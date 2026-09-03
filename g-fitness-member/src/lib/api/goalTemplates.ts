import { supabase } from '../supabaseClient';

/**
 * Preset goals (migration 0055).
 *
 * `fitness_goals` has always modelled a number moving towards another number —
 * right for "get to 75 kg", wrong for "build consistency", which is what people
 * actually say. A template carries its own definition: a metric the system
 * already counts, a rolling window, and a default target.
 *
 * The member sets the target and nothing else. `achieved_on` belongs to
 * `settle_goals()`, because reaching a goal now awards 100 CORE Points (0051)
 * and sends a notification (0053) — a member who could write it could award
 * themselves both.
 */

export interface GoalTemplate {
  key: string;
  label: string;
  description: string;
  /** The rule, in words. Shown on the card so it is never hidden. */
  measuredAs: string;
  targetDefault: number;
}

interface Row {
  key: string; label: string; description: string;
  measured_as: string; target_default: number;
}

export async function listGoalTemplates(): Promise<GoalTemplate[]> {
  const { data, error } = await supabase
    .from('goal_templates')
    .select('key, label, description, measured_as, target_default')
    .eq('is_active', true)
    .order('sort_order');
  if (error) throw error;
  return ((data ?? []) as Row[]).map((r) => ({
    key: r.key,
    label: r.label,
    description: r.description,
    measuredAs: r.measured_as,
    targetDefault: r.target_default,
  }));
}

export async function createTemplateGoal(
  memberId: string, template: GoalTemplate, target: number
): Promise<void> {
  const { error } = await supabase.from('fitness_goals').insert({
    member_id: memberId,
    title: template.label,
    // Not one of the numeric metrics — the template carries the measurement.
    metric: 'custom',
    template_key: template.key,
    target_value: target,
  });
  if (error) throw error;
}

/** Counted in SQL, inside the template's own window. Null on failure — the card
 *  then says the progress is unknown rather than showing a zero. */
export async function goalProgress(goalId: string): Promise<number | null> {
  const { data, error } = await supabase.rpc('goal_progress', { p_goal: goalId });
  if (error) return null;
  return Number(data ?? 0);
}
