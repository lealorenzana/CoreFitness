import { supabase } from '../supabaseClient';
import type { BookingStatus } from '../../types/db';

/**
 * 1-on-1 personal training (migration 0015).
 *
 * Separate from `classes`/`bookings` on purpose: a class has a roster and a
 * capacity, a PT session has exactly one member. Routing PT through classes
 * would mean capacity-1 classes, and every "how full is this class" query would
 * quietly count PT sessions too.
 */
export interface PtSessionRow {
  id: string;
  trainer_id: string;
  member_id: string;
  starts_at: string;
  duration_minutes: number;
  status: BookingStatus;
  notes: string | null;
  requested_at: string;
  approved_at: string | null;
  approved_by: string | null;
  created_at: string;
}

export async function listPtSessions(): Promise<PtSessionRow[]> {
  const { data, error } = await supabase
    .from('pt_sessions')
    .select('*')
    .order('starts_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function listTrainerPtSessions(trainerId: string): Promise<PtSessionRow[]> {
  const { data, error } = await supabase
    .from('pt_sessions')
    .select('*')
    .eq('trainer_id', trainerId)
    .order('starts_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function listMemberPtSessions(memberId: string): Promise<PtSessionRow[]> {
  const { data, error } = await supabase
    .from('pt_sessions')
    .select('*')
    .eq('member_id', memberId)
    .order('starts_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/**
 * Requests a session. Starts 'pending' — approval is a front-desk action, per
 * the decision that trainers see requests but don't confirm them.
 *
 * A partial unique index on (trainer_id, starts_at) enforces no double-booking
 * server-side, so a race between two members picking the same slot fails at the
 * database rather than quietly overbooking the trainer. That surfaces here as a
 * duplicate-key error (23505), rewritten into something a receptionist can read.
 */
export async function requestPtSession(input: {
  trainerId: string;
  memberId: string;
  startsAt: string;
  durationMinutes?: number;
  notes?: string;
}): Promise<PtSessionRow> {
  const { data, error } = await supabase
    .from('pt_sessions')
    .insert({
      trainer_id: input.trainerId,
      member_id: input.memberId,
      starts_at: input.startsAt,
      duration_minutes: input.durationMinutes ?? 60,
      notes: input.notes ?? null,
      status: 'pending',
    })
    .select()
    .single();
  if (error) {
    if (error.code === '23505') {
      throw new Error('That slot has just been taken. Please pick another time.');
    }
    // 0068's guards raise a sentence written for the member — the clash it
    // names is the useful part, so it is passed through rather than replaced.
    throw error;
  }
  return data;
}

/**
 * Decide a request.
 *
 * Reachable by the front desk (`pt_sessions_update_frontdesk`) and, since 0071,
 * by the trainer the session belongs to (`pt_sessions_update_trainer`). A
 * trainer acting on someone else's session matches no policy, updates no rows,
 * and is caught by the zero-row guard rather than silently appearing to work.
 */
export async function setPtSessionStatus(
  id: string,
  status: Extract<BookingStatus, 'approved' | 'rejected' | 'cancelled'>
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  const updates: Partial<PtSessionRow> = { status };
  if (status === 'approved') {
    updates.approved_at = new Date().toISOString();
    updates.approved_by = user?.id ?? null;
  }
  const { data, error } = await supabase
    .from('pt_sessions')
    .update(updates)
    .eq('id', id)
    .select('id');
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error('That request could not be updated — it may already have been decided.');
  }
}

/** A member may withdraw their own request while it's still pending. */
export async function cancelPtSession(id: string): Promise<void> {
  const { data, error } = await supabase
    .from('pt_sessions')
    .delete()
    .eq('id', id)
    .select('id');
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error('That request could not be withdrawn — it may already have been approved.');
  }
}
