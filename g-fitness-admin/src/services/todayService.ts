import { supabase } from '../lib/supabaseClient';
import { todayKey, addDays } from '../utils/dates';
import { loadBookingQueue } from './bookingQueueService';
import { sweepStaleRequests } from '../lib/api/bookings';
import { listOpenRenewalRequests } from '../lib/api/renewalRequests';
import { listOpenMembershipRequests } from '../lib/api/membershipRequests';
import { cashDay } from '../lib/api/cash';
import { retentionRadar, type AtRisk } from '../lib/api/retention';
import { dashboardService, type ExpiringMember } from './dashboardService';

/**
 * The owner's morning (dashboard A1, 2026-10-18): what needs them, what is
 * happening today, and how this month compares with the last one.
 *
 * Every figure comes from the page that owns it, so the dashboard and that page
 * can never disagree: bookings from the Bookings queue, sign-ups from the
 * Members pending panel, online payments from Payments' renewal requests,
 * freeze/cancel asks from Members, money from cash_day_summary, risk from
 * retention_radar. A section that fails to load says so (null), never zero.
 *
 * Dates are Manila days (utils/dates), never toISOString(): the UTC date is
 * yesterday for the first eight hours of every local day.
 */

const startOf = (day: string) => `${day}T00:00:00+08:00`;

/** "2026-10-18" → "2026-10-01". */
const monthStart = (day: string) => `${day.slice(0, 8)}01`;
/** The first day of the month before `first` (a "YYYY-MM-01"). */
function previousMonthStart(first: string): string {
  const [y, m] = first.split('-').map(Number);
  const py = m === 1 ? y - 1 : y;
  const pm = m === 1 ? 12 : m - 1;
  return `${py}-${String(pm).padStart(2, '0')}-01`;
}

// ── Needs you ─────────────────────────────────────────────────────────────────

export interface NeedsYou {
  bookings: { count: number; oldestDays: number | null } | null;
  signups: { count: number; names: string[] } | null;
  payments: { count: number; total: number; methods: string[] } | null;
  requests: { count: number; freezes: number; cancels: number } | null;
  expiring: ExpiringMember[] | null;
}

const daysAgo = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));

export async function loadNeedsYou(): Promise<NeedsYou> {
  const bookings = (async () => {
    // The same sweep Bookings runs first, so a request it would expire is not counted here.
    await sweepStaleRequests();
    const { rows } = await loadBookingQueue();
    const pending = rows.filter((r) => r.status === 'pending');
    const times = pending.map((r) => r.requestedAt).filter((t): t is string => !!t);
    const oldest = times.length ? Math.max(...times.map(daysAgo)) : null;
    return { count: pending.length, oldestDays: oldest };
  })().catch(() => null);

  const signups = (async () => {
    const { data, error } = await supabase.from('pending_registrations')
      .select('first_name, last_name, created_at').order('created_at', { ascending: true }).limit(50);
    if (error) throw error;
    const rows = (data ?? []) as { first_name: string; last_name: string }[];
    return { count: rows.length, names: rows.slice(0, 2).map((r) => `${r.first_name} ${r.last_name?.[0] ?? ''}.`.trim()) };
  })().catch(() => null);

  const payments = listOpenRenewalRequests().then((rows) => {
    if (rows === null) return null;
    const paid = rows.filter((r) => r.paid);
    return {
      count: paid.length,
      total: paid.reduce((s, r) => s + (r.paid?.amount ?? 0), 0),
      methods: Array.from(new Set(paid.map((r) => r.paid?.method).filter((m): m is string => !!m))),
    };
  }).catch(() => null);

  const requests = listOpenMembershipRequests().then((rows) => (rows === null ? null : {
    count: rows.length,
    freezes: rows.filter((r) => r.kind === 'freeze').length,
    cancels: rows.filter((r) => r.kind === 'cancel').length,
  })).catch(() => null);

  const expiring = dashboardService.getExpiringSoon(7).catch(() => null);

  const [b, s, p, r, e] = await Promise.all([bookings, signups, payments, requests, expiring]);
  return { bookings: b, signups: s, payments: p, requests: r, expiring: e };
}

// ── Today ─────────────────────────────────────────────────────────────────────

