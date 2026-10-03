import { supabase } from '../supabaseClient';

/**
 * The AI coach, from the gym's side (0147): its two limits and this Manila
 * month's TOTALS. Never a member's name, never a per-member count, never a
 * word anyone wrote to it — the SQL returns none of those, and nothing here
 * asks for them.
 *
 * The owner changes the limits (`set_ai_coach_limits`, refused for the desk
 * in a plain sentence); the owner and the desk both read the totals.
 */

export interface AiUsage {
  daily_limit: number;
  monthly_limit: number;
  month_start: string;
  messages_month: number;
  tokens_in_month: number;
  tokens_out_month: number;
  messages_today: number;
  /** How many members used it this month — a count, never who. */
  members_using_month: number;
  /** Tokens at the coach model's list price. An estimate, in US dollars. */
  est_cost_usd_month: number;
  days: { day: string; messages: number }[];
}

/**
 * `missing` means 0147 has not been pasted yet; `error` is any other refusal,
 * worded by the database. Neither is ever rendered as "no usage".
 */
export type AiUsageResult =
  | { ok: true; usage: AiUsage }
  | { ok: false; missing: true }
  | { ok: false; missing: false; error: string };

const isMissing = (e: { code?: string; message?: string }) =>
  e.code === 'PGRST202' || e.code === '42883'
  || /could not find the function|does not exist/i.test(e.message ?? '');

export async function getAiUsage(): Promise<AiUsageResult> {
  const { data, error } = await supabase.rpc('gym_ai_usage');
  if (error) {
    return isMissing(error) ? { ok: false, missing: true } : { ok: false, missing: false, error: error.message };
  }
  const d = (data ?? {}) as Record<string, unknown>;
  // bigint and numeric arrive as strings or numbers depending on size; the
  // screen does arithmetic, so they are numbers from here on.
  const n = (k: string) => Number(d[k] ?? 0) || 0;
  return {
    ok: true,
    usage: {
      daily_limit: n('daily_limit'),
      monthly_limit: n('monthly_limit'),
      month_start: String(d.month_start ?? ''),
      messages_month: n('messages_month'),
      tokens_in_month: n('tokens_in_month'),
      tokens_out_month: n('tokens_out_month'),
      messages_today: n('messages_today'),
      members_using_month: n('members_using_month'),
      est_cost_usd_month: n('est_cost_usd_month'),
      days: Array.isArray(d.days)
        ? (d.days as { day: string; messages: number | string }[])
            .map((x) => ({ day: String(x.day), messages: Number(x.messages) || 0 }))
        : [],
    },
  };
}

/** The owner only; the database refuses anyone else in a sentence, which is thrown as-is. */
export async function setAiLimits(daily: number, monthly: number): Promise<void> {
  const { error } = await supabase.rpc('set_ai_coach_limits', { p_daily: daily, p_monthly: monthly });
  if (error) throw new Error(error.message);
}

/** `$1,234.56`, or `<$0.01` for a real but sub-cent figure. Zero is `$0.00`. */
export function formatUsd(v: number): string {
  if (v > 0 && v < 0.01) return '<$0.01';
  return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
