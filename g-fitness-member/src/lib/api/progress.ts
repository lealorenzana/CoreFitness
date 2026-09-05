import { supabase } from '../supabaseClient';

/**
 * The Progress Hub's data layer (migration 0020).
 *
 * Members write their own rows; trainers and the front desk can read them.
 * There is no badges module — badges had no table and no earning rules, and
 * were dropped rather than faked.
 */

export interface BodyMeasurementRow {
  id: string;
  member_id: string;
  /** The day it was measured, not the day it was typed in. */
  measured_on: string;
  weight_kg: number | null;
  height_cm: number | null;
  body_fat_pct: number | null;
  chest_cm: number | null;
  waist_cm: number | null;
  hips_cm: number | null;
  arms_cm: number | null;
  thighs_cm: number | null;
  /** 0043. `hips_cm` predates them but was written as a literal null for years —
   *  the column existed and never held a value until the map needed it. */
  neck_cm: number | null;
  shoulders_cm: number | null;
  forearm_cm: number | null;
  calf_cm: number | null;
  notes: string | null;
  created_at: string;
}

export interface FitnessGoalRow {
  id: string;
  member_id: string;
  title: string;
  metric: string;
  start_value: number | null;
  target_value: number | null;
  target_date: string | null;
  achieved_on: string | null;
  created_at: string;
}

export interface WorkoutLogRow {
  id: string;
  member_id: string;
  performed_on: string;
  activity: string | null;
  duration_minutes: number | null;
  notes: string | null;
  created_at: string;
}

// ─── Body measurements ───────────────────────────────────────────────────────

/** Oldest first — charts read left to right, and callers that want the latest take the last. */
export async function listMeasurements(memberId: string): Promise<BodyMeasurementRow[]> {
  const { data, error } = await supabase
    .from('body_measurements')
    .select('*')
    .eq('member_id', memberId)
    .order('measured_on', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/**
 * Records a measurement, replacing any entry already logged for that day.
 *
 * The unique index on (member_id, measured_on) makes a same-day re-entry a
 * correction rather than a second point — two conflicting weights for one
 * morning would make the chart lie.
 */
export async function saveMeasurement(
  input: Omit<BodyMeasurementRow, 'id' | 'created_at'>
): Promise<BodyMeasurementRow> {
  const { data, error } = await supabase
    .from('body_measurements')
    .upsert(input, { onConflict: 'member_id,measured_on' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteMeasurement(id: string): Promise<void> {
  const { error } = await supabase.from('body_measurements').delete().eq('id', id);
  if (error) throw error;
}

// ─── Goals ───────────────────────────────────────────────────────────────────

export async function listGoals(memberId: string): Promise<FitnessGoalRow[]> {
  const { data, error } = await supabase
    .from('fitness_goals')
    .select('*')
    .eq('member_id', memberId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createGoal(
  input: Omit<FitnessGoalRow, 'id' | 'created_at' | 'achieved_on'> & { achieved_on?: string | null }
): Promise<FitnessGoalRow> {
  const { data, error } = await supabase.from('fitness_goals').insert(input).select().single();
  if (error) throw error;
  return data;
}

export async function updateGoal(
  id: string,
  updates: Partial<Omit<FitnessGoalRow, 'id' | 'member_id' | 'created_at'>>
): Promise<void> {
  const { error } = await supabase.from('fitness_goals').update(updates).eq('id', id);
  if (error) throw error;
}

export async function deleteGoal(id: string): Promise<void> {
  const { error } = await supabase.from('fitness_goals').delete().eq('id', id);
  if (error) throw error;
}

// ─── Workout logs ────────────────────────────────────────────────────────────

export async function listWorkoutLogs(memberId: string): Promise<WorkoutLogRow[]> {
  const { data, error } = await supabase
    .from('workout_logs')
    .select('*')
    .eq('member_id', memberId)
    .order('performed_on', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createWorkoutLog(
  input: Omit<WorkoutLogRow, 'id' | 'created_at'>
): Promise<WorkoutLogRow> {
  const { data, error } = await supabase.from('workout_logs').insert(input).select().single();
  if (error) throw error;
  return data;
}

export async function deleteWorkoutLog(id: string): Promise<void> {
  const { error } = await supabase.from('workout_logs').delete().eq('id', id);
  if (error) throw error;
}

// ─── Derived ─────────────────────────────────────────────────────────────────

/** Local calendar date as YYYY-MM-DD. Never toISOString() — that shifts to UTC. */
export function todayDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** BMI, or null when either input is missing. Never a partial guess. */
export function bmi(weightKg: number | null, heightCm: number | null): number | null {
  if (!weightKg || !heightCm) return null;
  const m = heightCm / 100;
  return Number((weightKg / (m * m)).toFixed(1));
}

/**
 * The BMI band, with **no colour verdict**.
 *
 * This returned `#22c55e` for "Normal" and `#ef4444` for "Obese" — a traffic
 * light, in an app whose design system has no greens or reds, rating a member's
 * body on the Progress tab.
 *
 * Re-toning it to violet and amber removed the palette violation and kept the
 * judgement, which was the worse half. The card carrying this badge already
 * says, in as many words, that BMI *"doesn't distinguish muscle from fat"* — so
 * flashing a warning colour at a member who has been lifting for a year
 * contradicts the app's own caption. It is a number and a band, and the band
 * name says everything the colour was saying.
 *
 * The label is unchanged. Nothing is hidden; it just stops being scored.
 */
export function bmiBand(value: number): { label: string; color: string } {
  const color = 'var(--color-text-secondary)';
  if (value < 18.5) return { label: 'Underweight', color };
  if (value < 25) return { label: 'Normal', color };
  if (value < 30) return { label: 'Overweight', color };
  return { label: 'Obese', color };
}

/**
 * How far a goal has come, 0–1, or null when it can't be known.
 *
 * Needs a start, a target and a current reading; without all three the honest
 * answer is "no idea", and a progress bar that invents a position is worse than
 * no bar at all.
 */
export function goalProgress(
  goal: FitnessGoalRow,
  current: number | null
): number | null {
  if (goal.start_value == null || goal.target_value == null || current == null) return null;
  const span = goal.target_value - goal.start_value;
  if (span === 0) return current === goal.target_value ? 1 : 0;
  // Works for goals that go down (losing weight) as well as up.
  return Math.max(0, Math.min(1, (current - goal.start_value) / span));
}
