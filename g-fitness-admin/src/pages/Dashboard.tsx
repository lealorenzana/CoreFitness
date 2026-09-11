import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  Users, Banknote, Activity, CalendarDays, ArrowUpRight, ChevronRight,
  ChevronDown,
} from 'lucide-react';

import DetailSheet from '../components/ui/DetailSheet';
import { loadBookingQueue } from '../services/bookingQueueService';
import { sweepStaleRequests } from '../lib/api/bookings';
import { formatCurrency } from '../utils/formatters';
import {
  dashboardService,
  type RevenuePoint, type MembersPoint, type AttendancePt,
  type HeatmapCell, type TopTrainer,
  type DashboardSummary, type ExpiringMember,
} from '../services/dashboardService';

const VIOLET     = '#7C3AED';
const YELLOW     = '#F59E0B';
const TEXT_MUTED = 'var(--color-text-muted)';
const BORDER     = 'var(--color-border)';
const SURFACE    = 'var(--color-surface)';

// ── Filter pill ─────────────────────────────────────────────────────────────
function FilterSelect({ value, options, onChange }: {
  value: string; options: string[]; onChange: (v: string) => void;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none pl-3 pr-7 py-1.5 rounded-full text-xs font-medium cursor-pointer"
        style={{
          background: 'var(--color-surface-raised)',
          border: `1px solid ${BORDER}`,
          color: 'var(--color-text-secondary)',
        }}
      >
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
      <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: TEXT_MUTED }} />
    </div>
  );
}


// ── Top trainers ────────────────────────────────────────────────────────────
const TOP_TRAINERS_SHOWN = 6;

/** "4.6 ★ (12) · 23 sessions". A coach nobody has rated reads "No evaluations",
 *  never "0.0 ★" — a missing score is not a bad one. */
function trainerLine(t: TopTrainer): string {
  const rating = t.avgRating == null ? 'No evaluations' : `${t.avgRating.toFixed(1)} ★ (${t.evaluations})`;
  return `${rating} · ${t.sessions} session${t.sessions === 1 ? '' : 's'}`;
}

// ── Activity Heatmap ────────────────────────────────────────────────────────
/** Quiet violet to busy amber. Shared by the tile and the full panel so the two
 *  can never shade the same count differently. */
function heatColor(v: number, max: number) {
  if (v === 0) return 'var(--color-surface-raised)';
  const pct = v / Math.max(1, max);
  if (pct < 0.25) return 'rgba(124,58,237,0.25)';
  if (pct < 0.5)  return 'rgba(124,58,237,0.50)';
  if (pct < 0.75) return 'rgba(245,158,11,0.45)';
  return 'rgba(245,158,11,0.75)';
}

/**
 * The heatmap as a dashboard tile: every cell visible without a click.
 *
 * It lived only behind the "Busiest hour" tile, in a panel nobody opened, so
 * the one chart that answers "when is the gym full?" was effectively missing.
 * Rows and columns are fractions of the tile, so it fills whatever height the
 * bento gives it rather than sitting at a fixed size in the corner.
 */
