import { supabase } from '../supabaseClient';
import { todayKey } from '../../utils/dates';

/**
 * The door (0200): the owner's two switches, coach check-ins, and the
 * activity a member picked on their QR screen.
 *
 * Coaches have their own table — a coach is never a member visit (no points,
 * streaks or member counts). Every write goes through a SECURITY DEFINER
 * function; nothing here inserts into a table directly.
 */

export interface DoorSettings {
  /** Members tap what they are doing today on their QR screen. */
  memberPick: boolean;
  /** Each coach gets a QR and checks in at the desk or the kiosk. */
  coachCheckin: boolean;
}

/** Null before 0200 — the screens then show neither switch nor coaches. */
export async function getDoorSettings(): Promise<DoorSettings | null> {
  const { data, error } = await supabase.from('gym_settings').select('member_activity_pick, coach_checkin_on').maybeSingle();
  if (error || !data) return null;
  const r = data as { member_activity_pick: boolean; coach_checkin_on: boolean };
  return { memberPick: !!r.member_activity_pick, coachCheckin: !!r.coach_checkin_on };
}

/** The owner only (the function refuses anyone else). Null leaves a switch as it is. */
export async function setDoorSettings(memberPick: boolean | null, coachCheckin: boolean | null): Promise<void> {
  const { error } = await supabase.rpc('set_door_settings', { p_member_pick: memberPick, p_coach_checkin: coachCheckin });
  if (error) throw error;
}

export interface DoorCoach {
  id: string;
  name: string;
  photo: string | null;
  /** Today's check-in, or null if not in yet. */
  checkedInAt: string | null;
  checkinId: string | null;
}

/** The gym's active coaches with today's check-in. Empty when the desk may not read them. */
export async function listDoorCoaches(): Promise<DoorCoach[]> {
  const { data, error } = await supabase.rpc('door_coaches');
  if (error) throw error;
  return ((data ?? []) as { trainer_id: string; first_name: string | null; last_name: string | null; photo_url: string | null; checked_in_at: string | null; checkin_id: string | null }[])
    .map((r) => ({ id: r.trainer_id, name: [r.first_name, r.last_name].filter(Boolean).join(' ') || 'Coach', photo: r.photo_url, checkedInAt: r.checked_in_at, checkinId: r.checkin_id }));
}

export async function recordCoachCheckin(trainerId: string, method: 'qr' | 'manual', source: 'desk' | 'kiosk'): Promise<{ id: string; at: string }> {
  const { data, error } = await supabase.rpc('record_coach_checkin', { p_trainer: trainerId, p_method: method, p_source: source });
  if (error) throw error;
  const r = (Array.isArray(data) ? data[0] : data) as { id: string; check_in_time: string };
  return { id: r.id, at: r.check_in_time };
}

/** The wrong coach scanned — today only. */
export async function undoCoachCheckin(id: string): Promise<void> {
  const { error } = await supabase.rpc('undo_coach_checkin', { p_id: id });
  if (error) throw error;
}

/**
 * The activity each member will check in with, if they picked one: today's
 * pick when it was made today (even "nothing"), otherwise their usual — the
 * same rule the database trigger applies. Empty before 0200 or when the read
 * fails; the check-in never depends on it.
 */
export async function listTodayPicks(): Promise<Map<string, string>> {
  const { data, error } = await supabase.from('checkin_picks').select('member_id, today, today_on, usual');
  const out = new Map<string, string>();
  if (error || !data) return out;
  const today = todayKey();
  for (const r of data as { member_id: string; today: string | null; today_on: string | null; usual: string | null }[]) {
    const v = r.today_on === today ? r.today : r.usual;
    if (v) out.set(r.member_id, v);
  }
  return out;
}
