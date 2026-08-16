/**
 * Dashboard service — single point of truth for the admin dashboard's analytics.
 *
 * Every figure here is now derived from real Supabase rows. Where the underlying
 * entity hasn't been migrated yet (classes/bookings are still mock — see CLAUDE.md),
 * the corresponding metric returns empty/zero rather than a plausible-looking
 * invention: a fabricated number on the dashboard is worse than a visible gap,
 * because nobody can tell it's wrong.
 */
import { supabase } from '../lib/supabaseClient';

export interface RevenuePoint  { month: string; revenue: number; }
export interface MembersPoint  { month: string; members: number; newMembers: number; }
export interface AttendancePt  { day: string; count: number; }
export interface HeatmapCell   { day: string; hour: string; visits: number; }
export interface TopTrainer    { id: string; name: string; sessions: number; avgRating: number; }
export interface ProgressKpis  {
  avgBmi: number;
  avgWeightChangeKg: number;
  totalWorkouts: number;
  activeGoals: number;
  totalClasses: number;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/** Mon-first, matching how the charts read. */
const WEEK_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function yearBounds(year: string) {
  return { start: `${year}-01-01`, end: `${Number(year) + 1}-01-01` };
}

export interface DashboardSummary {
  totalMembers: number;
  activeMembers: number;
  monthlyRevenue: number;
  attendanceToday: number;
  pendingApprovals: number;
}

export interface RevenueSummary {
  totalRevenue: number;
  thisMonth: number;
  avgPerPayingMember: number;
  pendingAmount: number;
}

export interface MonthlyBreakdown {
  month: string;
  newMembers: number;
  payments: number;
  revenue: number;
}

export interface TierRevenue {
  name: string;
  value: number;
}

export type RiskLevel = 'high' | 'medium' | 'low';

export interface AtRiskMemberRow {
  id: string;
  name: string;
  daysInactive: number;
  attendanceRate: number;
  riskLevel: RiskLevel;
  planName: string;
}

export interface RetentionSummary {
  atRisk: number;
  activeMembers: number;
  retentionRate: number;
  avgVisitsPerWeek: number;
}

export interface ExpiringMember {
  id: string;
  firstName: string;
  fullName: string;
  daysLeft: number;
}

/** One row in the admin header's notification bell. */
export interface HeaderAlert {
  id: string;
  kind: 'expired' | 'expiring' | 'registration' | 'booking' | 'payment';
  title: string;
  message: string;
  time: string;
  priority: 'high' | 'medium' | 'low';
  actionUrl?: string;
}

export const dashboardService = {
  /** Active memberships expiring within `withinDays` — the retention worklist. */
  async getExpiringSoon(withinDays = 7): Promise<ExpiringMember[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const cutoff = new Date(today);
    cutoff.setDate(cutoff.getDate() + withinDays);

    // Two queries rather than a nested embed: memberships.member_id points at
    // member_profiles, not profiles, so PostgREST can't resolve `profiles(...)`
    // directly off this table. Joining in JS is unambiguous and cheap here.
    const { data: rows, error } = await supabase
      .from('memberships')
      .select('id, expiry_date, member_id')
      .eq('status', 'active')
      .not('expiry_date', 'is', null)
      .gte('expiry_date', today.toISOString().slice(0, 10))
      .lte('expiry_date', cutoff.toISOString().slice(0, 10))
      .order('expiry_date', { ascending: true });
    if (error) throw error;
    if (!rows || rows.length === 0) return [];

    const { data: people, error: peopleError } = await supabase
      .from('profiles')
      .select('id, first_name, last_name')
      .in('id', rows.map((r) => r.member_id));
    if (peopleError) throw peopleError;

    const byId = new Map((people ?? []).map((p) => [p.id, p]));

    return rows.map((m) => {
      const p = byId.get(m.member_id);
      const first = p?.first_name ?? '';
      const daysLeft = Math.ceil(
        (new Date(m.expiry_date as string).getTime() - today.getTime()) / 86400000
      );
      return {
        id: m.id,
        firstName: first || '?',
        fullName: `${first} ${p?.last_name ?? ''}`.trim() || 'Unknown member',
        daysLeft,
      };
    });
  },

  /**
   * The header bell's contents, assembled from Postgres.
   *
   * This used to be generated from `SharedStorage` — localStorage seeded with
   * MOCK_BOOKINGS/MOCK_PAYMENTS on every boot — so the bell warned about
   * members who do not exist and payments nobody took. Every item below traces
   * to a real row; when there is nothing to report the list is empty and the
   * panel says so, rather than inventing an alert.
   */
  async getHeaderAlerts(): Promise<HeaderAlert[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().slice(0, 10);
    const dayAgo = new Date(today.getTime() - 24 * 60 * 60 * 1000);

    const [expiredRes, pendingRegRes, bookingsRes, ptRes, paymentsRes, expiringSoon] =
      await Promise.all([
        // Still marked active but already past expiry — the front desk's worklist.
        supabase.from('memberships').select('id, expiry_date, member_id')
          .eq('status', 'active').not('expiry_date', 'is', null).lt('expiry_date', todayStr),
        supabase.from('pending_registrations').select('id', { count: 'exact', head: true }),
        supabase.from('bookings').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('pt_sessions').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('payments').select('amount, paid_on, status')
          .eq('status', 'completed').gte('paid_on', dayAgo.toISOString().slice(0, 10)),
        this.getExpiringSoon(7),
      ]);

    for (const r of [expiredRes, pendingRegRes, bookingsRes, ptRes, paymentsRes]) {
      if (r.error) throw r.error;
    }

    const list: HeaderAlert[] = [];

    // Names for the expired rows — memberships.member_id points at
    // member_profiles, not profiles, so this joins in JS like getExpiringSoon.
    const expired = expiredRes.data ?? [];
    if (expired.length > 0) {
      const { data: people } = await supabase.from('profiles')
        .select('id, first_name, last_name').in('id', expired.map((m) => m.member_id));
      const byId = new Map((people ?? []).map((p) => [p.id, p]));
      for (const m of expired) {
        const p = byId.get(m.member_id);
        const name = `${p?.first_name ?? ''} ${p?.last_name ?? ''}`.trim();
        const daysAgo = Math.abs(Math.ceil(
          (new Date(m.expiry_date as string).getTime() - today.getTime()) / 86400000));
        list.push({
          id: `expired-${m.id}`,
          kind: 'expired',
          title: 'Membership expired',
          // No name means the profile lookup missed — say that rather than
          // inventing an identity.
          message: name
            ? `${name}'s membership expired ${daysAgo} day${daysAgo === 1 ? '' : 's'} ago`
            : `A membership expired ${daysAgo} day${daysAgo === 1 ? '' : 's'} ago`,
          time: `${daysAgo}d`,
          priority: 'high',
          actionUrl: '/members',
        });
      }
    }

    for (const m of expiringSoon) {
      list.push({
        id: `expiring-${m.id}`,
        kind: 'expiring',
        title: 'Expiring soon',
        message: `${m.fullName} expires in ${m.daysLeft} day${m.daysLeft === 1 ? '' : 's'}`,
        time: `${m.daysLeft}d`,
        priority: 'high',
        actionUrl: '/members',
      });
    }

    const pendingReg = pendingRegRes.count ?? 0;
    if (pendingReg > 0) {
      list.push({
        id: 'pending-registrations',
        kind: 'registration',
        title: 'Registrations awaiting approval',
        message: `${pendingReg} new sign-up${pendingReg === 1 ? '' : 's'} to review`,
        time: 'Now',
        priority: 'high',
        actionUrl: '/members',
      });
    }

    const pendingBookings = (bookingsRes.count ?? 0) + (ptRes.count ?? 0);
    if (pendingBookings > 0) {
      list.push({
        id: 'pending-bookings',
        kind: 'booking',
        title: 'Booking requests',
        message: `${pendingBookings} request${pendingBookings === 1 ? '' : 's'} waiting for approval`,
        time: 'Now',
        priority: 'high',
        actionUrl: '/bookings',
      });
    }

    const recent = paymentsRes.data ?? [];
    if (recent.length > 0) {
      const total = recent.reduce((s, p) => s + (Number(p.amount) || 0), 0);
      list.push({
        id: 'recent-payments',
        kind: 'payment',
        title: 'Payments received',
        message: `${recent.length} payment${recent.length === 1 ? '' : 's'} today (₱${total.toLocaleString()})`,
        time: 'Today',
        priority: 'low',
        actionUrl: '/payments',
      });
    }

    const order = { high: 0, medium: 1, low: 2 } as const;
    return list.sort((a, b) => order[a.priority] - order[b.priority]);
  },

  /**
   * At-risk members, by threshold rules over real check-ins (NOT machine learning —
   * keep the vocabulary honest). Window is the last 30 days:
   *   high   = no visit in 21+ days
   *   medium = no visit in 14-20 days
   *   low    = no visit in 7-13 days
   * attendanceRate is visits/30d expressed against a 3-visits-per-week target.
   */
  async getAtRiskMembers(): Promise<AtRiskMemberRow[]> {
    const WINDOW_DAYS = 30;
    const since = new Date();
    since.setDate(since.getDate() - WINDOW_DAYS);

    const [membersRes, attendanceRes, membershipsRes] = await Promise.all([
      supabase.from('profiles').select('id, first_name, last_name').eq('role', 'member').eq('status', 'active'),
      supabase.from('attendance').select('member_id, check_in_time').gte('check_in_time', since.toISOString()),
      supabase.from('memberships').select('member_id, plan_id, status, created_at').eq('status', 'active'),
    ]);
    if (membersRes.error) throw membersRes.error;
    if (attendanceRes.error) throw attendanceRes.error;
    if (membershipsRes.error) throw membershipsRes.error;

    const planIds = [...new Set((membershipsRes.data ?? []).map((m) => m.plan_id))];
    let nameOfPlan = new Map<string, string>();
    if (planIds.length) {
      const { data: plans } = await supabase.from('membership_plans').select('id, name').in('id', planIds);
      nameOfPlan = new Map((plans ?? []).map((p) => [p.id, p.name]));
    }
    const planOfMember = new Map(
      (membershipsRes.data ?? []).map((m) => [m.member_id, nameOfPlan.get(m.plan_id) ?? '—'])
    );

    const visits = new Map<string, Date[]>();
    for (const a of attendanceRes.data ?? []) {
      const list = visits.get(a.member_id) ?? [];
      list.push(new Date(a.check_in_time));
      visits.set(a.member_id, list);
    }

    const now = Date.now();
    const rows: AtRiskMemberRow[] = [];
    for (const m of membersRes.data ?? []) {
      const list = visits.get(m.id) ?? [];
      const last = list.length ? Math.max(...list.map((d) => d.getTime())) : null;
      const daysInactive = last === null ? WINDOW_DAYS : Math.floor((now - last) / 86400000);

      let riskLevel: RiskLevel | null = null;
      if (daysInactive >= 21) riskLevel = 'high';
      else if (daysInactive >= 14) riskLevel = 'medium';
      else if (daysInactive >= 7) riskLevel = 'low';
      if (!riskLevel) continue;

      const targetVisits = (WINDOW_DAYS / 7) * 3;
      rows.push({
        id: m.id,
        name: `${m.first_name} ${m.last_name}`.trim(),
        daysInactive,
        attendanceRate: Math.min(100, Math.round((list.length / targetVisits) * 100)),
        riskLevel,
        planName: planOfMember.get(m.id) ?? '—',
      });
    }

    const order: Record<RiskLevel, number> = { high: 0, medium: 1, low: 2 };
    return rows.sort((a, b) => order[a.riskLevel] - order[b.riskLevel] || b.daysInactive - a.daysInactive);
  },

  /** Headline retention figures, all derived from real rows. */
  async getRetentionSummary(): Promise<RetentionSummary> {
    const since = new Date();
    since.setDate(since.getDate() - 30);

    const [activeRes, attendanceRes, atRisk] = await Promise.all([
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'member').eq('status', 'active'),
      supabase.from('attendance').select('member_id').gte('check_in_time', since.toISOString()),
      this.getAtRiskMembers(),
    ]);
    if (activeRes.error) throw activeRes.error;
    if (attendanceRes.error) throw attendanceRes.error;

    const activeMembers = activeRes.count ?? 0;
    const visitRows = attendanceRes.data ?? [];
    const distinctVisitors = new Set(visitRows.map((v) => v.member_id)).size;

    return {
      activeMembers,
      atRisk: atRisk.length,
      // Share of active members who showed up at least once in the last 30 days.
      retentionRate: activeMembers ? Math.round((distinctVisitors / activeMembers) * 100) : 0,
      avgVisitsPerWeek: activeMembers
        ? Math.round((visitRows.length / activeMembers / (30 / 7)) * 10) / 10
        : 0,
    };
  },

