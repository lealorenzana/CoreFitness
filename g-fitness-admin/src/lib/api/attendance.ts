import { supabase } from '../supabaseClient';
import type { AttendanceRow, CheckinMethod } from '../../types/db';

export async function listAttendance(gymId?: string): Promise<AttendanceRow[]> {
  let query = supabase.from('attendance').select('*').order('check_in_time', { ascending: false });
  if (gymId) query = query.eq('gym_id', gymId);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function listMemberAttendance(memberId: string): Promise<AttendanceRow[]> {
  const { data, error } = await supabase
    .from('attendance')
    .select('*')
    .eq('member_id', memberId)
    .order('check_in_time', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/**
 * Undo a check-in the desk just got wrong (migration 0035).
 *
 * Verified, not assumed. `attendance` had no DELETE policy at all until 0035, and
 * RLS filters unmatched rows silently — a DELETE that removes nothing is not an
 * error in PostgreSQL, so without `.select()` this would report success on a
 * database that still forbids it. The policy also allows **today only**, so a
 * yesterday row comes back as zero rather than an error.
 */
export async function deleteCheckIn(id: string): Promise<void> {
  const { data, error } = await supabase.from('attendance').delete().eq('id', id).select('id');
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error(
      'That check-in was not removed. Only today\'s check-ins can be undone, and the database needs migration 0035.'
    );
  }
}

/** Admin/trainer only per RLS (attendance_insert_staff) — a member never self-reports a check-in. */
export async function recordCheckIn(input: {
  memberId: string;
  gymId?: string;
  method: CheckinMethod;
  recordedBy: string;
  /** One of gym_settings.activity_options (0018). Omitted rather than guessed
   *  when the front desk didn't ask — a NULL is honest, a default is fiction. */
  activity?: string;
}): Promise<AttendanceRow> {
  const { data, error } = await supabase
    .from('attendance')
    .insert({
      member_id: input.memberId,
      gym_id: input.gymId ?? null,
      method: input.method,
      recorded_by: input.recordedBy,
      activity: input.activity ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}
