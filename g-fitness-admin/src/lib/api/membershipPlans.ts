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

/**
 * Delete a plan and move everyone on it to the free tier (0062).
 *
 * A plain `delete` is wrong here and used to fail: `memberships.plan_id` has no
 * cascade, so removing a plan anybody is on raises a foreign key error the
 * screen could only report as "Failed to delete plan". Doing the move from the
 * browser instead would be three round trips that can stop after the first.
 *
 * The function is atomic, admin-only, and returns what it actually did — the
 * count comes from the rows, not from whatever the page last loaded.
 */
export async function retirePlan(
  id: string
): Promise<{ moved: number; planName: string; movedTo: string }> {
  const { data, error } = await supabase.rpc('retire_plan', { p_plan_id: id });
  if (error) throw error;
  // A set-returning function comes back as an array of one row.
  const row = Array.isArray(data) ? data[0] : data;
  return {
    moved: row?.moved ?? 0,
    planName: row?.plan_name ?? '',
    movedTo: row?.moved_to ?? '',
  };
}

export interface PlanMemberCount {
  plan_id: string;
  active_count: number;
  total_count: number;
}

/**
 * Members per plan, counted in the database.
 *
 * The page used to tally this client-side over every membership row and count
 * only `status === 'active'`. That reported **0** for a plan somebody was
 * genuinely on — any other status is invisible to it — and the delete guard
 * believed it. `total_count` is the number that answers "is this plan
 * referenced at all"; `active_count` is the one the revenue figure wants.
 */
export async function getPlanMemberCounts(): Promise<PlanMemberCount[]> {
  const { data, error } = await supabase.rpc('plan_member_counts');
  if (error) throw error;
  return (data ?? []) as PlanMemberCount[];
}