  /** Monthly retention rate: share of active members who checked in that month. */
  async getRetentionTrend(year: string): Promise<{ month: string; rate: number }[]> {
    const { start, end } = yearBounds(year);
    const [attendanceRes, membersRes] = await Promise.all([
      supabase.from('attendance').select('member_id, check_in_time').gte('check_in_time', start).lt('check_in_time', end),
      supabase.from('profiles').select('id, created_at').eq('role', 'member').lt('created_at', end),
    ]);
    if (attendanceRes.error) throw attendanceRes.error;
    if (membersRes.error) throw membersRes.error;

    const visitorsByMonth = new Map<number, Set<string>>();
    for (const a of attendanceRes.data ?? []) {
      const i = new Date(a.check_in_time).getMonth();
      const set = visitorsByMonth.get(i) ?? new Set<string>();
      set.add(a.member_id);
      visitorsByMonth.set(i, set);
    }

    const lastMonth = String(new Date().getFullYear()) === year ? new Date().getMonth() : 11;
    return MONTHS.slice(0, lastMonth + 1).map((month, i) => {
      const monthEnd = new Date(Number(year), i + 1, 1);
      const enrolled = (membersRes.data ?? []).filter((m) => new Date(m.created_at) < monthEnd).length;
      const visited = visitorsByMonth.get(i)?.size ?? 0;
      return { month, rate: enrolled ? Math.round((visited / enrolled) * 100) : 0 };
    });
  },

