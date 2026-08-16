import { supabase } from '../supabaseClient';
import type { ClassLevel } from '../../types/db';

/**
 * The gym's curated library of free external training resources (0019).
 *
 * Links out rather than storing routines: the workouts belong to the people who
 * wrote them, and a copy here would go stale the moment they revised it.
 */
export interface WorkoutResourceRow {
  id: string;
  title: string;
  provider: string;
  url: string;
  description: string | null;
  category: string | null;
  level: ClassLevel;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  created_by: string | null;
}

/** Members see only the active list; the admin page passes false to see everything. */
export async function listWorkoutResources(activeOnly = true): Promise<WorkoutResourceRow[]> {
  let query = supabase
    .from('workout_resources')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('title', { ascending: true });
  if (activeOnly) query = query.eq('is_active', true);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function createWorkoutResource(
  input: Omit<WorkoutResourceRow, 'id' | 'created_at' | 'created_by'>
): Promise<WorkoutResourceRow> {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('workout_resources')
    .insert({ ...input, created_by: user?.id ?? null })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateWorkoutResource(
  id: string,
  updates: Partial<Omit<WorkoutResourceRow, 'id' | 'created_at' | 'created_by'>>
): Promise<void> {
  const { error } = await supabase.from('workout_resources').update(updates).eq('id', id);
  if (error) throw error;
}

export async function deleteWorkoutResource(id: string): Promise<void> {
  const { error } = await supabase.from('workout_resources').delete().eq('id', id);
  if (error) throw error;
}

/**
 * The host, for display beside a link.
 *
 * Members should be able to see where a tap will take them before they take it.
 * Falls back to the raw string rather than throwing — a malformed URL is a data
 * problem for the admin to fix, not a reason for the page to break.
 */
export function linkHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
