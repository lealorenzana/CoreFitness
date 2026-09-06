import { supabase } from '../supabaseClient';
import type { BookingRow, BookingStatus, ClassRow, ProfileRow } from '../../types/db';

/**
 * One commitment a member already holds — a class booking or a PT session —
 * as a half-open interval. Mirrors `member_commitments()` in migration 0068.
 */
export interface Commitment {
  source: 'class' | 'pt';
  ref_id: string;
  starts_at: string;
  ends_at: string;
  label: string;
}

/**
 * Everything this member is already booked into, across both tables.
 *
 * The booking triggers (0068) are the boundary — this read only lets a slot
 * picker grey out a time *before* it is tapped. Never treat an empty result as
 * permission: the member may have booked on another device a second ago.
 *
 * Self or front desk only; the function raises for anyone else.
 */
export async function listMemberCommitments(memberId: string): Promise<Commitment[]> {
  const { data, error } = await supabase.rpc('member_commitments', { p_member: memberId });
  if (error) throw error;
  return (data ?? []) as Commitment[];
}

/** True when `[startsAt, +minutes)` overlaps something already held. */
export function clashesWith(
  held: Commitment[],
  startsAt: string,
  durationMinutes: number,
): Commitment | null {
  const start = new Date(startsAt).getTime();
  const end = start + durationMinutes * 60_000;
  // Half-open on both sides, matching the SQL: a class ending at 11:00 and a
  // session starting at 11:00 do not clash.
  return held.find((c) => {
    const hs = new Date(c.starts_at).getTime();
    const he = new Date(c.ends_at).getTime();
    return hs < end && start < he;
  }) ?? null;
}

export interface BookingWithDetails extends BookingRow {
  classes: ClassRow;
}

/** Admin: every booking, most recent first. */
export async function listBookings(): Promise<BookingWithDetails[]> {
  const { data, error } = await supabase
    .from('bookings')
    .select('*, classes(*)')
    .order('requested_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as BookingWithDetails[];
}

export async function listMemberBookings(memberId: string): Promise<BookingWithDetails[]> {
  const { data, error } = await supabase
    .from('bookings')
    .select('*, classes(*)')
    .eq('member_id', memberId)
    .order('requested_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as BookingWithDetails[];
}

/** Trainer: bookings for classes this trainer teaches (matches the bookings_select_trainer RLS policy). */
export async function listTrainerBookings(trainerId: string): Promise<BookingWithDetails[]> {
  const { data, error } = await supabase
    .from('bookings')
    .select('*, classes!inner(*)')
    .eq('classes.trainer_id', trainerId)
    .order('requested_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as BookingWithDetails[];
}

export async function createBooking(memberId: string, classId: string): Promise<BookingRow> {
  const { data, error } = await supabase
    .from('bookings')
    .insert({ member_id: memberId, class_id: classId, status: 'pending' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * The member withdraws their own booking (bookings_cancel_self, migration 0016).
 *
 * Cancelled, not deleted: the seat is released either way, but keeping the row
 * means the history the member sees matches the history the gym sees. The
 * policy's `with check` pins the only reachable status to 'cancelled', so this
 * cannot be repurposed to self-approve.
 */
export async function cancelOwnBooking(id: string): Promise<void> {
  // `.select()` so a zero-row result can be told apart from success. PostgREST
  // returns no error for an UPDATE that matched nothing, so without this a
  // cancellation RLS declined would report "Cancelled" and leave the seat taken.
  const { data, error } = await supabase
    .from('bookings')
    .update({ status: 'cancelled' })
    .eq('id', id)
    .select('id');
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error('That booking could not be cancelled. Please refresh and try again.');
  }
}

/**
 * Approve or reject a pending booking.
 *
 * Reachable by an admin (`bookings_update_admin`) and, since 0071, by the
 * trainer who teaches the class (`bookings_update_trainer`). Anyone else gets a
 * zero-row update, which the guard below turns into a visible failure rather
 * than a button that appears to work.
 */
export async function updateBookingStatus(
  id: string,
  status: Extract<BookingStatus, 'approved' | 'rejected'>,
  approvedBy: ProfileRow['id']
): Promise<void> {
  const now = new Date().toISOString();
  const updates: Partial<BookingRow> =
    status === 'approved'
      ? { status, approved_at: now, approved_by: approvedBy }
      : { status, rejected_at: now };
  const { data, error } = await supabase
    .from('bookings')
    .update(updates)
    .eq('id', id)
    .select('id');
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error('That booking could not be updated — it may already have been decided.');
  }
}