  /** Revenue KPIs for the Revenue report — all from real recorded payments. */
  async getRevenueSummary(): Promise<RevenueSummary> {
    // Revenue is grouped by paid_on — the day the cash came in — not created_at,
    // which is only when a staff member got round to keying it in (0008).
    const now = new Date();
    const startOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

    const { data, error } = await supabase.from('payments').select('amount, status, member_id, paid_on');
    if (error) throw error;

    let totalRevenue = 0;
    let thisMonth = 0;
    let pendingAmount = 0;
    const payingMembers = new Set<string>();

    for (const p of data ?? []) {
      const amount = Number(p.amount) || 0;
      if (p.status === 'completed') {
        totalRevenue += amount;
        payingMembers.add(p.member_id);
        if (p.paid_on >= startOfMonth) thisMonth += amount;
      } else if (p.status === 'pending') {
        pendingAmount += amount;
      }
    }

    return {
      totalRevenue,
      thisMonth,
      pendingAmount,
      avgPerPayingMember: payingMembers.size ? Math.round(totalRevenue / payingMembers.size) : 0,
    };
  },

  /** Per-month new members, payment count and revenue for the given year. */
  async getMonthlyBreakdown(year: string): Promise<MonthlyBreakdown[]> {
    const { start, end } = yearBounds(year);
    const [paymentsRes, membersRes] = await Promise.all([
      supabase.from('payments').select('amount, status, paid_on').gte('paid_on', start).lt('paid_on', end),
      supabase.from('profiles').select('created_at').eq('role', 'member').gte('created_at', start).lt('created_at', end),
    ]);
    if (paymentsRes.error) throw paymentsRes.error;
    if (membersRes.error) throw membersRes.error;

    const revenue = new Array(12).fill(0);
    const counts = new Array(12).fill(0);
    for (const p of paymentsRes.data ?? []) {
      if (p.status !== 'completed') continue;
      // Read the month out of the YYYY-MM-DD string directly. new Date() on a
      // bare date parses it as UTC midnight, which lands in the previous month
      // for anyone west of Greenwich on the 1st.
      const i = Number(p.paid_on.slice(5, 7)) - 1;
      revenue[i] += Number(p.amount) || 0;
      counts[i] += 1;
    }

    const newMembers = new Array(12).fill(0);
    for (const m of membersRes.data ?? []) newMembers[new Date(m.created_at).getMonth()] += 1;

    // Only months that have actually happened — a table of empty future months
    // reads as missing data rather than "hasn't happened yet".
    const lastMonth = String(new Date().getFullYear()) === year ? new Date().getMonth() : 11;
    return MONTHS.slice(0, lastMonth + 1).map((month, i) => ({
      month,
      newMembers: newMembers[i],
      payments: counts[i],
      revenue: revenue[i],
    }));
  },

