import { supabase } from '../supabaseClient';

/**
 * Who in this gym Core Fitness has suspended (0226) — the fact only, never the
 * reason, which is between Core Fitness and the person. An empty set before
 * 0226 is pasted, or when the read fails: nothing is marked rather than guessed.
 */
export async function platformSuspendedIds(): Promise<Set<string>> {
  const { data, error } = await supabase.rpc('gym_suspended_people');
  if (error || !Array.isArray(data)) return new Set();
  return new Set((data as unknown[]).map((r) => (typeof r === 'string' ? r : Object.values(r as Record<string, string>)[0])));
}
