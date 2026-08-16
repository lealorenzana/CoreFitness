import { supabase } from '../supabaseClient';
import type { BookingRow, BookingStatus, ClassRow, ProfileRow } from '../../types/db';

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
  const { error } = await supabase.from('bookings').update({ status: 'cancelled' }).eq('id', id);
  if (error) throw error;
}

/** Admin-only per RLS (bookings_update_admin) — approve or reject a pending booking. */
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
  const { error } = await supabase.from('bookings').update(updates).eq('id', id);
  if (error) throw error;
}
