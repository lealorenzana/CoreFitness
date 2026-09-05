import { supabase } from '../supabaseClient';

/**
 * Coach evaluations (0042, made monthly by 0066).
 *
 * One evaluation per member per trainer **per month**, editable while that
 * month is open. The month is the gym's month: `currentPeriod()` below, never
 * `toISOString()`, which would file anything written in the first eight hours
 * of the 1st into the previous month.
 *
 *
 * Every guard here is in SQL and this module only explains it. `may_rate_trainer()`
 * decides eligibility, and the same function is called again inside the INSERT
 * and UPDATE policies — so a member who calls PostgREST directly still cannot
 * rate a coach they never trained with. Treat `canRate()` as *why a button is
 * disabled*, never as the rule.
 */

export interface TrainerRatingSummary {
  trainer_id: string;
  /** How many **members** have evaluated — one vote each, their latest month,
   *  so a member evaluating monthly does not outweigh one who evaluated once. */
  rating_count: number;
  /** NULL until three **different members** have evaluated (0066). Renders as
   *  "needs N more", never as zero stars, which is a score nobody gave. */
  average_stars: number | null;
}

export interface MyTrainerRating {
  trainer_id: string;
  stars: number;
  comment: string | null;
  /** First of the month this evaluation is for, 'YYYY-MM-01'. */
  period: string;
  updated_at: string;
}

/** One month of a trainer's record, for the history a member can look back on. */
export interface MyRatingHistoryEntry {
  period: string;
  stars: number;
  comment: string | null;
}

/**
 * The month being evaluated, as 'YYYY-MM-01' in Manila.
 *
 * Deliberately not `new Date().toISOString().slice(0, 8) + '01'`: that is UTC,
 * so for the first eight hours of the 1st it names last month — and the
 * evaluation would land in a period the member has already filled in, silently
 * overwriting it. The same off-by-eight-hours that hid every pre-8am check-in.
 */
export function currentPeriod(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

/** '2026-09-01' → 'September 2026'. */
export function periodLabel(period: string): string {
  const [y, m] = period.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });
}

/**
 * Every trainer's score in one round trip, keyed for lookup.
 *
 * A Map rather than an array because the callers — the coach list and the
 * profile — both want "the score for this id" and neither wants to scan.
 */
export async function getRatingSummaries(): Promise<Map<string, TrainerRatingSummary>> {
  const { data, error } = await supabase.from('trainer_rating_summary').select('*');
  if (error) throw error;
  return new Map((data ?? []).map((r) => [r.trainer_id, r as TrainerRatingSummary]));
}

export async function getRatingSummary(trainerId: string): Promise<TrainerRatingSummary | null> {
  const { data, error } = await supabase
    .from('trainer_rating_summary')
    .select('*')
    .eq('trainer_id', trainerId)
    .maybeSingle();
  if (error) throw error;
  return (data as TrainerRatingSummary) ?? null;
}

/**
 * This member's evaluation of one coach for a given month, or null.
 *
 * Defaults to the current month. Passing an older period is how the history
 * list lets someone re-read what they wrote in March.
 */
export async function getMyRating(
  memberId: string,
  trainerId: string,
  period: string = currentPeriod()
): Promise<MyTrainerRating | null> {
  const { data, error } = await supabase
    .from('trainer_ratings')
    .select('trainer_id, stars, comment, period, updated_at')
    .eq('member_id', memberId)
    .eq('trainer_id', trainerId)
    .eq('period', period)
    .maybeSingle();
  if (error) throw error;
  return (data as MyTrainerRating) ?? null;
}

/**
 * Every month this member has evaluated this coach, newest first.
 *
 * Their own rows only — RLS narrowed reads in 0066, because "why I scored my
 * coach 2" is a note to the gym and not something other members may read.
 */
export async function getMyRatingHistory(
  memberId: string,
  trainerId: string
): Promise<MyRatingHistoryEntry[]> {
  const { data, error } = await supabase
    .from('trainer_ratings')
    .select('period, stars, comment')
    .eq('member_id', memberId)
    .eq('trainer_id', trainerId)
    .order('period', { ascending: false });
  if (error) throw error;
  return (data ?? []) as MyRatingHistoryEntry[];
}

/**
 * May this member rate this coach? Answered by the database, not inferred here.
 *
 * A failure returns `false`, which hides the form rather than showing one that
 * would be rejected on submit. That is the right way round: an eligible member
 * who briefly sees no form will see it on the next load, whereas an ineligible
 * member shown a form gets to write a review and then lose it.
 */
export async function canRate(trainerId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('may_rate_trainer', { p_trainer: trainerId });
  if (error) return false;
  return data === true;
}

/**
 * Leave or change a rating.
 *
 * `upsert` on the composite primary key, because a member changing their mind
 * should replace their rating rather than add a second one — stacking would
 * double their weight in the average.
 */
export async function saveMyRating(
  memberId: string,
  trainerId: string,
  stars: number,
  comment: string | null,
  period: string = currentPeriod()
): Promise<void> {
  const { error } = await supabase
    .from('trainer_ratings')
    .upsert(
      { member_id: memberId, trainer_id: trainerId, stars, comment, period },
      // The key gained `period` in 0066. Without naming it here the upsert
      // would target the old two-column key, which no longer exists, and
      // PostgREST would report a conflict-target error rather than saving.
      { onConflict: 'member_id,trainer_id,period' }
    );
  if (error) throw error;
}

/**
 * Withdraw a rating.
 *
 * `.select()` so the statement becomes `DELETE … RETURNING` and a zero-row
 * result can be told apart from success. Without it PostgREST reports success
 * for a delete that RLS silently filtered to nothing — the failure mode that
 * made admin "Recall" and "Undo check-in" both lie.
 */
export async function deleteMyRating(
  memberId: string,
  trainerId: string,
  period: string = currentPeriod()
): Promise<void> {
  const { data, error } = await supabase
    .from('trainer_ratings')
    .delete()
    .eq('member_id', memberId)
    .eq('trainer_id', trainerId)
    // Scoped to one month, or withdrawing this month's evaluation would erase
    // every month the member has ever written.
    .eq('period', period)
    .select('trainer_id');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('That evaluation could not be removed.');
}
