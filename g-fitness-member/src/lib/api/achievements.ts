import { supabase } from '../supabaseClient';
import {
  iconByName,
  type AchievementDef, type AchievementRole, type AchievementTier,
} from '../../data/achievements';

/**
 * Progression and achievements (migration 0028).
 *
 * Thin on purpose. Every threshold, every earning rule and the ratchet that
 * keeps a level once reached all live in SQL — see the header of
 * `0028_progression_and_achievements.sql` for why. This module calls two
 * functions and marks celebrations as shown.
 *
 * There is deliberately no `unlock()` here. `achievement_unlocks` has no INSERT
 * policy at all; rows only ever arrive from `sync_my_achievements()`, which
 * runs as definer and grades the caller against the real tables. A badge cannot
 * be awarded from the client, which is the whole reason the old badges tab was
 * deleted in 0020. (0038 added an admin-only `award_achievement()` RPC for
 * hand-given badges — still server-side, still not reachable from this app.)
 *
 * Since 0038 the **catalogue** is a table too, so the definitions are fetched
 * rather than compiled in. `loadCatalogue()` caches them for the session.
 */

export type TrainingLevel = 'beginner' | 'intermediate' | 'advanced';

export interface Progression {
  /** What the member holds — never drops, even if activity does. */
  level: TrainingLevel;
  /** What today's numbers alone would say. Differs from `level` after a quiet spell. */
  computedLevel: TrainingLevel;
  trainingDays: number;
  /** Check-ins the gym recorded. */
  verifiedDays: number;
  /** Days the member logged themselves, with no check-in. */
  loggedDays: number;
  consistentWeeks: number;
  currentWeekStreak: number;
  bestWeekStreak: number;
  /** null once Advanced is reached — there is nothing above it. */
  nextLevel: TrainingLevel | null;
  nextDays: number | null;
  nextWeeks: number | null;
  memberSince: string | null;
}

export interface UnlockRow {
  achievement_key: string;
  unlocked_on: string;
  seen: boolean;
}

/** Shape of the `member_progression` row as PostgREST returns it. */
interface ProgressionRow {
  level: TrainingLevel;
  computed_level: TrainingLevel;
  training_days: number;
  verified_days: number;
  logged_days: number;
  consistent_weeks: number;
  current_week_streak: number;
  best_week_streak: number;
  next_level: TrainingLevel | null;
  next_days: number | null;
  next_weeks: number | null;
  member_since: string | null;
}

/**
 * `uid` omitted reads your own. Passing one is for trainers and the front desk
 * looking at a member; the function refuses anyone else, so this can be called
 * without checking the caller's role first.
 */
export async function getProgression(uid?: string): Promise<Progression | null> {
  const { data, error } = await supabase.rpc('member_progression', uid ? { uid } : {});
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as ProgressionRow | undefined;
  if (!row) return null;
  return {
    level: row.level,
    computedLevel: row.computed_level,
    trainingDays: row.training_days,
    verifiedDays: row.verified_days,
    loggedDays: row.logged_days,
    consistentWeeks: row.consistent_weeks,
    currentWeekStreak: row.current_week_streak,
    bestWeekStreak: row.best_week_streak,
    nextLevel: row.next_level,
    nextDays: row.next_days,
    nextWeeks: row.next_weeks,
    memberSince: row.member_since,
  };
}

/**
 * Re-grades the signed-in user and returns only what was *newly* unlocked, so
 * the caller can celebrate it. Already-earned achievements come back empty on
 * every later call — `on conflict do nothing` in the SQL is what stops every
 * badge replaying its animation at each app launch.
 */
export async function syncAchievements(): Promise<string[]> {
  const { data, error } = await supabase.rpc('sync_my_achievements');
  if (error) throw error;
  if (!Array.isArray(data)) return [];
  // A `setof text` comes back as bare strings; the row-wrapped form is
  // tolerated so a PostgREST change can't blank the celebration.
  return data
    .map((d: unknown) =>
      typeof d === 'string' ? d : (d as { sync_my_achievements?: string })?.sync_my_achievements
    )
    .filter((k): k is string => typeof k === 'string' && k.length > 0);
}

