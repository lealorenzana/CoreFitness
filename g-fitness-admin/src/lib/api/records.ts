import { supabase } from '../supabaseClient';

/**
 * Personal records, from the gym's side (0123). Detecting one is the database's
 * (the workout_sets trigger); the desk can remove a record that is obviously not
 * real. The monthly season these once shared a module with went with 0275.
 */

export interface MemberRecord { id: string; exerciseName: string; kind: 'weight' | 'duration'; value: number; previous: number; achievedAt: string }

const clean = (m: string) => m.replace(/^.*?: /, '');

export async function memberRecords(memberId: string): Promise<MemberRecord[] | null> {
  const { data, error } = await supabase.rpc('member_personal_records', { p_member: memberId });
  if (error) return null;
  return ((data ?? []) as { id: string; exercise_name: string; kind: 'weight' | 'duration'; value: number;
    previous: number; achieved_at: string }[]).map((r) => ({
    id: r.id, exerciseName: r.exercise_name, kind: r.kind, value: Number(r.value), previous: Number(r.previous),
    achievedAt: r.achieved_at,
  })).sort((a, b) => b.achievedAt.localeCompare(a.achievedAt));
}

export async function removeRecord(prId: string): Promise<void> {
  const { error } = await supabase.rpc('remove_personal_record', { p_pr: prId });
  if (error) throw new Error(clean(error.message));
}

export const recordValue = (kind: 'weight' | 'duration', v: number) =>
  kind === 'weight' ? `${Number.isInteger(v) ? v : v.toFixed(1)} kg` : `${Math.round(v)} s`;
