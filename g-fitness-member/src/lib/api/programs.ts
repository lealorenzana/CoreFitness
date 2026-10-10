import { supabase } from '../supabaseClient';
import type { Routine } from './routines';

/**
 * The gym's programs, from the member's and the coach's side (0122).
 *
 * A program is weeks × days; each day is a gym workout. Following one is an
 * enrolment (written only by the RPCs below, which check the Premium lock), and
 * running a day is an ordinary workout log — so it happens in the same player,
 * and earns what any workout earns. "Done" is computed from the logs by
 * `program_progress()`; nothing here stores a tick.
 *
 * A Premium program's row is readable by everybody in the gym, so a free member
 * sees it with a lock and the reason. Its days are not readable, which is why
 * `getProgram()` can return a program with no days: that is the lock, not an
 * empty program, and the screen must say which.
 */

export type Level = 'beginner' | 'intermediate' | 'advanced' | 'all_levels';

export interface ProgramSummary {
  id: string;
  name: string;
  description: string | null;
  coverUrl: string | null;
  level: Level;
  weeks: number;
  premium: boolean;
  /** 0173: the gym's, a coach's for this member, or the AI coach's. 'gym' before 0173. */
  source: 'gym' | 'trainer' | 'ai';
  authorName: string | null;
  /** Lighter every Nth week (0173), or null. */
  deloadEvery: number | null;
}

/** Where a program came from, as the member reads it. */
export function programSourceLabel(p: Pick<ProgramSummary, 'source' | 'authorName'>, coachWord = 'Coach'): string {
  if (p.source === 'ai') return 'AI coach';
  if (p.source === 'trainer') return p.authorName ? `${coachWord} ${p.authorName}` : coachWord;
  return 'Gym';
}

export interface ProgramDayRow { id: string; week: number; day: number; workoutId: string; workoutName: string }

export interface ProgressDay {
  programId: string; programName: string; dayId: string; week: number; day: number;
  workoutId: string; workoutName: string; done: boolean;
}

interface ProgramRow {
  id: string; name: string; description: string | null; cover_url: string | null; level: Level;
  weeks: number; premium: boolean;
  source?: string | null; deload_every?: number | null; author?: { first_name: string | null } | null;
}
const toSummary = (p: ProgramRow): ProgramSummary => ({
  id: p.id, name: p.name, description: p.description, coverUrl: p.cover_url, level: p.level,
  weeks: p.weeks, premium: p.premium,
  source: p.source === 'trainer' ? 'trainer' : p.source === 'ai' ? 'ai' : 'gym',
  authorName: p.author?.first_name ?? null, deloadEvery: p.deload_every ?? null,
});
const BASE_COLS = 'id, name, description, cover_url, level, weeks, premium';
// 0173's source, author and lighter week; before 0173 these columns do not exist.
const COLS = `${BASE_COLS}, source, deload_every, author:profiles!gym_programs_author_id_fkey(first_name)`;

/** Published programs. Empty before 0122, which reads as "the gym has none yet". */
export async function listGymPrograms(): Promise<ProgramSummary[]> {
  const q = (cols: string) => supabase.from('gym_programs').select(cols)
    .eq('published', true).eq('hidden', false).order('created_at');
  let res = await q(COLS);
  if (res.error) res = await q(BASE_COLS);
  const { data, error } = res;
  if (error) return [];
  return ((data ?? []) as unknown as ProgramRow[]).map(toSummary);
}

export async function getProgram(id: string): Promise<{ program: ProgramSummary; days: ProgramDayRow[] } | null> {
  const [p, d] = await Promise.all([
    supabase.from('gym_programs').select(COLS).eq('id', id).maybeSingle()
      .then(async (r) => (r.error ? supabase.from('gym_programs').select(BASE_COLS).eq('id', id).maybeSingle() : r)),
    supabase.from('gym_program_days').select('id, week, day, workout_id, gym_workouts (name)')
      .eq('program_id', id).order('week').order('day'),
  ]);
  if (p.error) throw p.error;
  if (!p.data) return null;
  const days = ((d.data ?? []) as unknown as { id: string; week: number; day: number; workout_id: string;
    gym_workouts: { name: string } | null }[])
    .map((r) => ({ id: r.id, week: r.week, day: r.day, workoutId: r.workout_id, workoutName: r.gym_workouts?.name ?? 'Workout' }));
  return { program: toSummary(p.data as unknown as ProgramRow), days };
}

/** The member's active program, day by day. [] = not following one. */
export async function programProgress(memberId: string): Promise<ProgressDay[]> {
  const { data, error } = await supabase.rpc('program_progress', { p_member: memberId });
  if (error) return [];
  return ((data ?? []) as { program_id: string; program_name: string; day_id: string; week: number; day: number;
    workout_id: string; workout_name: string; done: boolean }[]).map((r) => ({
    programId: r.program_id, programName: r.program_name, dayId: r.day_id, week: r.week, day: r.day,
    workoutId: r.workout_id, workoutName: r.workout_name, done: r.done,
  }));
}

const clean = (m: string) => m.replace(/^.*?: /, '');