  /**
   * Revenue split by plan tier. Payments link to a membership, which links to a
   * plan — resolved with follow-up lookups rather than a nested embed, since
   * payments.member_id points at member_profiles rather than profiles.
   */
  async getRevenueByTier(): Promise<TierRevenue[]> {
    const { data: payments, error } = await supabase
      .from('payments')
      .select('amount, status, membership_id')
      .eq('status', 'completed');
    if (error) throw error;
    if (!payments || payments.length === 0) return [];

    const membershipIds = [...new Set(payments.map((p) => p.membership_id).filter(Boolean))] as string[];
    if (membershipIds.length === 0) return [];

    const { data: memberships, error: mErr } = await supabase
      .from('memberships')
      .select('id, plan_id')
      .in('id', membershipIds);
    if (mErr) throw mErr;

    const planIds = [...new Set((memberships ?? []).map((m) => m.plan_id))];
    const { data: plans, error: pErr } = await supabase
      .from('membership_plans')
      .select('id, name')
      .in('id', planIds);
    if (pErr) throw pErr;

    const planOfMembership = new Map((memberships ?? []).map((m) => [m.id, m.plan_id]));
    const nameOfPlan = new Map((plans ?? []).map((p) => [p.id, p.name]));

    const totals = new Map<string, number>();
    for (const p of payments) {
      if (!p.membership_id) continue;
      const planId = planOfMembership.get(p.membership_id);
      const name = (planId && nameOfPlan.get(planId)) || 'Other';
      totals.set(name, (totals.get(name) ?? 0) + (Number(p.amount) || 0));
    }

    return [...totals.entries()].map(([name, value]) => ({ name, value }));
  },

