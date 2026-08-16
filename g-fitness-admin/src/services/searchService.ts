import { supabase } from '../lib/supabaseClient';
import type { ProfileRow } from '../types/db';

/**
 * Global search across everything the admin app manages.
 *
 * Runs one small query per entity **in parallel**, each independently allowed to
 * fail: a missing table (a migration not yet run) or a policy that says no must
 * degrade that one section to empty, never blank the whole palette. Same shape
 * as `chatbotService.loadChatbotContext`.
 *
 * Everything is matched server-side with `ilike`. Doing it client-side would
 * mean shipping the entire roster to the browser to filter it, which gets slower
 * as the gym grows and hands out rows RLS may not intend to release.
 */

export type SearchKind =
  | 'member' | 'trainer' | 'staff' | 'class' | 'template'
  | 'event' | 'plan' | 'payment' | 'resource';

export interface SearchHit {
  id: string;
  kind: SearchKind;
  /** Primary line — a name, a title, an invoice number. */
  title: string;
  /** Secondary line: email, schedule, amount. Null renders nothing, not a dash. */
  subtitle: string | null;
  /** Small trailing tag: 'Suspended', 'Retired', 'Cancelled'. */
  tag?: string | null;
  photoUrl?: string | null;
  href: string;
}

export interface SearchResults {
  hits: SearchHit[];
  /** Sections that errored, so the UI can say so instead of implying "no results". */
  failed: SearchKind[];
}

/** Per-entity cap. The palette shows a handful of each; nobody scrolls a
 *  thousand-row dropdown, and a small limit keeps every query cheap. */
const PER_KIND = 8;

/**
 * One character is enough.
 *
 * This started at two, on the usual reasoning that a single letter matches most
 * of the database. At this gym's size that reasoning is wrong: a single letter
 * returning everything it matches IS the useful answer, and the per-entity cap
 * above already bounds the work. Typing "l" should find Lea.
 */
export const MIN_QUERY_LENGTH = 1;

/**
 * PostgREST's `or=(...)` filter is a comma-separated list wrapped in
 * parentheses, so a raw comma or paren in the search term is parsed as filter
 * syntax rather than as text. `*` and `%` are wildcards, and a stray backslash
 * breaks the escape. Strip all of them.
 *
 * Dots survive deliberately — an email address is one of the most common things
 * to search for here, and a dot is safe inside a filter value.
 */
