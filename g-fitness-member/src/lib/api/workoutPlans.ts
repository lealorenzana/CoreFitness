import { supabase } from '../supabaseClient';
import type { PlanSpec } from '../../utils/planBuilder';

/**
 * Saved training plans (migration 0047).
 *
 * What is stored is the **spec**, not the rendered text — see the migration for
 * why. Everything here treats the JSON as opaque apart from its `version`, so a
 * future PlanSpec v2 can be added without this file needing to understand both.
 */

interface PlanRow {
  id: string;
  spec: PlanSpec;
  created_at: string;
}

export interface SavedPlan {
  id: string;
  spec: PlanSpec;
  createdAt: string;
}

/**
 * The plan the member is on: the most recent build.
 *
 * `maybeSingle` — having no plan yet is the normal state for anyone who has not
 * used the builder, and `single()` would treat that as an error.
 */
export async function getCurrentPlan(memberId: string): Promise<SavedPlan | null> {
  const { data, error } = await supabase
    .from('workout_plans')
    .select('id, spec, created_at')
    .eq('member_id', memberId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as PlanRow;
  // A row whose shape this build does not know about is not rendered as if it
  // were v1 — that would show the member a plan assembled from fields that may
  // mean something else now.
  if (row.spec?.version !== 1) return null;
  return { id: row.id, spec: row.spec, createdAt: row.created_at };
}

/** Every build, newest first — the member can see what they were doing before. */
export async function listPlanHistory(memberId: string): Promise<SavedPlan[]> {
  const { data, error } = await supabase
    .from('workout_plans')
    .select('id, spec, created_at')
    .eq('member_id', memberId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? [])
    .filter((r: PlanRow) => r.spec?.version === 1)
    .map((r: PlanRow) => ({ id: r.id, spec: r.spec, createdAt: r.created_at }));
}

/**
 * Store a freshly built plan. Returns the saved row so the screen shows what
 * the database actually holds rather than what it hoped it wrote.
 */
export async function savePlan(memberId: string, spec: PlanSpec): Promise<SavedPlan> {
  const { data, error } = await supabase
    .from('workout_plans')
    .insert({ member_id: memberId, spec })
    .select('id, spec, created_at')
    .single();
  if (error) throw error;
  const row = data as PlanRow;
  return { id: row.id, spec: row.spec, createdAt: row.created_at };
}
