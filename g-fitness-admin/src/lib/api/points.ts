import { supabase } from '../supabaseClient';

/**
 * CORE Points, from the gym's side (migration 0051).
 *
 * ## Nothing here can create points
 *
 * There is no "give this member 500 points" function, and the database would
 * refuse one: `point_ledger` has **no INSERT, UPDATE or DELETE policy for any
 * role** — not admin, not staff, not the member. Every row is written by
 * `award_points()`, which owns the rules and the idempotency guarantee.
 *
 * That is the whole design. A balance an admin can type into is not a score, it
 * is a number, and members work out the difference quickly.
 *
 * ## What the desk actually needed
 *
 * Points existed and members could see them, but the *gym* could not act on
 * them: the person at the counter could not see a balance while the member was
 * standing there, which is the one moment it matters. "Integrate CORE Points in
 * the gym" means the front desk, not more member-side chrome.
 */

export interface LedgerEntry {
  id: string;
  member_id: string;
  points: number;
  /** NOT NULL in 0051 — every row is written by `award_points()` against a rule. */
  rule_key: string;
  source_table: string;
  source_id: string | null;
  created_at: string;
}

/**
 * A member's current balance: everything earned, less everything spent or
 * committed to a pending redemption.
 *
 * Reads `member_points_balance()`, which is SECURITY DEFINER and — worth
 * knowing — granted to `authenticated` with **no caller guard**, so any signed-in
 * user can ask for any member's balance. That is a small privacy leak rather
 * than a hole in the ledger, since nothing writable is exposed, but it should
 * be narrowed to self-or-front-desk the next time 0051 is touched.
 */
export async function getBalance(memberId: string): Promise<number> {
  const { data, error } = await supabase.rpc('member_points_balance', { p_member: memberId });
  if (error) throw error;
  return (data as number | null) ?? 0;
}

/**
 * Balances for a list of members, in one round trip per member.
 *
 * Sequential rather than parallel: the free tier's connection pool is small and
 * a check-in list of eighty members firing eighty concurrent RPCs gets most of
 * them queued anyway. A failure resolves to null — **not 0**, which would read
 * as "this member has no points" when the truth is "we could not find out".
 */
export async function getBalances(memberIds: string[]): Promise<Map<string, number | null>> {
  const out = new Map<string, number | null>();
  for (const id of memberIds) {
    try {
      out.set(id, await getBalance(id));
    } catch {
      out.set(id, null);
    }
  }
  return out;
}

/**
 * How the balance was arrived at. Front desk and admin only per
 * `point_ledger_select_gym`; a member sees only their own.
 *
 * Empty means no points have ever been awarded, which for a member who has
 * never checked in is the correct answer rather than a missing read.
 */
export async function listLedger(memberId: string, limit = 50): Promise<LedgerEntry[]> {
  const { data, error } = await supabase
    .from('point_ledger')
    .select('*')
    .eq('member_id', memberId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as LedgerEntry[];
}

/** Wording for a ledger row, since `rule_key` is a database key and not a sentence. */
export function ledgerLabel(entry: LedgerEntry): string {
  const BY_RULE: Record<string, string> = {
    checkin: 'Checked in',
    workout_logged: 'Logged a workout',
    goal_reached: 'Reached a goal',
    class_attended: 'Attended a class',
    pt_attended: 'Personal training session',
    challenge_completed: 'Finished a challenge',
  };
  if (BY_RULE[entry.rule_key]) return BY_RULE[entry.rule_key];
  // An unknown key is shown as itself rather than as "Points" — a rule the gym
  // added later should be legible, not flattened into a generic word.
  return entry.rule_key;
}
