import { supabase } from '../supabaseClient';

/**
 * The subscription feature matrix (migration 0049).
 *
 * `membership_plans` has carried four entitlement columns since 0017 —
 * `can_book_classes`, `can_book_pt` and a quota for each — and they are edited
 * in the plan form above this. They stay there. What they cannot express is
 * "this tier does not get the AI plan builder", so 0049 adds a plan x feature
 * matrix, and this is how the admin writes it.
 *
 * ## Why the catalogue is read-only here
 *
 * There is no `createFeature`. A feature key does something because code checks
 * it, so a row invented from this screen would render a checkbox that gates
 * nothing — the "control that writes a flag nothing reads" failure this project
 * shipped once already, on a login form. New keys arrive by migration with the
 * code that honours them, and the database has no INSERT policy on `features`
 * for anyone, admin included.
 */

export interface FeatureDef {
  key: string;
  label: string;
  description: string;
  sort_order: number;
}

export interface PlanFeatureCell {
  plan_id: string;
  feature_key: string;
  enabled: boolean;
}

/** The catalogue, in display order. */
export async function listFeatures(): Promise<FeatureDef[]> {
  const { data, error } = await supabase
    .from('features')
    .select('key, label, description, sort_order')
    .order('sort_order');
  if (error) throw error;
  return (data ?? []) as FeatureDef[];
}

/** Every cell. Small by construction: features x plans, both in single digits. */
export async function listPlanFeatures(): Promise<PlanFeatureCell[]> {
  const { data, error } = await supabase
    .from('plan_features')
    .select('plan_id, feature_key, enabled');
  if (error) throw error;
  return (data ?? []) as PlanFeatureCell[];
}

/**
 * Flip one cell.
 *
 * `upsert` rather than `update` because a zero-row UPDATE is not an error in
 * PostgREST — it returns 204 and the screen would show a toggle that moved and
 * a database that did not. The seed trigger in 0049 means the row should always
 * exist; upsert makes the one case where it does not self-heal instead of
 * silently doing nothing.
 */
export async function setPlanFeature(
  planId: string,
  featureKey: string,
  enabled: boolean
): Promise<void> {
  const { error } = await supabase
    .from('plan_features')
    .upsert({ plan_id: planId, feature_key: featureKey, enabled }, { onConflict: 'plan_id,feature_key' });
  if (error) throw error;
}
