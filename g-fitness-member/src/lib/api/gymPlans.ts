import { supabase } from '../supabaseClient';
import type { GymPlanRow } from '../../types/db';

/**
 * The member's weekly training plan (migration 0030).
 *
 * One row per chosen weekday. `last_reminded_on` is written by
 * `send_due_gym_reminders()` on the server and is never touched from here —
 * a client that could clear it could make the same nudge fire repeatedly.
 */

export const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const DAY_FULL = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
];

export const DEFAULT_REMIND_AT = '17:00';

export async function listMyPlan(memberId: string): Promise<GymPlanRow[]> {
  const { data, error } = await supabase
    .from('gym_plans')
    .select('*')
    .eq('member_id', memberId)
    .order('day_of_week', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/**
 * Replaces the whole plan in one go.
 *
 * Deliberately delete-then-insert rather than diffing: the editor hands over
 * the complete set of days, and a diff would have to reason about the unique
 * (member_id, day_of_week) constraint for every add/remove combination. The
 * member owns these rows, so both halves are permitted by the same policy.
 *
 * Not a transaction — supabase-js has no client-side multi-statement
 * transaction. A failure between the two leaves the plan empty rather than
 * wrong, and the screen reloads from the server, so the member sees the truth
 * and can set it again.
 */
export async function saveMyPlan(
  memberId: string,
  days: number[],
  remindAt: string
): Promise<void> {
  const { error: delError } = await supabase
    .from('gym_plans')
    .delete()
    .eq('member_id', memberId);
  if (delError) throw delError;

  if (days.length === 0) return;

  const rows = days.map((day_of_week) => ({
    member_id: memberId,
    day_of_week,
    // Postgres `time` accepts 'HH:MM'; the column stores 'HH:MM:SS'.
    remind_at: remindAt,
    active: true,
  }));

  const { error } = await supabase.from('gym_plans').insert(rows);
  if (error) throw error;
}

/** Local weekday index, 0 = Sunday — the same basis the SQL uses. */
export function todayDow(): number {
  return new Date().getDay();
}

/** 'HH:MM:SS' or 'HH:MM' → '5:00 PM'. */
export function formatRemindAt(value: string): string {
  const [h, m] = value.split(':');
  const hour = Number(h);
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}:${m} ${suffix}`;
}

/** The `<input type="time">` value — that control wants exactly 'HH:MM'. */
export function toTimeInput(value: string): string {
  return value.slice(0, 5);
}
