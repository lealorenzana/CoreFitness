import { assertWrote } from './mutate';
import { supabase } from '../supabaseClient';
import type { MembershipPlanRow } from '../../types/db';

export async function listPlans(): Promise<MembershipPlanRow[]> {
  const { data, error } = await supabase
    .from('membership_plans')
    .select('*')
    .order('price', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/**
 * The plans a gym offers, for sign-up — before there is an account to read
 * `membership_plans` with (0104's public_plans). Active plans of an active gym.
 */
export async function publicPlans(gymId: string): Promise<MembershipPlanRow[]> {
  const { data, error } = await supabase.rpc('public_plans', { p_gym: gymId });
  if (error) throw new Error(error.message);
  return (data ?? []) as MembershipPlanRow[];
}

export async function createPlan(
  plan: Omit<MembershipPlanRow, 'id' | 'created_at'>
): Promise<MembershipPlanRow> {
  const { data, error } = await supabase.from('membership_plans').insert(plan).select().single();
  if (error) throw error;
  return data;
}

export async function updatePlan(
  id: string,
  updates: Partial<Omit<MembershipPlanRow, 'id' | 'created_at'>>
): Promise<void> {
  const { data, error } = await supabase
    .from('membership_plans').update(updates).eq('id', id)
    .select('id');
  if (error) throw error;
  assertWrote(data, 'That plan could not be saved — only an admin can change pricing.');
}

export async function deletePlan(id: string): Promise<void> {
  const { data, error } = await supabase
    .from('membership_plans').delete().eq('id', id)
    .select('id');
  if (error) throw error;
  assertWrote(data, 'That plan could not be removed. Retire it instead if members are still on it.');
}
