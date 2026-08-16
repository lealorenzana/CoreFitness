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
  const { error } = await supabase.from('classes').update(updates).eq('id', id);
  if (error) throw error;
}

export async function deleteClass(id: string): Promise<void> {
  const { error } = await supabase.from('classes').delete().eq('id', id);
  if (error) throw error;
}
