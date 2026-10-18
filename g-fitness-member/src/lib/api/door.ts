import { supabase } from '../supabaseClient';
import { addDays, todayKey } from '../../utils/dates';

/**
 * The door (0200), from the phone: a member's activity pick on their QR
 * screen, and a coach's own check-ins. The admin app has the desk's side
 * (its lib/api/door.ts) — the two differ on purpose.
 *
 * Every write is a SECURITY DEFINER function; a member never inserts a row.
 */

export interface MyDoor {
  /** The owner's two switches. */
  memberPick: boolean;
  coachCheckin: boolean;
  /** The gym's activities — what a member picks from. */
  options: string[];
  /** What this member will check in with: today's pick if made today, else their usual. */
  pick: string | null;
  /** Their usual, if they set one. */
  usual: string | null;
}

/** Null before 0200 (the sheet then shows no chips) or when it cannot be read. */
export async function getMyDoor(userId: string): Promise<MyDoor | null> {
  const { data, error } = await supabase.from('gym_settings').select('member_activity_pick, coach_checkin_on, activity_options').maybeSingle();
  if (error || !data) return null;
  const s = data as { member_activity_pick: boolean; coach_checkin_on: boolean; activity_options: string[] | null };
  const { data: p } = await supabase.from('checkin_picks').select('today, today_on, usual').eq('member_id', userId).maybeSingle();
  const row = p as { today: string | null; today_on: string | null; usual: string | null } | null;
  const options = s.activity_options ?? [];
  // A pick no longer on the gym's list is not shown as chosen (the trigger would still use it; the desk can override).
  const pick = row ? (row.today_on === todayKey() ? row.today : row.usual) : null;
  return { memberPick: !!s.member_activity_pick, coachCheckin: !!s.coach_checkin_on, options, pick: pick && options.includes(pick) ? pick : null, usual: row?.usual ?? null };
}

/** Today's pick (null = nothing today); `usual` true makes it the usual, false clears it, null leaves it. */
export async function setMyPick(activity: string | null, usual: boolean | null): Promise<{ today: string | null; usual: string | null }> {
  const { data, error } = await supabase.rpc('set_my_checkin_pick', { p_activity: activity, p_usual: usual });
  if (error) throw error;
  const r = (Array.isArray(data) ? data[0] : data) as { today: string | null; usual: string | null } | null;
  return { today: r?.today ?? null, usual: r?.usual ?? null };
}

export interface MyCoachDays {
  /** Today's check-in time, or null. */
  today: string | null;
  /** Days checked in, Monday to today. */
  week: number;
}

/** A coach's own check-ins this week (RLS: they read only their own). */
export async function myCoachCheckins(userId: string): Promise<MyCoachDays> {
  const today = todayKey();
  // Monday of this week, Manila: getDay() of a date key read at local noon.
  const dow = new Date(`${today}T12:00:00`).getDay();
  const monday = addDays(today, -((dow + 6) % 7));
  const { data, error } = await supabase.from('coach_checkins').select('day, check_in_time').eq('trainer_id', userId).gte('day', monday);
  if (error) throw error;
  const rows = (data ?? []) as { day: string; check_in_time: string }[];
  return { today: rows.find((r) => r.day === today)?.check_in_time ?? null, week: rows.length };
}
