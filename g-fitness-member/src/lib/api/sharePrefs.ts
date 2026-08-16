import { supabase } from '../supabaseClient';

/**
 * What a member lets their trainer see (migration 0032).
 *
 * These are **not** the boundary — `trainer_may_see()` and the RLS policies on
 * `body_measurements` / `fitness_goals` / `workout_logs` are. This module reads
 * and writes the switches; turning one off genuinely removes the rows from
 * every trainer's queries, not just from the screen.
 *
 * A missing row means "sharing everything", which is the behaviour that existed
 * before the switches did. Nothing changes for anyone until they choose.
 */

export interface SharePrefs {
  shareMeasurements: boolean;
  shareGoals: boolean;
  shareWorkouts: boolean;
}

export const SHARE_ALL: SharePrefs = {
  shareMeasurements: true,
  shareGoals: true,
  shareWorkouts: true,
};

interface SharePrefsRow {
  member_id: string;
  share_measurements: boolean;
  share_goals: boolean;
  share_workouts: boolean;
}

function toPrefs(row: SharePrefsRow | null): SharePrefs {
  if (!row) return SHARE_ALL;
  return {
    shareMeasurements: row.share_measurements,
    shareGoals: row.share_goals,
    shareWorkouts: row.share_workouts,
  };
}

/**
 * `maybeSingle`, not `single`: no row is the normal state for anyone who has
 * never opened the screen, and `single()` treats that as an error.
 */
export async function getSharePrefs(memberId: string): Promise<SharePrefs> {
  const { data, error } = await supabase
    .from('member_share_prefs')
    .select('member_id, share_measurements, share_goals, share_workouts')
    .eq('member_id', memberId)
    .maybeSingle();
  if (error) throw error;
  return toPrefs(data);
}

/**
 * Upsert, because the row may not exist yet and the member owns it either way.
 * Safe to read back — `member_share_prefs_all_self` covers both halves, so this
 * is not the `INSERT … RETURNING` trap.
 */
export async function saveSharePrefs(memberId: string, prefs: SharePrefs): Promise<void> {
  const { error } = await supabase
    .from('member_share_prefs')
    .upsert(
      {
        member_id: memberId,
        share_measurements: prefs.shareMeasurements,
        share_goals: prefs.shareGoals,
        share_workouts: prefs.shareWorkouts,
      },
      { onConflict: 'member_id' }
    );
  if (error) throw error;
}
