import { supabase } from '../supabaseClient';
import type { ClassLevel } from '../../types/db';

/** The recurring weekly timetable (migration 0015). Instances live in `classes`. */
export interface ClassTemplateRow {
  id: string;
  name: string;
  trainer_id: string | null;
  level: ClassLevel;
  capacity: number;
  location: string | null;
  /** 0 = Sunday … 6 = Saturday — matches JS getDay() and Postgres extract(dow). */
  day_of_week: number;
  /** 'HH:MM:SS' */
  start_time: string;
  duration_minutes: number;
  active: boolean;
  created_at: string;
}

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export async function listClassTemplates(): Promise<ClassTemplateRow[]> {
  const { data, error } = await supabase
    .from('class_templates')
    .select('*')
    .order('day_of_week', { ascending: true })
    .order('start_time', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function createClassTemplate(
  input: Omit<ClassTemplateRow, 'id' | 'created_at' | 'active'> & { active?: boolean }
): Promise<ClassTemplateRow> {
  const { data, error } = await supabase.from('class_templates').insert(input).select().single();
  if (error) throw error;
  return data;
}

export async function updateClassTemplate(
  id: string,
  updates: Partial<Omit<ClassTemplateRow, 'id' | 'created_at'>>
): Promise<void> {
  const { error } = await supabase.from('class_templates').update(updates).eq('id', id);
  if (error) throw error;
}

/**
 * Retires a template without deleting the sessions already generated from it.
 *
 * A hard delete would null out `classes.template_id` (on delete set null) and
 * orphan the history, so the timetable would lose what was actually run. Use
 * this instead of deleteClassTemplate unless the template was created in error.
 */
export async function deactivateClassTemplate(id: string): Promise<void> {
  return updateClassTemplate(id, { active: false });
}

export async function deleteClassTemplate(id: string): Promise<void> {
  const { error } = await supabase.from('class_templates').delete().eq('id', id);
  if (error) throw error;
}

/**
 * Materialises dated `classes` rows from active templates.
 *
 * Called on page load rather than by a cron job — the free tier has no scheduled
 * worker. Idempotent: a unique index absorbs repeats, so this is safe to call on
 * every visit. Returns how many new sessions were created.
 */
export async function generateClassInstances(weeksAhead = 4): Promise<number> {
  const { data, error } = await supabase.rpc('generate_class_instances', { weeks_ahead: weeksAhead });
  if (error) throw error;
  return (data as number) ?? 0;
}