function sanitize(term: string): string {
  return term.trim().replace(/[,()*%\\]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** `or` clause matching a term against several text columns. */
function anyColumn(columns: string[], term: string): string {
  return columns.map((c) => `${c}.ilike.*${term}*`).join(',');
}

const STATUS_TAG: Partial<Record<ProfileRow['status'], string>> = {
  pending_approval: 'Pending approval',
  suspended: 'Suspended',
  archived: 'Archived',
};

function fullName(p: { first_name: string; last_name: string }): string {
  return `${p.first_name} ${p.last_name}`.trim();
}

const peso = new Intl.NumberFormat('en-PH', {
  style: 'currency', currency: 'PHP', maximumFractionDigits: 2,
});

/** Manila-local, short. Never `toISOString()` — that shifts the date back a day
 *  for the first eight hours of every local day. */
const when = new Intl.DateTimeFormat('en-PH', {
  timeZone: 'Asia/Manila', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
});

export async function globalSearch(rawTerm: string): Promise<SearchResults> {
  const term = sanitize(rawTerm);
  if (term.length < MIN_QUERY_LENGTH) return { hits: [], failed: [] };

  const failed: SearchKind[] = [];
  /** Runs a section, recording rather than propagating its failure. */
  const section = async <T>(kind: SearchKind, run: () => Promise<T[]>): Promise<T[]> => {
    try {
      return await run();
    } catch {
      failed.push(kind);
      return [];
    }
  };

  const unwrap = <T>(res: { data: T[] | null; error: unknown }): T[] => {
    if (res.error) throw res.error;
    return res.data ?? [];
  };

  // A bare number is almost always a payment amount or a phone number, so the
  // payment query gets an extra branch rather than a separate mode the user has
  // to know about.
  const asNumber = Number(term.replace(/[₱,\s]/g, ''));
  const numeric = Number.isFinite(asNumber) && term.replace(/[₱,\s]/g, '') !== '';

  const [members, trainers, staff, classes, templates, events, plans, payments, resources] =
    await Promise.all([
      // Half of what identifies a member lives on `member_profiles`, not
      // `profiles` — address, emergency contact, QR code, experience level. Two
      // queries merged is the only way to reach both: PostgREST's `or=` cannot
      // span an embedded resource and its parent in one filter.
      section('member', async () => {
        const [byProfile, byDetail] = await Promise.all([
          supabase
            .from('profiles')
            .select('id, first_name, last_name, email, phone, photo_url, status, role')
            .eq('role', 'member')
            .or(anyColumn(['first_name', 'last_name', 'email', 'phone'], term))
            .limit(PER_KIND),
          supabase
            .from('member_profiles')
            .select('profile_id, profiles!inner(id, first_name, last_name, email, phone, photo_url, status, role)')
            .or(anyColumn(
              ['address', 'emergency_contact_name', 'emergency_contact_phone',
               'emergency_contact_relationship', 'qr_code', 'experience_level', 'gender'], term))
            .limit(PER_KIND),
        ]);
        const rows = unwrap<ProfileRow>(byProfile as { data: ProfileRow[] | null; error: unknown });
        const nested = unwrap<{ profiles: ProfileRow }>(byDetail as never);
        const seen = new Set(rows.map((r) => r.id));
        for (const n of nested) {
          if (n.profiles && !seen.has(n.profiles.id)) { seen.add(n.profiles.id); rows.push(n.profiles); }
        }
        return rows.slice(0, PER_KIND);
      }),

      // Same split as members: specialization, bio and availability are on
      // `trainer_profiles`. "boxing" should find the boxing coach.
      section('trainer', async () => {
        const [byProfile, byDetail] = await Promise.all([
          supabase
            .from('profiles')
            .select('id, first_name, last_name, email, phone, photo_url, status, role')
            .eq('role', 'trainer')
            .or(anyColumn(['first_name', 'last_name', 'email', 'phone'], term))
            .limit(PER_KIND),
          supabase
            .from('trainer_profiles')
            .select('profile_id, profiles!inner(id, first_name, last_name, email, phone, photo_url, status, role)')
            .or(anyColumn(['specialization', 'bio', 'availability'], term))
            .limit(PER_KIND),
        ]);
        const rows = unwrap<ProfileRow>(byProfile as { data: ProfileRow[] | null; error: unknown });
        const nested = unwrap<{ profiles: ProfileRow }>(byDetail as never);
        const seen = new Set(rows.map((r) => r.id));
        for (const n of nested) {
          if (n.profiles && !seen.has(n.profiles.id)) { seen.add(n.profiles.id); rows.push(n.profiles); }
        }
        return rows.slice(0, PER_KIND);
      }),

      // Admin and front-desk accounts. Grouped apart from trainers because
      // "who has desk access" is a different question from "who coaches".
      section('staff', async () =>
        unwrap<ProfileRow>(await supabase
          .from('profiles')
          .select('id, first_name, last_name, email, phone, photo_url, status, role')
          .in('role', ['admin', 'staff'])
          .or(anyColumn(['first_name', 'last_name', 'email', 'phone'], term))
          .limit(PER_KIND) as { data: ProfileRow[] | null; error: unknown })),

      section('class', async () =>
        unwrap<{ id: string; name: string; class_type: string | null; location: string | null; scheduled_at: string | null }>(
          await supabase
            .from('classes')
            .select('id, name, class_type, location, scheduled_at')
            .or(anyColumn(['name', 'class_type', 'location'], term))
            // Upcoming first: a class next Tuesday is far likelier to be the one
            // being looked for than the same class three months ago.
            .order('scheduled_at', { ascending: false })
            .limit(PER_KIND) as never)),

      section('template', async () =>
        unwrap<{ id: string; name: string; location: string | null; active: boolean }>(
          await supabase
            .from('class_templates')
            .select('id, name, location, active')
            .or(anyColumn(['name', 'location'], term))
            .limit(PER_KIND) as never)),

      section('event', async () =>
        unwrap<{ id: string; title: string; location: string | null; starts_at: string; cancelled: boolean }>(
          await supabase
            .from('events')
            .select('id, title, location, starts_at, cancelled')
            .or(anyColumn(['title', 'location', 'description'], term))
            .order('starts_at', { ascending: false })
            .limit(PER_KIND) as never)),

      section('plan', async () =>
        unwrap<{ id: string; name: string; price: number; is_active: boolean }>(
          await supabase
            .from('membership_plans')
            .select('id, name, price, is_active')
            .or(anyColumn(['name', 'description'], term))
            .limit(PER_KIND) as never)),

      section('payment', async () => {
        // A number matches the amount **as well as** the text columns, not
        // instead of them. The exact-amount branch used to replace the text
        // search entirely, so typing "1" found only payments of exactly ₱1 and
        // missed invoice INV-001.
        const filters = [
          ...['invoice_number', 'notes', 'method'].map((c) => `${c}.ilike.*${term}*`),
          ...(numeric ? [`amount.eq.${asNumber}`] : []),
        ];
        const q = supabase
          .from('payments')
          .select('id, amount, method, invoice_number, notes, paid_on, member_id')
          .or(filters.join(','))
          .order('paid_on', { ascending: false })
          .limit(PER_KIND);
        return unwrap<{ id: string; amount: number; method: string; invoice_number: string | null; paid_on: string }>(await q as never);
      }),

      section('resource', async () =>
        unwrap<{ id: string; title: string; category: string | null; provider: string | null }>(
          await supabase
            .from('workout_resources')
            .select('id, title, category, provider')
            .or(anyColumn(['title', 'category', 'provider', 'description'], term))
            .limit(PER_KIND) as never)),
    ]);

  const hits: SearchHit[] = [
    ...members.map((p): SearchHit => ({
      id: p.id, kind: 'member', title: fullName(p),
      subtitle: p.email ?? p.phone ?? null,
      tag: STATUS_TAG[p.status] ?? null,
      photoUrl: p.photo_url, href: `/members/${p.id}`,
    })),
    ...trainers.map((p): SearchHit => ({
      id: p.id, kind: 'trainer', title: fullName(p),
      subtitle: p.email ?? null, tag: STATUS_TAG[p.status] ?? null,
      photoUrl: p.photo_url, href: '/trainers',
    })),
    ...staff.map((p): SearchHit => ({
      id: p.id, kind: 'staff', title: fullName(p),
      subtitle: p.email ?? null,
      // The role IS the useful tag here, so it replaces the status tag unless
      // the account is in a state worth flagging.
      tag: STATUS_TAG[p.status] ?? (p.role === 'admin' ? 'Admin' : 'Front desk'),
      photoUrl: p.photo_url, href: '/settings',
    })),
    ...classes.map((c): SearchHit => ({
      id: c.id, kind: 'class', title: c.name,
      subtitle: [c.class_type, c.location, c.scheduled_at ? when.format(new Date(c.scheduled_at)) : null]
        .filter(Boolean).join(' · ') || null,
      href: '/schedule',
    })),
    ...templates.map((t): SearchHit => ({
      id: t.id, kind: 'template', title: t.name,
      subtitle: ['Weekly timetable', t.location].filter(Boolean).join(' · '),
      tag: t.active ? null : 'Paused',
      href: '/schedule',
    })),
    ...events.map((e): SearchHit => ({
      id: e.id, kind: 'event', title: e.title,
      subtitle: [e.location, when.format(new Date(e.starts_at))].filter(Boolean).join(' · '),
      tag: e.cancelled ? 'Cancelled' : null, href: '/events',
    })),
    ...plans.map((p): SearchHit => ({
      id: p.id, kind: 'plan', title: p.name,
      subtitle: peso.format(p.price), tag: p.is_active ? null : 'Retired',
      href: '/membership-plans',
    })),
    ...payments.map((p): SearchHit => ({
      id: p.id, kind: 'payment',
      title: p.invoice_number ?? peso.format(p.amount),
      subtitle: [p.invoice_number ? peso.format(p.amount) : null, p.method, p.paid_on]
        .filter(Boolean).join(' · '),
      href: '/payments',
    })),
    ...resources.map((r): SearchHit => ({
      id: r.id, kind: 'resource', title: r.title,
      subtitle: [r.category, r.provider].filter(Boolean).join(' · ') || null,
      href: '/resources',
    })),
  ];

  return { hits, failed };
}

export const KIND_LABEL: Record<SearchKind, string> = {
  member: 'Members',
  trainer: 'Trainers',
  staff: 'Accounts',
  class: 'Scheduled classes',
  template: 'Timetable',
  event: 'Events',
  plan: 'Plans',
  payment: 'Payments',
  resource: 'Resources',
};

/** Section order in the palette — most-searched first, not alphabetical. */
export const KIND_ORDER: SearchKind[] = [
  'member', 'trainer', 'staff', 'class', 'template', 'event', 'plan', 'payment', 'resource',
];
