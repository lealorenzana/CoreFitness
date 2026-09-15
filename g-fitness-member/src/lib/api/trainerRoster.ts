import { supabase } from '../supabaseClient';

/**
 * The signed-in trainer's own members (0082).
 *
 * Replaces three unfiltered reads joined on the phone — `listMembers()`,
 * `listMemberships()`, `listAttendance()` — with one view that is narrowed by
 * RLS before it leaves the database.
 *
 * **The view is `security_invoker`**, so it adds no reach of its own: the
 * caller's own `member_profiles` policy decides which rows come back. A definer
 * view here would have re-opened the hole 0082 exists to close, which is the
 * same reasoning `activity_feed` follows.
 *
 * The plan name is deliberately not in it. `memberships` is narrowed by the
 * same rule now, so the roster still fetches it — but as a label beside a name,
 * not as the thing that decides who is on the list.
 */
export interface TrainerRosterRow {
  member_id: string;
  name: string;
  photo_url: string | null;
  experience_level: string | null;
  /** Most recent check-in, or null for a member who has never been in. */
  last_visit: string | null;
  visits_last_30: number;
  /** Approved sessions with *this* trainer still ahead. */
  upcoming_with_me: number;
}

export async function listMyTrainerMembers(): Promise<TrainerRosterRow[]> {
  const { data, error } = await supabase
    .from('my_trainer_members')
    .select('*')
    .order('name');
  if (error) throw error;
  // Postgres counts arrive as strings over PostgREST when they exceed the JS
  // safe range; these never will, but `Number()` costs nothing and a count
  // rendered as "12" vs 12 is the sort of thing that only shows up in sorting.
  return ((data ?? []) as TrainerRosterRow[]).map((r) => ({
    ...r,
    visits_last_30: Number(r.visits_last_30 ?? 0),
    upcoming_with_me: Number(r.upcoming_with_me ?? 0),
  }));
}