export interface TodayClass {
  id: string; name: string; startsAt: string; coach: string | null; location: string | null;
  capacity: number; booked: number; done: boolean;
}

export interface Today {
  checkIns: number | null;
  walkIns: number | null;
  cash: { cashIn: number; payments: number; closed: boolean } | null;
  classes: TodayClass[] | null;
  /** Today's confirmed 1-on-1 sessions (simplify, 2026-10-28) — the card when the gym runs no classes. */
  sessions: TodaySession[] | null;
}

export interface TodaySession { id: string; startsAt: string; member: string | null; coach: string | null; done: boolean }

export async function loadToday(): Promise<Today> {
  const day = todayKey();
  const from = startOf(day);
  const to = startOf(addDays(day, 1));

  const checkIns = supabase.from('attendance').select('id', { count: 'exact', head: true })
    .gte('check_in_time', from).lt('check_in_time', to)
    .then((r) => (r.error ? null : r.count ?? 0), () => null);

  // Walk-ins (0185) are guests, never members — counted apart, voided visits left out.
  const walkIns = supabase.from('guest_visits').select('id', { count: 'exact', head: true })
    .eq('visit_day', day).is('voided_at', null)
    .then((r) => (r.error ? null : r.count ?? 0), () => null);

  const cash = cashDay(day).then((c) => (c ? { cashIn: c.cashIn, payments: c.paymentCount, closed: c.closed } : null)).catch(() => null);

  const classes = (async (): Promise<TodayClass[]> => {
    const { data, error } = await supabase.from('classes')
      .select('id, name, scheduled_at, duration_minutes, capacity, location, trainer_id')
      .gte('scheduled_at', from).lt('scheduled_at', to).order('scheduled_at');
    if (error) throw error;
    const rows = (data ?? []) as { id: string; name: string; scheduled_at: string; duration_minutes: number | null; capacity: number | null; location: string | null; trainer_id: string | null }[];
    if (!rows.length) return [];
    const trainerIds = Array.from(new Set(rows.map((r) => r.trainer_id).filter((t): t is string => !!t)));
    const [avail, people] = await Promise.all([
      supabase.from('class_availability').select('class_id, booked_count').in('class_id', rows.map((r) => r.id)),
      trainerIds.length
        ? supabase.from('gym_people').select('id, first_name, last_name').in('id', trainerIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    const booked = new Map(((avail.data ?? []) as { class_id: string; booked_count: number }[]).map((a) => [a.class_id, Number(a.booked_count) || 0]));
    const names = new Map(((people.data ?? []) as { id: string; first_name: string; last_name: string }[])
      .map((p) => [p.id, `${p.first_name} ${p.last_name}`.trim()]));
    const now = Date.now();
    return rows.map((r) => ({
      id: r.id, name: r.name, startsAt: r.scheduled_at,
      coach: r.trainer_id ? names.get(r.trainer_id) ?? null : null,
      location: r.location, capacity: r.capacity ?? 0, booked: booked.get(r.id) ?? 0,
      done: new Date(r.scheduled_at).getTime() + (r.duration_minutes ?? 60) * 60000 < now,
    }));
  })().catch(() => null);

  const sessions = (async (): Promise<TodaySession[]> => {
    const { data, error } = await supabase.from('pt_sessions')
      .select('id, starts_at, duration_minutes, member_id, trainer_id')
      .eq('status', 'approved').gte('starts_at', from).lt('starts_at', to).order('starts_at');
    if (error) throw error;
    const rows = (data ?? []) as { id: string; starts_at: string; duration_minutes: number | null; member_id: string; trainer_id: string }[];
    if (!rows.length) return [];
    const ids = Array.from(new Set(rows.flatMap((r) => [r.member_id, r.trainer_id])));
    const { data: people } = await supabase.from('gym_people').select('id, first_name, last_name').in('id', ids);
    const names = new Map(((people ?? []) as { id: string; first_name: string; last_name: string }[])
      .map((p) => [p.id, `${p.first_name} ${p.last_name}`.trim()]));
    const now = Date.now();
    return rows.map((r) => ({
      id: r.id, startsAt: r.starts_at, member: names.get(r.member_id) ?? null, coach: names.get(r.trainer_id) ?? null,
      done: new Date(r.starts_at).getTime() + (r.duration_minutes ?? 60) * 60000 < now,
    }));
  })().catch(() => null);

  const [c, w, k, cl, se] = await Promise.all([checkIns, walkIns, cash, classes, sessions]);
  return { checkIns: c, walkIns: w, cash: k, classes: cl, sessions: se };
}

// ── This month, against the last ───────────────────────────────────────────────

/** A figure and the one it is compared with. `previous` null = nothing to compare. */
export interface Compared { value: number; previous: number | null }

export interface MonthNumbers {
  revenue: Compared | null;
  activeMembers: { value: number; joinedThisMonth: number } | null;
  visits30: Compared | null;
  newMembers: Compared | null;
  monthLabel: string;
  previousLabel: string;
}

const monthName = (first: string) =>
  new Date(`${first}T12:00:00+08:00`).toLocaleDateString('en-PH', { month: 'long', timeZone: 'Asia/Manila' });

export async function loadMonthNumbers(): Promise<MonthNumbers> {
  const day = todayKey();
  const thisFirst = monthStart(day);
  const prevFirst = previousMonthStart(thisFirst);
  // The same number of days into last month, so the 18th is compared with the 18th
  // (exclusive end). A shorter last month (31 March vs February) stops at its own end.
  const dayOfMonth = Number(day.slice(8, 10));
  const prevLastDay = Number(addDays(thisFirst, -1).slice(8, 10));
  const prevSameDay = dayOfMonth >= prevLastDay ? thisFirst : addDays(prevFirst, dayOfMonth);

  const revenue = (async () => {
    const [cur, prev] = await Promise.all([
      supabase.from('payments').select('amount').eq('status', 'completed').gte('paid_on', thisFirst).lte('paid_on', day),
      supabase.from('payments').select('amount').eq('status', 'completed').gte('paid_on', prevFirst).lt('paid_on', prevSameDay),
    ]);
    if (cur.error || prev.error) throw cur.error ?? prev.error;
    const sum = (rows: { amount: number | string }[] | null) => (rows ?? []).reduce((s, r) => s + (Number(r.amount) || 0), 0);
    return { value: sum(cur.data), previous: sum(prev.data) };
  })().catch(() => null);

  const joined = (from: string, to: string) => supabase.from('gym_people').select('id', { count: 'exact', head: true })
    .eq('role', 'member').gte('created_at', startOf(from)).lt('created_at', startOf(to))
    .then((r) => { if (r.error) throw r.error; return r.count ?? 0; });

  const activeMembers = (async () => {
    const [active, joinedNow] = await Promise.all([
      supabase.from('memberships').select('id', { count: 'exact', head: true }).eq('status', 'active')
        .then((r) => { if (r.error) throw r.error; return r.count ?? 0; }),
      joined(thisFirst, addDays(day, 1)),
    ]);
    return { value: active, joinedThisMonth: joinedNow };
  })().catch(() => null);

  const visits30 = (async () => {
    const count = (from: string, to: string) => supabase.from('attendance').select('id', { count: 'exact', head: true })
      .gte('check_in_time', startOf(from)).lt('check_in_time', startOf(to))
      .then((r) => { if (r.error) throw r.error; return r.count ?? 0; });
    const end = addDays(day, 1);
    const [cur, prev] = await Promise.all([count(addDays(end, -30), end), count(addDays(end, -60), addDays(end, -30))]);
    return { value: cur, previous: prev };
  })().catch(() => null);

  const newMembers = (async () => {
    const [cur, prev] = await Promise.all([joined(thisFirst, addDays(day, 1)), joined(prevFirst, prevSameDay)]);
    return { value: cur, previous: prev };
  })().catch(() => null);

  const [r, a, v, n] = await Promise.all([revenue, activeMembers, visits30, newMembers]);
  return { revenue: r, activeMembers: a, visits30: v, newMembers: n, monthLabel: monthName(thisFirst), previousLabel: monthName(prevFirst) };
}

// ── Members to watch ───────────────────────────────────────────────────────────

/** Highest risk first. undefined = 0130 not live; null = it failed to load. */
export async function loadMembersToWatch(): Promise<AtRisk[] | null | undefined> {
  try {
    const rows = await retentionRadar();
    return rows === undefined ? undefined : [...rows].sort((a, b) => b.score - a.score);
  } catch {
    return null;
  }
}
