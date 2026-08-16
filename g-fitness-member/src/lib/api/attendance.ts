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
