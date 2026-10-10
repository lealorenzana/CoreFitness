import { assertWrote } from './mutate';
import { supabase } from '../supabaseClient';

/**
 * Saved workout routines and the guided sessions that run them (migration 0086).
 *
 * A routine is the plan ("Leg day: squat 4×8 @ 60 kg, rest 2 min …"); running
 * it creates an ordinary `workout_logs` session with `routine_id` set, and each
 * ticked set is an ordinary `workout_sets` row — so points, achievements,
 * Progress and the trainer's view all count it with no extra plumbing.
 */

export interface RoutineExercise {
  /** Absent on a row that has not been saved yet. */
  id?: string;
  exerciseId: string | null;
  customName: string | null;
  /** Denormalised from the catalogue for display; not written. */
  name: string;
  isTimed: boolean;
  targetSets: number;
  targetReps: number | null;
  targetWeightKg: number | null;
  targetSeconds: number | null;
  restSeconds: number;
  /** From the catalogue, for display only (the run screen's backdrop). Absent on custom rows. */
  muscleGroup?: string | null;
  /** A program day (0173): what last week asked for, when this week asks for more — "last week 40 kg". */
  lastWeek?: string | null;
  equipment?: string | null;
}

export interface Routine {
  id: string;
  name: string;
  notes: string | null;
  position: number;
  exercises: RoutineExercise[];
  updatedAt: string;
  /** 0145: 'coach' when the member applied the AI coach's proposal; 0172: 'trainer' when a coach wrote it. */
  source: 'member' | 'coach' | 'trainer';
  /** The coach who wrote it (source 'trainer'), first name. */
  authorName: string | null;
  /** 0172: a coach changed it — who and when ("Edited by Coach Ben"). */
  editedByName: string | null;
  editedAt: string | null;
}

/** Where a routine came from, as the member reads it (2026-10-10). */
export function routineSourceLabel(r: Pick<Routine, 'source' | 'authorName'>, coachWord = 'Coach'): string {
  if (r.source === 'coach') return 'AI coach';
  if (r.source === 'trainer') return r.authorName ? `${coachWord} ${r.authorName}` : coachWord;
  return 'Yours';
}

interface RoutineRow {
  id: string; name: string; notes: string | null; position: number; updated_at: string;
  source?: string | null;
  edited_at?: string | null;
  author?: { first_name: string | null } | null;
  editor?: { first_name: string | null } | null;
  workout_routine_exercises: {
    id: string; position: number; exercise_id: string | null; custom_name: string | null;
    target_sets: number; target_reps: number | null; target_weight_kg: string | number | null;
    target_seconds: number | null; rest_seconds: number;
    exercises: { name: string; is_timed: boolean; muscle_group?: string | null; equipment?: string | null } | null;
  }[];
}

const BASE_SELECT = `id, name, notes, position, updated_at,
  workout_routine_exercises (id, position, exercise_id, custom_name, target_sets, target_reps,
    target_weight_kg, target_seconds, rest_seconds, exercises (name, is_timed, muscle_group, equipment))`;
// 0145's `source` first; before 0145 the column does not exist and the routine is the member's.
const SELECT_0145 = `source, ${BASE_SELECT}`;
// 0172's authorship: who wrote it, who last edited it. Falls back to 0145, then to the bare columns.
const SELECT = `source, edited_at, author:profiles!workout_routines_author_id_fkey(first_name),
  editor:profiles!workout_routines_edited_by_fkey(first_name), ${BASE_SELECT}`;

function toRoutine(r: RoutineRow): Routine {
  return {
    id: r.id,
    name: r.name,
    notes: r.notes,
    position: r.position,
    updatedAt: r.updated_at,
    source: r.source === 'coach' ? 'coach' : r.source === 'trainer' ? 'trainer' : 'member',
    authorName: r.author?.first_name ?? null,
    editedByName: r.editor?.first_name ?? null,
    editedAt: r.edited_at ?? null,
    exercises: [...(r.workout_routine_exercises ?? [])]
      .sort((a, b) => a.position - b.position)
      .map((e) => ({
        id: e.id,
        exerciseId: e.exercise_id,
        customName: e.custom_name,
        name: e.exercises?.name ?? e.custom_name ?? 'Exercise',
        isTimed: e.exercises?.is_timed ?? false,
        targetSets: e.target_sets,
        targetReps: e.target_reps,
        targetWeightKg: e.target_weight_kg == null ? null : Number(e.target_weight_kg),
        targetSeconds: e.target_seconds,
        restSeconds: e.rest_seconds,
        muscleGroup: e.exercises?.muscle_group ?? null,
        equipment: e.exercises?.equipment ?? null,
      })),
  };
}