export async function listUnlocks(uid: string): Promise<UnlockRow[]> {
  const { data, error } = await supabase
    .from('achievement_unlocks')
    .select('achievement_key, unlocked_on, seen')
    .eq('user_id', uid)
    .order('unlocked_on', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/**
 * Fire-and-forget by design at the call sites: the celebration has already been
 * shown by the time this runs, and failing to record that is not worth an error
 * in the user's face. The cost of a lost write is one repeated animation.
 */
export async function markSeen(keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  const { error } = await supabase
    .from('achievement_unlocks')
    .update({ seen: true })
    .in('achievement_key', keys);
  if (error) throw error;
}

/** Display name for a level. The DB stores lowercase; screens want a label. */
export function levelLabel(level: TrainingLevel): string {
  return level === 'beginner' ? 'Beginner'
    : level === 'intermediate' ? 'Intermediate'
    : 'Advanced';
}

export const LEVEL_ACCENT: Record<TrainingLevel, string> = {
  beginner: '#A8B0BE',
  intermediate: '#F59E0B',
  advanced: '#A78BFA',
};

// ─── The catalogue (migration 0038) ──────────────────────────────────────────

/** Row shape of `achievements`. */
export interface AchievementRow {
  key: string;
  audience: AchievementRole;
  title: string;
  description: string;
  requirement: string;
  icon: string;
  tier: AchievementTier;
  category: string;
  rule_kind: 'metric' | 'builtin' | 'manual';
  metric: string | null;
  threshold: number | null;
  metric2: string | null;
  threshold2: number | null;
  active: boolean;
  builtin: boolean;
  sort_order: number;
}

/**
 * Session cache. The catalogue changes when an admin edits it, which is rare,
 * and re-fetching it on every screen would make the gallery flicker for no
 * reason. A page that must be current can pass `force`.
 */
let cache: AchievementDef[] | null = null;
let cacheByKey = new Map<string, AchievementDef>();
let inflight: Promise<AchievementDef[]> | null = null;

function toDef(row: AchievementRow): AchievementDef & { audience: AchievementRole } {
  return {
    key: row.key,
    title: row.title,
    description: row.description,
    requirement: row.requirement,
    icon: iconByName(row.icon),
    tier: row.tier,
    category: row.category,
    audience: row.audience,
    metric: row.metric,
    metric2: row.metric2,
    ruleKind: row.rule_kind,
  };
}

const withAudience: Array<AchievementDef & { audience: AchievementRole }> = [];

/**
 * Loads every active achievement once per session.
 *
 * Concurrent callers share one request — the watcher and the gallery both call
 * this on mount, and two identical queries on app start is waste the free tier
 * does not need to absorb.
 */
export async function loadCatalogue(force = false): Promise<AchievementDef[]> {
  if (cache && !force) return cache;
  if (inflight && !force) return inflight;

  inflight = (async () => {
    const { data, error } = await supabase
      .from('achievements')
      .select('*')
      .eq('active', true)
      .order('audience', { ascending: true })
      .order('sort_order', { ascending: true });
    if (error) throw error;

    const defs = (data ?? []).map((r) => toDef(r as AchievementRow));
    withAudience.length = 0;
    withAudience.push(...defs);
    cache = defs;
    cacheByKey = new Map(defs.map((d) => [d.key, d]));
    return defs;
  })();

  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

/**
 * The set for one role. Synchronous, so the screens that already called it stay
 * unchanged — but it reads the cache, so **`loadCatalogue()` must have resolved
 * first** or it returns empty. Every caller awaits it in the same effect.
 */
export function catalogFor(role: AchievementRole): AchievementDef[] {
  return withAudience.filter((a) => a.audience === role);
}

/**
 * Undefined for a key the catalogue has no row for — a retired achievement
 * somebody still holds, or a database a migration ahead of this build. Callers
 * skip those rather than rendering an empty tile.
 */
export function achievementByKey(key: string): AchievementDef | undefined {
  return cacheByKey.get(key);
}

/** Catalogue order, so the gallery groups do not jump around between loads. */
export function categoriesFor(role: AchievementRole): string[] {
  const seen: string[] = [];
  for (const a of catalogFor(role)) if (!seen.includes(a.category)) seen.push(a.category);
  return seen;
}

// ─── Progress and rarity (migration 0093) ────────────────────────────────────

export interface AchievementProgress {
  value: number;
  threshold: number;
  value2: number | null;
  threshold2: number | null;
}

/** PostgREST's "no such function" — the migration has not been pasted yet. */
const missingFn = (e: { code?: string } | null) => e?.code === 'PGRST202' || e?.code === '42883';

/**
 * How far along each automatic achievement is, for yourself (no `uid`) or —
 * for a trainer — a member you have trained. Null before 0093 exists, so the
 * gallery falls back to the rule text alone rather than failing.
 */
export async function getAchievementProgress(uid?: string): Promise<Map<string, AchievementProgress> | null> {
  const { data, error } = await supabase.rpc('achievement_progress', uid ? { p_user: uid } : {});
  if (missingFn(error)) return null;
  if (error) throw error;
  return new Map(((data ?? []) as {
    achievement_key: string; value: number | string; threshold: number | string;
    value2: number | string | null; threshold2: number | string | null;
  }[]).map((r) => [r.achievement_key, {
    value: Number(r.value),
    threshold: Number(r.threshold),
    value2: r.value2 == null ? null : Number(r.value2),
    threshold2: r.threshold2 == null ? null : Number(r.threshold2),
  }]));
}

/**
 * The share of a threshold reached, 0–1. A two-part rule is as far along as its
 * weaker half — 20 of 20 days but 2 of 6 weeks is a third of the way, not most
 * of it. Null when there is nothing to measure against.
 */
export function progressFraction(p: AchievementProgress | undefined): number | null {
  if (!p || !(p.threshold > 0)) return null;
  const a = Math.min(1, p.value / p.threshold);
  if (p.threshold2 == null || !(p.threshold2 > 0)) return a;
  return Math.min(a, Math.min(1, (p.value2 ?? 0) / p.threshold2));
}

export interface Rarity { holders: number; audience: number }

/** How many active people of the audience hold each one. Null before 0093. */
export async function getAchievementRarity(): Promise<Map<string, Rarity> | null> {
  const { data, error } = await supabase.rpc('achievement_rarity');
  if (missingFn(error)) return null;
  if (error) throw error;
  return new Map(((data ?? []) as { achievement_key: string; holders: number; audience_size: number }[])
    .map((r) => [r.achievement_key, { holders: r.holders, audience: r.audience_size }]));
}

/** Unit words per metric ("days", "classes") from the catalogue's vocabulary (0038). */
export async function getMetricUnits(): Promise<Map<string, { label: string; unit: string | null; isBoolean: boolean }>> {
  const { data, error } = await supabase.from('achievement_metrics').select('key, label, unit, is_boolean');
  if (error) return new Map();
  return new Map(((data ?? []) as { key: string; label: string; unit: string | null; is_boolean: boolean }[])
    .map((m) => [m.key, { label: m.label, unit: m.unit, isBoolean: m.is_boolean }]));
}
