import { supabase } from '../supabaseClient';
import type { ActivityFeedRow, UserRole } from '../../types/db';

/**
 * Read side of the audit trail (migration 0037).
 *
 * Read-only by construction: `activity_log` has an admin SELECT policy and no
 * write policy of any kind, so there is deliberately no `createActivity` here.
 * Everything is written by database triggers. If you find yourself wanting to
 * log something from the client, add a trigger to 0037 instead — a log the
 * client writes is a log the client can skip.
 *
 * Reads go through the `activity_feed` view, which resolves the actor's current
 * name (falling back to the write-time snapshot) and the subject member's name
 * in one round trip. The view is `security_invoker`, so the admin-only policy on
 * the base table still applies.
 */

/** Coarse buckets for the filter chips. Keep in sync with ACTION_GROUPS below. */
export type ActivityGroup =
  | 'bookings'
  | 'payments'
  | 'attendance'
  | 'memberships'
  | 'accounts'
  | 'schedule';

/**
 * Which `action` prefixes belong to which chip. A prefix rather than a fixed
 * list, so adding a trigger in a later migration does not silently produce
 * entries that no filter can reach.
 */
const ACTION_GROUPS: Record<ActivityGroup, string[]> = {
  bookings:    ['booking.', 'pt.'],
  payments:    ['payment.', 'plan.'],
  attendance:  ['checkin.'],
  memberships: ['membership.'],
  accounts:    ['member.', 'account.'],
  schedule:    ['class.', 'event.'],
};

export interface ActivityQuery {
  /** Restrict to one bucket. Omit for everything. */
  group?: ActivityGroup;
  /** Only entries about this member (their bookings, payments, check-ins…). */
  memberId?: string;
  /** Only entries performed by this person. */
  actorId?: string;
  /** The role the actor held at the time — `member` vs `staff` vs `admin`. */
  actorRole?: UserRole;
  /** Inclusive ISO instant. */
  from?: string;
  /** Exclusive ISO instant. */
  before?: string;
  /** Substring match against the composed summary sentence. */
  search?: string;
  /** Hide the rows 0037 reconstructed from pre-existing timestamps. */
  liveOnly?: boolean;
  limit?: number;
  offset?: number;
}

export interface ActivityPage {
  rows: ActivityFeedRow[];
  /** Total matching the filters, ignoring limit/offset. `null` when Postgres
   *  declined to count (it does not, here — but the client must not invent 0). */
  total: number | null;
}

const DEFAULT_LIMIT = 50;

export async function listActivity(q: ActivityQuery = {}): Promise<ActivityPage> {
  const limit = q.limit ?? DEFAULT_LIMIT;
  const offset = q.offset ?? 0;

  let query = supabase
    .from('activity_feed')
    .select('*', { count: 'exact' })
    .order('occurred_at', { ascending: false })
    // `occurred_at` alone is not a total order — a backfill inserted thousands
    // of rows sharing a timestamp, and two pages of an ambiguous sort can repeat
    // or skip rows. `id` breaks the tie deterministically.
    .order('id', { ascending: false })
    .range(offset, offset + limit - 1);

  if (q.group) {
    // PostgREST `or` takes a comma-separated filter list; `like.booking.*`
    // cannot be used because `.` is the filter separator, so `ilike` with a
    // wildcard is spelled with `%`.
    const prefixes = ACTION_GROUPS[q.group];
    query = query.or(prefixes.map((p) => `action.ilike.${p}%`).join(','));
  }
  if (q.memberId)  query = query.eq('member_id', q.memberId);
  if (q.actorId)   query = query.eq('actor_id', q.actorId);
  if (q.actorRole) query = query.eq('actor_role', q.actorRole);
  if (q.from)      query = query.gte('occurred_at', q.from);
  if (q.before)    query = query.lt('occurred_at', q.before);
  if (q.liveOnly)  query = query.eq('reconstructed', false);
  if (q.search?.trim()) {
    // `%` and `_` are wildcards in ilike; a member searching for "50%" must not
    // accidentally match everything.
    const safe = q.search.trim().replace(/[%_\\]/g, (c) => `\\${c}`);
    query = query.ilike('summary', `%${safe}%`);
  }

  const { data, error, count } = await query;
  if (error) throw error;
  return { rows: data ?? [], total: count ?? null };
}

/** Everything that ever happened to one member — for their detail page. */
export async function listMemberActivity(memberId: string, limit = 25): Promise<ActivityFeedRow[]> {
  const { rows } = await listActivity({ memberId, limit });
  return rows;
}

/**
 * Distinct actors present in the log, for the "performed by" filter.
 *
 * Built from the log itself rather than from `profiles`, so the dropdown lists
 * exactly the people who have actually done something — including anyone since
 * archived, who would be missing from a `profiles` query but whose actions are
 * precisely what an owner reviewing history wants to find.
 */
export async function listActivityActors(): Promise<Array<{ id: string; name: string; role: UserRole | null }>> {
  const { data, error } = await supabase
    .from('activity_feed')
    .select('actor_id, actor_name, actor_role')
    .not('actor_id', 'is', null)
    .order('occurred_at', { ascending: false })
    .limit(1000);
  if (error) throw error;

  const seen = new Map<string, { id: string; name: string; role: UserRole | null }>();
  for (const row of data ?? []) {
    const r = row as Pick<ActivityFeedRow, 'actor_id' | 'actor_name' | 'actor_role'>;
    if (!r.actor_id || seen.has(r.actor_id)) continue;
    // No name means the profile is gone. Say so rather than printing an id or
    // inventing a label — the entry itself is still real and still listed.
    seen.set(r.actor_id, {
      id: r.actor_id,
      name: r.actor_name ?? 'Deleted account',
      role: r.actor_role,
    });
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** True when the log exists and this account may read it. Used to hide the page
 *  gracefully on a database where 0037 has not been run yet. */
export async function activityLogAvailable(): Promise<boolean> {
  const { error } = await supabase.from('activity_feed').select('id').limit(1);
  return !error;
}

/**
 * Where an entry should navigate to. Returns null when there is nowhere useful
 * to go — a deleted plan has no page, and a dead link is worse than none.
 */
export function activityHref(row: ActivityFeedRow): string | null {
  switch (row.subject_type) {
    case 'profile':
    case 'membership':
      return row.member_id ? `/members/${row.member_id}` : null;
    case 'payment':        return '/payments';
    case 'attendance':     return '/attendance';
    case 'booking':
    case 'pt_session':     return '/bookings';
    case 'event':          return '/events';
    case 'plan':           return '/membership-plans';
    case 'class_template': return '/schedule';
    default:               return null;
  }
}

export function groupForAction(action: string): ActivityGroup | null {
  for (const [group, prefixes] of Object.entries(ACTION_GROUPS)) {
    if (prefixes.some((p) => action.startsWith(p))) return group as ActivityGroup;
  }
  return null;
}
