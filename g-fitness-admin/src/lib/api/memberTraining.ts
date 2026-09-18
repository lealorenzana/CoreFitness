import { supabase } from '../supabaseClient';

/**
 * What a member set up in the phone app, read for the member drawer — the
 * admin side of features that were member-only until 2026-09-19:
 *
 *   plan       their training days, reminder time and routine per day (0030/0089)
 *   routines   the routines they built (0086)
 *   notes      coach notes as `trainer_feedback` records (0072), with whether the
 *              member opened them and ticked the next step off (0088)
 *   goal value the current value of each goal, from `goal_current_value` (0087)
 *              — the same number the member's own Goals tab shows
 *
 * Each read fails soft to null, and the drawer says "could not be read" for a
 * null rather than drawing an empty section that looks like "none".
 */

export interface MemberPlan {
  days: number[];
  remindAt: string | null;
  /** day → routine name; a day missing from the map is "any workout". */
  routineByDay: Record<number, string>;
}

export async function getMemberPlan(memberId: string): Promise<MemberPlan | null> {
  const { data, error } = await supabase
    .from('gym_plans').select('*').eq('member_id', memberId).eq('active', true)
    .order('day_of_week');
  if (error) return null;
  const rows = (data ?? []) as { day_of_week: number; remind_at: string; routine_id?: string | null }[];
  const ids = [...new Set(rows.map((r) => r.routine_id).filter((x): x is string => !!x))];
  const names = new Map<string, string>();
  if (ids.length) {
    const { data: rs } = await supabase.from('workout_routines').select('id, name').in('id', ids);
    for (const r of (rs ?? []) as { id: string; name: string }[]) names.set(r.id, r.name);
  }
  const routineByDay: Record<number, string> = {};
  for (const r of rows) if (r.routine_id && names.has(r.routine_id)) routineByDay[r.day_of_week] = names.get(r.routine_id)!;
  return { days: rows.map((r) => r.day_of_week), remindAt: rows[0]?.remind_at ?? null, routineByDay };
}

export interface MemberRoutine { id: string; name: string; exerciseCount: number; updatedAt: string }

export async function listMemberRoutines(memberId: string): Promise<MemberRoutine[] | null> {
  const { data, error } = await supabase
    .from('workout_routines')
    .select('id, name, updated_at, workout_routine_exercises (id)')
    .eq('member_id', memberId)
    .order('position');
  if (error) return null;
  return ((data ?? []) as { id: string; name: string; updated_at: string; workout_routine_exercises: { id: string }[] }[])
    .map((r) => ({ id: r.id, name: r.name, updatedAt: r.updated_at, exerciseCount: r.workout_routine_exercises?.length ?? 0 }));
}

export interface CoachNoteRecord {
  id: string;
  createdAt: string;
  coach: string;
  note: string;
  recommendation: string | null;
  /** 0088 — absent (undefined) before it is live, so the drawer shows no status. */
  seenAt?: string | null;
  doneAt?: string | null;
}

/** Admin only — 0072's policy. Null for staff, and the drawer falls back. */
export async function listCoachNotes(memberId: string): Promise<CoachNoteRecord[] | null> {
  const { data, error } = await supabase
    .from('trainer_feedback').select('*').eq('member_id', memberId)
    .order('created_at', { ascending: false });
  if (error) return null;
  const rows = (data ?? []) as {
    id: string; created_at: string; trainer_id: string; note: string; recommendation: string | null;
    seen_at?: string | null; done_at?: string | null;
  }[];
  const ids = [...new Set(rows.map((r) => r.trainer_id))];
  const names = new Map<string, string>();
  if (ids.length) {
    const { data: ps } = await supabase.from('profiles').select('id, first_name, last_name').in('id', ids);
    for (const p of (ps ?? []) as { id: string; first_name: string | null; last_name: string | null }[]) {
      names.set(p.id, `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim());
    }
  }
  return rows.map((r) => ({
    id: r.id, createdAt: r.created_at, coach: names.get(r.trainer_id) || 'A coach',
    note: r.note, recommendation: r.recommendation,
    ...('seen_at' in r ? { seenAt: r.seen_at ?? null, doneAt: r.done_at ?? null } : {}),
  }));
}

/** goal id → current value (0087); null where the database has none. */
export async function getGoalValues(goalIds: string[]): Promise<Record<string, number | null>> {
  const pairs = await Promise.all(goalIds.map(async (id) => {
    const { data, error } = await supabase.rpc('goal_current_value', { p_goal: id });
    return [id, error || data == null ? null : Number(data)] as const;
  }));
  return Object.fromEntries(pairs);
}