  /** The KPI row. All five figures are real counts, not estimates. */
  async getSummary(): Promise<DashboardSummary> {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const [membersRes, activeRes, pendingRes, paymentsRes, attendanceRes] = await Promise.all([
      supabase.from('profiles').select('id', { count: 'exact', head: true })
        .eq('role', 'member').neq('status', 'archived'),
      supabase.from('memberships').select('id', { count: 'exact', head: true }).eq('status', 'active'),
      supabase.from('pending_registrations').select('id', { count: 'exact', head: true }),
      supabase.from('payments').select('amount, status')
        .gte('paid_on', `${startOfMonth.getFullYear()}-${String(startOfMonth.getMonth() + 1).padStart(2, '0')}-01`),
      supabase.from('attendance').select('id', { count: 'exact', head: true })
        .gte('check_in_time', startOfToday.toISOString()),
    ]);

    for (const r of [membersRes, activeRes, pendingRes, paymentsRes, attendanceRes]) {
      if (r.error) throw r.error;
    }

    const monthlyRevenue = (paymentsRes.data ?? [])
      .filter((p) => p.status === 'completed')
      .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

    return {
      totalMembers: membersRes.count ?? 0,
      activeMembers: activeRes.count ?? 0,
      monthlyRevenue,
      attendanceToday: attendanceRes.count ?? 0,
      pendingApprovals: pendingRes.count ?? 0,
    };
  },

  /** Completed payments, summed per month. Cash-only gym, so this is real income. */
  async getRevenueByYear(year: string): Promise<RevenuePoint[]> {
    const { start, end } = yearBounds(year);
    const { data, error } = await supabase
      .from('payments')
      .select('amount, paid_on, status')
      .gte('paid_on', start)
      .lt('paid_on', end);
    if (error) throw error;

    const totals = new Array(12).fill(0);
    for (const p of data ?? []) {
      if (p.status !== 'completed') continue;
      totals[Number(p.paid_on.slice(5, 7)) - 1] += Number(p.amount) || 0;
    }
    return MONTHS.map((month, i) => ({ month, revenue: totals[i] }));
  },

  /** New member signups per month, plus the running cumulative total. */
  async getNewMembersByYear(year: string): Promise<MembersPoint[]> {
    const { start, end } = yearBounds(year);
    const { data, error } = await supabase
      .from('profiles')
      .select('created_at, role')
      .eq('role', 'member')
      .lt('created_at', end);
    if (error) throw error;

    const perMonth = new Array(12).fill(0);
    let carriedIn = 0; // members who joined before this year
    for (const p of data ?? []) {
      const d = new Date(p.created_at);
      if (p.created_at < start) carriedIn += 1;
      else perMonth[d.getMonth()] += 1;
    }

    let running = carriedIn;
    return MONTHS.map((month, i) => {
      running += perMonth[i];
      return { month, members: running, newMembers: perMonth[i] };
    });
  },

