import { assertWrote } from './mutate';
import { supabase } from '../supabaseClient';
import type { ClassRow } from '../../types/db';

export async function listClasses(): Promise<ClassRow[]> {
  const { data, error } = await supabase
    .from('classes')
    .select('*')
    .order('scheduled_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** Classes this trainer teaches, soonest first. */
export async function listTrainerClasses(trainerId: string): Promise<ClassRow[]> {
  const { data, error } = await supabase
    .from('classes')
    .select('*')
    .eq('trainer_id', trainerId)
    .order('scheduled_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function createClass(input: Omit<ClassRow, 'id' | 'created_at'>): Promise<ClassRow> {
  const { data, error } = await supabase.from('classes').insert(input).select().single();
  if (error) throw error;
  return data;
}

export async function updateClass(
  id: string,
  updates: Partial<Omit<ClassRow, 'id' | 'created_at'>>
): Promise<void> {
  const { data: data, error: error } = await supabase
    .from('classes').update(updates).eq('id', id)
    .select('id');
  if (error) throw error;
  assertWrote(data, 'That class could not be saved. Please refresh and try again.');
}

/**
 * Sets how many people a class will take.
 *
 * The only column a trainer may change on their own class (migration 0071).
 * Everything else — the name, the time, the room, who teaches it — is the
 * gym's timetable, and a guard trigger refuses those even on a class the
 * trainer owns, because a policy chooses rows and never columns.
 *
 * Two failures are told apart on purpose:
 *
 *   * **A raised error** is the database refusing, and its message is written
 *     to be read out ("that class already has more members booked than the
 *     size you set"). Passed through rather than replaced.
 *   * **A zero-row result** is RLS quietly declining — somebody else's class —
 *     which PostgREST reports as success. Without the guard that shows a green
 *     toast over an unchanged row.
 */
export async function setClassCapacity(id: string, capacity: number): Promise<void> {
  const { data, error } = await supabase
    .from('classes')
    .update({ capacity })
    .eq('id', id)
    .select('id');
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error('That class size could not be saved — it may not be your class.');
  }
}

export async function deleteClass(id: string): Promise<void> {
  const { data: data, error: error } = await supabase
    .from('classes').delete().eq('id', id)
    .select('id');
  if (error) throw error;
  assertWrote(data, 'That class could not be removed. Please refresh and try again.');
}
