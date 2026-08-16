import { supabase } from '../supabaseClient';

/**
 * A member's *earned* training level (migration 0028).
 *
 * Not the same thing as `member_profiles.experience_level`, and the two must
 * never be labelled the same way on screen. `experience_level` is what the
 * member said about themselves at onboarding; this is what this gym actually
 * recorded — check-ins and logged workouts, counted as days.
 *
 * `member_progression()` is SECURITY DEFINER and does its own authorisation:
 * you may read your own, and admin/staff/trainer may read anyone's.
 */
export interface MemberProgression {
  /** Displayed level — never drops below the highest level ever held. */
  level: string;
  /** What today's numbers alone would give. Differs after a long break. */
  computed_level: string;
  training_days: number;
  /** Days with a staff-recorded check-in. */
  verified_days: number;
  /** Days with a self-logged workout. */
  logged_days: number;
  consistent_weeks: number;
  current_week_streak: number;
  best_week_streak: number;
  /** null once there is nothing left to reach. */
  next_level: string | null;
  next_days: number | null;
  next_weeks: number | null;
  member_since: string | null;
}

/**
 * Returns null rather than throwing when progression can't be read.
 *
 * Migration 0028 has not been run against every environment, and a missing
 * function comes back as a PostgREST error, not an empty result. A member
 * record must still open when the RPC isn't there — the caller hides the
 * section instead of showing a level it had to invent.
 */
export async function getMemberProgression(memberId: string): Promise<MemberProgression | null> {
  const { data, error } = await supabase.rpc('member_progression', { uid: memberId });
  if (error) return null;
  const row = Array.isArray(data) ? data[0] : data;
  return (row as MemberProgression) ?? null;
}
