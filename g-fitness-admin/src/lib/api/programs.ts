import { supabase } from '../supabaseClient';
import { currentGymId } from '../gymContext';
import { assertWrote } from './mutate';

/**
 * The gym's own workouts and programs (0122), for the owner's Programs page.
 *
 * A program is weeks × days, each day pointing at a gym workout. Members run a
 * day as an ordinary workout log in the member app, so nothing here tracks
 * progress — `program_progress()` computes it from the logs.
 *
 * Everything starts as a draft. The owner builds programs; trainers build
 * workouts in the phone app, and theirs appear here too (the owner edits any).
 */

export type Level = 'beginner' | 'intermediate' | 'advanced' | 'all_levels';

export type ProgressKind = 'none' | 'weight' | 'reps' | 'sets' | 'seconds';

export interface WorkoutItem {
  exerciseId: string;
  targetSets: number;
  targetReps: number | null;
  targetSeconds: number | null;
  restSeconds: number;
  /** 0173: the starting load, and how it steps up each week of a program. */
  targetWeightKg: number | null;
  progressKind: ProgressKind;
  progressStep: number;
}

export interface GymWorkout {
  id: string;
  name: string;
  notes: string | null;
  level: Level;
  published: boolean;
  createdBy: string;
  items: WorkoutItem[];
}

export interface ProgramDay { id: string; week: number; day: number; workoutId: string }

export interface GymProgram {
  id: string;
  name: string;
  description: string | null;
  coverUrl: string | null;
  level: Level;
  weeks: number;
  premium: boolean;
  published: boolean;
  /** 0173: every Nth week repeats week 1's load (a lighter week), or null. */
  deloadEvery: number | null;
  days: ProgramDay[];
}

interface WorkoutRow {
  id: string; name: string; notes: string | null; level: Level; published: boolean; created_by: string;
  gym_workout_items: { exercise_id: string; position: number; target_sets: number; target_reps: number | null;
    target_seconds: number | null; rest_seconds: number;
    target_weight_kg?: number | string | null; progress_kind?: string | null; progress_step?: number | string | null }[];
}
interface ProgramRow {
  id: string; name: string; description: string | null; cover_url: string | null; level: Level;
  weeks: number; premium: boolean; published: boolean; deload_every?: number | null;
  gym_program_days: { id: string; week: number; day: number; workout_id: string }[];
}

/** Null before 0122 is pasted: the page says so rather than showing an empty studio. */
const ITEM_BASE = 'exercise_id, position, target_sets, target_reps, target_seconds, rest_seconds';
// 0173's progression; before 0173 these columns do not exist and every item stays the same each week.
const ITEM_COLS = `${ITEM_BASE}, target_weight_kg, progress_kind, progress_step`;

export async function listWorkouts(): Promise<GymWorkout[] | null> {
  const q = (items: string) => supabase.from('gym_workouts')
    .select(`id, name, notes, level, published, created_by, gym_workout_items (${items})`)
    .eq('hidden', false).order('created_at');
  let res = await q(ITEM_COLS);
  if (res.error) res = await q(ITEM_BASE);
  const { data, error } = res;
  if (error) return null;
  return ((data ?? []) as unknown as WorkoutRow[]).map((w) => ({
    id: w.id, name: w.name, notes: w.notes, level: w.level, published: w.published, createdBy: w.created_by,
    items: [...w.gym_workout_items].sort((a, b) => a.position - b.position).map((i) => ({
      exerciseId: i.exercise_id, targetSets: i.target_sets, targetReps: i.target_reps,
      targetSeconds: i.target_seconds, restSeconds: i.rest_seconds,
      targetWeightKg: i.target_weight_kg == null ? null : Number(i.target_weight_kg),
      progressKind: (['weight', 'reps', 'sets', 'seconds'].includes(String(i.progress_kind)) ? i.progress_kind : 'none') as ProgressKind,
      progressStep: Number(i.progress_step ?? 0),
    })),
  }));
}

export async function listPrograms(): Promise<GymProgram[] | null> {
  // The gym's own programs; a coach's program for one member (0173) is theirs, shown with that member.
  const base = 'id, name, description, cover_url, level, weeks, premium, published, gym_program_days (id, week, day, workout_id)';
  const full = await supabase.from('gym_programs').select(`${base}, deload_every`)
    .eq('hidden', false).is('member_id', null).order('created_at');
  const { data, error } = full.error
    ? await supabase.from('gym_programs').select(base).eq('hidden', false).order('created_at')
    : full;
  if (error) return null;
  return ((data ?? []) as unknown as ProgramRow[]).map((p) => ({
    id: p.id, name: p.name, description: p.description, coverUrl: p.cover_url, level: p.level,
    weeks: p.weeks, premium: p.premium, published: p.published, deloadEvery: p.deload_every ?? null,
    days: p.gym_program_days.map((d) => ({ id: d.id, week: d.week, day: d.day, workoutId: d.workout_id })),
  }));
}

export interface WorkoutDraft { name: string; notes: string | null; level: Level; items: WorkoutItem[] }

/**
 * Create or replace a workout. Its items are replaced wholesale: a workout is
 * short, and "what is on screen is what is saved" beats diffing positions.
 */
