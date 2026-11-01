import { supabase } from '../supabaseClient';

const ids = (data: unknown): Set<string> => new Set(Array.isArray(data)
  ? (data as unknown[]).map((r) => (typeof r === 'string' ? r : Object.values(r as Record<string, string>)[0]))
  : []);

/**
 * Members moving between gyms (0227) — never which other gym: that is the
 * member's business. Empty before 0227, or when a read fails.
 *   switchingIn  — asked to switch to this gym; their request is waiting here.
 *   switchedOut  — left this gym for another; their records stay here.
 */
export async function gymSwitchMarks(): Promise<{ switchingIn: Set<string>; switchedOut: Set<string> }> {
  const [a, b] = await Promise.all([supabase.rpc('gym_switching_in'), supabase.rpc('gym_switched_out')]);
  return { switchingIn: a.error ? new Set() : ids(a.data), switchedOut: b.error ? new Set() : ids(b.data) };
}
