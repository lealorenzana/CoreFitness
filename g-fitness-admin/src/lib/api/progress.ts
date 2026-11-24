import { assertWrote } from './mutate';
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
  notes: string | null;
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
  const { data: data, error: error } = await supabase
    .from('body_measurements').delete().eq('id', id)
    .select('id');
  if (error) throw error;
  assertWrote(data, 'That measurement could not be deleted — it may not be yours to remove.');
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
  const { data: data, error: error } = await supabase
    .from('workout_logs').delete().eq('id', id)
    .select('id');
  if (error) throw error;
  assertWrote(data, 'That workout could not be deleted — it may not be yours to remove.');
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
 * The BMI band, with no colour verdict. Mirrors the member app's copy — see the
 * longer note there.
 *
 * Short version: this returned green for "Normal" and red for "Obese", which is
 * a traffic light rating a body, in a palette that has neither colour. The band
 * name carries the information; the colour only added a judgement that BMI is
 * not entitled to make, since it cannot tell muscle from fat.
 */
export function bmiBand(value: number): { label: string; color: string } {
  const color = 'var(--color-text-secondary)';
  if (value < 18.5) return { label: 'Underweight', color };
  if (value < 25) return { label: 'Normal', color };
  if (value < 30) return { label: 'Overweight', color };
  return { label: 'Obese', color };
}