export async function saveWorkout(id: string | null, draft: WorkoutDraft): Promise<string> {
  const gymId = await currentGymId();
  if (!gymId) throw new Error('Could not tell which gym this is for. Reload and try again.');
  let workoutId = id;
  if (workoutId) {
    const { data, error } = await supabase.from('gym_workouts')
      .update({ name: draft.name.trim(), notes: draft.notes?.trim() || null, level: draft.level })
      .eq('id', workoutId).select('id');
    if (error) throw new Error(error.message);
    assertWrote(data, 'That workout could not be saved. It may belong to a trainer.');
    const del = await supabase.from('gym_workout_items').delete().eq('workout_id', workoutId).select('id');
    if (del.error) throw new Error(del.error.message);
  } else {
    const { data, error } = await supabase.from('gym_workouts')
      .insert({ gym_id: gymId, name: draft.name.trim(), notes: draft.notes?.trim() || null, level: draft.level })
      .select('id').single();
    if (error) throw new Error(error.message);
    workoutId = data.id as string;
  }
  if (draft.items.length) {
    const base = (it: WorkoutItem, n: number) => ({
      gym_id: gymId, workout_id: workoutId, position: n, exercise_id: it.exerciseId,
      target_sets: it.targetSets, target_reps: it.targetReps, target_seconds: it.targetSeconds,
      rest_seconds: it.restSeconds,
    });
    let { error } = await supabase.from('gym_workout_items').insert(draft.items.map((it, n) => ({
      ...base(it, n), target_weight_kg: it.targetWeightKg,
      progress_kind: it.progressKind, progress_step: it.progressKind === 'none' ? 0 : it.progressStep,
    })));
    // Before 0173 the progression columns do not exist: save the workout as written.
    if (error && /progress_|target_weight_kg/.test(error.message)) ({ error } = await supabase.from('gym_workout_items').insert(draft.items.map(base)));
    if (error) throw new Error(error.message);
  }
  return workoutId!;
}

export async function setWorkoutPublished(id: string, published: boolean): Promise<void> {
  const { data, error } = await supabase.from('gym_workouts').update({ published }).eq('id', id).select('id');
  if (error) throw new Error(error.message);
  assertWrote(data, 'That workout could not be changed.');
}

export interface ProgramFields {
  name: string; description: string | null; coverUrl: string | null; level: Level;
  weeks: number; premium: boolean;
  /** 0173: a lighter week every N weeks, or null. */
  deloadEvery: number | null;
}

export async function saveProgram(id: string | null, f: ProgramFields): Promise<string> {
  const gymId = await currentGymId();
  if (!gymId) throw new Error('Could not tell which gym this is for. Reload and try again.');
  const row: Record<string, unknown> = { name: f.name.trim(), description: f.description?.trim() || null, cover_url: f.coverUrl,
    level: f.level, weeks: f.weeks, premium: f.premium };
  // Before 0173 there is no deload_every: the write is retried without it.
  const write = async (r: Record<string, unknown>) => (id
    ? supabase.from('gym_programs').update(r).eq('id', id).select('id')
    : supabase.from('gym_programs').insert({ ...r, gym_id: gymId }).select('id'));
  let res = await write({ ...row, deload_every: f.deloadEvery });
  if (res.error && /deload_every/.test(res.error.message)) res = await write(row);
  if (res.error) throw new Error(res.error.message);
  if (id) { assertWrote(res.data, 'That program could not be saved.'); return id; }
  return (res.data as { id: string }[])[0].id;
}

export async function setProgramPublished(id: string, published: boolean): Promise<void> {
  const { data, error } = await supabase.from('gym_programs').update({ published }).eq('id', id).select('id');
  if (error) throw new Error(error.message);
  assertWrote(data, 'That program could not be changed.');
}

/** Put a workout on one day of the grid, or clear the day (a rest day). */
export async function setProgramDay(programId: string, week: number, day: number, workoutId: string | null): Promise<void> {
  const gymId = await currentGymId();
  if (!gymId) throw new Error('Could not tell which gym this is for. Reload and try again.');
  if (workoutId) {
    const { data, error } = await supabase.from('gym_program_days')
      .upsert({ gym_id: gymId, program_id: programId, week, day, workout_id: workoutId }, { onConflict: 'program_id,week,day' })
      .select('id');
    if (error) throw new Error(error.message);
    assertWrote(data, 'That day could not be set.');
  } else {
    const { error } = await supabase.from('gym_program_days').delete()
      .eq('program_id', programId).eq('week', week).eq('day', day).select('id');
    if (error) throw new Error(error.message);
  }
}

export type StarterKey = 'beginner_full_body' | 'push_pull_legs';

export async function copyStarterProgram(key: StarterKey): Promise<string> {
  const { data, error } = await supabase.rpc('copy_starter_program', { p_key: key });
  if (error) throw new Error(error.message.replace(/^.*?: /, ''));
  return data as string;
}

export interface ProgressDay {
  programId: string; programName: string; dayId: string; week: number; day: number;
  workoutName: string; done: boolean;
}

/** The member's active program, day by day. Null = could not be read (or before 0122). */
export async function memberProgramProgress(memberId: string): Promise<ProgressDay[] | null> {
  const { data, error } = await supabase.rpc('program_progress', { p_member: memberId });
  if (error) return null;
  return ((data ?? []) as { program_id: string; program_name: string; day_id: string; week: number; day: number;
    workout_name: string; done: boolean }[]).map((r) => ({
    programId: r.program_id, programName: r.program_name, dayId: r.day_id, week: r.week, day: r.day,
    workoutName: r.workout_name, done: r.done,
  }));
}
