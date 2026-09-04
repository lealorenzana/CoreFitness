import { supabase } from '../supabaseClient';

/**
 * What the member's subscription includes (migration 0049).
 *
 * ## Why this is one RPC and not a query
 *
 * The obvious version reads `membership_plans` and works the rules out on the
 * client. That reintroduces the failure 0017 was written to avoid from the
 * other direction: two implementations of the same rule, one in SQL enforcing
 * it and one in TypeScript explaining it, drifting apart the first time either
 * changes.
 *
 * `my_features()` calls the same `plan_allows()` the RLS policies call, so the
 * lock on screen and the refusal from the database are the same decision. The
 * label and description come back with it, which is what makes it impossible to
 * ship a gate with nothing to say — see `FeatureLock`.
 *
 * ## This is not the boundary
 *
 * Everything here is for *explaining*. A member who edits their own bundle to
 * flip `enabled` gets a working button and a rejected insert, because the
 * policy is checked in Postgres. That is the same split as `bookingService`
 * greying out a class it cannot book.
 */

/** Keys that exist in `features`. Adding one is a migration, so this is closed. */
export type FeatureKey =
  | 'workout_tracker'
  | 'plan_builder'
  | 'ai_model'
  | 'points_earn'
  | 'points_redeem'
  | 'challenges';

export interface Feature {
  key: FeatureKey;
  /** "AI workout plan" — the name shown on the lock card. */
  label: string;
  /** One sentence on what the member is missing. Never empty (NOT NULL in SQL). */
  description: string;
  enabled: boolean;
}

interface FeatureRow {
  key: string;
  label: string;
  description: string;
  enabled: boolean;
  sort_order: number;
}

/**
 * Every feature with this member's own answer, in display order.
 *
 * Throws rather than returning `[]` on failure. An empty list is
 * indistinguishable from "nothing is included", which would lock a paying
 * member out of everything they bought and tell them their plan was the
 * problem — the "degrading to empty makes 'couldn't load' read as 'nothing
 * here'" rule. Callers surface the error.
 */
export async function getMyFeatures(): Promise<Feature[]> {
  const { data, error } = await supabase.rpc('my_features');
  if (error) throw error;
  return ((data ?? []) as FeatureRow[]).map((r) => ({
    key: r.key as FeatureKey,
    label: r.label,
    description: r.description,
    enabled: r.enabled,
  }));
}

/** Lookup helper. Unknown key -> false, because a gate nobody defined is not open. */
export function isEnabled(features: Feature[] | null, key: FeatureKey): boolean {
  return features?.find((f) => f.key === key)?.enabled ?? false;
}

export function findFeature(features: Feature[] | null, key: FeatureKey): Feature | null {
  return features?.find((f) => f.key === key) ?? null;
}

/**
 * The whole matrix, keyed by plan — for the comparison screen.
 *
 * `my_features()` answers for *this* member's plan and cannot answer for the
 * others, which is exactly what "should I upgrade?" needs. Both tables are
 * readable by any authenticated user (0049), so this is a plain join.
 *
 * The result feeds `planAccess(plan, matrix[plan.id])`, so the upgrade screen
 * lists what a tier adds in the same words as the lock card that will explain
 * it later.
 */
export async function getPlanFeatureMatrix(): Promise<Record<string, { key: string; label: string; enabled: boolean }[]>> {
  const [defs, cells] = await Promise.all([
    supabase.from('features').select('key, label, sort_order').order('sort_order'),
    supabase.from('plan_features').select('plan_id, feature_key, enabled'),
  ]);
  if (defs.error) throw defs.error;
  if (cells.error) throw cells.error;

  const labels = new Map((defs.data ?? []).map((d) => [d.key as string, d.label as string]));
  const order = new Map((defs.data ?? []).map((d, i) => [d.key as string, i]));
  const out: Record<string, { key: string; label: string; enabled: boolean }[]> = {};

  for (const c of cells.data ?? []) {
    const key = c.feature_key as string;
    const label = labels.get(key);
    // A cell whose feature row is missing is skipped rather than rendered as a
    // blank bullet — the catalogue is the source of the wording.
    if (!label) continue;
    (out[c.plan_id as string] ??= []).push({ key, label, enabled: c.enabled as boolean });
  }
  for (const list of Object.values(out)) {
    list.sort((a, b) => (order.get(a.key) ?? 0) - (order.get(b.key) ?? 0));
  }
  return out;
}