  /** Real check-ins: by weekday for the last 7 days, or by month across the year. */
  async getAttendance(scope: 'weekly' | 'monthly'): Promise<AttendancePt[]> {
    if (scope === 'weekly') {
      const since = new Date();
      since.setDate(since.getDate() - 6);
      since.setHours(0, 0, 0, 0);
      const { data, error } = await supabase
        .from('attendance')
        .select('check_in_time')
        .gte('check_in_time', since.toISOString());
      if (error) throw error;

      const counts = new Map<string, number>(WEEK_ORDER.map((d) => [d, 0]));
      for (const a of data ?? []) {
        const day = DAYS[new Date(a.check_in_time).getDay()];
        counts.set(day, (counts.get(day) ?? 0) + 1);
      }
      return WEEK_ORDER.map((day) => ({ day, count: counts.get(day) ?? 0 }));
    }

    const year = new Date().getFullYear();
    const { start, end } = yearBounds(String(year));
    const { data, error } = await supabase
      .from('attendance')
      .select('check_in_time')
      .gte('check_in_time', start)
      .lt('check_in_time', end);
    if (error) throw error;

    const perMonth = new Array(12).fill(0);
    for (const a of data ?? []) perMonth[new Date(a.check_in_time).getMonth()] += 1;
    return MONTHS.map((day, i) => ({ day, count: perMonth[i] }));
  },

  /** Busiest hours, from real check-in timestamps over the last 30 days. */
  async getAttendanceHeatmap(): Promise<HeatmapCell[]> {
    const since = new Date();
    since.setDate(since.getDate() - 30);
    const { data, error } = await supabase
      .from('attendance')
      .select('check_in_time')
      .gte('check_in_time', since.toISOString());
    if (error) throw error;
    if (!data || data.length === 0) return [];

    const hours = ['6am', '9am', '12pm', '3pm', '6pm', '9pm'];
    const bucketOf = (h: number) => {
      if (h < 8) return '6am';
      if (h < 11) return '9am';
      if (h < 14) return '12pm';
      if (h < 17) return '3pm';
      if (h < 20) return '6pm';
      return '9pm';
    };

    const counts = new Map<string, number>();
    for (const a of data) {
      const d = new Date(a.check_in_time);
      counts.set(`${DAYS[d.getDay()]}|${bucketOf(d.getHours())}`, (counts.get(`${DAYS[d.getDay()]}|${bucketOf(d.getHours())}`) ?? 0) + 1);
    }

    return WEEK_ORDER.flatMap((day) =>
      hours.map((hour) => ({ day, hour, visits: counts.get(`${day}|${hour}`) ?? 0 }))
    );
  },

  /**
   * Trainers ranked by sessions delivered. Sessions come from bookings/classes,
   * which are still mock (see CLAUDE.md), so sessions/rating stay at 0 until that
   * migration lands — the trainer names themselves are real.
   */
  async getTopTrainers(): Promise<TopTrainer[]> {
    const { data, error } = await supabase
      .from('trainer_profiles')
      .select('profile_id, profiles!inner(first_name, last_name, status)');
    if (error) throw error;

    return (data ?? [])
      .filter((t) => (t.profiles as { status?: string })?.status === 'active')
      .map((t) => {
        const p = t.profiles as unknown as { first_name: string; last_name: string };
        return {
          id: t.profile_id,
          name: `${p.first_name} ${p.last_name}`.trim(),
          sessions: 0,
          avgRating: 0,
        };
      });
  },

  /**
   * Body-composition and workout KPIs have no backing tables yet (progress
   * tracking was never migrated), so those stay 0. `totalClasses` is real.
   */
  async getProgressKpis(): Promise<ProgressKpis> {
    const { count, error } = await supabase
      .from('classes')
      .select('id', { count: 'exact', head: true });
    if (error) throw error;
    return {
      avgBmi: 0,
      avgWeightChangeKg: 0,
      totalWorkouts: 0,
      activeGoals: 0,
      totalClasses: count ?? 0,
    };
  },

  /** Years offered in the chart filters: this year and the two before it. */
  getYears(): string[] {
    const y = new Date().getFullYear();
    return [String(y), String(y - 1), String(y - 2)];
  },
};
