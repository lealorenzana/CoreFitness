import { assertWrote } from './mutate';
import { supabase } from '../supabaseClient';

/**
 * The two rule tables the gym tunes and, until now, could only tune in SQL:
 * how many CORE points each action earns (`point_rules`, 0051) and the goal
 * templates members pick from (`goal_templates`, 0055). Both have had an
 * admin-only write policy since they were created; the phone app reads them
 * ("How you earn" on Rewards, the goal picker), so a change here is what the
 * member sees next time they open the screen.
 *
 * Only the parts that are safe to change live are editable. A point rule's
 * `key` is what the SQL triggers award by, so rules are never added or removed
 * here. A goal template's `metric` and `period_days` are read *live* by
 * `goal_value_of()` (0087), so changing either would silently move goals
 * members have already set — those stay fixed; the default target only
 * applies to goals set from now on.
 */

export interface PointRule { key: string; label: string; points: number; is_active: boolean; sort_order: number }

export async function listPointRules(): Promise<PointRule[]> {
  const { data, error } = await supabase.from('point_rules').select('key, label, points, is_active, sort_order').order('sort_order');
  if (error) throw error;
  return (data ?? []) as PointRule[];
}

export async function updatePointRule(key: string, patch: Partial<Pick<PointRule, 'label' | 'points' | 'is_active'>>): Promise<void> {
  if (patch.points != null && !(Number.isInteger(patch.points) && patch.points > 0)) {
    throw new Error('Points must be a whole number above zero — turn the rule off instead of setting 0.');
  }
  if (patch.label != null && !patch.label.trim()) throw new Error('The label is what members read — it cannot be empty.');
  const { data, error } = await supabase.from('point_rules').update(patch).eq('key', key).select('key');
  if (error) throw error;
  assertWrote(data, 'That rule could not be saved — only an admin can change point rules.');
}

export interface GoalTemplate {
  key: string; label: string; description: string; measured_as: string; metric: string;
  period_days: number; target_default: number; is_active: boolean; sort_order: number;
}

export async function listGoalTemplates(): Promise<GoalTemplate[]> {
  const { data, error } = await supabase.from('goal_templates')
    .select('key, label, description, measured_as, metric, period_days, target_default, is_active, sort_order')
    .order('sort_order');
  if (error) throw error;
  return (data ?? []) as GoalTemplate[];
}

export async function updateGoalTemplate(
  key: string,
  patch: Partial<Pick<GoalTemplate, 'label' | 'description' | 'target_default' | 'is_active'>>,
): Promise<void> {
  if (patch.target_default != null && !(Number.isInteger(patch.target_default) && patch.target_default > 0)) {
    throw new Error('The default target must be a whole number above zero.');
  }
  if (patch.label != null && !patch.label.trim()) throw new Error('The name cannot be empty.');
  const { data, error } = await supabase.from('goal_templates').update(patch).eq('key', key).select('key');
  if (error) throw error;
  assertWrote(data, 'That template could not be saved — only an admin can change goal templates.');
}

/** How many members currently have an open goal on each template. */
export async function goalTemplateUsage(): Promise<Map<string, number>> {
  const { data, error } = await supabase.from('fitness_goals').select('template_key').is('achieved_on', null)
    .not('template_key', 'is', null);
  if (error) return new Map();
  const m = new Map<string, number>();
  for (const r of data ?? []) m.set(r.template_key as string, (m.get(r.template_key as string) ?? 0) + 1);
  return m;
}

export interface Standing {
  member_id: string; first_name: string; last_name: string; joined_at: string;
  completed_on: string | null; progress: number; target: number;
}

/** Everyone in a challenge with their progress (0094). Null before 0094 is pasted. */
export async function challengeStandings(challengeId: string): Promise<Standing[] | null> {
  const { data, error } = await supabase.rpc('challenge_standings', { p_challenge: challengeId });
  if (error?.code === 'PGRST202' || error?.code === '42883') return null;
  if (error) throw error;
  return (data ?? []) as Standing[];
}
