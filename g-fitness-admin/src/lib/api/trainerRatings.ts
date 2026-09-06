import { supabase } from '../supabaseClient';

/**
 * What the gym can see about how its trainers are rated (migrations 0042, 0066,
 * 0072).
 *
 * ## The admin sees names, the trainer does not
 *
 * A trainer reads their ratings through a view with no member identity in it.
 * The admin reads the rows themselves. That asymmetry is deliberate and is the
 * whole design: anonymity protects a member grading someone with power over
 * their training, and an anonymous complaint the gym cannot follow up is not
 * monitoring — it cannot check whether one member is rating everybody one star,
 * and cannot talk to a member who reported something serious.
 *
 * ## Why the numbers here differ from the member app's
 *
 * The member-facing summary withholds an average below three ratings (0042), so
 * one bad night cannot define a coach publicly. The admin's does not withhold
 * anything: the gym needs to see the single two-star review. Same data, two
 * honest presentations, and they will legitimately disagree.
 */

export interface EvaluationMonth {
  trainer_id: string;
  /** First day of the month, e.g. '2026-09-01'. */
  period: string;
  rating_count: number;
  /** Never withheld here — see the note above. NULL only when there is nothing
   *  to average, which `rating_count === 0` already says. */
  average_stars: number | null;
  comment_count: number;
}

/**
 * Month-by-month scores. Pass a trainer id to narrow, or nothing for everyone.
 *
 * The RPC refuses a non-admin outright rather than returning an empty list — an
 * empty list would read as "no trainer has ever been rated", which is a claim
 * about the gym rather than about the caller's permissions.
 */
export async function listEvaluationMonths(trainerId?: string): Promise<EvaluationMonth[]> {
  const { data, error } = await supabase.rpc('admin_trainer_evaluations', {
    p_trainer: trainerId ?? null,
  });
  if (error) throw error;
  return (data ?? []) as EvaluationMonth[];
}

export interface RatingWithMember {
  member_id: string;
  trainer_id: string;
  stars: number;
  comment: string | null;
  period: string;
  created_at: string;
  updated_at: string;
}

/**
 * The individual reviews, with who wrote them.
 *
 * Reads the base table, which since 0072 answers only to the member who wrote
 * the row and to an admin. A staff account gets nothing — front desk is
 * payments and check-ins (0012), not personnel review.
 */
export async function listRatings(trainerId?: string): Promise<RatingWithMember[]> {
  let query = supabase
    .from('trainer_ratings')
    .select('*')
    .order('period', { ascending: false })
    .order('created_at', { ascending: false });
  if (trainerId) query = query.eq('trainer_id', trainerId);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as RatingWithMember[];
}

/** Notes trainers have written to members — the other direction (0072). */
export interface FeedbackWithNames {
  id: string;
  trainer_id: string;
  member_id: string;
  note: string;
  recommendation: string | null;
  created_at: string;
}

export async function listTrainerFeedback(trainerId?: string): Promise<FeedbackWithNames[]> {
  let query = supabase
    .from('trainer_feedback')
    .select('id, trainer_id, member_id, note, recommendation, created_at')
    .order('created_at', { ascending: false });
  if (trainerId) query = query.eq('trainer_id', trainerId);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as FeedbackWithNames[];
}

/** '2026-09-01' → 'September 2026'. */
export function periodLabel(period: string): string {
  const [y, m] = period.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });
}

/**
 * Whole-star distribution, for a five-bar chart.
 *
 * Index 0 is one star. Returns all five buckets even when empty, so the chart
 * has a stable shape rather than redrawing its axis as reviews arrive.
 */
export function starDistribution(ratings: { stars: number }[]): number[] {
  const buckets = [0, 0, 0, 0, 0];
  for (const r of ratings) {
    const i = Math.min(4, Math.max(0, Math.round(r.stars) - 1));
    buckets[i] += 1;
  }
  return buckets;
}
