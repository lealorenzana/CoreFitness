import { supabase } from '../supabaseClient';
import type { ProfileRow, ProfileStatus, TrainerProfileRow } from '../../types/db';

export interface TrainerWithProfile {
  profile: ProfileRow;
  trainer: TrainerProfileRow;
}

function unwrap(rows: unknown[]): TrainerWithProfile[] {
  return rows.map((row) => {
    const { profiles, ...trainer } = row as TrainerProfileRow & { profiles: ProfileRow };
    return { profile: profiles, trainer: trainer as TrainerProfileRow };
  });
}

/**
 * Sorted here rather than in the query.
 *
 * `.order('first_name', { referencedTable: 'profiles' })` looks like it orders
 * the roster and does not: it emits `profiles.order=…`, which sorts *within* the
 * embedded resource, and `profiles` is a to-one embed — a single object with
 * nothing to sort. The rows come back in whatever order PostgreSQL felt like.
 */
function byName(rows: TrainerWithProfile[]): TrainerWithProfile[] {
  return rows.sort((a, b) =>
    `${a.profile.first_name} ${a.profile.last_name}`.localeCompare(
      `${b.profile.first_name} ${b.profile.last_name}`
    )
  );
}

/**
 * The working trainer roster — everyone except archived.
 *
 * Trainers are archived rather than deleted, for the same reason members are: a
 * delete would orphan every class they taught and every PT session they ran.
 * Archived rows stay readable through `listArchivedTrainers`.
 */
export async function listTrainers(): Promise<TrainerWithProfile[]> {
  const { data, error } = await supabase
    .from('trainer_profiles')
    .select('*, profiles!inner(*)')
    .neq('profiles.status', 'archived');
  if (error) throw error;
  return byName(unwrap(data ?? []));
}

export async function listArchivedTrainers(): Promise<TrainerWithProfile[]> {
  const { data, error } = await supabase
    .from('trainer_profiles')
    .select('*, profiles!inner(*)')
    .eq('profiles.status', 'archived');
  if (error) throw error;
  return byName(unwrap(data ?? []));
}

/**
 * Suspend, reactivate or archive a trainer's account.
 *
 * There was no way to do any of this: a coach who left the gym kept a working
 * login and stayed on the roster indefinitely. Suspending flips
 * `profiles.status`, which `RoleProtectedRoute` and every RLS policy already
 * check — nothing is deleted, and it is reversible.
 */
export async function setTrainerStatus(id: string, status: ProfileStatus): Promise<void> {
  const { error } = await supabase.from('profiles').update({ status }).eq('id', id);
  if (error) throw error;
}

export async function getTrainer(id: string): Promise<TrainerWithProfile | null> {
  const { data, error } = await supabase
    .from('trainer_profiles')
    .select('*, profiles!inner(*)')
    .eq('profile_id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const { profiles, ...trainer } = data as TrainerProfileRow & { profiles: ProfileRow };
  return { profile: profiles, trainer: trainer as TrainerProfileRow };
}

export async function updateTrainerProfile(
  id: string,
  updates: Partial<Omit<TrainerProfileRow, 'profile_id'>>
): Promise<void> {
  const { error } = await supabase.from('trainer_profiles').update(updates).eq('profile_id', id);
  if (error) throw error;
}

/**
 * Admin-only: creates a real Supabase Auth account + profile for a new trainer via
 * the create-trainer Edge Function, so the admin's own browser session is never
 * touched (a client-side supabase.auth.signUp would sign the admin's browser out).
 */
export async function createTrainer(input: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
  specialization?: string;
  bio?: string;
  availability?: string;
}): Promise<{ id: string; email: string }> {
  const { data, error } = await supabase.functions.invoke('create-trainer', {
    body: input,
  });
  if (error) {
    // FunctionsHttpError doesn't surface the function's JSON error body by default —
    // it's on error.context (the raw Response), so pull the real reason out of it.
    const context = (error as { context?: Response }).context;
    let serverMessage: string | undefined;
    if (context && typeof context.json === 'function') {
      try {
        const body = await context.json();
        serverMessage = body?.error;
      } catch {
        // body isn't JSON — fall through to the generic error below
      }
    }
    throw new Error(serverMessage ?? error.message);
  }
  return data as { id: string; email: string };
}

export interface TrainerRatingSummary {
  trainer_id: string;
  rating_count: number;
  /** NULL until three ratings exist (0042) — the gym sees the same withheld
   *  average members do, on purpose. An admin view that revealed a 1-rating
   *  average would make the threshold a display trick rather than a policy, and
   *  the number would leak back out in conversation with the coach. */
  average_stars: number | null;
}

/** Every coach's score, keyed by trainer id. */
export async function getRatingSummaries(): Promise<Map<string, TrainerRatingSummary>> {
  const { data, error } = await supabase.from('trainer_rating_summary').select('*');
  if (error) throw error;
  return new Map((data ?? []).map((r) => [r.trainer_id, r as TrainerRatingSummary]));
}

export interface TrainerRatingRow {
  member_id: string;
  stars: number;
  comment: string | null;
  /** Which month this evaluation is for (0066), 'YYYY-MM-01'. */
  period: string;
  updated_at: string;
}

/** One month of a coach's record, straight from `trainer_evaluation_months`. */
export interface TrainerMonth {
  trainer_id: string;
  period: string;
  evaluations: number;
  average_stars: number;
  with_comment: number;
}

/**
 * The gym's own month-by-month figures — **not withheld**.
 *
 * 0042 deliberately gave the admin the same withheld number members see, so a
 * policy could not quietly become a display trick. 0066 reverses that on
 * purpose: this is an evaluation tool now, and a gym that cannot read its own
 * evaluations cannot act on them. Members still see the withheld average; this
 * view is admin-only in SQL and named so the two cannot be confused.
 */
export async function getTrainerMonths(trainerId?: string): Promise<TrainerMonth[]> {
  let q = supabase.from('trainer_evaluation_months').select('*').order('period', { ascending: false });
  if (trainerId) q = q.eq('trainer_id', trainerId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as TrainerMonth[];
}

/** '2026-09-01' → 'Sep 2026'. */
export function periodLabel(period: string): string {
  const [y, m] = period.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-PH', { month: 'short', year: 'numeric' });
}

/**
 * Every evaluation of one coach, newest month first.
 *
 * Genuinely admin-only now, not just admin-shaped. 0042's SELECT policy let any
 * signed-in member read every row, on the reasoning that a rating is a public
 * statement. Once a written reason is attached that stopped being true — "why I
 * scored my coach 2" is a note to the gym — so 0066 narrowed reads to your own
 * rows, the trainer being evaluated, and admins.
 */
export async function listTrainerRatings(trainerId: string): Promise<TrainerRatingRow[]> {
  const { data, error } = await supabase
    .from('trainer_ratings')
    .select('member_id, stars, comment, period, updated_at')
    .eq('trainer_id', trainerId)
    .order('period', { ascending: false })
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as TrainerRatingRow[];
}
