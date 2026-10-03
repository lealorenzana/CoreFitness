import { supabase } from '../supabaseClient';

/**
 * What the Terms page needs to state the signed-in member's own gym's refund
 * and freeze rules, instead of numbers typed into the page.
 *
 * Terms used to print 100% / 50% / 25% and "60 is the guideline". Those were
 * 0070's seeds, and each gym edits its own `refund_rules`, refund fee and
 * freeze ceiling in admin Settings — so the moment a gym changed one, its Terms
 * described a rule the database was not running.
 *
 * Read with the member's own session: `refund_rules` is readable by any signed-in
 * user (0070) and both tables carry the tenancy policy (0110), so this returns
 * the current gym's rows and nothing else. Someone not signed in — a visitor from
 * the website, or a person reading Terms before registering — has no gym yet, and
 * gets `guest`, never another gym's numbers.
 */

export interface RefundRule {
  priority: number;
  /** Inclusive, in days since the membership started. */
  min_days: number;
  /** Exclusive; null = and every day after. */
  max_days: number | null;
  /** null = either way; true = only after a check-in; false = only before any. */
  requires_visits: boolean | null;
  percent: number;
}

export interface RefundTerms {
  gymName: string | null;
  rules: RefundRule[];
  fee: number;
  feeReason: string | null;
  maxFreezeDaysPerYear: number | null;
}

export type RefundTermsState =
  | { kind: 'loading' }
  | { kind: 'guest' }
  | { kind: 'failed' }
  | { kind: 'ready'; terms: RefundTerms };

export async function getRefundTerms(): Promise<RefundTermsState> {
  const { data: session } = await supabase.auth.getSession();
  if (!session.session) return { kind: 'guest' };

  const [rules, settings] = await Promise.all([
    supabase.from('refund_rules')
      .select('priority, min_days, max_days, requires_visits, percent')
      .eq('is_active', true)
      .order('priority'),
    supabase.from('gym_settings')
      .select('gym_name, refund_processing_fee, refund_fee_reason, max_freeze_days_per_year')
      .eq('id', true)
      .maybeSingle(),
  ]);
  if (rules.error || settings.error || !settings.data) return { kind: 'failed' };

  const s = settings.data as {
    gym_name: string | null; refund_processing_fee: number | string | null;
    refund_fee_reason: string | null; max_freeze_days_per_year: number | null;
  };
  return {
    kind: 'ready',
    terms: {
      gymName: s.gym_name?.trim() || null,
      // numeric arrives as a string from PostgREST.
      rules: (rules.data ?? []).map((r) => ({ ...r, percent: Number(r.percent) })) as RefundRule[],
      fee: Number(s.refund_processing_fee ?? 0),
      feeReason: s.refund_fee_reason?.trim() || null,
      maxFreezeDaysPerYear: s.max_freeze_days_per_year,
    },
  };
}

/** "Within 7 days", "Between day 8 and day 30", "After 30 days" — from the rule's own bounds. */
export function describeWindow(r: RefundRule): string {
  const visits = r.requires_visits === false ? ', and you have not checked in once'
    : r.requires_visits === true ? ', and you have checked in' : '';
  let when: string;
  if (r.max_days === null) when = r.min_days <= 0 ? 'Any time' : `After ${r.min_days} days`;
  else if (r.min_days <= 0) when = `Within ${r.max_days} days`;
  else when = `Between day ${r.min_days + 1} and day ${r.max_days}`;
  return when + visits;
}
