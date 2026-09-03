import { supabase } from '../supabaseClient';

/**
 * The exercise catalogue and what the member actually lifted (migration 0050).
 *
 * `workout_logs` is the session header — it existed before this as the whole
 * feature, and a row with no sets is still a valid session ("Cardio, 30
 * minutes"). `workout_sets` is the detail the paid tiers add.
 */

export interface Exercise {
  id: string;
  name: string;
  muscleGroup: string;
  equipment: string;
  /** Measured in time/distance rather than reps and weight. Changes the form. */
  isTimed: boolean;
}

export interface WorkoutSet {
  id: string;
  exerciseId: string | null;
  /** Set when the member logged something not in the catalogue. */
  customName: string | null;
  setNumber: number;
  reps: number | null;
  weightKg: number | null;
  durationSeconds: number | null;
  distanceM: number | null;
}

export interface SessionSummary {
  exerciseCount: number;
  setCount: number;
  totalVolumeKg: number;
}

interface ExerciseRow {
  id: string; name: string; muscle_group: string; equipment: string; is_timed: boolean;
}

/** Active exercises only — a deactivated one stays in history but leaves the picker. */
export async function listExercises(): Promise<Exercise[]> {
  const { data, error } = await supabase
    .from('exercises')
    .select('id, name, muscle_group, equipment, is_timed')
    .eq('is_active', true)
    .order('sort_order');
  if (error) throw error;
  return ((data ?? []) as ExerciseRow[]).map((r) => ({
    id: r.id,
    name: r.name,
    muscleGroup: r.muscle_group,
    equipment: r.equipment,
    isTimed: r.is_timed,
  }));
}

/**
 * The session the member has open, if any.
 *
 * `completed_at IS NULL` is the open one. Without this a member who starts a
 * workout, locks their phone between sets and comes back would start a second
 * session and split one workout in two.
 */
export async function getOpenSession(memberId: string): Promise<{ id: string; performedOn: string } | null> {
  const { data, error } = await supabase
    .from('workout_logs')
    .select('id, performed_on')
    .eq('member_id', memberId)
    .is('completed_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? { id: data.id as string, performedOn: data.performed_on as string } : null;
}

export async function startSession(memberId: string, planId?: string | null): Promise<string> {
  const { data, error } = await supabase
    .from('workout_logs')
    .insert({ member_id: memberId, activity: 'Weights', plan_id: planId ?? null })
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
}

/**
 * Close the session.
 *
 * `duration_minutes` is written here rather than tracked live: a member who
 * leaves the app open overnight would otherwise record a nine-hour workout.
 * Passing it explicitly keeps the number something the member can see and
 * correct.
 */
export async function completeSession(logId: string, durationMinutes: number | null): Promise<void> {
  const { error } = await supabase
    .from('workout_logs')
    .update({ completed_at: new Date().toISOString(), duration_minutes: durationMinutes })
    .eq('id', logId);
  if (error) throw error;
}

export async function listSets(logId: string): Promise<WorkoutSet[]> {
  const { data, error } = await supabase
    .from('workout_sets')
    .select('id, exercise_id, custom_name, set_number, reps, weight_kg, duration_seconds, distance_m')
    .eq('log_id', logId)
    .order('set_number');
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id as string,
    exerciseId: r.exercise_id as string | null,
    customName: r.custom_name as string | null,
    setNumber: r.set_number as number,
    reps: r.reps as number | null,
    weightKg: r.weight_kg == null ? null : Number(r.weight_kg),
    durationSeconds: r.duration_seconds as number | null,
    distanceM: r.distance_m as number | null,
  }));
}

export interface NewSet {
  exerciseId?: string | null;
  customName?: string | null;
  setNumber: number;
  reps?: number | null;
  weightKg?: number | null;
  durationSeconds?: number | null;
  distanceM?: number | null;
}

/**
 * Record one set.
 *
 * The database refuses a set that measures nothing (`workout_sets_measured`),
 * so this does not need to re-check it — but the form should, because a
 * constraint violation is a worse message than a disabled button.
 */
export async function addSet(logId: string, set: NewSet): Promise<string> {
  const { data, error } = await supabase
    .from('workout_sets')
    .insert({
      log_id: logId,
      exercise_id: set.exerciseId ?? null,
      custom_name: set.customName ?? null,
      set_number: set.setNumber,
      reps: set.reps ?? null,
      weight_kg: set.weightKg ?? null,
      duration_seconds: set.durationSeconds ?? null,
      distance_m: set.distanceM ?? null,
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function deleteSet(id: string): Promise<void> {
  const { error } = await supabase.from('workout_sets').delete().eq('id', id);
  if (error) throw error;
}

/** "5 exercises · 12 sets" — counted in SQL so the phone never has to guess. */
export async function getSessionSummary(logId: string): Promise<SessionSummary> {
  const { data, error } = await supabase.rpc('workout_session_summary', { p_log: logId });
  if (error) throw error;
  const row = (data ?? [])[0];
  return {
    exerciseCount: row?.exercise_count ?? 0,
    setCount: row?.set_count ?? 0,
    totalVolumeKg: Number(row?.total_volume_kg ?? 0),
  };
}

export interface HistoryPoint {
  performedOn: string;
  topWeightKg: number;
  topReps: number | null;
}

/** Heaviest set per session for one exercise — the "am I getting stronger" line. */
export async function getExerciseHistory(memberId: string, exerciseId: string): Promise<HistoryPoint[]> {
  const { data, error } = await supabase.rpc('member_exercise_history', {
    p_member: memberId,
    p_exercise: exerciseId,
  });
  if (error) throw error;
  return (data ?? []).map((r: { performed_on: string; top_weight_kg: string; top_reps: number | null }) => ({
    performedOn: r.performed_on,
    topWeightKg: Number(r.top_weight_kg),
    topReps: r.top_reps,
  }));
}