export async function listRoutines(memberId: string): Promise<Routine[]> {
  const q = (cols: string) => supabase
    .from('workout_routines')
    .select(cols)
    .eq('member_id', memberId)
    .order('position')
    .order('created_at');
  let res = await q(SELECT);
  if (res.error) res = await q(SELECT_0145);
  if (res.error) res = await q(BASE_SELECT);
  const { data, error } = res;
  if (error) throw error;
  return ((data ?? []) as unknown as RoutineRow[]).map(toRoutine);
}

export async function getRoutine(id: string): Promise<Routine | null> {
  const q = (cols: string) => supabase.from('workout_routines').select(cols).eq('id', id).maybeSingle();
  let res = await q(SELECT);
  if (res.error) res = await q(SELECT_0145);
  if (res.error) res = await q(BASE_SELECT);
  const { data, error } = res;
  if (error) throw error;
  return data ? toRoutine(data as unknown as RoutineRow) : null;
}

export interface RoutineDraft {
  id?: string;
  name: string;
  notes: string | null;
  exercises: RoutineExercise[];
}

/**
 * Create or update a routine, and replace its exercise list.
 *
 * The list is replaced rather than diffed: a routine is a handful of rows, the
 * member edits it as a whole, and a diff would need an id per row to survive
 * reordering. Deleting "all of this routine's exercises" legitimately matches
 * zero rows on a new routine, so that delete is not `assertWrote`-guarded; the
 * header update is.
 */
export async function saveRoutine(memberId: string, draft: RoutineDraft): Promise<string> {
  let id = draft.id;
  if (id) {
    const { data, error } = await supabase
      .from('workout_routines')
      .update({ name: draft.name.trim(), notes: draft.notes?.trim() || null })
      .eq('id', id)
      .select('id');
    if (error) throw error;
    assertWrote(data, 'That routine could not be saved — it may not be yours to change.');
    const del = await supabase.from('workout_routine_exercises').delete().eq('routine_id', id);
    if (del.error) throw del.error;
  } else {
    const { data, error } = await supabase
      .from('workout_routines')
      .insert({ member_id: memberId, name: draft.name.trim(), notes: draft.notes?.trim() || null })
      .select('id')
      .single();
    if (error) throw error;
    id = data.id as string;
  }

  if (draft.exercises.length > 0) {
    const { error } = await supabase.from('workout_routine_exercises').insert(
      draft.exercises.map((e, i) => ({
        routine_id: id,
        position: i,
        exercise_id: e.exerciseId,
        custom_name: e.exerciseId ? null : e.customName,
        target_sets: e.targetSets,
        target_reps: e.isTimed ? null : e.targetReps,
        target_weight_kg: e.isTimed ? null : e.targetWeightKg,
        target_seconds: e.isTimed ? e.targetSeconds : null,
        rest_seconds: e.restSeconds,
      })),
    );
    if (error) throw error;
  }
  return id as string;
}

export async function deleteRoutine(id: string): Promise<void> {
  const { data, error } = await supabase
    .from('workout_routines').delete().eq('id', id)
    .select('id');
  if (error) throw error;
  assertWrote(data, 'That routine could not be removed — it may not be yours.');
}

/** Opens a session for a routine. The routine's name is the session's activity. */
export async function startRoutineSession(memberId: string, routine: Routine): Promise<string> {
  const { data, error } = await supabase
    .from('workout_logs')
    .insert({ member_id: memberId, activity: routine.name, routine_id: routine.id })
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
}

/** The open (unfinished) session, with the routine it runs if any. */
export async function getOpenRoutineSession(memberId: string): Promise<
  { logId: string; routineId: string | null; gymWorkoutId: string | null; activity: string | null; startedAt: string } | null
