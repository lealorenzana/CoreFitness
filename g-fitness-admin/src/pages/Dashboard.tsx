import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  Users, DollarSign, Activity, CalendarDays, ArrowUpRight, ChevronRight,
  Star, Target, Dumbbell as DumbbellIcon, Scale, Sparkles, ChevronDown,
} from 'lucide-react';

import Card from '../components/ui/Card';
import { useGymContext } from '../hooks/useGymContext';
import { MEMBERS } from '../data/members';
import { formatCurrency } from '../utils/formatters';
import { SharedStorage } from '../utils/sharedStorage';
import {
  dashboardService,
  type RevenuePoint, type MembersPoint, type AttendancePt,
  type HeatmapCell, type TopTrainer, type ProgressKpis,
} from '../services/dashboardService';

const VIOLET     = '#7C3AED';
const YELLOW     = '#F59E0B';
const TEXT_MUTED = 'var(--color-text-muted)';
const BORDER     = 'var(--color-border)';

// ── Filter pill ─────────────────────────────────────────────────────────────
function FilterSelect({ value, options, onChange }: {
  value: string; options: string[]; onChange: (v: string) => void;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none pl-3 pr-7 py-1.5 rounded-full text-xs font-medium focus:outline-none cursor-pointer"
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
function KpiCard({ label, value, delta, icon: Icon, tooltip }: {
  label: string; value: string | number; delta?: string; icon: any; tooltip?: string;
}) {
  return (
    <Card className="!p-4" title={tooltip}>
      <div className="flex items-start justify-between mb-2">
        <div className="w-9 h-9 rounded-full flex items-center justify-center"
          style={{ background: 'var(--color-primary-light)' }}>
          <Icon size={16} style={{ color: VIOLET }} />
        </div>
        {delta && (
          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold"
            style={{ background: 'var(--color-secondary-light)', color: YELLOW }}>
            <ArrowUpRight size={9} /> {delta}
          </span>
        )}
      </div>
      <p className="text-2xl font-bold text-white tracking-tight">{value}</p>
      <p className="text-[11px] mt-0.5" style={{ color: TEXT_MUTED }}>{label}</p>
    </Card>
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
  const { selectedGym } = useGymContext();
  const navigate = useNavigate();

  const years = dashboardService.getYears();
  const [revenueYear, setRevenueYear] = useState(years[years.length - 1]);
  const [memberYear,  setMemberYear]  = useState(years[years.length - 1]);
  const [attendanceScope, setAttendanceScope] = useState<'weekly' | 'monthly'>('weekly');
  const [pendingBookings, setPendingBookings] = useState(0);

  const [revenueData,    setRevenueData]    = useState<RevenuePoint[]>([]);
  const [memberData,     setMemberData]     = useState<MembersPoint[]>([]);
  const [attendanceData, setAttendanceData] = useState<AttendancePt[]>([]);
  const [heatmap,        setHeatmap]        = useState<HeatmapCell[]>([]);
  const [topTrainers,    setTopTrainers]    = useState<TopTrainer[]>([]);
  const [progressKpis,   setProgressKpis]   = useState<ProgressKpis | null>(null);

  useEffect(() => {
    const refresh = () => setPendingBookings(SharedStorage.getBookings().filter((b: any) => b.status === 'Pending').length);
    refresh();
    const i = setInterval(refresh, 2000);
    return () => clearInterval(i);
  }, []);

  useEffect(() => { dashboardService.getRevenueByYear(revenueYear).then(setRevenueData); }, [revenueYear]);
  useEffect(() => { dashboardService.getNewMembersByYear(memberYear).then(setMemberData); }, [memberYear]);
  useEffect(() => { dashboardService.getAttendance(attendanceScope).then(setAttendanceData); }, [attendanceScope]);
  useEffect(() => {
    dashboardService.getAttendanceHeatmap().then(setHeatmap);
    dashboardService.getTopTrainers().then(setTopTrainers);
    dashboardService.getProgressKpis().then(setProgressKpis);
  }, []);

  // Derived KPIs
  const gymMembers      = MEMBERS.filter((m) => m.gymId === selectedGym.id);
  const activeMembers   = gymMembers.filter((m) => m.membershipStatus === 'Active');
  const todayAttendance = Math.floor(activeMembers.length * 0.6);
  const monthlyRevenue  = activeMembers.reduce((sum, m) => {
    const prices = { Basic: 800, Standard: 1500, Premium: 2500 };
    return sum + prices[m.membershipType];
  }, 0);

  const kpis = [
    { label: 'Total Members',    value: gymMembers.length,             delta: '+12%', icon: Users,        tooltip: 'Total number of registered gym members across all membership types' },
    { label: 'Monthly Revenue',  value: formatCurrency(monthlyRevenue), delta: '+15%', icon: DollarSign,   tooltip: 'Estimated monthly revenue based on active membership fees' },
    { label: 'Active Classes',   value: progressKpis?.totalClasses ?? '—', delta: '+2', icon: CalendarDays, tooltip: 'Number of scheduled classes currently running this week' },
    { label: 'Attendance Today', value: todayAttendance,                delta: '+5%',  icon: Activity,     tooltip: 'Number of members who checked in today via QR or manual entry' },
  ];

  return (
    <div className="flex gap-5">
      {/* ── LEFT: Main content ─────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 space-y-4">
        {/* ── HERO BANNER ──────────────────────────────────────────────────── */}
        <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }}>
          <div
            className="relative overflow-hidden rounded-2xl p-5"
            style={{ background: VIOLET }}
            title="Admin welcome banner — quick access to reports and pending bookings"
          >
            <Sparkles size={80} className="absolute -top-2 -right-2 text-white/10" />

            <p className="text-[10px] font-semibold tracking-[0.2em] uppercase text-white/60 mb-1">
              Admin Console
            </p>
            <h1 className="text-xl font-bold text-white leading-tight">
              Welcome to Core Fitness
            </h1>
            <p className="text-xs text-white/60 mt-1">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                onClick={() => navigate('/revenue')}
                className="inline-flex items-center gap-1.5 h-8 px-4 rounded-full font-semibold text-xs text-black"
                style={{ background: YELLOW }}
              >
                View Reports <ArrowUpRight size={12} />
              </button>
              {pendingBookings > 0 && (
                <button
                  onClick={() => navigate('/bookings')}
                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full font-medium text-xs text-white"
                  style={{ background: 'rgba(255,255,255,0.15)' }}
                >
                  {pendingBookings} pending <ChevronRight size={12} />
                </button>
              )}
            </div>
          </div>
        </motion.div>

        {/* ── KPI ROW ──────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpis.map((k, i) => (
          <motion.div key={k.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
            <KpiCard {...k} />
          </motion.div>
        ))}
      </div>

      {/* ── REVENUE + NEW MEMBERS ──────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <motion.div className="lg:col-span-2" initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }}>
          <Card className="!p-4" title="Monthly revenue breakdown showing income per month for the selected year" header={
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-semibold text-white">Revenue</h3>
                <p className="text-[10px] mt-0.5" style={{ color: TEXT_MUTED }}>Monthly performance</p>
              </div>
              <FilterSelect value={revenueYear} options={years} onChange={setRevenueYear} />
            </div>
          }>
            <ResponsiveContainer width="100%" height={180}>
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
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.25 }}>
          <Card className="!p-4" title="New member sign-ups per month showing growth trend over time" header={
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-semibold text-white">New Members</h3>
                <p className="text-[10px] mt-0.5" style={{ color: TEXT_MUTED }}>Trend</p>
              </div>
              <FilterSelect value={memberYear} options={years} onChange={setMemberYear} />
            </div>
          }>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={memberData}>
                <CartesianGrid strokeDasharray="3 3" stroke={BORDER as string} vertical={false} />
                <XAxis dataKey="month" stroke={TEXT_MUTED as string} tick={{ fill: '#9CA3AF', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis stroke={TEXT_MUTED as string} tick={{ fill: '#9CA3AF', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ backgroundColor: '#1E1B30', border: `1px solid ${BORDER}`, borderRadius: 12, color: '#fff', fontSize: 12 }} />
                <Line type="monotone" dataKey="newMembers" stroke={YELLOW} strokeWidth={2.5} dot={{ fill: YELLOW, r: 4 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </Card>
        </motion.div>
      </div>

      {/* ── ATTENDANCE + 12-MONTH TREND ────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <Card className="!p-4" title="Daily/weekly member check-in count showing gym traffic patterns" header={
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-semibold text-white">Attendance</h3>
                <p className="text-[10px] mt-0.5" style={{ color: TEXT_MUTED }}>Yellow bars</p>
              </div>
              <div className="flex p-0.5 rounded-full" style={{ background: 'var(--color-surface-raised)', border: `1px solid ${BORDER}` }}>
                {(['weekly', 'monthly'] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setAttendanceScope(s)}
                    className="px-2.5 h-6 rounded-full text-[10px] font-semibold capitalize transition-colors"
                    style={{
                      background: attendanceScope === s ? VIOLET : 'transparent',
                      color:      attendanceScope === s ? '#fff'  : 'var(--color-text-secondary)',
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          }>
            <ResponsiveContainer width="100%" height={160}>
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
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
          <Card className="!p-4" title="12-month revenue trend line showing overall financial performance" header={
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-semibold text-white">12-Month Revenue Trend</h3>
                <p className="text-[10px] mt-0.5" style={{ color: TEXT_MUTED }}>Yellow line overlay</p>
              </div>
              <FilterSelect value={revenueYear} options={years} onChange={setRevenueYear} />
            </div>
          }>
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={revenueData}>
                <CartesianGrid strokeDasharray="3 3" stroke={BORDER as string} vertical={false} />
                <XAxis dataKey="month" stroke={TEXT_MUTED as string} tick={{ fill: '#9CA3AF', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis stroke={TEXT_MUTED as string} tick={{ fill: '#9CA3AF', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ backgroundColor: '#1E1B30', border: `1px solid ${BORDER}`, borderRadius: 12, color: '#fff', fontSize: 12 }} />
                <Line type="monotone" dataKey="revenue" stroke={YELLOW} strokeWidth={2.5} dot={{ fill: YELLOW, r: 3 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </Card>
        </motion.div>
      </div>

      {/* ── HEATMAP (compact, no extra space) ── */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
        <Card className="!p-4" title="Heatmap showing peak gym hours — darker cells mean more member visits at that time" header={
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity size={14} style={{ color: VIOLET }} />
              <h3 className="text-xs font-semibold text-white">Member Activity Heatmap</h3>
            </div>
            <span className="text-[10px]" style={{ color: TEXT_MUTED }}>day-of-week × hour bucket</span>
          </div>
        }>
          <div className="max-h-[220px] overflow-y-auto scrollbar-thin scrollbar-thumb-dark-border">
            {heatmap.length > 0
              ? <HeatmapGrid cells={heatmap} />
              : <div className="py-8 text-center text-sm" style={{ color: TEXT_MUTED }}>Loading heatmap…</div>}
          </div>
        </Card>
      </motion.div>
      </div>

      {/* ── RIGHT: Statistics sidebar ──────────────────────────────────────── */}
      <aside className="hidden xl:block w-[280px] flex-shrink-0 space-y-4">
        {/* Greeting card */}
        <Card className="!p-4 text-center" title="Admin greeting card — shows current admin status">
          <div className="w-14 h-14 mx-auto rounded-full flex items-center justify-center mb-3"
            style={{ background: 'var(--color-primary-light)', border: `2px solid ${VIOLET}` }}>
            <Users size={24} style={{ color: VIOLET }} />
          </div>
          <h3 className="text-sm font-bold text-white">Good Morning, Admin 🔥</h3>
          <p className="text-[10px] mt-1" style={{ color: TEXT_MUTED }}>
            Continue managing your gym!
          </p>
        </Card>

        {/* Progress Summary */}
        <Card className="!p-4" title="Key fitness statistics — average BMI, weight changes, total workouts, and active goals across all members" header={
          <h3 className="text-xs font-semibold text-white">Statistics</h3>
        }>
          <div className="space-y-3">
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

        {/* Top Trainers */}
        <Card className="!p-4" title="Top-performing trainers ranked by rating and completed sessions" header={
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-white">Top Trainers</h3>
            <button
              onClick={() => navigate('/trainers')}
              className="text-[10px] font-semibold flex items-center gap-0.5"
              style={{ color: YELLOW }}
            >
              See all <ChevronRight size={10} />
            </button>
          </div>
        }>
          {topTrainers.length === 0 ? (
            <div className="py-4 text-center text-xs" style={{ color: TEXT_MUTED }}>Loading…</div>
          ) : (
            <div className="space-y-1.5">
              {topTrainers.slice(0, 4).map((t) => (
                <div
                  key={t.id}
                  className="flex items-center gap-2 p-2 rounded-xl"
                  style={{ background: 'var(--color-surface-raised)', border: `1px solid ${BORDER}` }}
                >
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-white font-bold text-[9px] flex-shrink-0"
                    style={{ background: VIOLET }}>
                    {t.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] text-white font-semibold truncate">{t.name}</p>
                    <div className="flex items-center gap-1">
                      <Star size={8} style={{ color: YELLOW, fill: YELLOW }} />
                      <span className="text-[9px] text-white">{t.avgRating.toFixed(1)}</span>
                    </div>
                  </div>
                  <span className="text-[8px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap"
                    style={{ background: 'var(--color-primary-light)', color: VIOLET }}>
                    {t.sessions}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Membership Expiring Soon */}
        <Card className="!p-4" title="Members whose memberships expire within the next 7 days — send reminders to retain them" header={
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-white">Expiring Soon</h3>
            <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
              style={{ background: 'var(--color-secondary-light)', color: YELLOW }}>
              {gymMembers.filter(m => {
                const days = Math.ceil((new Date(m.expiryDate).getTime() - Date.now()) / 86400000);
                return days > 0 && days <= 7;
              }).length} members
            </span>
          </div>
        }>
          {(() => {
            const expiring = gymMembers
              .map(m => ({ ...m, daysLeft: Math.ceil((new Date(m.expiryDate).getTime() - Date.now()) / 86400000) }))
              .filter(m => m.daysLeft > 0 && m.daysLeft <= 7)
              .sort((a, b) => a.daysLeft - b.daysLeft)
              .slice(0, 4);
            if (expiring.length === 0) return (
              <p className="text-center py-4 text-[11px]" style={{ color: TEXT_MUTED }}>No expiring memberships</p>
            );
            return (
              <div className="space-y-1.5">
                {expiring.map(m => (
                  <div key={m.id} className="flex items-center gap-2 p-2 rounded-xl"
                    style={{ background: 'var(--color-surface-raised)', border: `1px solid ${BORDER}` }}>
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-white font-bold text-[9px] flex-shrink-0"
                      style={{ background: YELLOW }}>
                      {m.firstName[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] text-white font-semibold truncate">{m.fullName}</p>
                      <p className="text-[9px]" style={{ color: YELLOW }}>{m.daysLeft} day{m.daysLeft !== 1 ? 's' : ''} left</p>
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}
        </Card>
      </aside>
    </div>
  );
}
