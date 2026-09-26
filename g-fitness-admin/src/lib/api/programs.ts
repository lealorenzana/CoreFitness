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

export interface WorkoutItem {
  exerciseId: string;
  targetSets: number;
  targetReps: number | null;
  targetSeconds: number | null;
  restSeconds: number;
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
  days: ProgramDay[];
}

interface WorkoutRow {
  id: string; name: string; notes: string | null; level: Level; published: boolean; created_by: string;
  gym_workout_items: { exercise_id: string; position: number; target_sets: number; target_reps: number | null;
    target_seconds: number | null; rest_seconds: number }[];
}
interface ProgramRow {
  id: string; name: string; description: string | null; cover_url: string | null; level: Level;
  weeks: number; premium: boolean; published: boolean;
  gym_program_days: { id: string; week: number; day: number; workout_id: string }[];
}

/** Null before 0122 is pasted: the page says so rather than showing an empty studio. */
export async function listWorkouts(): Promise<GymWorkout[] | null> {
  const { data, error } = await supabase.from('gym_workouts')
    .select('id, name, notes, level, published, created_by, gym_workout_items (exercise_id, position, target_sets, target_reps, target_seconds, rest_seconds)')
    .eq('hidden', false).order('created_at');
  if (error) return null;
  return ((data ?? []) as WorkoutRow[]).map((w) => ({
    id: w.id, name: w.name, notes: w.notes, level: w.level, published: w.published, createdBy: w.created_by,
    items: [...w.gym_workout_items].sort((a, b) => a.position - b.position).map((i) => ({
      exerciseId: i.exercise_id, targetSets: i.target_sets, targetReps: i.target_reps,
      targetSeconds: i.target_seconds, restSeconds: i.rest_seconds,
    })),
  }));
}

export async function listPrograms(): Promise<GymProgram[] | null> {
  const { data, error } = await supabase.from('gym_programs')
    .select('id, name, description, cover_url, level, weeks, premium, published, gym_program_days (id, week, day, workout_id)')
    .eq('hidden', false).order('created_at');
  if (error) return null;
  return ((data ?? []) as ProgramRow[]).map((p) => ({
    id: p.id, name: p.name, description: p.description, coverUrl: p.cover_url, level: p.level,
    weeks: p.weeks, premium: p.premium, published: p.published,
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
    const { error } = await supabase.from('gym_workout_items').insert(draft.items.map((it, n) => ({
      gym_id: gymId, workout_id: workoutId, position: n, exercise_id: it.exerciseId,
      target_sets: it.targetSets, target_reps: it.targetReps, target_seconds: it.targetSeconds,
      rest_seconds: it.restSeconds,
    })));
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
}

export async function saveProgram(id: string | null, f: ProgramFields): Promise<string> {
  const gymId = await currentGymId();
  if (!gymId) throw new Error('Could not tell which gym this is for. Reload and try again.');
  const row = { name: f.name.trim(), description: f.description?.trim() || null, cover_url: f.coverUrl,
    level: f.level, weeks: f.weeks, premium: f.premium };
  if (id) {
    const { data, error } = await supabase.from('gym_programs').update(row).eq('id', id).select('id');
    if (error) throw new Error(error.message);
    assertWrote(data, 'That program could not be saved.');
    return id;
  }
  const { data, error } = await supabase.from('gym_programs').insert({ ...row, gym_id: gymId }).select('id').single();
  if (error) throw new Error(error.message);
  return data.id as string;
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
