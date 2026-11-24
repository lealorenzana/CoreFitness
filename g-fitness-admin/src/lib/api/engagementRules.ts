import { assertWrote } from './mutate';
import { supabase } from '../supabaseClient';

/**
 * The rule table the gym tunes and, until 0051, could only tune in SQL: how
 * many CORE points each action earns (`point_rules`). It has had an admin-only
 * write policy since it was created; the phone app reads it ("How you earn" on
 * Rewards), so a change here is what the member sees next time.
 *
 * Only the parts that are safe to change live are editable. A point rule's
 * `key` is what the SQL triggers award by, so rules are never added or removed
 * here.
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
