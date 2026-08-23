import { supabase } from '../supabaseClient';

/**
 * Coach ratings (0042).
 *
 * Every guard here is in SQL and this module only explains it. `may_rate_trainer()`
 * decides eligibility, and the same function is called again inside the INSERT
 * and UPDATE policies — so a member who calls PostgREST directly still cannot
 * rate a coach they never trained with. Treat `canRate()` as *why a button is
 * disabled*, never as the rule.
 */

export interface TrainerRatingSummary {
  trainer_id: string;
  rating_count: number;
  /** NULL until three ratings exist — see `trainer_rating_summary` in 0042.
   *  Renders as "Not rated yet", never as zero stars, which is a score nobody gave. */
  average_stars: number | null;
}

export interface MyTrainerRating {
  trainer_id: string;
  stars: number;
  comment: string | null;
  updated_at: string;
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

/** This member's own rating of one coach, or null if they have not rated them. */
export async function getMyRating(memberId: string, trainerId: string): Promise<MyTrainerRating | null> {
  const { data, error } = await supabase
    .from('trainer_ratings')
    .select('trainer_id, stars, comment, updated_at')
    .eq('member_id', memberId)
    .eq('trainer_id', trainerId)
    .maybeSingle();
  if (error) throw error;
  return (data as MyTrainerRating) ?? null;
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
  comment: string | null
): Promise<void> {
  const { error } = await supabase
    .from('trainer_ratings')
    .upsert(
      { member_id: memberId, trainer_id: trainerId, stars, comment },
      { onConflict: 'member_id,trainer_id' }
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
export async function deleteMyRating(memberId: string, trainerId: string): Promise<void> {
  const { data, error } = await supabase
    .from('trainer_ratings')
    .delete()
    .eq('member_id', memberId)
    .eq('trainer_id', trainerId)
    .select('trainer_id');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('That rating could not be removed.');
}
