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
import { formatCurrency } from '../utils/formatters';
import {
  dashboardService,
  type RevenuePoint, type MembersPoint, type AttendancePt,
  type HeatmapCell, type TopTrainer, type ProgressKpis,
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

// ── Progress Ring ───────────────────────────────────────────────────────────
function ProgressRing({ value, label, sub, accent = VIOLET, format }: {
  value: number; label: string; sub?: string; accent?: string;
  format?: (v: number) => string;
}) {
  const radius = 24;
  const stroke = 5;
  const size = (radius + stroke) * 2;
  const c = 2 * Math.PI * radius;
  const pct = Math.max(0, Math.min(100, value));
  const offset = c - (pct / 100) * c;
  const display = format ? format(value) : `${Math.round(value)}%`;

  return (
    <div className="flex items-center gap-2.5">
      <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle cx={size / 2} cy={size / 2} r={radius} stroke={BORDER} strokeWidth={stroke} fill="none" />
          <circle
            cx={size / 2} cy={size / 2} r={radius}
            stroke={accent} strokeWidth={stroke} fill="none"
            strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            style={{ transition: 'stroke-dashoffset 0.6s ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center text-[11px] font-bold text-white">
          {display}
        </div>
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-white truncate">{label}</p>
        {sub && <p className="text-[10px] mt-0.5 truncate" style={{ color: TEXT_MUTED }}>{sub}</p>}
      </div>
    </div>
  );
}

// ── Activity Heatmap ────────────────────────────────────────────────────────
function HeatmapGrid({ cells }: { cells: HeatmapCell[] }) {
  if (cells.length === 0) return null;
  const max  = Math.max(...cells.map((c) => c.visits));
  const days = Array.from(new Set(cells.map((c) => c.day)));
  const hrs  = Array.from(new Set(cells.map((c) => c.hour)));
  const visitOf = (d: string, h: string) => cells.find((c) => c.day === d && c.hour === h)?.visits ?? 0;

  // Color scale: dark → yellow (more visits = brighter yellow)
  const colorFor = (v: number) => {
    if (v === 0) return 'var(--color-surface-raised)';
    const pct = v / Math.max(1, max);
    if (pct < 0.25) return 'rgba(124,58,237,0.25)';
    if (pct < 0.5)  return 'rgba(124,58,237,0.50)';
    if (pct < 0.75) return 'rgba(245,158,11,0.45)';
    return 'rgba(245,158,11,0.75)';
  };

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
  const [pendingBookings, setPendingBookings] = useState(0);

  const [revenueData,    setRevenueData]    = useState<RevenuePoint[]>([]);
  const [memberData,     setMemberData]     = useState<MembersPoint[]>([]);
  const [attendanceData, setAttendanceData] = useState<AttendancePt[]>([]);
  const [heatmap,        setHeatmap]        = useState<HeatmapCell[]>([]);
  const [topTrainers,    setTopTrainers]    = useState<TopTrainer[]>([]);
  const [progressKpis,   setProgressKpis]   = useState<ProgressKpis | null>(null);

  useEffect(() => {
    dashboardService
      .getSummary()
      .then((s) => {
        setSummary(s);
        setPendingBookings(s.pendingApprovals);
      })
      .catch(() => {});
    dashboardService.getExpiringSoon().then(setExpiringSoon).catch(() => {});
  }, []);

  useEffect(() => { dashboardService.getRevenueByYear(revenueYear).then(setRevenueData); }, [revenueYear]);
  useEffect(() => { dashboardService.getNewMembersByYear(memberYear).then(setMemberData); }, [memberYear]);
  useEffect(() => { dashboardService.getAttendance(attendanceScope).then(setAttendanceData); }, [attendanceScope]);
  useEffect(() => {
    dashboardService.getAttendanceHeatmap().then(setHeatmap);
    dashboardService.getTopTrainers().then(setTopTrainers);
    dashboardService.getProgressKpis().then(setProgressKpis);
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

  /**
   * Visits per hour bucket, summed across the week.
   *
   * The heatmap is day x hour; this collapses the day axis so the tile can draw
   * the shape of an ordinary day in the space a sparkline would have used.
   * Bucket order comes from the data, not from a hardcoded list of hours —
   * `getAttendanceHeatmap` decides the buckets and this must not disagree.
   */
  const hourTotals = (() => {
    const order: string[] = [];
    const sums = new Map<string, number>();
    for (const c of heatmap) {
      if (!sums.has(c.hour)) { order.push(c.hour); sums.set(c.hour, 0); }
      sums.set(c.hour, (sums.get(c.hour) ?? 0) + c.visits);
    }
    return order.map((h) => sums.get(h) ?? 0);
  })();
  const peakHour = Math.max(0, ...hourTotals);

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
          {pendingBookings > 0 && (
            <button
              onClick={() => navigate('/bookings')}
              data-tip="Class and personal-training requests waiting for a decision"
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg font-semibold text-[11px]"
              style={{ background: 'var(--color-secondary-light)', color: YELLOW }}
            >
              {pendingBookings} awaiting approval <ChevronRight size={12} />
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

        {/* Rows 2–4, middle — the member-body figures. */}
        <Tile col="7 / 10" row="2 / 5">
          <h3 className="text-xs font-semibold text-white mb-2">Member statistics</h3>
          <div className="space-y-2.5">
            <ProgressRing
              value={progressKpis ? Math.min(100, (progressKpis.avgBmi / 30) * 100) : 0}
              label="Avg BMI"
              sub={progressKpis ? progressKpis.avgBmi.toFixed(1) : '—'}
              accent={VIOLET}
              format={() => progressKpis ? progressKpis.avgBmi.toFixed(1) : '—'}
            />
            <ProgressRing
              value={progressKpis ? Math.min(100, Math.abs(progressKpis.avgWeightChangeKg) * 25) : 0}
              label="Avg Weight Change"
              sub={progressKpis
                ? `${progressKpis.avgWeightChangeKg > 0 ? '+' : ''}${progressKpis.avgWeightChangeKg} kg`
                : '—'}
              accent={YELLOW}
              format={() => progressKpis ? `${progressKpis.avgWeightChangeKg > 0 ? '+' : ''}${progressKpis.avgWeightChangeKg}` : '—'}
            />
            <ProgressRing
              value={progressKpis ? Math.min(100, (progressKpis.totalWorkouts / 1500) * 100) : 0}
              label="Total Workouts"
              sub={progressKpis ? `${progressKpis.totalWorkouts.toLocaleString()} logged` : '—'}
              accent={VIOLET}
              format={() => progressKpis ? `${Math.round((progressKpis.totalWorkouts / 1500) * 100)}%` : '—'}
            />
            <ProgressRing
              value={progressKpis ? Math.min(100, (progressKpis.activeGoals / 100) * 100) : 0}
              label="Active Goals"
              sub={progressKpis ? `${progressKpis.activeGoals} in progress` : '—'}
              accent={YELLOW}
              format={() => progressKpis ? `${progressKpis.activeGoals}` : '—'}
            />
          </div>
        </Tile>

        {/* Rows 2–4, right — who is coaching well. */}
        <Tile col="10 / 13" row="2 / 5" onClick={() => setPanel('trainers')}
          tip="Coaches ranked by member rating and sessions run">
          <div className="h-full flex flex-col">
            <div className="flex items-center justify-between gap-2 mb-2 flex-shrink-0">
              <h3 className="text-xs font-semibold text-white">Top trainers</h3>
              <span className="text-[10px] font-semibold flex items-center gap-0.5" style={{ color: YELLOW }}>
                {topTrainers.length > 3 ? `All ${topTrainers.length}` : 'Open'} <ChevronRight size={10} />
              </span>
            </div>
            {topTrainers.length === 0 ? (
              <p className="text-[11px]" style={{ color: TEXT_MUTED }}>No rated coaches yet.</p>
            ) : (
              <div className="space-y-1.5 overflow-hidden">
                {topTrainers.slice(0, 3).map((t) => (
                  <div key={t.id} className="flex items-center gap-2 p-2 rounded-lg"
                    style={{ background: 'var(--color-surface-raised)' }}>
                    <span className="w-7 h-7 rounded-full flex items-center justify-center text-white font-bold text-[9px] flex-shrink-0"
                      style={{ background: VIOLET }}>
                      {t.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-[11px] text-white font-semibold truncate">{t.name}</span>
                      <span className="block text-[9px]" style={{ color: TEXT_MUTED }}>
                        {t.avgRating.toFixed(1)} ★ · {t.sessions} sessions
                      </span>
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
          tip="The busiest day-and-hour, from real check-ins">
          <MiniChartHeader
            label="Busiest hour"
            /* NULL until the heatmap loads, and it says so rather than naming
               an hour nobody's visits produced. */
            value={busiestCell && busiestCell.visits > 0 ? busiestCell.hour : '—'}
            sub={busiestCell && busiestCell.visits > 0
              ? `${busiestCell.day} · ${busiestCell.visits} visits`
              : 'no visits yet'}
          />
          <div className="flex-1 min-h-0 flex items-end gap-[3px]">
            {/* Visits by hour, summed across days — the shape of a gym's day
                in the space a sparkline would have used. */}
            {hourTotals.map((n, i) => (
              <div key={i} className="flex-1 rounded-sm"
                style={{
                  height: `${peakHour === 0 ? 3 : Math.max(3, (n / peakHour) * 100)}%`,
                  background: n === 0 ? 'var(--color-border)'
                    : n === peakHour ? YELLOW : 'rgba(124,58,237,0.55)',
                }} />
            ))}
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
            {topTrainers.length === 0 ? (
              <p className="text-[11px]" style={{ color: TEXT_MUTED }}>No rated trainers yet.</p>
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
                  <span className="block text-[10px]" style={{ color: TEXT_MUTED }}>
                    {t.avgRating.toFixed(1)} ★ · {t.sessions} sessions
                  </span>
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
