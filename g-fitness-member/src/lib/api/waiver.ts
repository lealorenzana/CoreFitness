import { supabase } from '../supabaseClient';

/**
 * The gym's waiver and the PAR-Q (0119).
 *
 * A signature here is written only by `accept_waiver()` — the table has no
 * INSERT policy, because a signature the client can write is not a signature.
 * The PAR-Q questions come from `parq_questions()` in SQL rather than from this
 * file, so a screen cannot quietly ask fewer of them.
 *
 * A "yes" is a referral to the desk and a doctor. It never changes training and
 * never blocks by itself (CLAUDE.md: a stated injury yields a referral, never a
 * changed exercise).
 */

export interface WaiverStatus {
  waiverId: string;
  version: number;
  title: string;
  body: string;
  /** Null until this member signs this version. */
  acceptedAt: string | null;
  /** Whether this gym refuses bookings until it is signed. */
  required: boolean;
  flagged: boolean;
}

export interface ParqQuestion { key: string; question: string }

/**
 * Null when the gym has published no waiver (or 0119 is not pasted). Both mean
 * "nothing to sign", and the screen then says so rather than inventing one.
 */
export async function myWaiverStatus(): Promise<WaiverStatus | null> {
  const { data, error } = await supabase.rpc('my_waiver_status');
  if (error || !Array.isArray(data) || !data[0]) return null;
  const r = data[0] as {
    waiver_id: string; version: number; title: string; body: string;
    accepted_at: string | null; required: boolean; flagged: boolean;
  };
  return {
    waiverId: r.waiver_id, version: r.version, title: r.title, body: r.body,
    acceptedAt: r.accepted_at, required: r.required, flagged: r.flagged,
  };
}

export async function parqQuestions(): Promise<ParqQuestion[]> {
  const { data, error } = await supabase.rpc('parq_questions');
  if (error || !Array.isArray(data)) return [];
  return (data as { key: string; question: string; sort_order: number }[])
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(({ key, question }) => ({ key, question }));
}

/** Returns whether any answer was yes — which refers them to the desk. */
export async function acceptWaiver(
  waiverId: string, answers: Record<string, boolean>
): Promise<boolean> {
  const { data, error } = await supabase.rpc('accept_waiver', {
    p_waiver: waiverId, p_answers: answers,
  });
  if (error) throw new Error(error.message);
  return data === true;
}
