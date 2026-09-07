import { supabase } from '../supabaseClient';
import { assertWrote } from './mutate';

/**
 * The gym's refund policy, as rows the admin edits (migrations 0070, 0073).
 *
 * ## These are a floor, not the whole rule
 *
 * Since 0073 a refund is `max(pro-rata for the unused term, the tier below)`
 * less a documented fee. Under RA 7394 a prepaid membership is expected to be
 * refunded pro-rata for the unused portion, and a gym may be **more** generous
 * than that but not less — so editing a percentage down here does not reduce
 * what a member actually gets below the legal baseline. It only changes how
 * generous the gym chooses to be on top of it.
 *
 * Worth knowing before someone lowers a number and expects the payout to drop.
 * `docs/MEMBERSHIP_POLICY.md` carries the reasoning and the sources.
 */
export interface RefundRule {
  id: string;
  /** Lowest wins when several match, so specific rules beat the catch-all. */
  priority: number;
  /** The sentence read out at the desk and printed on the quote. */
  label: string;
  min_days: number;
  /** NULL = "and everything after". */
  max_days: number | null;
  /** NULL = does not care. TRUE = only if they have visited; FALSE = only if not. */
  requires_visits: boolean | null;
  percent: number;
  is_active: boolean;
}

export async function listRefundRules(): Promise<RefundRule[]> {
  const { data, error } = await supabase
    .from('refund_rules')
    .select('*')
    .order('priority');
  if (error) throw error;
  return (data ?? []) as RefundRule[];
}

export async function updateRefundRule(
  id: string,
  updates: Partial<Pick<RefundRule, 'label' | 'percent' | 'min_days' | 'max_days' | 'requires_visits' | 'is_active'>>,
): Promise<void> {
  const { data, error } = await supabase
    .from('refund_rules')
    .update(updates)
    .eq('id', id)
    .select('id');
  if (error) throw error;
  assertWrote(data, 'That rule could not be saved — only an admin can change the refund policy.');
}

/** The documented deduction, and the reason it exists. */
export interface RefundFee {
  amount: number;
  reason: string | null;
}

export async function getRefundFee(): Promise<RefundFee> {
  const { data, error } = await supabase
    .from('gym_settings')
    .select('refund_processing_fee, refund_fee_reason')
    .maybeSingle();
  if (error) throw error;
  return {
    amount: Number(data?.refund_processing_fee ?? 0),
    reason: (data?.refund_fee_reason as string | null) ?? null,
  };
}

/**
 * Sets the deduction.
 *
 * RA 7394 allows only "reasonable and documented" deductions, so a non-zero fee
 * without a stated reason is exactly the kind of term that gets voided. The
 * screen requires the reason; this refuses it too, because the screen is not
 * the only possible caller.
 */
export async function setRefundFee(amount: number, reason: string | null): Promise<void> {
  if (amount > 0 && !reason?.trim()) {
    throw new Error('A processing fee needs a stated reason — an undocumented deduction is not enforceable.');
  }
  const { data, error } = await supabase
    .from('gym_settings')
    .update({
      refund_processing_fee: amount,
      refund_fee_reason: amount > 0 ? reason!.trim() : null,
    })
    .eq('id', true)
    .select('id');
  if (error) throw error;
  assertWrote(data, 'That fee could not be saved — only an admin can change it.');
}
