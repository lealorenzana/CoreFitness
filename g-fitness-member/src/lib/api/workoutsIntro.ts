import { supabase } from '../supabaseClient';

/**
 * Has this member seen the Workouts introduction (0172)? Per-member state in
 * the database, never localStorage. Before 0172 is pasted the column does not
 * exist — then the answer is "yes, seen": an introduction whose Skip cannot be
 * saved would come back on every visit.
 */
export async function workoutsIntroSeen(memberId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('member_profiles')
    .select('workouts_intro_seen_at')
    .eq('profile_id', memberId)
    .maybeSingle();
  if (error) return true;
  return (data as { workouts_intro_seen_at: string | null } | null)?.workouts_intro_seen_at != null;
}

/** The first workout started, or Skip: never shown again on any device. */
export async function markWorkoutsIntroSeen(): Promise<void> {
  await supabase.rpc('mark_workouts_intro_seen').then(() => undefined, () => undefined);
}
