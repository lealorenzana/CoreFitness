import { assertWrote } from './mutate';
import { supabase } from '../supabaseClient';

/**
 * The achievement catalogue, admin side (migration 0038).
 *
 * Before 0038 there was no admin side: the 33 achievements were an `if` ladder
 * in SQL plus an array in the member app's TypeScript, so the gym could not add
 * one without a developer and a deploy.
 *
 * The security property from 0028 is unchanged and worth restating, because
 * this module is the thing that could have broken it: **`achievement_unlocks`
 * still has no INSERT policy.** Editing the catalogue changes which rules the
 * server evaluates; it does not let anybody hand themselves a badge. The one
 * hand-award path is `award_achievement()`, which is SECURITY DEFINER and
 * refuses anyone who is not an admin — checked in the database, not here.
 */

export type AchievementAudience = 'member' | 'trainer';
export type AchievementTier = 'bronze' | 'silver' | 'gold' | 'platinum';
export type AchievementRuleKind = 'metric' | 'builtin' | 'manual';

export interface AchievementRow {
  key: string;
  audience: AchievementAudience;
  title: string;
  description: string;
  requirement: string;
  icon: string;
  tier: AchievementTier;
  category: string;
  rule_kind: AchievementRuleKind;
  metric: string | null;
  threshold: number | null;
  metric2: string | null;
  threshold2: number | null;
  active: boolean;
  /** Seeded by 0038. Its rule may be `builtin` and uneditable. */
  builtin: boolean;
  sort_order: number;
  created_at: string;
  created_by: string | null;
}

/** A stat a rule can be built on — the real output columns of the SQL stats
 *  functions, so the dropdown cannot offer something that never fires. */
export interface AchievementMetric {
  key: string;
  audience: AchievementAudience;
  label: string;
  unit: string | null;
  is_boolean: boolean;
  sort_order: number;
}

export interface AchievementHolder {
  user_id: string;
  name: string;
  unlocked_on: string;
}

export async function listAchievements(includeRetired = true): Promise<AchievementRow[]> {
  let q = supabase
    .from('achievements')
    .select('*')
    .order('audience', { ascending: true })
    .order('sort_order', { ascending: true });
  if (!includeRetired) q = q.eq('active', true);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function listMetrics(): Promise<AchievementMetric[]> {
  const { data, error } = await supabase
    .from('achievement_metrics')
    .select('*')
    .order('audience', { ascending: true })
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export type AchievementInput = Omit<AchievementRow, 'created_at' | 'created_by' | 'builtin'>;

export async function createAchievement(input: AchievementInput): Promise<AchievementRow> {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('achievements')
    .insert({ ...input, builtin: false, created_by: user?.id ?? null })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * `key` is never in the update payload.
 *
 * It is the join to `achievement_unlocks.achievement_key`, and nothing enforces
 * that relationship — renaming a key would leave every earned badge pointing at
 * a row that no longer exists, silently, and the member would simply lose it.
 * The form renders the key read-only once the row exists.
 */
export async function updateAchievement(
  key: string,
  updates: Partial<Omit<AchievementInput, 'key'>>
): Promise<void> {
  const { data, error } = await supabase
    .from('achievements').update(updates).eq('key', key)
    .select('id');
  if (error) throw error;
  assertWrote(data, 'That achievement could not be saved. Please refresh and try again.');
}

/** Stops new unlocks without touching anyone who already earned it. */
export async function setAchievementActive(key: string, active: boolean): Promise<void> {
  return updateAchievement(key, { active });
}

/**
 * Only possible while nobody has earned it — a BEFORE DELETE trigger in 0038
 * raises otherwise, because deleting one out from under a member would take a
 * badge they were already shown. The thrown message names the count and says to
 * retire it instead, so it is surfaced verbatim.
 */
export async function deleteAchievement(key: string): Promise<void> {
  const { data, error } = await supabase
    .from('achievements').delete().eq('key', key)
    .select('id');
  if (error) throw error;
  assertWrote(data, 'That achievement could not be deleted. Please refresh and try again.');
}

/** Everyone currently holding one, for the detail panel. */
export async function listHolders(key: string): Promise<AchievementHolder[]> {
  const { data, error } = await supabase
    .from('achievement_unlocks')
    .select('user_id, unlocked_on, profiles!inner(first_name, last_name)')
    .eq('achievement_key', key)
    .order('unlocked_on', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => {
    // PostgREST returns a to-one embed as an object, but the generated types
    // describe it as an array. Both shapes are unwrapped rather than trusting
    // either — this is the same embed pattern `members.ts` uses.
    const row = r as unknown as {
      user_id: string;
      unlocked_on: string;
      profiles: { first_name: string; last_name: string } | Array<{ first_name: string; last_name: string }>;
    };
    const p = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    return {
      user_id: row.user_id,
      // No name means the profile is gone; say so rather than printing an id.
      name: `${p?.first_name ?? ''} ${p?.last_name ?? ''}`.trim() || 'Deleted account',
      unlocked_on: row.unlocked_on,
    };
  });
}

/** Hand-award. Admin-only, enforced inside the function. */
export async function awardAchievement(userId: string, key: string): Promise<void> {
  const { error } = await supabase.rpc('award_achievement', { p_user: userId, p_key: key });
  if (error) throw error;
}

/**
 * Take one back.
 *
 * Honest caveat the UI repeats: revoking a **metric** achievement the person
 * still qualifies for only lasts until their next sync, which re-grants it.
 * Revoking is really only meaningful for a manual award.
 */
export async function revokeAchievement(userId: string, key: string): Promise<void> {
  const { error } = await supabase.rpc('revoke_achievement', { p_user: userId, p_key: key });
  if (error) throw error;
}

/** Candidates for a hand-award: active accounts of the matching role. */
export async function listAwardCandidates(
  audience: AchievementAudience
): Promise<Array<{ id: string; name: string }>> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, first_name, last_name')
    .eq('role', audience)
    .eq('status', 'active')
    .order('first_name', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((p) => ({
    id: p.id,
    name: `${p.first_name} ${p.last_name}`.trim(),
  }));
}

/**
 * Turns a rule into the sentence shown on the card.
 *
 * Derived from the stored rule rather than from the `requirement` text, so the
 * card cannot claim one thing while the evaluator does another — the two drift
 * the moment somebody edits a threshold and forgets the wording.
 */
export function ruleSummary(a: AchievementRow, metrics: AchievementMetric[]): string {
  if (a.rule_kind === 'manual') return 'Awarded by hand';
  if (a.rule_kind === 'builtin') return 'Built-in rule (fixed)';

  const describe = (metricKey: string | null, threshold: number | null): string => {
    const m = metrics.find((x) => x.key === metricKey);
    if (!m) return `${metricKey ?? '?'} ≥ ${threshold ?? '?'}`;
    if (m.is_boolean) return m.label;
    return `${m.label} ≥ ${threshold ?? '?'}${m.unit ? ' ' + m.unit : ''}`;
  };

  const first = describe(a.metric, a.threshold);
  return a.metric2 ? `${first} and ${describe(a.metric2, a.threshold2)}` : first;
}
