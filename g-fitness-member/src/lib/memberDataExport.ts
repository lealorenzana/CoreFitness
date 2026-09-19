import { supabase } from './supabaseClient';

/**
 * Everything the gym holds about one member, as one JSON file (2026-09-19) —
 * the right to a copy under RA 10173 (Privacy → "Your rights").
 *
 * **This file exists in both apps and must stay identical** (diff before you
 * change one): the member downloads their own copy from Settings → Your data,
 * and the desk exports the same shape from the member drawer when a member asks
 * at the counter. RLS decides what each caller may read — a member gets their
 * own rows; the desk gets that member's. A table the caller may not read, or
 * that does not exist yet, is listed under `unavailable` with the reason,
 * rather than silently left out.
 */

/** Table → the column naming the member. Order is the order in the file. */
const TABLES: [string, string, string?][] = [
  ['profiles', 'id'],
  ['member_profiles', 'profile_id'],
  ['memberships', 'member_id'],
  ['membership_events', 'member_id'],
  ['payments', 'member_id'],
  ['renewal_requests', 'member_id'],
  ['attendance', 'member_id'],
  ['bookings', 'member_id'],
  ['pt_sessions', 'member_id'],
  ['gym_plans', 'member_id'],
  ['workout_routines', 'member_id', '*, workout_routine_exercises(*)'],
  ['workout_logs', 'member_id', '*, workout_sets(*)'],
  ['body_measurements', 'member_id'],
  ['fitness_goals', 'member_id'],
  ['point_ledger', 'member_id'],
  ['reward_redemptions', 'member_id'],
  ['saved_resources', 'member_id'],
  ['trainer_feedback', 'member_id'],
  ['trainer_ratings', 'member_id'],
  ['member_share_prefs', 'member_id'],
  ['notification_prefs', 'user_id'],
  ['notifications', 'user_id'],
];

export interface MemberDataExport {
  exported_at: string;
  member_id: string;
  note: string;
  data: Record<string, unknown[]>;
  unavailable: Record<string, string>;
}

export async function exportMemberData(memberId: string): Promise<MemberDataExport> {
  const results = await Promise.all(TABLES.map(async ([table, column, select]) => {
    const { data, error } = await supabase.from(table).select(select ?? '*').eq(column, memberId);
    return { table, data: (data ?? []) as unknown[], error: error?.message ?? null };
  }));
  const out: MemberDataExport = {
    exported_at: new Date().toISOString(),
    member_id: memberId,
    note: 'Core Fitness — a copy of the records held about this member. Passwords are never held by the gym and are not included.',
    data: {},
    unavailable: {},
  };
  for (const r of results) {
    if (r.error) out.unavailable[r.table] = r.error;
    else out.data[r.table] = r.data;
  }
  return out;
}

/** Hands the export to the browser as a download. */
export function downloadExport(exp: MemberDataExport, name: string): void {
  const blob = new Blob([JSON.stringify(exp, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name.replace(/[^\w-]+/g, '-').toLowerCase() || 'member'}-core-fitness-data.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
