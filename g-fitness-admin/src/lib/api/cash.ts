import { supabase } from '../supabaseClient';

/**
 * The end-of-day cash count (migration 0095). What the drawer *should* hold is
 * computed in SQL from the day's completed cash payments minus refunds paid
 * out — never sent from here — so the difference cannot be typed away.
 */

export interface CashDay {
  day: string;
  /** What the drawer held when the day began: the last close's count, carried over (0271). */
  opening: number;
  cashIn: number;
  handedOver: number;
  paidOut: number;
  /** Closed by the system at the end of the day: nobody counted (0271). */
  auto: boolean;
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
  refunds_out: number; note: string | null; closed_at: string; previous: Record<string, unknown> | null; auto?: boolean;
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
    opening: Number(r.opening ?? 0),
    cashIn: Number(r.cash_in),
    handedOver: Number(r.handed_over ?? 0),
    paidOut: Number(r.paid_out ?? 0),
    auto: !!r.auto,
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
    .select('day, expected, counted, difference, payment_count, refunds_out, note, closed_at, previous, auto')
    .order('day', { ascending: false }).limit(limit);
  if (error) return [];
  return ((data ?? []) as Closeout[]).map((c) => ({
    ...c, expected: Number(c.expected), counted: Number(c.counted), difference: Number(c.difference), refunds_out: Number(c.refunds_out),
  }));
}

/**
 * Closes the past days nobody closed, at the expected amount, marked "nobody counted" (0271).
 * pg_cron does it at 00:05 Manila when the project has it; this is the same sweep on page load.
 * Never throws: a failed sweep leaves the days open, which the screen shows as they are.
 */
export async function autoCloseDays(): Promise<void> {
  await supabase.rpc('auto_close_cash_days');
}

export type CashOutKind = 'handed_over' | 'paid_out';
export interface CashOut {
  id: string; day: string; kind: CashOutKind; amount: number; note: string | null; created_at: string;
  takenByName: string | null; recordedByName: string | null; voided_at: string | null; void_reason: string | null;
}

const fullName = (p: { first_name: string | null; last_name: string | null } | null) =>
  p ? `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || null : null;

/** Cash taken out of the drawer, newest first: one day, or the last ones across days. Empty before 0271. */
export async function listCashOuts(day?: string, limit = 20): Promise<CashOut[]> {
  let q = supabase.from('cash_outs')
    .select('id, day, kind, amount, note, created_at, voided_at, void_reason, taken:profiles!cash_outs_taken_by_fkey(first_name, last_name), recorder:profiles!cash_outs_recorded_by_fkey(first_name, last_name)')
    .order('created_at', { ascending: false }).limit(limit);
  if (day) q = q.eq('day', day);
  const { data, error } = await q;
  if (error) return [];
  type P = { first_name: string | null; last_name: string | null } | null;
  return ((data ?? []) as unknown as (Omit<CashOut, 'takenByName' | 'recordedByName' | 'amount'> & { amount: number | string; taken: P; recorder: P })[])
    .map(({ taken, recorder, ...o }) => ({ ...o, amount: Number(o.amount), takenByName: fullName(taken), recordedByName: fullName(recorder) }));
}

export async function recordCashOut(kind: CashOutKind, amount: number, takenBy: string | null, note: string): Promise<void> {
  const { error } = await supabase.rpc('record_cash_out', { p_kind: kind, p_amount: amount, p_taken_by: takenBy, p_note: note.trim() || null });
  if (error) throw error;
}

export async function voidCashOut(id: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc('void_cash_out', { p_id: id, p_reason: reason.trim() });
  if (error) throw error;
}

/** The owner and the desk: who may take cash out of the drawer. */
export async function drawerPeople(): Promise<{ id: string; name: string; role: string }[]> {
  const { data, error } = await supabase.from('gym_people').select('id, first_name, last_name, role').in('role', ['admin', 'staff']);
  if (error) return [];
  return ((data ?? []) as { id: string; first_name: string | null; last_name: string | null; role: string }[])
    .map((p) => ({ id: p.id, name: fullName(p) ?? 'Someone', role: p.role }))
    .sort((a, b) => (a.role === b.role ? a.name.localeCompare(b.name) : a.role === 'admin' ? -1 : 1));
}