export async function startProgram(programId: string): Promise<void> {
  const { error } = await supabase.rpc('start_program', { p_program: programId });
  if (error) throw new Error(clean(error.message));
}

export async function leaveProgram(programId: string): Promise<void> {
  const { error } = await supabase.rpc('leave_program', { p_program: programId });
  if (error) throw new Error(clean(error.message));
}

/** Opens a workout log for one program day; returns its id for the player. */
export async function startProgramDay(dayId: string): Promise<string> {
  const { data, error } = await supabase.rpc('start_program_day', { p_day: dayId });
  if (error) throw new Error(clean(error.message));
  return data as string;
}

/** A coach puts their trainee on a program (0122; only their own trainees). */
export async function assignProgram(memberId: string, programId: string): Promise<void> {
  const { error } = await supabase.rpc('assign_program', { p_member: memberId, p_program: programId });
  if (error) throw new Error(clean(error.message));
}

/**
 * A gym workout in the shape the player already runs. It is read-only to the
 * member — "Edit routine" has nothing to open — so `id` is the workout's.
 */
/**
 * A program day as the player runs it (0173): this week's targets, computed by
 * the database (`program_day_targets`) — heavier, longer or more reps than last
 * week, or week 1's load on a lighter week — with last week's beside each one
 * that moved. Before 0173 the function does not exist and the day runs the
 * workout as written, exactly as it did.
 */
export async function getProgramDayRoutine(dayId: string, workoutId: string, name: string | null): Promise<Routine | null> {
  const { data, error } = await supabase.rpc('program_day_targets', { p_day: dayId });
  // No answer, or nothing computed for this day: run the workout as written
  // rather than a player with no exercises in it.
  if (error || !Array.isArray(data) || data.length === 0) return getGymWorkoutRoutine(workoutId);
  const rows = data as {
    item_id: string; item_position: number; exercise_id: string; exercise_name: string | null;
    sets: number; reps: number | null; seconds: number | null; weight_kg: number | string | null; rest_seconds: number;
    progress_kind: string; prev_sets: number | null; prev_reps: number | null; prev_seconds: number | null; prev_weight_kg: number | string | null;
  }[];
  const last = (r: typeof rows[number]): string | null => {
    if (r.progress_kind === 'weight' && r.prev_weight_kg != null && Number(r.prev_weight_kg) !== Number(r.weight_kg)) return `last week ${Number(r.prev_weight_kg)} kg`;
    if (r.progress_kind === 'reps' && r.prev_reps != null && r.prev_reps !== r.reps) return `last week ${r.prev_reps} reps`;
    if (r.progress_kind === 'sets' && r.prev_sets != null && r.prev_sets !== r.sets) return `last week ${r.prev_sets} sets`;
    if (r.progress_kind === 'seconds' && r.prev_seconds != null && r.prev_seconds !== r.seconds) return `last week ${r.prev_seconds} s`;
    return null;
  };
  return {
    id: workoutId, name: name ?? 'Program day', notes: null, position: 0, updatedAt: new Date().toISOString(), source: 'member',
    authorName: null, editedByName: null, editedAt: null,
    exercises: [...rows].sort((a, b) => a.item_position - b.item_position).map((r) => ({
      id: r.item_id, exerciseId: r.exercise_id, customName: null, name: r.exercise_name ?? 'Exercise',
      isTimed: r.seconds != null && r.reps == null,
      targetSets: r.sets, targetReps: r.reps, targetWeightKg: r.weight_kg == null ? null : Number(r.weight_kg),
      targetSeconds: r.seconds, restSeconds: r.rest_seconds, lastWeek: last(r),
    })),
  };
}

export async function getGymWorkoutRoutine(workoutId: string): Promise<Routine | null> {
  const { data, error } = await supabase.from('gym_workouts')
    .select(`id, name, notes, updated_at, gym_workout_items (id, position, exercise_id, target_sets, target_reps,
      target_seconds, rest_seconds, exercises (name, is_timed, muscle_group, equipment))`)
    .eq('id', workoutId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const w = data as unknown as {
    id: string; name: string; notes: string | null; updated_at: string;
    gym_workout_items: { id: string; position: number; exercise_id: string; target_sets: number;
      target_reps: number | null; target_seconds: number | null; rest_seconds: number;
      exercises: { name: string; is_timed: boolean; muscle_group: string | null; equipment: string | null } | null }[];
  };
  return {
    id: w.id, name: w.name, notes: w.notes, position: 0, updatedAt: w.updated_at, source: 'member',
    authorName: null, editedByName: null, editedAt: null,
    exercises: [...w.gym_workout_items].sort((a, b) => a.position - b.position).map((i) => ({
      id: i.id, exerciseId: i.exercise_id, customName: null,
      name: i.exercises?.name ?? 'Exercise', isTimed: i.exercises?.is_timed ?? false,
      targetSets: i.target_sets, targetReps: i.target_reps, targetWeightKg: null,
      targetSeconds: i.target_seconds, restSeconds: i.rest_seconds,
      muscleGroup: i.exercises?.muscle_group ?? null, equipment: i.exercises?.equipment ?? null,
    })),
  };
}
