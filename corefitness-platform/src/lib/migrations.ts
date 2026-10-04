import { supabase } from './supabaseClient';

/**
 * Which migrations are live, asked of the database (moved here from the gym
 * owner's System page, 2026-10-04 — pasting migrations is the platform's job,
 * never a gym's). Every migration from 0074 defines `migration_NNNN_applied()`;
 * a missing function is a file that was never pasted.
 *
 * `LAST` must be the newest migration. `scripts/probe-migrations.py` warns when
 * it falls behind its own last row — the drift that hid 0118 and 0119 once.
 */
export const FIRST = 74;
export const LAST = 164;

export type MigrationState = 'live' | 'missing' | 'unknown';

export async function probeMigrations(): Promise<{ num: number; state: MigrationState }[]> {
  const nums = Array.from({ length: LAST - FIRST + 1 }, (_, i) => FIRST + i);
  return Promise.all(nums.map(async (num) => {
    const { error } = await supabase.rpc(`migration_${String(num).padStart(4, '0')}_applied`);
    if (!error) return { num, state: 'live' as const };
    const missing = error.code === 'PGRST202' || error.code === '42883' || /could not find the function/i.test(error.message);
    return { num, state: missing ? 'missing' as const : 'unknown' as const };
  }));
}
