import { supabase } from '../supabaseClient';

/**
 * The end-of-day cash count (migration 0095). What the drawer *should* hold is
 * computed in SQL from the day's completed cash payments minus refunds paid
 * out — never sent from here — so the difference cannot be typed away.
 */

export interface CashDay {
  day: string;
  cashIn: number;
  refundsOut: number;
  expected: number;
  paymentCount: number;
  closed: boolean;
  counted: number | null;
  difference: number | null;
  note: string | null;
  closedByName: string | null;
  closedAt: string | null;
}

export interface Closeout {
  day: string; expected: number; counted: number; difference: number; payment_count: number;
  refunds_out: number; note: string | null; closed_at: string; previous: Record<string, unknown> | null;
}

const missingFn = (e: { code?: string } | null) => e?.code === 'PGRST202' || e?.code === '42883' || e?.code === '42P01';

/** Null before 0095 is pasted. */
export async function cashDay(day: string): Promise<CashDay | null> {
  const { data, error } = await supabase.rpc('cash_day_summary', { p_day: day });
  if (missingFn(error)) return null;
  if (error) throw error;
  const r = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined;
  // The function always answers with one row; none means something between
  // here and the database went wrong — say so rather than crash on r.day.
  if (!r) throw new Error('The cash summary came back empty. Try again in a moment.');
  const num = (v: unknown) => (v == null ? null : Number(v));
  return {
    day: r.day as string,
    cashIn: Number(r.cash_in),
    refundsOut: Number(r.refunds_out),
    expected: Number(r.expected),
    paymentCount: Number(r.payment_count),
    closed: !!r.closed,
    counted: num(r.counted),
    difference: num(r.difference),
    note: (r.note as string | null) ?? null,
    closedByName: (r.closed_by_name as string | null) ?? null,
    closedAt: (r.closed_at as string | null) ?? null,
  };
}

export async function closeCashDay(day: string, counted: number, note: string): Promise<void> {
  const { error } = await supabase.rpc('close_cash_day', { p_day: day, p_counted: counted, p_note: note.trim() || null });
  if (error) throw error;
}

export async function recentCloseouts(limit = 14): Promise<Closeout[]> {
  const { data, error } = await supabase.from('cash_closeouts')
    .select('day, expected, counted, difference, payment_count, refunds_out, note, closed_at, previous')
    .order('day', { ascending: false }).limit(limit);
  if (error) return [];
  return ((data ?? []) as Closeout[]).map((c) => ({
    ...c, expected: Number(c.expected), counted: Number(c.counted), difference: Number(c.difference), refunds_out: Number(c.refunds_out),
  }));
}
