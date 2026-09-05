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

import Card from '../components/ui/Card';
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

// ── KPI Card ────────────────────────────────────────────────────────────────
/**
 * One headline figure.
 *
 * Laid out on one line rather than stacked: the icon sat above the number in a
 * 100px-tall card, and four of those plus a 145px banner is most of a laptop
 * screen spent before the first chart. Side by side it is 62px and reads the
 * same.
 *
 * `delta` is still supported and still unused — no invented growth badges. A
 * "+12%" beside a real number is worse than no badge, because it looks
 * authoritative while being made up.
 */
function KpiCard({ label, value, delta, icon: Icon, tooltip, onClick }: {
  label: string; value: string | number; delta?: string; icon: any;
  tooltip?: string; onClick?: () => void;
}) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      onClick={onClick}
      title={tooltip}
      className="w-full text-left rounded-xl p-3 flex items-center gap-2.5 group transition-colors"
      style={{
        background: SURFACE, border: `1px solid ${BORDER}`,
        boxShadow: 'var(--shadow-card)', cursor: onClick ? 'pointer' : 'default',
      }}
    >
      <span className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ background: 'var(--color-primary-light)' }}>
        <Icon size={16} style={{ color: VIOLET }} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-lg font-bold text-white tracking-tight tabular-nums leading-tight truncate">
          {value}
        </span>
        <span className="block text-[10px] truncate" style={{ color: TEXT_MUTED }}>{label}</span>
      </span>
      {delta && (
        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold flex-shrink-0"
          style={{ background: 'var(--color-secondary-light)', color: YELLOW }}>
          <ArrowUpRight size={9} /> {delta}
        </span>
      )}
      {onClick && (
        <ChevronRight size={13} className="flex-shrink-0 transition-transform group-hover:translate-x-0.5"
          style={{ color: TEXT_MUTED }} />
      )}
    </Tag>
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
                  title={`${d} ${h}: ${v} visits`}
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

  const PANEL_TITLE: Record<string, string> = {
    members: 'New members', attendance: 'Attendance',
    trend: '12-month revenue trend', heatmap: 'Member activity heatmap',
    trainers: 'Top trainers', expiring: 'Expiring soon',
  };

  return (
    <div
      /* Exactly the height <main> gives it, so the page itself never scrolls.
         `h-full`, not `calc(100vh - something)`: the something is the header
         plus main's padding plus the route wrapper's margins, and hard-coding
         a guess at that was wrong by 8px at every viewport size — which is all
         it takes to put a scrollbar back on a screen built not to have one.
         100% asks the parent, and the parent knows. */
      className="flex gap-4 overflow-hidden h-full"
    >
      {/* ── LEFT: Main content ─────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col gap-3">
        {/* ── HEADER ────────────────────────────────────────────────────────
            The purple banner was 145px tall and carried a greeting, the date
            and two buttons. The greeting and the date are one line; the buttons
            keep their place. That is ~100px given back to the charts. */}
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
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg font-semibold text-[11px]"
                style={{ background: 'var(--color-secondary-light)', color: YELLOW }}
              >
                {pendingBookings} awaiting approval <ChevronRight size={12} />
              </button>
            )}
            <button
              onClick={() => navigate('/revenue')}
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg font-semibold text-[11px] text-black"
              style={{ background: YELLOW }}
            >
              Reports <ArrowUpRight size={12} />
            </button>
          </div>
        </motion.div>

        {/* ── KPI ROW ──────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-4 gap-2.5 flex-shrink-0">
          {kpis.map((k, i) => (
            <motion.div key={k.label} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}>
              <KpiCard {...k} onClick={k.to ? () => navigate(k.to as string) : undefined} />
            </motion.div>
          ))}
        </div>

        {/* ── REVENUE — the one chart that keeps its full size ─────────────
            `min-h-0` matters: without it a flex child refuses to shrink below
            its content, the column grows past the viewport, and the page you
            just made unscrollable gets a scrollbar again. */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }}
          className="flex-1 min-h-0">
          {/* The column layout is an inline style, not `className="flex flex-col"`.
              Card runs its classes through `cn()` (tailwind-merge), which ate
              the bare `flex` and kept `flex-col` — so the card stayed
              `display: block`, `flex-1` on the chart wrapper meant nothing, and
              the chart rendered at zero height: a full-size card with nothing
              in it. Inline styles do not go through the merge. */}
          <Card className="!p-4 h-full"
            style={{ display: 'flex', flexDirection: 'column' }}
            title="Monthly revenue breakdown showing income per month for the selected year">
            <div className="flex items-center justify-between mb-3 flex-shrink-0">
              <div>
                <h3 className="text-xs font-semibold text-white">Revenue</h3>
                <p className="text-[10px] mt-0.5" style={{ color: TEXT_MUTED }}>
                  {formatCurrency(yearRevenue)} across {revenueYear}
                </p>
              </div>
              <FilterSelect value={revenueYear} options={years} onChange={setRevenueYear} />
            </div>
            <div className="flex-1 min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={revenueData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={BORDER as string} vertical={false} />
                  <XAxis dataKey="month" stroke={TEXT_MUTED as string} tick={{ fill: '#9CA3AF', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis stroke={TEXT_MUTED as string} tick={{ fill: '#9CA3AF', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1E1B30', border: `1px solid ${BORDER}`, borderRadius: 12, color: '#fff', fontSize: 12 }}
                    cursor={{ fill: 'rgba(124,58,237,0.08)' }}
                  />
                  <Bar dataKey="revenue" fill={VIOLET} radius={[8, 8, 0, 0]} maxBarSize={42} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </motion.div>

        {/* ── THE OTHER THREE, AS CARDS ───────────────────────────────────────
            Each shows the figure you would have scrolled down to read, plus a
            sparkline of the same series. Clicking opens the full chart. */}
        <div className="grid grid-cols-4 gap-2.5 flex-shrink-0">
          <MiniCard
            label="New members" value={String(totalNewMembers)} sub={`in ${memberYear}`}
            series={memberData.map((m) => m.newMembers)} accent={YELLOW}
            onClick={() => setPanel('members')}
          />
          <MiniCard
            label="Attendance" value={String(totalAttendance)}
            sub={attendanceScope === 'weekly' ? 'this week' : 'this month'}
            series={attendanceData.map((a) => a.count)} accent={YELLOW}
            onClick={() => setPanel('attendance')}
          />
          <MiniCard
            label="12-month trend" value={formatCurrency(yearRevenue)} sub={`${revenueYear} total`}
            series={revenueData.map((r) => r.revenue)} accent={VIOLET}
            onClick={() => setPanel('trend')}
          />
          <MiniCard
            label="Busiest hour"
            /* NULL until the heatmap loads, and it says so rather than showing
               a plausible "6am" nobody's visits produced. */
            value={busiestCell && busiestCell.visits > 0 ? busiestCell.hour : '—'}
            sub={busiestCell && busiestCell.visits > 0 ? `${busiestCell.day} · ${busiestCell.visits} visits` : 'no visits yet'}
            series={[]} accent={VIOLET}
            onClick={() => setPanel('heatmap')}
          />
        </div>
      </div>

      {/* ── RIGHT: Statistics rail ─────────────────────────────────────────── */}
      <aside className="hidden xl:flex w-[264px] flex-shrink-0 flex-col gap-3">
        {/* The greeting card is gone. It was 120px of "Good Morning, Admin 🔥 /
            Continue managing your gym!" — no number, no link, no state. The
            greeting now lives in the header line, where it costs nothing. */}
        <Card className="!p-3.5 flex-shrink-0" title="Key fitness statistics — average BMI, weight changes, total workouts, and active goals across all members" header={
          <h3 className="text-xs font-semibold text-white">Member statistics</h3>
        }>
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
        </Card>

        {/* Two lists, each showing its top two and opening the rest in a panel.
            They used to show four apiece and pushed the rail past the fold. */}
        <RailList
          title="Top trainers"
          count={topTrainers.length}
          onOpen={() => setPanel('trainers')}
          empty="No rated trainers yet"
          rows={topTrainers.slice(0, 2).map((t) => ({
            id: t.id,
            initials: t.name.split(' ').map((n) => n[0]).join('').slice(0, 2),
            name: t.name,
            note: `${t.avgRating.toFixed(1)} ★ · ${t.sessions} sessions`,
            tone: VIOLET,
          }))}
        />

        <RailList
          title="Expiring soon"
          count={expiringSoon.length}
          onOpen={() => setPanel('expiring')}
          empty="No expiring memberships"
          rows={expiringSoon.slice(0, 2).map((m) => ({
            id: m.id,
            initials: m.firstName[0],
            name: m.fullName,
            note: `${m.daysLeft} day${m.daysLeft !== 1 ? 's' : ''} left`,
            tone: YELLOW,
          }))}
        />
      </aside>

      {/* ── The panel every small card opens ───────────────────────────────── */}
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
function MiniCard({ label, value, sub, series, accent, onClick }: {
  label: string; value: string; sub: string;
  series: number[]; accent: string; onClick: () => void;
}) {
  const peak = Math.max(...series, 1);
  const points = series.length > 1
    ? series.map((v, i) => `${(i / (series.length - 1)) * 96},${24 - (v / peak) * 22}`).join(' ')
    : null;

  return (
    <button onClick={onClick}
      className="text-left rounded-xl p-3 transition-colors group"
      style={{ background: SURFACE, border: `1px solid ${BORDER}` }}>
      <span className="flex items-center justify-between gap-2">
        <span className="text-[9px] uppercase tracking-wider truncate" style={{ color: TEXT_MUTED }}>{label}</span>
        <ChevronRight size={12} className="flex-shrink-0 transition-transform group-hover:translate-x-0.5"
          style={{ color: TEXT_MUTED }} />
      </span>
      <span className="flex items-end justify-between gap-2 mt-0.5">
        <span className="min-w-0">
          <span className="block text-base font-bold text-white tabular-nums leading-tight truncate">{value}</span>
          <span className="block text-[10px] truncate" style={{ color: TEXT_MUTED }}>{sub}</span>
        </span>
        {points && (
          <svg width="96" height="24" viewBox="0 0 96 24" className="flex-shrink-0" aria-hidden>
            <polyline points={points} fill="none" stroke={accent} strokeWidth="1.5"
              strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
    </button>
  );
}

/** A short list in the right rail, with the rest one click away. */
function RailList({ title, count, rows, empty, onOpen }: {
  title: string;
  count: number;
  rows: { id: string; initials: string; name: string; note: string; tone: string }[];
  empty: string;
  onOpen: () => void;
}) {
  return (
    <Card className="!p-3.5 flex-shrink-0" header={
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-white">{title}</h3>
        <button onClick={onOpen} className="text-[10px] font-semibold flex items-center gap-0.5"
          style={{ color: YELLOW }}>
          {count > rows.length ? `All ${count}` : 'Open'} <ChevronRight size={10} />
        </button>
      </div>
    }>
      {rows.length === 0 ? (
        <p className="text-center py-3 text-[11px]" style={{ color: TEXT_MUTED }}>{empty}</p>
      ) : (
        <div className="space-y-1.5">
          {rows.map((r) => (
            <button key={r.id} onClick={onOpen}
              className="w-full text-left flex items-center gap-2 p-2 rounded-lg"
              style={{ background: 'var(--color-surface-raised)' }}>
              <span className="w-7 h-7 rounded-full flex items-center justify-center text-white font-bold text-[9px] flex-shrink-0"
                style={{ background: r.tone }}>
                {r.initials}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-[11px] text-white font-semibold truncate">{r.name}</span>
                <span className="block text-[9px] truncate" style={{ color: TEXT_MUTED }}>{r.note}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </Card>
  );
}
