import { supabase } from '../supabaseClient';

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
 * deleted in 0020.
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