> {
  // 0122's gym_workout_id first; before 0122 the column does not exist.
  const q = (cols: string) => supabase
    .from('workout_logs')
    .select(cols)
    .eq('member_id', memberId)
    .is('completed_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const full = await q('id, routine_id, gym_workout_id, activity, created_at');
  const { data, error } = !full.error ? full : await q('id, routine_id, activity, created_at');
  if (error) throw error;
  const row = data as unknown as Record<string, string | null> | null;
  return row
    ? {
        logId: row.id as string,
        routineId: row.routine_id ?? null,
        gymWorkoutId: row.gym_workout_id ?? null,
        activity: row.activity ?? null,
        startedAt: row.created_at as string,
      }
    : null;
}

export interface SessionHeader {
  logId: string;
  routineId: string | null;
  /** A gym program day (0122) runs a gym workout instead of the member's routine. */
  gymWorkoutId: string | null;
  /** The program day it runs (0122): its week decides the targets (0173). */
  programDayId: string | null;
  activity: string | null;
  startedAt: string;
  completedAt: string | null;
}

export async function getSession(logId: string): Promise<SessionHeader | null> {
  const q = (cols: string) => supabase.from('workout_logs').select(cols).eq('id', logId).maybeSingle();
  let res = await q('id, routine_id, gym_workout_id, program_day_id, activity, created_at, completed_at');
  if (res.error) res = await q('id, routine_id, activity, created_at, completed_at');
  const { data, error } = res;
  if (error) throw error;
  const row = data as unknown as Record<string, string | null> | null;
  return row
    ? {
        logId: row.id as string,
        routineId: row.routine_id ?? null,
        gymWorkoutId: row.gym_workout_id ?? null,
        programDayId: row.program_day_id ?? null,
        activity: row.activity ?? null,
        startedAt: row.created_at as string,
        completedAt: row.completed_at ?? null,
      }
    : null;
}

/** Abandon an open session and every set in it (sets cascade). */
export async function discardSession(logId: string): Promise<void> {
  const { data, error } = await supabase
    .from('workout_logs').delete().eq('id', logId).is('completed_at', null)
    .select('id');
  if (error) throw error;
  assertWrote(data, 'That workout could not be discarded — it may already be finished.');
}

export interface LastSet {
  setNumber: number;
  reps: number | null;
  weightKg: number | null;
  durationSeconds: number | null;
}

/** Per exercise, the sets from the last finished session that included it. */
export async function lastSetsFor(exerciseIds: string[]): Promise<Map<string, LastSet[]>> {
  const out = new Map<string, LastSet[]>();
  if (exerciseIds.length === 0) return out;
  const { data, error } = await supabase.rpc('member_last_sets', { p_exercises: exerciseIds });
  if (error) throw error;
  for (const r of (data ?? []) as {
    exercise_id: string; set_number: number; reps: number | null;
    weight_kg: string | number | null; duration_seconds: number | null;
  }[]) {
    const list = out.get(r.exercise_id) ?? [];
    list.push({
      setNumber: r.set_number,
      reps: r.reps,
      weightKg: r.weight_kg == null ? null : Number(r.weight_kg),
      durationSeconds: r.duration_seconds,
    });
    out.set(r.exercise_id, list);
  }
  return out;
}

// ── What was done on a day ─────────────────────────────────────────────────

export interface DayWorkout {
  logId: string;
  activity: string | null;
  durationMinutes: number | null;
  completedAt: string;
  exercises: { name: string; sets: { setNumber: number; reps: number | null; weightKg: number | null; durationSeconds: number | null }[] }[];
}

interface DayRow {
  id: string; activity: string | null; duration_minutes: number | null; completed_at: string;
  workout_sets: {
    set_number: number; reps: number | null; weight_kg: string | number | null;
    duration_seconds: number | null; custom_name: string | null; created_at: string;
    exercises: { name: string } | null;
  }[];
}

/** Finished workouts on one calendar day (a `YYYY-MM-DD` key from utils/dates). */
export async function listDayWorkouts(memberId: string, day: string): Promise<DayWorkout[]> {
  const { data, error } = await supabase
    .from('workout_logs')
    .select('id, activity, duration_minutes, completed_at, workout_sets (set_number, reps, weight_kg, duration_seconds, custom_name, created_at, exercises (name))')
    .eq('member_id', memberId)
    .eq('performed_on', day)
    .not('completed_at', 'is', null)
    .order('completed_at');
  if (error) throw error;
  return ((data ?? []) as unknown as DayRow[]).map((l) => {
    // Grouped in the order the exercises were done.
    const byName = new Map<string, DayWorkout['exercises'][number]>();
    for (const s of [...l.workout_sets].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
      const name = s.exercises?.name ?? s.custom_name ?? 'Exercise';
      const entry = byName.get(name) ?? { name, sets: [] };
      entry.sets.push({
        setNumber: s.set_number,
        reps: s.reps,
        weightKg: s.weight_kg == null ? null : Number(s.weight_kg),
        durationSeconds: s.duration_seconds,
      });
      byName.set(name, entry);
    }
    return {
      logId: l.id,
      activity: l.activity,
      durationMinutes: l.duration_minutes,
      completedAt: l.completed_at,
      exercises: [...byName.values()],
    };
  });
}

/** The days in a range with at least one finished workout, for calendar marks. */
export async function listWorkoutDays(memberId: string, from: string, to: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('workout_logs')
    .select('performed_on')
    .eq('member_id', memberId)
    .not('completed_at', 'is', null)
    .gte('performed_on', from)
    .lte('performed_on', to);
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.performed_on as string));
}

/** "4 exercises · 14 sets · about 45 min" — the estimate counts work and rest. */
export function routineSummary(r: Routine): string {
  const sets = r.exercises.reduce((n, e) => n + e.targetSets, 0);
  const seconds = r.exercises.reduce(
    (t, e) => t + e.targetSets * ((e.isTimed ? e.targetSeconds ?? 45 : 45) + e.restSeconds), 0);
  const minutes = Math.max(5, Math.round(seconds / 60 / 5) * 5);
  return `${r.exercises.length} ${r.exercises.length === 1 ? 'exercise' : 'exercises'} · ${sets} sets · about ${minutes} min`;
}
