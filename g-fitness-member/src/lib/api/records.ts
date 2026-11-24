import { supabase } from '../supabaseClient';

/**
 * Personal records and the opt-in record wall (0123).
 *
 * Everything here is read or asked for, never decided: the database detects a
 * PR (a trigger on workout_sets). The wall shows only members who opted in
 * (`show_on_boards`, off by default); a member's own records are theirs either
 * way. The monthly season that shared this module went with 0275.
 */

export interface WallRow { firstName: string; lastInitial: string; exerciseName: string; kind: 'weight' | 'duration'; value: number; achievedAt: string }
export interface Record_ { id: string; exerciseName: string; kind: 'weight' | 'duration'; value: number; previous: number; achievedAt: string }

const clean = (m: string) => m.replace(/^.*?: /, '');

export async function prWall(): Promise<WallRow[]> {
  const { data, error } = await supabase.rpc('pr_wall');
  if (error) return [];
  return ((data ?? []) as { first_name: string; last_initial: string; exercise_name: string; kind: 'weight' | 'duration';
    value: number; achieved_at: string }[]).map((w) => ({
    firstName: w.first_name, lastInitial: w.last_initial, exerciseName: w.exercise_name, kind: w.kind,
    value: Number(w.value), achievedAt: w.achieved_at,
  }));
}

export async function personalRecords(memberId: string): Promise<Record_[] | null> {
  const { data, error } = await supabase.rpc('member_personal_records', { p_member: memberId });
  if (error) return null;
  return ((data ?? []) as { id: string; exercise_name: string; kind: 'weight' | 'duration'; value: number;
    previous: number; achieved_at: string }[]).map((r) => ({
    id: r.id, exerciseName: r.exercise_name, kind: r.kind, value: Number(r.value), previous: Number(r.previous),
    achievedAt: r.achieved_at,
  })).sort((a, b) => b.achievedAt.localeCompare(a.achievedAt));
}

/** Whether a set just logged came back as a record — the player's celebration. */
export async function setWasRecord(setId: string): Promise<boolean> {
  const { data, error } = await supabase.from('personal_records').select('id').eq('set_id', setId).limit(1);
  return !error && (data ?? []).length > 0;
}

export async function getShowOnBoards(memberId: string): Promise<boolean | null> {
  const { data, error } = await supabase.from('member_profiles').select('show_on_boards')
    .eq('profile_id', memberId).maybeSingle();
  if (error || !data) return null;
  return !!(data as { show_on_boards: boolean }).show_on_boards;
}

export async function setShowOnBoards(on: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_show_on_boards', { p_on: on });
  if (error) throw new Error(clean(error.message));
}

export const recordValue = (kind: 'weight' | 'duration', v: number) =>
  kind === 'weight' ? `${Number.isInteger(v) ? v : v.toFixed(1)} kg` : `${Math.round(v)} s`;
