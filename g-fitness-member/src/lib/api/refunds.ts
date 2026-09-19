import { supabase } from '../supabaseClient';

/**
 * What a membership would be refunded, and why (migrations 0070, 0073).
 *
 * **Copied from g-fitness-admin/src/lib/api/refunds.ts and kept identical** —
 * the member's Plans screen and the desk's cancel dialog quote the same
 * function, so they print the same figure and the same sentence.
 *
 * ## The number is never shown without the reason
 *
 * "The system says ₱880" is not something a member can accept or dispute, and
 * it leaves whoever is at the desk defending an unexplained figure. Every quote
 * carries the sentence that produced it, and the screen prints both.
 *
 * ## Pro-rata is the baseline, the gym's tiers are a floor
 *
 * Under RA 7394 a refund on a prepaid service membership is expected to be
 * pro-rata for the unused portion, with only reasonable and documented
 * deductions — and a "no refund" clause does not override that. So 0073 made
 * the calculation `max(pro-rata, gym tier)` less a documented fee: the member
 * never gets less than the law expects, and the gym keeps the ability to be
 * more generous, which is what the 7-day full refund was always for.
 *
 * `docs/MEMBERSHIP_POLICY.md` has the sources.
 */

export interface RefundQuote {
  /** The percentage actually applied. NULL means no rule covers this case. */
  percent: number | null;
  /** Pesos, after the documented fee. NULL alongside a NULL percent. */
  amount: number | null;
  /** The sentence to print. Always present, including for the NULL case. */
  rule_label: string;
  days_elapsed: number;
  has_visited: boolean;
  paid_total: number;
  /** NULL for a non-expiring plan — there is no term to divide. */
  days_total: number | null;
  days_unused: number | null;
  prorata_percent: number | null;
  floor_percent: number | null;
  /** Which side won. 'undecided' means an admin has to decide. */
  basis: 'prorata' | 'gym_floor' | 'undecided';
  fee_deducted: number;
}

/**
 * Quotes one membership. Self or front desk; the function raises for anyone
 * else rather than returning an empty result, because an empty result would
 * read as "no refund due".
 */
export async function getRefundQuote(membershipId: string): Promise<RefundQuote | null> {
  const { data, error } = await supabase.rpc('refund_quote', { p_membership: membershipId });
  if (error) throw error;
  // A set-returning function comes back as an array of one.
  const row = Array.isArray(data) ? data[0] : data;
  return (row as RefundQuote) ?? null;
}

/**
 * Pesos, in the format the desk writes on a receipt.
 *
 * A NULL amount is **not** rendered as ₱0 — that would answer a question the
 * system has explicitly declined to answer.
 */
export function formatPeso(amount: number | null): string {
  if (amount == null) return '—';
  return `₱${Number(amount).toLocaleString('en-PH', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })}`;
}

/**
 * One line explaining where the figure came from, for under the amount.
 *
 * Returns null when there is nothing worth adding — the rule label already says
 * it, and repeating it in different words reads as two separate claims.
 */
export function basisLine(q: RefundQuote): string | null {
  if (q.basis === 'undecided') return null;
  if (q.basis === 'prorata') {
    return q.days_total == null
      ? null
      : `${q.days_unused} of ${q.days_total} days unused.`;
  }
  return q.prorata_percent == null
    ? 'Gym policy — this plan has no term to pro-rate.'
    : `Gym policy, above the ${q.prorata_percent}% the unused term alone would give.`;
}
