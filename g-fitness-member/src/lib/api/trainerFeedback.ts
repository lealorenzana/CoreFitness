import { supabase } from '../supabaseClient';

/**
 * The two halves of the evaluation loop that the ratings table did not cover
 * (migration 0072).
 *
 * `trainer_ratings` is the member grading the coach. This module carries the
 * coach's own view of that — **without any member identity** — and the note the
 * coach writes back.
 */

// ─── What a trainer may see about their own ratings ──────────────────────────

/**
 * One rating, as the trainer is allowed to see it.
 *
 * There is no member id here and no way to derive one. That is enforced in SQL,
 * not by this type: `my_trainer_ratings()` reads a view with no identity column
 * in it, and the base table no longer answers to trainers at all. Hiding a name
 * in the component would have left it sitting in the network response.
 */
export interface AnonymousRating {
  stars: number;
  /** NULL is normal and common — a star with no words is still a rating. */
  comment: string | null;
  /** First day of the month it was written for, e.g. '2026-09-01'. */
  period: string;
  created_at: string;
}

/**
 * Every rating written about the signed-in trainer.
 *
 * Takes no trainer id on purpose — the function keys on `auth.uid()`, so one
 * trainer cannot ask for another's.
 */
export async function listMyRatings(): Promise<AnonymousRating[]> {
  const { data, error } = await supabase.rpc('my_trainer_ratings');
  if (error) throw error;
  return (data ?? []) as AnonymousRating[];
}

/**
 * Average and count over whatever period the caller passes in.
 *
 * Returns NULL for the average when there is nothing to average. **Never 0** —
 * zero stars is a rating nobody can give, so printing it would invent a verdict
 * out of an absence of one.
 */
export function summarise(ratings: AnonymousRating[]): {
  average: number | null;
  count: number;
} {
  if (ratings.length === 0) return { average: null, count: 0 };
  const total = ratings.reduce((sum, r) => sum + r.stars, 0);
  return { average: total / ratings.length, count: ratings.length };
}

// ─── Credentials a member may see ────────────────────────────────────────────

/**
 * A qualification the gym has verified.
 *
 * The *fact* is public; the *file* is not. 0054 keeps the uploaded document
 * with the trainer and the admin — it is their personal paperwork and often
 * carries a licence number — and 0072's view exposes only the title and the
 * date the gym checked it. Unverified uploads never appear: a pending claim
 * shown on a profile is a claim laundered into a fact.
 */
export interface PublicCredential {
  trainer_id: string;
  title: string;
  /** When the gym verified it. NULL only for rows verified before reviewed_at
   *  was being written; the screen shows the title without a date. */
  verified_on: string | null;
}

export async function listPublicCredentials(trainerId: string): Promise<PublicCredential[]> {
  const { data, error } = await supabase
    .from('public_trainer_credentials')
    .select('*')
    .eq('trainer_id', trainerId)
    .order('verified_on', { ascending: false });
  if (error) throw error;
  return (data ?? []) as PublicCredential[];
}

// ─── Feedback from a coach to a member ───────────────────────────────────────

export interface TrainerFeedbackRow {
  id: string;
  trainer_id: string;
  member_id: string;
  note: string;
  /** What to do next. Kept apart from the note because it is the part the
   *  member acts on, and a screen can show it alone. */
  recommendation: string | null;
  pt_session_id: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Notes this member has been given.
 *
 * Not anonymous, unlike ratings, and deliberately: a member told to change
 * something needs to know which coach said it or they cannot ask a follow-up.
 * Anonymity protects whoever has less power in the exchange — the member when
 * they are grading, and not the coach when they are advising.
 */
export async function listFeedbackForMember(memberId: string): Promise<TrainerFeedbackRow[]> {
  const { data, error } = await supabase
    .from('trainer_feedback')
    .select('*')
    .eq('member_id', memberId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as TrainerFeedbackRow[];
}

/** Notes this trainer has written, newest first. */
export async function listFeedbackByTrainer(trainerId: string): Promise<TrainerFeedbackRow[]> {
  const { data, error } = await supabase
    .from('trainer_feedback')
    .select('*')
    .eq('trainer_id', trainerId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as TrainerFeedbackRow[];
}

/**
 * Writes a note. The insert policy pins `trainer_id` to `auth.uid()`, so a
 * trainer cannot sign one with a colleague's name — passing the id here is for
 * the row, not for authorisation.
 *
 * The member is notified by a trigger rather than from here: feedback nobody is
 * told about is a note in a drawer, and a client that could skip the message
 * would eventually skip it.
 */
export async function leaveFeedback(input: {
  trainerId: string;
  memberId: string;
  note: string;
  recommendation?: string;
  ptSessionId?: string;
}): Promise<TrainerFeedbackRow> {
  const { data, error } = await supabase
    .from('trainer_feedback')
    .insert({
      trainer_id: input.trainerId,
      member_id: input.memberId,
      note: input.note.trim(),
      recommendation: input.recommendation?.trim() || null,
      pt_session_id: input.ptSessionId ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as TrainerFeedbackRow;
}

/** Corrects a note. Only the author's own rows match the policy. */
export async function updateFeedback(
  id: string,
  updates: { note?: string; recommendation?: string | null },
): Promise<void> {
  const { data, error } = await supabase
    .from('trainer_feedback')
    .update(updates)
    .eq('id', id)
    .select('id');
  if (error) throw error;
  // A zero-row update is not an error in PostgREST, so without this a note
  // edited by anyone but its author would report success and change nothing.
  if (!data || data.length === 0) {
    throw new Error('That note could not be updated — it may not be yours to edit.');
  }
}
