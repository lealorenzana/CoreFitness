import { supabase } from '../supabaseClient';

/**
 * The gym documents between Core Fitness and this gym (0152): which version is
 * in effect, and whether this gym's owner has agreed to it. `my_gym_terms()`
 * answers null for anyone but an owner — the desk is never asked — and errors
 * before 0152 is pasted, which reads here as "nothing to ask".
 */
export const SITE = 'https://corefitness-site.vercel.app';

export interface MyGymTerms {
  published: string | null;
  accepted_version: string | null;
  accepted_at: string | null;
  accepted_by: string | null;
}

export async function myGymTerms(): Promise<MyGymTerms | null> {
  const { data, error } = await supabase.rpc('my_gym_terms');
  if (error || !data || typeof data !== 'object') return null;
  return data as MyGymTerms;
}

export async function acceptGymTerms(version: string): Promise<void> {
  const { error } = await supabase.rpc('accept_gym_terms_owner', { p_version: version });
  if (error) throw error;
}

/** '2026-10-03' → 'October 3, 2026' — a calendar date, never parsed through Date (UTC midnight is the day before west of Greenwich). */
export function versionLabel(v: string): string {
  const [y, m, d] = v.split('-').map(Number);
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return y && m && d ? `${months[m - 1]} ${d}, ${y}` : v;
}