function HeatmapTileGrid({ cells }: { cells: HeatmapCell[] }) {
  const max  = Math.max(0, ...cells.map((c) => c.visits));
  const days = Array.from(new Set(cells.map((c) => c.day)));
  const hrs  = Array.from(new Set(cells.map((c) => c.hour)));
  const visitOf = (d: string, h: string) => cells.find((c) => c.day === d && c.hour === h)?.visits ?? 0;
  return (
    <div className="h-full grid gap-[3px]"
      style={{
        gridTemplateColumns: `28px repeat(${hrs.length}, minmax(0, 1fr))`,
        gridTemplateRows: `auto repeat(${days.length}, minmax(0, 1fr))`,
      }}>
      <div />
      {hrs.map((h) => (
        <div key={h} className="text-[9px] text-center pb-0.5" style={{ color: TEXT_MUTED }}>{h}</div>
      ))}
      {days.map((d) => (
        <div key={d} className="contents">
          <div className="text-[9px] flex items-center" style={{ color: TEXT_MUTED }}>{d}</div>
          {hrs.map((h) => {
            const v = visitOf(d, h);
            return (
              <div key={`${d}-${h}`}
                className="rounded-sm flex items-center justify-center text-[10px] font-bold text-white min-h-0"
                style={{ background: heatColor(v, max) }}
                data-tip={`${d} around ${h}: ${v} check-in${v === 1 ? '' : 's'} in the last 30 days`}>
                {v > 0 ? v : ''}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function HeatmapGrid({ cells }: { cells: HeatmapCell[] }) {
  if (cells.length === 0) return null;
  const max  = Math.max(...cells.map((c) => c.visits));
  const days = Array.from(new Set(cells.map((c) => c.day)));
  const hrs  = Array.from(new Set(cells.map((c) => c.hour)));
  const visitOf = (d: string, h: string) => cells.find((c) => c.day === d && c.hour === h)?.visits ?? 0;
  const colorFor = (v: number) => heatColor(v, max);

  return (
    <div>
      <div className="grid gap-[3px]"
        style={{ gridTemplateColumns: `32px repeat(${hrs.length}, 1fr)` }}>
        <div />
        {hrs.map((h) => (
          <div key={h} className="text-[8px] text-center truncate" style={{ color: TEXT_MUTED }}>{h}</div>
        ))}
        {days.map((d) => (
          <div key={d} className="contents">
            <div className="text-[8px] flex items-center" style={{ color: TEXT_MUTED }}>{d}</div>
            {hrs.map((h) => {
              const v = visitOf(d, h);
              return (
                <div
                  key={`${d}-${h}`}
                  className="h-7 rounded-sm flex items-center justify-center text-[9px] font-bold text-white"
                  style={{ background: colorFor(v) }}
                  data-tip={`${d} ${h}: ${v} visits`}
                >
                  {v > 0 ? v : ''}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-1.5 mt-2 text-[8px]" style={{ color: TEXT_MUTED }}>
        Less
        <div className="w-3 h-3 rounded-sm" style={{ background: 'var(--color-surface-raised)' }} />
        <div className="w-3 h-3 rounded-sm" style={{ background: 'rgba(124,58,237,0.25)' }} />
        <div className="w-3 h-3 rounded-sm" style={{ background: 'rgba(124,58,237,0.50)' }} />
        <div className="w-3 h-3 rounded-sm" style={{ background: 'rgba(245,158,11,0.45)' }} />
        <div className="w-3 h-3 rounded-sm" style={{ background: 'rgba(245,158,11,0.75)' }} />
        More
      </div>
    </div>
  );
}

// ── Main Dashboard ──────────────────────────────────────────────────────────
export default function Dashboard() {
  const navigate = useNavigate();

  const years = dashboardService.getYears();
  const [revenueYear, setRevenueYear] = useState(years[0]);
  const [memberYear,  setMemberYear]  = useState(years[0]);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [expiringSoon, setExpiringSoon] = useState<ExpiringMember[]>([]);
  const [attendanceScope, setAttendanceScope] = useState<'weekly' | 'monthly'>('weekly');
  /**
   * Two different queues, counted apart.
   *
   * There was one "N awaiting approval" button. Its number came from
   * `pending_registrations` — member sign-ups — but it said "class and
   * personal-training requests" and opened Bookings, where there was nothing
   * to approve. Each count now comes from the same place as the page it opens,
   * so the two can never disagree:
   *  - sign-ups: `pending_registrations`, the Members page's pending panel;
   *  - requests: `loadBookingQueue()`, the exact rows the Bookings page shows.
   */
  const [pendingSignups, setPendingSignups] = useState(0);
  const [pendingRequests, setPendingRequests] = useState(0);

  const [revenueData,    setRevenueData]    = useState<RevenuePoint[]>([]);
  const [memberData,     setMemberData]     = useState<MembersPoint[]>([]);
  const [attendanceData, setAttendanceData] = useState<AttendancePt[]>([]);
  const [heatmap,        setHeatmap]        = useState<HeatmapCell[]>([]);
  /** Loading, loaded or failed — an empty heatmap means "nobody checked in",
   *  and must not also mean "still loading" or "the query failed". */
  const [heatmapState,   setHeatmapState]   = useState<'loading' | 'ready' | 'failed'>('loading');
  const [topTrainers,    setTopTrainers]    = useState<TopTrainer[]>([]);
  const [trainersFailed, setTrainersFailed] = useState(false);

  useEffect(() => {
    dashboardService
      .getSummary()
      .then((s) => {
        setSummary(s);
        setPendingSignups(s.pendingApprovals);
      })
      .catch(() => {});
    dashboardService.getExpiringSoon().then(setExpiringSoon).catch(() => {});
    // The same sweep the Bookings page runs first (0071), so a request it would
    // expire on opening is not counted here as still waiting. Never throws.
    (async () => {
      await sweepStaleRequests();
      const { rows } = await loadBookingQueue();
      setPendingRequests(rows.filter((r) => r.status === 'pending').length);
    })().catch(() => {});
  }, []);

  useEffect(() => { dashboardService.getRevenueByYear(revenueYear).then(setRevenueData); }, [revenueYear]);
  useEffect(() => { dashboardService.getNewMembersByYear(memberYear).then(setMemberData); }, [memberYear]);
  useEffect(() => { dashboardService.getAttendance(attendanceScope).then(setAttendanceData); }, [attendanceScope]);
  useEffect(() => {
    dashboardService.getAttendanceHeatmap()
      .then((cells) => { setHeatmap(cells); setHeatmapState('ready'); })
      .catch(() => setHeatmapState('failed'));
    dashboardService.getTopTrainers().then(setTopTrainers).catch(() => setTrainersFailed(true));
    // The "Member statistics" tile that used getProgressKpis() is gone: every
    // figure it drew (BMI, weight change, workouts, goals) was a hardcoded 0,
    // shown as if measured. The heatmap took its place.
  }, []);

  // Real KPIs — no invented deltas. A "+12%" badge next to a real number is worse
  // than no badge, because it looks authoritative while being made up.
  const kpis: {
    label: string; value: string | number; icon: typeof Users; tooltip: string; to?: string;
  }[] = [
    { label: 'Total members',      value: summary ? summary.totalMembers : '—',                    icon: Users,        tooltip: 'Registered members, excluding archived accounts',                to: '/members' },
    { label: 'Revenue this month', value: summary ? formatCurrency(summary.monthlyRevenue) : '—',  icon: Banknote,     tooltip: 'Sum of completed payments recorded since the 1st of this month', to: '/payments' },
    { label: 'Active memberships', value: summary ? summary.activeMembers : '—',                   icon: CalendarDays, tooltip: 'Memberships currently in active status (paid and not expired)',  to: '/members' },
    { label: 'Attendance today',   value: summary ? summary.attendanceToday : '—',                 icon: Activity,     tooltip: 'Members checked in today via QR or manual entry',                to: '/attendance' },
  ];

  /**
   * Which secondary panel is open.
   *
   * The dashboard used to be roughly two screens tall: a 145px welcome banner
   * that said "Welcome to Core Fitness", four KPI cards, four full charts and a
   * heatmap, stacked. Everything below the fold — attendance, the 12-month
   * trend, the heatmap — was invisible until you scrolled, which on the one
   * screen meant to answer "how is the gym doing" is the wrong way round.
   *
   * Now: the page is exactly one viewport tall and never scrolls. Revenue keeps
   * the big chart because it is the question asked most often; the rest become
   * small cards showing their headline figure, and clicking one opens the full
   * chart in a panel over the page. Nothing was removed.
   */
  const [panel, setPanel] = useState<
    null | 'members' | 'attendance' | 'trend' | 'heatmap' | 'trainers' | 'expiring'
  >(null);

  const totalNewMembers = memberData.reduce((sum, m) => sum + m.newMembers, 0);
  const totalAttendance = attendanceData.reduce((sum, a) => sum + a.count, 0);
  const yearRevenue = revenueData.reduce((sum, r) => sum + r.revenue, 0);
  const busiestCell = heatmap.reduce<HeatmapCell | null>(
    (best, c) => (best === null || c.visits > best.visits ? c : best), null);

  /** Visits per weekday, the hour axis collapsed — the other cut of the same
   *  30 days, for the small tile under the heatmap. Order comes from the data:
   *  `getAttendanceHeatmap` decides the days and this must not disagree. */
  const dayTotals = (() => {
    const order: string[] = [];
    const sums = new Map<string, number>();
    for (const c of heatmap) {
      if (!sums.has(c.day)) { order.push(c.day); sums.set(c.day, 0); }
      sums.set(c.day, (sums.get(c.day) ?? 0) + c.visits);
    }
    return order.map((d) => ({ day: d, visits: sums.get(d) ?? 0 }));
  })();
  const peakDay = dayTotals.reduce<{ day: string; visits: number } | null>(
    (best, d) => (best === null || d.visits > best.visits ? d : best), null);
  const heatmapVisits = dayTotals.reduce((s, d) => s + d.visits, 0);

  /** Bars or a line — the same twelve months either way. */
  const [chartMode, setChartMode] = useState<'bars' | 'trend'>('bars');

  const PANEL_TITLE: Record<string, string> = {
    members: 'New members', attendance: 'Attendance',
    trend: '12-month revenue trend', heatmap: 'Member activity heatmap',
    trainers: 'Top trainers', expiring: 'Expiring soon',
  };

  return (
    <div className="h-full flex flex-col gap-3 overflow-hidden">
      {/* ── HEADER ──────────────────────────────────────────────────────────
          One line. The purple banner this replaced was 145px tall and carried
          a greeting, a date and two buttons; only two of those were facts. */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between gap-4 flex-shrink-0">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-white">Dashboard</h1>
          <p className="text-[11px]" style={{ color: TEXT_MUTED }}>
            {new Date().toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {pendingSignups > 0 && (
            <button
              onClick={() => navigate('/members?pending=1')}
              data-tip="New members who registered in the app and are waiting to be approved"
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg font-semibold text-[11px]"
              style={{ background: 'var(--color-secondary-light)', color: YELLOW }}
            >
              {pendingSignups} sign-up{pendingSignups === 1 ? '' : 's'} to approve <ChevronRight size={12} />
            </button>
          )}
          {pendingRequests > 0 && (
            <button
              onClick={() => navigate('/bookings')}
              data-tip="Class and personal-training requests waiting for a decision"
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg font-semibold text-[11px]"
              style={{ background: 'var(--color-secondary-light)', color: YELLOW }}
            >
              {pendingRequests} booking{pendingRequests === 1 ? '' : 's'} to decide <ChevronRight size={12} />
            </button>
          )}
          <button
            onClick={() => navigate('/revenue')}
            data-tip="Full revenue reports, by month and by plan"
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg font-semibold text-[11px] text-black"
            style={{ background: YELLOW }}
          >
            Reports <ArrowUpRight size={12} />
          </button>
        </div>
      </motion.div>

      {/* ── THE BENTO ───────────────────────────────────────────────────────
          Twelve columns, six rows, filling exactly the height left over. Every
          tile is a real card with real content; the sizes differ because the
          things differ, which is the whole point of the arrangement.

          It replaced a layout with one 500px chart in the middle and a rail of
          small cards down the side — that shape says "one of these matters and
          the rest are footnotes", which is not true of a gym's morning.

          The row track is `76px` then five equal rows: the KPI strip is a fixed
          height because a number needs 76px whatever the screen, while the
          tiles below share whatever is left. `minmax(0, 1fr)` on both axes, not
          `1fr` — a bare `1fr` floors at the content's min size, so one long
          trainer name would push a tile past the viewport and put back the
          scrollbar this layout exists to avoid. */}
      <div
        className="flex-1 min-h-0 grid gap-3"
        style={{
          gridTemplateColumns: 'repeat(12, minmax(0, 1fr))',
          gridTemplateRows: '76px repeat(5, minmax(0, 1fr))',
        }}
      >
        {/* Row 1 — the four figures, three columns each. */}
        {kpis.map((k, i) => (
          <Tile key={k.label} col={`${i * 3 + 1} / ${i * 3 + 4}`} row="1 / 2"
            onClick={k.to ? () => navigate(k.to as string) : undefined}
            tip={k.tooltip}>
            <div className="h-full flex items-center gap-2.5">
              <span className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: 'var(--color-primary-light)' }}>
                <k.icon size={16} style={{ color: VIOLET }} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-lg font-bold text-white tabular-nums leading-tight truncate">
                  {k.value}
                </span>
                <span className="block text-[10px] truncate" style={{ color: TEXT_MUTED }}>{k.label}</span>
              </span>
              <ChevronRight size={13} className="flex-shrink-0" style={{ color: TEXT_MUTED }} />
            </div>
          </Tile>
        ))}

        {/* Rows 2–4, left half — revenue, the one figure asked for daily.
            The bar/line switch is where the old "12-Month Revenue Trend" panel
            went: it plotted `revenueData`, the identical series this tile
            already draws. Two charts of one array is not two facts. */}
        <Tile col="1 / 7" row="2 / 5">
          <div className="h-full flex flex-col">
            <div className="flex items-start justify-between gap-2 mb-2 flex-shrink-0">
              <div className="min-w-0">
                <h3 className="text-xs font-semibold text-white">Revenue</h3>
                <p className="text-[10px] mt-0.5" style={{ color: TEXT_MUTED }}>
                  {formatCurrency(yearRevenue)} across {revenueYear}
                </p>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <div className="flex p-0.5 rounded-lg" style={{ background: 'var(--color-surface-high)' }}>
                  {(['bars', 'trend'] as const).map((m) => (
                    <button key={m} onClick={() => setChartMode(m)}
                      data-tip={m === 'bars' ? 'Each month as a bar' : 'The same months as a line'}
                      className="px-2 h-6 rounded-md text-[10px] font-semibold capitalize"
                      style={{
                        background: chartMode === m ? VIOLET : 'transparent',
                        color: chartMode === m ? '#fff' : 'var(--color-text-secondary)',
                      }}>
                      {m}
                    </button>
                  ))}
                </div>
                <FilterSelect value={revenueYear} options={years} onChange={setRevenueYear} />
              </div>
            </div>
            <div className="flex-1 min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                {chartMode === 'bars' ? (
                  <BarChart data={revenueData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={BORDER as string} vertical={false} />
                    <XAxis dataKey="month" stroke={TEXT_MUTED as string} tick={{ fill: '#9CA3AF', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis stroke={TEXT_MUTED as string} tick={{ fill: '#9CA3AF', fontSize: 10 }} axisLine={false} tickLine={false} width={44} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#1E1B30', border: `1px solid ${BORDER}`, borderRadius: 12, color: '#fff', fontSize: 12 }}
                      cursor={{ fill: 'rgba(124,58,237,0.08)' }}
                    />
                    <Bar dataKey="revenue" fill={VIOLET} radius={[8, 8, 0, 0]} maxBarSize={38} />
                  </BarChart>
                ) : (
                  <LineChart data={revenueData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={BORDER as string} vertical={false} />
                    <XAxis dataKey="month" stroke={TEXT_MUTED as string} tick={{ fill: '#9CA3AF', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis stroke={TEXT_MUTED as string} tick={{ fill: '#9CA3AF', fontSize: 10 }} axisLine={false} tickLine={false} width={44} />
                    <Tooltip contentStyle={{ backgroundColor: '#1E1B30', border: `1px solid ${BORDER}`, borderRadius: 12, color: '#fff', fontSize: 12 }} />
                    <Line type="monotone" dataKey="revenue" stroke={YELLOW} strokeWidth={2.5} dot={{ fill: YELLOW, r: 3 }} activeDot={{ r: 6 }} />
                  </LineChart>
                )}
              </ResponsiveContainer>
            </div>
          </div>
        </Tile>

        {/* Rows 2–4, middle — when the members actually come in. This tile was
            "Member statistics": four rings that always read 0, because the
            service returned hardcoded zeros. The heatmap it replaces lived only
            behind a click, so this is the chart promoted rather than a new one. */}
        <Tile col="7 / 10" row="2 / 5" onClick={() => setPanel('heatmap')}
          tip="Check-ins by day and time over the last 30 days — click for the full view">
          <div className="h-full flex flex-col">
            <div className="flex items-start justify-between gap-2 mb-2 flex-shrink-0">
              <div className="min-w-0">
                <h3 className="text-xs font-semibold text-white">Member activity</h3>
                <p className="text-[10px] mt-0.5 truncate" style={{ color: TEXT_MUTED }}>
                  {heatmapState === 'ready' && heatmapVisits > 0 && busiestCell
                    ? `${heatmapVisits} check-ins, last 30 days · busiest ${busiestCell.day} ${busiestCell.hour}`
                    : 'Check-ins by day and time, last 30 days'}
                </p>
              </div>
              <ChevronRight size={13} className="flex-shrink-0" style={{ color: TEXT_MUTED }} />
            </div>
            <div className="flex-1 min-h-0">
              {heatmapState === 'loading' ? (
                <p className="text-[11px]" style={{ color: TEXT_MUTED }}>Loading…</p>
              ) : heatmapState === 'failed' ? (
                <p className="text-[11px]" style={{ color: TEXT_MUTED }}>
                  Couldn&apos;t load check-ins. This is a connection problem, not an empty gym.
                </p>
              ) : heatmap.length === 0 ? (
                <p className="text-[11px]" style={{ color: TEXT_MUTED }}>
                  No check-ins in the last 30 days.
                </p>
              ) : (
                <HeatmapTileGrid cells={heatmap} />
              )}
            </div>
          </div>
        </Tile>

        {/* Rows 2–4, right — who is coaching, and how members rate them. */}
        <Tile col="10 / 13" row="2 / 5" onClick={() => setPanel('trainers')}
          tip="Coaches ranked by sessions run in the last 90 days, then by member rating">
          <div className="h-full flex flex-col">
            <div className="flex items-center justify-between gap-2 mb-2 flex-shrink-0">
              <div className="min-w-0">
                <h3 className="text-xs font-semibold text-white">Top trainers</h3>
                <p className="text-[10px] mt-0.5" style={{ color: TEXT_MUTED }}>Sessions run, last 90 days</p>
              </div>
              <span className="text-[10px] font-semibold flex items-center gap-0.5" style={{ color: YELLOW }}>
                {topTrainers.length > TOP_TRAINERS_SHOWN ? `All ${topTrainers.length}` : 'Open'} <ChevronRight size={10} />
              </span>
            </div>
            {trainersFailed ? (
              <p className="text-[11px]" style={{ color: TEXT_MUTED }}>
                Couldn&apos;t load the ranking. This is a connection problem, not a quiet month.
              </p>
            ) : topTrainers.length === 0 ? (
              <p className="text-[11px]" style={{ color: TEXT_MUTED }}>No active coaches.</p>
            ) : (
              // Six, not three: this tile is three rows tall, and three
              // coaches left half of it empty.
              <div className="space-y-1.5 overflow-hidden flex-1 min-h-0">
                {topTrainers.slice(0, TOP_TRAINERS_SHOWN).map((t, i) => (
                  <div key={t.id} className="flex items-center gap-2 p-2 rounded-lg"
                    style={{ background: 'var(--color-surface-raised)' }}>
                    <span className="w-4 text-[10px] font-bold tabular-nums text-center flex-shrink-0"
                      style={{ color: i === 0 ? YELLOW : TEXT_MUTED }}>{i + 1}</span>
                    <span className="w-7 h-7 rounded-full flex items-center justify-center text-white font-bold text-[9px] flex-shrink-0"
                      style={{ background: VIOLET }}>
                      {t.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-[11px] text-white font-semibold truncate">{t.name}</span>
                      <span className="block text-[9px] truncate" style={{ color: TEXT_MUTED }}>{trainerLine(t)}</span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Tile>

        {/* Rows 5–6 — four equal tiles, each a real chart rather than a
            sparkline standing in for one. Clicking any of them opens the same
            chart full size with its own controls. */}
        <Tile col="1 / 4" row="5 / 7" onClick={() => setPanel('members')}
          tip="Sign-ups per month for the selected year">
          <MiniChartHeader label="New members" value={String(totalNewMembers)} sub={`in ${memberYear}`} />
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={memberData} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
                <Line type="monotone" dataKey="newMembers" stroke={YELLOW} strokeWidth={2}
                  dot={false} activeDot={{ r: 4 }} />
                <XAxis dataKey="month" hide />
                <Tooltip contentStyle={{ backgroundColor: '#1E1B30', border: `1px solid ${BORDER}`, borderRadius: 10, color: '#fff', fontSize: 11 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Tile>

        <Tile col="4 / 7" row="5 / 7" onClick={() => setPanel('attendance')}
          tip="Check-ins per day this week, or per week this month">
          <MiniChartHeader label="Attendance" value={String(totalAttendance)}
            sub={attendanceScope === 'weekly' ? 'this week' : 'this month'} />
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={attendanceData} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
                <Bar dataKey="count" fill={YELLOW} radius={[4, 4, 0, 0]} maxBarSize={22} />
                <XAxis dataKey="day" hide />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1E1B30', border: `1px solid ${BORDER}`, borderRadius: 10, color: '#fff', fontSize: 11 }}
                  cursor={{ fill: 'rgba(245,158,11,0.08)' }}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Tile>

        <Tile col="7 / 10" row="5 / 7" onClick={() => setPanel('heatmap')}
          tip="Check-ins per weekday over the last 30 days">
          <MiniChartHeader
            label="Busiest day"
            /* A dash until there are visits, rather than naming a day nobody's
               check-ins produced. */
            value={peakDay && peakDay.visits > 0 ? peakDay.day : '—'}
            sub={peakDay && peakDay.visits > 0
              ? `${peakDay.visits} check-ins · last 30 days`
              : 'no visits yet'}
          />
          <div className="flex-1 min-h-0 flex items-end gap-1">
            {/* The heatmap's other cut: its hour axis summed away, so the tile
                shows the shape of the week under the grid that shows the day. */}
            {dayTotals.map(({ day, visits }) => {
              const top = peakDay?.visits ?? 0;
              return (
                <div key={day} className="flex-1 h-full flex flex-col items-center justify-end gap-0.5"
                  data-tip={`${day}: ${visits} check-in${visits === 1 ? '' : 's'}`}>
                  <div className="w-full rounded-sm"
                    style={{
                      height: `${top === 0 ? 3 : Math.max(3, (visits / top) * 80)}%`,
                      background: visits === 0 ? 'var(--color-border)'
                        : visits === top ? YELLOW : 'rgba(124,58,237,0.55)',
                    }} />
                  <span className="text-[8px]" style={{ color: TEXT_MUTED }}>{day.slice(0, 1)}</span>
                </div>
              );
            })}
          </div>
        </Tile>

        <Tile col="10 / 13" row="5 / 7" onClick={() => setPanel('expiring')}
          tip="Memberships ending within seven days">
          <div className="h-full flex flex-col">
            <div className="flex items-center justify-between gap-2 mb-2 flex-shrink-0">
              <h3 className="text-xs font-semibold text-white">Expiring soon</h3>
              <span className="text-[10px] font-semibold px-1.5 rounded-full"
                style={{
                  background: expiringSoon.length > 0 ? 'var(--color-secondary-light)' : 'var(--color-surface-high)',
                  color: expiringSoon.length > 0 ? YELLOW : TEXT_MUTED,
                }}>
                {expiringSoon.length}
              </span>
            </div>
            {expiringSoon.length === 0 ? (
              <p className="text-[11px]" style={{ color: TEXT_MUTED }}>Nothing expires this week.</p>
            ) : (
              <div className="space-y-1.5 overflow-hidden">
                {expiringSoon.slice(0, 3).map((m) => (
                  <div key={m.id} className="flex items-center gap-2 p-2 rounded-lg"
                    style={{ background: 'var(--color-surface-raised)' }}>
                    <span className="w-7 h-7 rounded-full flex items-center justify-center text-white font-bold text-[9px] flex-shrink-0"
                      style={{ background: YELLOW }}>
                      {m.firstName[0]}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-[11px] text-white font-semibold truncate">{m.fullName}</span>
                      <span className="block text-[9px]" style={{ color: YELLOW }}>
                        {m.daysLeft} day{m.daysLeft !== 1 ? 's' : ''} left
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Tile>
      </div>

      <DetailSheet
        open={panel !== null}
        onClose={() => setPanel(null)}
        title={panel ? PANEL_TITLE[panel] : ''}
        width={620}
      >
        {panel === 'members' && (
          <>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[11px]" style={{ color: TEXT_MUTED }}>
                {totalNewMembers} joined in {memberYear}
              </p>
              <FilterSelect value={memberYear} options={years} onChange={setMemberYear} />
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={memberData}>
                <CartesianGrid strokeDasharray="3 3" stroke={BORDER as string} vertical={false} />
                <XAxis dataKey="month" stroke={TEXT_MUTED as string} tick={{ fill: '#9CA3AF', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis stroke={TEXT_MUTED as string} tick={{ fill: '#9CA3AF', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ backgroundColor: '#1E1B30', border: `1px solid ${BORDER}`, borderRadius: 12, color: '#fff', fontSize: 12 }} />
                <Line type="monotone" dataKey="newMembers" stroke={YELLOW} strokeWidth={2.5} dot={{ fill: YELLOW, r: 4 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </>
        )}

        {panel === 'attendance' && (
          <>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[11px]" style={{ color: TEXT_MUTED }}>
                {totalAttendance} check-in{totalAttendance === 1 ? '' : 's'}
              </p>
              <div className="flex p-0.5 rounded-lg" style={{ background: 'var(--color-surface-high)', border: `1px solid ${BORDER}` }}>
                {(['weekly', 'monthly'] as const).map((sc) => (
                  <button key={sc} onClick={() => setAttendanceScope(sc)}
                    className="px-2.5 h-6 rounded-md text-[10px] font-semibold capitalize transition-colors"
                    style={{
                      background: attendanceScope === sc ? VIOLET : 'transparent',
                      color: attendanceScope === sc ? '#fff' : 'var(--color-text-secondary)',
                    }}>
                    {sc}
                  </button>
                ))}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={attendanceData}>
                <CartesianGrid strokeDasharray="3 3" stroke={BORDER as string} vertical={false} />
                <XAxis dataKey="day" stroke={TEXT_MUTED as string} tick={{ fill: '#9CA3AF', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis stroke={TEXT_MUTED as string} tick={{ fill: '#9CA3AF', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1E1B30', border: `1px solid ${BORDER}`, borderRadius: 12, color: '#fff', fontSize: 12 }}
                  cursor={{ fill: 'rgba(245,158,11,0.08)' }}
                />
                <Bar dataKey="count" fill={YELLOW} radius={[8, 8, 0, 0]} maxBarSize={42} />
              </BarChart>
            </ResponsiveContainer>
          </>
        )}

        {panel === 'trend' && (
          <>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[11px]" style={{ color: TEXT_MUTED }}>
                {formatCurrency(yearRevenue)} across {revenueYear}
              </p>
              <FilterSelect value={revenueYear} options={years} onChange={setRevenueYear} />
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={revenueData}>
                <CartesianGrid strokeDasharray="3 3" stroke={BORDER as string} vertical={false} />
                <XAxis dataKey="month" stroke={TEXT_MUTED as string} tick={{ fill: '#9CA3AF', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis stroke={TEXT_MUTED as string} tick={{ fill: '#9CA3AF', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ backgroundColor: '#1E1B30', border: `1px solid ${BORDER}`, borderRadius: 12, color: '#fff', fontSize: 12 }} />
                <Line type="monotone" dataKey="revenue" stroke={YELLOW} strokeWidth={2.5} dot={{ fill: YELLOW, r: 3 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </>
        )}

        {panel === 'heatmap' && (
          <>
            <p className="text-[11px] mb-3" style={{ color: TEXT_MUTED }}>
              Day of week × hour bucket. Darker means more visits.
            </p>
            {heatmap.length > 0
              ? <HeatmapGrid cells={heatmap} />
              : <div className="py-8 text-center text-sm" style={{ color: TEXT_MUTED }}>Loading heatmap…</div>}
          </>
        )}

        {panel === 'trainers' && (
          <div className="space-y-1.5">
            <p className="text-[11px] mb-2" style={{ color: TEXT_MUTED }}>
              Ranked by sessions run in the last 90 days — approved PT sessions and classes
              taught, both already past — then by the gym&apos;s evaluation average.
            </p>
            {trainersFailed ? (
              <p className="text-[11px]" style={{ color: TEXT_MUTED }}>Couldn&apos;t load the ranking.</p>
            ) : topTrainers.length === 0 ? (
              <p className="text-[11px]" style={{ color: TEXT_MUTED }}>No active coaches.</p>
            ) : topTrainers.map((t) => (
              <button key={t.id} onClick={() => { setPanel(null); navigate('/trainers'); }}
                className="w-full text-left flex items-center gap-2.5 p-2.5 rounded-xl"
                style={{ background: 'var(--color-surface-high)' }}>
                <span className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-[10px] flex-shrink-0"
                  style={{ background: VIOLET }}>
                  {t.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[12px] text-white font-semibold truncate">{t.name}</span>
                  <span className="block text-[10px]" style={{ color: TEXT_MUTED }}>{trainerLine(t)}</span>
                </span>
                <ChevronRight size={13} style={{ color: TEXT_MUTED }} />
              </button>
            ))}
          </div>
        )}

        {panel === 'expiring' && (
          <div className="space-y-1.5">
            {expiringSoon.length === 0 ? (
              <p className="text-[11px]" style={{ color: TEXT_MUTED }}>Nothing expires in the next seven days.</p>
            ) : expiringSoon.map((m) => (
              <button key={m.id} onClick={() => { setPanel(null); navigate('/members'); }}
                className="w-full text-left flex items-center gap-2.5 p-2.5 rounded-xl"
                style={{ background: 'var(--color-surface-high)' }}>
                <span className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-[10px] flex-shrink-0"
                  style={{ background: YELLOW }}>
                  {m.firstName[0]}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[12px] text-white font-semibold truncate">{m.fullName}</span>
                  <span className="block text-[10px]" style={{ color: YELLOW }}>
                    {m.daysLeft} day{m.daysLeft !== 1 ? 's' : ''} left
                  </span>
                </span>
                <ChevronRight size={13} style={{ color: TEXT_MUTED }} />
              </button>
            ))}
          </div>
        )}
      </DetailSheet>
    </div>
  );
}

/**
 * A small card standing in for a chart, showing the figure and the shape.
 *
 * The sparkline is drawn by hand rather than with a charting library: it is
 * twelve points in a 96×24 box, and mounting a ResponsiveContainer four times
 * to draw that costs more than the whole rest of the row.
 */
/**
 * One cell of the bento.
 *
 * Placement is passed in rather than expressed as Tailwind classes because
 * `col-start-7` and friends are only generated when the exact class name
 * appears in the source — a computed one emits no CSS at all, which is the
 * "if a class looks like it does nothing, it probably does nothing" trap this
 * codebase has hit twice. Grid lines as inline styles always apply.
 *
 * `min-h-0` and `overflow-hidden` are what keep the grid honest: without them
 * a tile grows to its content, the row grows with it, and the page that was
 * built never to scroll starts scrolling.
 */
function Tile({ col, row, onClick, tip, children }: {
  col: string; row: string; onClick?: () => void; tip?: string;
  children: React.ReactNode;
}) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      onClick={onClick}
      data-tip={tip}
      className="rounded-xl p-3 text-left min-w-0 min-h-0 overflow-hidden transition-colors"
      style={{
        gridColumn: col,
        gridRow: row,
        background: SURFACE,
        border: `1px solid ${BORDER}`,
        boxShadow: 'var(--shadow-card)',
        cursor: onClick ? 'pointer' : 'default',
        // A <button> centres its content and its children shrink-wrap; both are
        // wrong for a tile that must fill its cell. Same fix as TileCard.
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        justifyContent: 'flex-start',
      }}
    >
      {children}
    </Tag>
  );
}

/** The figure and label above a small chart, so the chart never stands alone. */
function MiniChartHeader({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="flex items-start justify-between gap-2 mb-1 flex-shrink-0">
      <div className="min-w-0">
        <p className="text-[9px] uppercase tracking-wider truncate" style={{ color: TEXT_MUTED }}>{label}</p>
        <p className="text-base font-bold text-white tabular-nums leading-tight truncate">{value}</p>
        <p className="text-[10px] truncate" style={{ color: TEXT_MUTED }}>{sub}</p>
      </div>
      <ChevronRight size={12} className="flex-shrink-0 mt-0.5" style={{ color: TEXT_MUTED }} />
    </div>
  );
}
