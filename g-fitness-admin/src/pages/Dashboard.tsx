import { motion } from 'framer-motion';
import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGymModules, moduleOn } from '../hooks/useGymModules';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  ChevronRight, ChevronDown, CalendarClock, UserPlus, ReceiptText, PauseCircle, Hourglass,
  QrCode, Banknote, Check, Dumbbell, Award,
} from 'lucide-react';

import DetailSheet from '../components/ui/DetailSheet';
import { winbackSweep, type AtRisk } from '../lib/api/retention';
import { streakNudgeSweep } from '../lib/api/streak';
import { runPermitReminders } from '../lib/api/applications';
import { getMyProfile } from '../lib/api/profiles';
import { getGymSettings } from '../lib/api/settings';
import PinGymChip from '../components/PinGymChip';
import { formatCurrency } from '../utils/formatters';
import {
  dashboardService,
  type RevenuePoint, type MembersPoint, type AttendancePt,
  type HeatmapCell, type TopTrainer,
} from '../services/dashboardService';
import {
  loadNeedsYou, loadToday, loadMonthNumbers, loadMembersToWatch,
  type NeedsYou, type Today, type MonthNumbers, type Compared,
} from '../services/todayService';
import { useTour } from '../components/tour/Tour';
import { tourFor } from '../lib/tours';

const VIOLET     = '#7C3AED';
const VIOLET_300 = '#C4B5FD';
const YELLOW     = '#F59E0B';
const TEXT_MUTED = 'var(--color-text-muted)';
const TEXT_2     = 'var(--color-text-secondary)';
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
          color: TEXT_2,
        }}
      >
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
      <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: TEXT_MUTED }} />
    </div>
  );
}

// ── Top trainers (now behind "Coach ranking", no longer a dashboard tile) ────
/** "4.6 ★ (12) · 23 sessions". A coach nobody has rated reads "No evaluations",
 *  never "0.0 ★" — a missing score is not a bad one. */
function trainerLine(t: TopTrainer): string {
  const rating = t.avgRating == null ? 'No evaluations' : `${t.avgRating.toFixed(1)} ★ (${t.evaluations})`;
  return `${rating} · ${t.sessions} session${t.sessions === 1 ? '' : 's'}`;
}

// ── Busy hours ──────────────────────────────────────────────────────────────
/**
 * One colour, light to strong. It used to run violet into amber, which read as
 * two different things ("Darker means more visits" while the brightest amber
 * was the busiest), and violet/amber mean "where you are" / "do this" elsewhere.
 * Shared by the tile and the full panel so the two never shade a count apart.
 */
function heatColor(v: number, max: number) {
  if (v === 0) return 'var(--color-surface-raised)';
  const pct = v / Math.max(1, max);
  if (pct < 0.25) return 'rgba(124,58,237,0.22)';
  if (pct < 0.5)  return 'rgba(124,58,237,0.42)';
  if (pct < 0.75) return 'rgba(124,58,237,0.68)';
  return 'rgba(155,123,255,0.95)';
}
const HEAT_LEGEND = ['var(--color-surface-raised)', 'rgba(124,58,237,0.22)', 'rgba(124,58,237,0.42)', 'rgba(124,58,237,0.68)', 'rgba(155,123,255,0.95)'];

function HeatmapGrid({ cells, compact }: { cells: HeatmapCell[]; compact?: boolean }) {
  const max  = Math.max(0, ...cells.map((c) => c.visits));
  const days = Array.from(new Set(cells.map((c) => c.day)));
  const hrs  = Array.from(new Set(cells.map((c) => c.hour)));
  const visitOf = (d: string, h: string) => cells.find((c) => c.day === d && c.hour === h)?.visits ?? 0;
  return (
    <div className={compact ? 'h-full grid gap-[3px]' : 'grid gap-[3px]'}
      style={{
        gridTemplateColumns: `30px repeat(${hrs.length}, minmax(0, 1fr))`,
        gridTemplateRows: compact ? `auto repeat(${days.length}, minmax(0, 1fr))` : undefined,
      }}>
      <div />
      {hrs.map((h) => (
        <div key={h} className="text-[10px] text-center pb-0.5" style={{ color: TEXT_MUTED }}>{h}</div>
      ))}
      {days.map((d) => (
        <div key={d} className="contents">
          <div className="text-[10px] flex items-center" style={{ color: TEXT_MUTED }}>{d}</div>
          {hrs.map((h) => {
            const v = visitOf(d, h);
            return (
              <div key={`${d}-${h}`}
                className={`rounded flex items-center justify-center text-[10px] font-semibold min-h-0 ${compact ? '' : 'h-8'}`}
                style={{ background: heatColor(v, max), color: compact ? 'transparent' : '#fff' }}
                data-tip={`${d} around ${h}: ${v} check-in${v === 1 ? '' : 's'} in the last 30 days`}>
                {!compact && v > 0 ? v : ''}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ── Small pieces ────────────────────────────────────────────────────────────
const peso = (n: number) => formatCurrency(n);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' }).toLowerCase();

/** "06:00" → "6:00 am". Null for anything unreadable rather than a guess. */
function clock(t: string | null | undefined): string | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(t ?? '');
  if (!m) return null;
  const h = Number(m[1]);
  return `${h % 12 === 0 ? 12 : h % 12}:${m[2]} ${h < 12 ? 'am' : 'pm'}`;
}

/** The comparison under a figure — computed from real counts, never invented. */
function deltaText(c: Compared, kind: 'pct' | 'count', vs: string): { text: string; dir: 'up' | 'down' | 'flat' } | null {
  if (c.previous === null) return null;
  const diff = c.value - c.previous;
  if (diff === 0) return { text: `Same as ${vs}`, dir: 'flat' };
  if (kind === 'pct' && c.previous > 0) {
    const pct = Math.round((diff / c.previous) * 100);
    if (pct === 0) return { text: `About the same as ${vs}`, dir: 'flat' };
    return { text: `${Math.abs(pct)}% vs ${vs}`, dir: pct > 0 ? 'up' : 'down' };
  }
  return { text: `${Math.abs(diff)} vs ${vs}`, dir: diff > 0 ? 'up' : 'down' };
}

function Delta({ d }: { d: ReturnType<typeof deltaText> }) {
  if (!d) return null;
  const color = d.dir === 'up' ? VIOLET_300 : d.dir === 'down' ? YELLOW : TEXT_MUTED;
  return (
    <p className="text-[11px] font-semibold mt-1 truncate" style={{ color }}>
      {d.dir === 'up' ? '▲ ' : d.dir === 'down' ? '▼ ' : ''}{d.text}
    </p>
  );
}

/** One card of the page. `min-h-0` + `overflow-hidden` keep the page from scrolling. */
function Card({ children, onClick, tip, glow, className = '', style }: {
  children: ReactNode; onClick?: () => void; tip?: string; glow?: boolean; className?: string; style?: React.CSSProperties;
}) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag onClick={onClick} data-tip={tip}
      className={`rounded-2xl p-4 text-left min-w-0 min-h-0 overflow-hidden flex flex-col items-stretch justify-start ${className}`}
      style={{
        background: glow ? 'linear-gradient(160deg, #211a3a 0%, var(--color-surface) 55%)' : SURFACE,
        border: `1px solid ${glow ? '#2f2752' : BORDER}`,
        boxShadow: 'var(--shadow-card)',
        cursor: onClick ? 'pointer' : 'default',
        ...style,
      }}>
      {children}
    </Tag>
  );
}

function CardHead({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 mb-2 flex-shrink-0">
      <h3 className="text-[13px] font-semibold text-white truncate">{title}</h3>
      {right}
    </div>
  );
}

/** A section that failed to load says so — empty must only ever mean "nothing here". */
function Failed({ what }: { what: string }) {
  return <p className="text-[11px]" style={{ color: TEXT_MUTED }}>Couldn&apos;t load {what}. This is a connection problem, not an empty list.</p>;
}

/** One line of "Needs you": icon, what, detail, one action. */
function TaskRow({ icon: Icon, title, detail, action, onClick, testId }: {
  icon: typeof UserPlus; title: string; detail: string; action: string; onClick: () => void; testId: string;
}) {
  return (
    <div className="flex items-center gap-3 py-2.5 min-w-0" style={{ borderTop: `1px solid ${BORDER}` }} data-task={testId}>
      <span className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ background: 'var(--color-secondary-light)', color: YELLOW }}>
        <Icon size={15} />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-[13px] font-medium text-white truncate">{title}</span>
        <span className="block text-[11px] truncate" style={{ color: TEXT_2 }}>{detail}</span>
      </span>
      <button onClick={onClick}
        className="h-7 px-3 rounded-lg text-[11px] font-semibold flex-shrink-0"
        style={{ background: 'var(--color-secondary-light)', color: YELLOW, border: '1px solid #3a2f10' }}>
        {action}
      </button>
    </div>
  );
}

// ── Main Dashboard ──────────────────────────────────────────────────────────
/**
 * The owner's morning (A1, chosen 2026-10-18 from three mock-ups).
 *
 * The old dashboard answered "how is the business doing?" and buried "what
 * needs me today?" in two corner buttons and the bottom-right tile. Top to
 * bottom it now runs the way a morning does: the tasks waiting, today (who has
 * checked in, the cash, the classes), this month against the last, then the
 * longer view. Every chart the old page had is still one click away — new
 * members, attendance, the full heatmap, the coach ranking and the expiring
 * list open in the side panel, and older figures live in Reports.
 *
 * "In the gym now" from the mock-up became "Checked in today": the system
 * records check-ins, never check-outs, so it cannot know who is still inside.
 */
export default function Dashboard() {
  const navigate = useNavigate();
  useTour(tourFor('dashboard'));

  const years = dashboardService.getYears();
  const [revenueYear, setRevenueYear] = useState(years[0]);
  const [memberYear,  setMemberYear]  = useState(years[0]);
  const [attendanceScope, setAttendanceScope] = useState<'weekly' | 'monthly'>('weekly');

  const [firstName, setFirstName] = useState<string | null>(null);
  const [hours, setHours] = useState<{ open: string | null; close: string | null }>({ open: null, close: null });
  const [needs, setNeeds] = useState<NeedsYou | null>(null);
  const [today, setToday] = useState<Today | null>(null);
  // A gym without classes (off by default since 0220) sees today's 1-on-1 sessions in that card.
  const classesOn = moduleOn(useGymModules(), 'classes');
  const [month, setMonth] = useState<MonthNumbers | null>(null);
  const [watch, setWatch] = useState<AtRisk[] | null | undefined | 'loading'>('loading');

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
    getMyProfile().then((p) => setFirstName(p?.first_name?.trim() || null)).catch(() => {});
    getGymSettings().then((s) => setHours({ open: clock(s?.opening_time), close: clock(s?.closing_time) })).catch(() => {});
    loadNeedsYou().then(setNeeds).catch(() => {});
    loadToday().then(setToday).catch(() => {});
    loadMonthNumbers().then(setMonth).catch(() => {});
    loadMembersToWatch().then(setWatch).catch(() => setWatch(null));
    // Win-back messages the owner switched on (0130): the dashboard is opened
    // daily, so it is the sweep that runs. Never throws.
    void winbackSweep();
    // The weekly "keep your streak" message (0151), on the same daily open.
    void streakNudgeSweep();
    // Renew the permit / clearance / ID (0187): each January and before one runs out. Owner only; never throws.
    void runPermitReminders();
  }, []);

  useEffect(() => { dashboardService.getRevenueByYear(revenueYear).then(setRevenueData); }, [revenueYear]);
  useEffect(() => { dashboardService.getNewMembersByYear(memberYear).then(setMemberData); }, [memberYear]);
  useEffect(() => { dashboardService.getAttendance(attendanceScope).then(setAttendanceData); }, [attendanceScope]);
  useEffect(() => {
    dashboardService.getAttendanceHeatmap()
      .then((cells) => { setHeatmap(cells); setHeatmapState('ready'); })
      .catch(() => setHeatmapState('failed'));
    dashboardService.getTopTrainers().then(setTopTrainers).catch(() => setTrainersFailed(true));
  }, []);

  /** Which side panel is open — the charts that are not tiles any more. */
  const [panel, setPanel] = useState<
    null | 'members' | 'attendance' | 'heatmap' | 'trainers' | 'expiring'
  >(null);
  const PANEL_TITLE: Record<string, string> = {
    members: 'New members', attendance: 'Attendance', heatmap: 'Busy hours',
    trainers: 'Coach ranking', expiring: 'Memberships ending this week',
  };

  /** Bars or a line — the same twelve months either way. */
  const [chartMode, setChartMode] = useState<'bars' | 'trend'>('bars');

  const totalNewMembers = memberData.reduce((sum, m) => sum + m.newMembers, 0);
  const totalAttendance = attendanceData.reduce((sum, a) => sum + a.count, 0);
  const yearRevenue = revenueData.reduce((sum, r) => sum + r.revenue, 0);
  const busiestCell = heatmap.reduce<HeatmapCell | null>(
    (best, c) => (best === null || c.visits > best.visits ? c : best), null);

  // ── "Needs you", as rows — only the ones with something waiting ────────────
  const tasks: { key: string; node: ReactNode; count: number }[] = [];
  if (needs?.bookings && needs.bookings.count > 0) {
    const b = needs.bookings;
    tasks.push({ key: 'bookings', count: b.count, node: (
      <TaskRow key="bookings" testId="bookings" icon={CalendarClock}
        title={`${plural(b.count, 'booking')} to decide`}
        detail={b.oldestDays == null ? 'classes and 1-on-1 requests' : b.oldestDays === 0 ? 'oldest asked today' : `oldest waiting ${plural(b.oldestDays, 'day')}`}
        action="Review" onClick={() => navigate('/personal-training')} />) });
  }
  if (needs?.signups && needs.signups.count > 0) {
    const s = needs.signups;
    const rest = s.count - s.names.length;
    tasks.push({ key: 'signups', count: s.count, node: (
      <TaskRow key="signups" testId="signups" icon={UserPlus}
        title={`${plural(s.count, 'sign-up')} waiting`}
        detail={`${s.names.join(', ')}${rest > 0 ? `, +${rest}` : ''}`}
        action="Approve" onClick={() => navigate('/members?pending=1')} />) });
  }
  if (needs?.payments && needs.payments.count > 0) {
    const p = needs.payments;
    tasks.push({ key: 'payments', count: p.count, node: (
      <TaskRow key="payments" testId="payments" icon={ReceiptText}
        title={`${plural(p.count, 'online payment')} to confirm`}
        detail={`${p.methods.join(', ') || 'Sent by members'} · ${peso(p.total)}`}
        action="Confirm" onClick={() => navigate('/payments')} />) });
  }
  if (needs?.requests && needs.requests.count > 0) {
    const r = needs.requests;
    const what = r.freezes && r.cancels ? 'freeze / cancel' : r.freezes ? 'freeze' : 'cancel';
    tasks.push({ key: 'requests', count: r.count, node: (
      <TaskRow key="requests" testId="requests" icon={PauseCircle}
        title={`${plural(r.count, `${what} request`)}`}
        detail="the refund quote is ready to check"
        action="Decide" onClick={() => navigate('/members')} />) });
  }
  if (needs?.expiring && needs.expiring.length > 0) {
    const e = needs.expiring;
    const first = e[0];
    tasks.push({ key: 'expiring', count: e.length, node: (
      <TaskRow key="expiring" testId="expiring" icon={Hourglass}
        title={`${plural(e.length, 'membership')} end${e.length === 1 ? 's' : ''} this week`}
        detail={`${first.fullName} in ${plural(first.daysLeft, 'day')}`}
        action="View" onClick={() => setPanel('expiring')} />) });
  }
  const todo = tasks.reduce((s, t) => s + t.count, 0);
  const needsFailed = needs !== null && [needs.bookings, needs.signups, needs.payments, needs.requests, needs.expiring].some((x) => x === null);

  const hour = Number(new Date().toLocaleString('en-PH', { hour: 'numeric', hour12: false, timeZone: 'Asia/Manila' }));
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const dateLine = new Date().toLocaleDateString('en-PH', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Manila' });

  const classes = today?.classes ?? null;
  const sessionsToday = today?.sessions ?? null;
  const stillToCome = classes ? classes.filter((c) => !c.done).length : 0;

  return (
    <div className="h-full flex flex-col gap-3 overflow-hidden" data-dashboard="a1">
      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
        className="flex items-end justify-between gap-4 flex-shrink-0">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-white truncate">{greeting}{firstName ? `, ${firstName}` : ''}</h1>
          <p className="text-[12px] truncate" style={{ color: TEXT_2 }}>
            {dateLine}
            {hours.open && hours.close ? ` · open ${hours.open} – ${hours.close}` : ''}
            {today?.checkIns != null ? ` · ${plural(today.checkIns, 'check-in')} so far` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <PinGymChip />
          <button onClick={() => navigate('/attendance')}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg font-semibold text-[12px] text-white"
            style={{ background: SURFACE, border: `1px solid ${BORDER}` }}>
            <QrCode size={14} /> Check in
          </button>
          <button onClick={() => navigate('/payments?record=new')}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg font-semibold text-[12px] text-black"
            style={{ background: YELLOW }}>
            <Banknote size={14} /> Record payment
          </button>
        </div>
      </motion.div>

      {/* ── THE PAGE ────────────────────────────────────────────────────────
          Three bands filling exactly the height left: today (tasks + now),
          this month's figures (a fixed 96px — a number needs that whatever the
          screen), then the longer view. `minmax(0, 1fr)`, never a bare `1fr`,
          or one long name pushes a band past the viewport and the page scrolls. */}
      <div className="flex-1 min-h-0 grid gap-3"
        style={{ gridTemplateRows: 'minmax(0, 1.2fr) 96px minmax(0, 1fr)' }}>

        {/* Band 1 — needs you, and today. */}
        <div className="grid gap-3 min-h-0" style={{ gridTemplateColumns: 'minmax(0, 1.25fr) minmax(0, 1fr) minmax(0, 1fr)', gridTemplateRows: 'auto minmax(0, 1fr)' }}>
          <Card glow className="row-span-2" style={{ gridRow: '1 / 3' }}>
            <CardHead title="Needs you" right={needs && (
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                style={todo > 0 ? { background: 'var(--color-secondary-light)', color: YELLOW } : { background: 'var(--color-primary-light)', color: VIOLET_300 }}>
                {todo > 0 ? `${todo} to do` : 'All clear'}
              </span>
            )} />
            <div className="flex-1 min-h-0 overflow-y-auto -mt-px" data-needs-you>
              {needs === null ? (
                <p className="text-[12px]" style={{ color: TEXT_MUTED }}>Loading…</p>
              ) : tasks.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center gap-2">
                  <span className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'var(--color-primary-light)', color: VIOLET_300 }}><Check size={18} /></span>
                  <p className="text-[13px] font-medium text-white">Nothing is waiting for you</p>
                  <p className="text-[11px]" style={{ color: TEXT_2 }}>New bookings, sign-ups and payments will show here.</p>
                </div>
              ) : tasks.map((t) => t.node)}
              {needsFailed && <p className="text-[11px] pt-2" style={{ color: TEXT_MUTED }}>Part of this list couldn&apos;t load — open the pages in the sidebar to be sure.</p>}
            </div>
          </Card>

          <Card onClick={() => navigate('/attendance')} tip="Everyone checked in today, at the desk, kiosk or by QR">
            <CardHead title="Checked in today" right={<ChevronRight size={14} style={{ color: TEXT_MUTED }} />} />
            <p className="text-2xl font-bold text-white tabular-nums">{today ? (today.checkIns ?? '—') : '…'}</p>
            <p className="text-[11px] mt-0.5 truncate" style={{ color: TEXT_2 }}>
              {today?.walkIns != null ? `+ ${plural(today.walkIns, 'walk-in')}` : today ? 'members and coaches' : ''}
            </p>
          </Card>

          <Card onClick={() => navigate('/payments')} tip="Cash payments recorded today, from the same figure as End of day">
            <CardHead title="Cash today" right={<ChevronRight size={14} style={{ color: TEXT_MUTED }} />} />
            <p className="text-2xl font-bold text-white tabular-nums">{today ? (today.cash ? peso(today.cash.cashIn) : '—') : '…'}</p>
            <p className="text-[11px] mt-0.5 truncate" style={{ color: TEXT_2 }}>
              {today?.cash ? `${plural(today.cash.payments, 'payment')} · ${today.cash.closed ? 'drawer closed' : 'drawer open'}` : ''}
            </p>
          </Card>

          <Card style={{ gridColumn: '2 / 4' }}>
            {classesOn ? (<>
            <CardHead title="Today's classes" right={
              <span className="flex items-center gap-3">
                {classes && classes.length > 0 && <span className="text-[11px]" style={{ color: TEXT_2 }}>{stillToCome} of {classes.length} still to come</span>}
                <button onClick={() => setPanel('trainers')} className="text-[11px] font-semibold inline-flex items-center gap-1" style={{ color: YELLOW }}
                  data-tip="Coaches ranked by sessions run in the last 90 days, then by rating">
                  <Award size={12} /> Coach ranking
                </button>
              </span>
            } />
            <div className="flex-1 min-h-0 overflow-y-auto" data-today-classes>
              {today === null ? (
                <p className="text-[12px]" style={{ color: TEXT_MUTED }}>Loading…</p>
              ) : classes === null ? (
                <Failed what="today's classes" />
              ) : classes.length === 0 ? (
                <p className="text-[12px]" style={{ color: TEXT_2 }}>No classes today. <button className="font-semibold" style={{ color: YELLOW }} onClick={() => navigate('/schedule')}>Open the schedule</button></p>
              ) : classes.map((c) => {
                const full = c.capacity > 0 && c.booked >= c.capacity;
                return (
                  <div key={c.id} className="flex items-center gap-3 py-2 min-w-0" style={{ borderTop: `1px solid ${BORDER}` }}>
                    <span className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: 'var(--color-surface-raised)', color: c.done ? TEXT_MUTED : VIOLET_300 }}>
                      {c.done ? <Check size={14} /> : <Dumbbell size={14} />}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-[13px] font-medium truncate" style={{ color: c.done ? TEXT_MUTED : '#fff' }}>
                        {timeOf(c.startsAt)} · {c.name}
                      </span>
                      <span className="block text-[11px] truncate" style={{ color: TEXT_2 }}>
                        {[c.coach, c.location, c.done ? 'done' : null].filter(Boolean).join(' · ') || 'No coach yet'}
                      </span>
                    </span>
                    {!c.done && c.capacity > 0 && (
                      <span className="w-28 h-1.5 rounded-full overflow-hidden flex-shrink-0" style={{ background: 'var(--color-surface-high)' }}>
                        <span className="block h-full rounded-full" style={{ width: `${Math.min(100, (c.booked / c.capacity) * 100)}%`, background: VIOLET }} />
                      </span>
                    )}
                    <span className="w-12 text-right text-[11px] font-semibold tabular-nums flex-shrink-0" style={{ color: full ? YELLOW : TEXT_2 }}>
                      {c.capacity > 0 ? (full && !c.done ? 'Full' : `${c.booked}/${c.capacity}`) : c.booked}
                    </span>
                  </div>
                );
              })}
            </div>
            </>) : (<>
            <CardHead title="Today's sessions" right={
              <span className="flex items-center gap-3">
                {sessionsToday && sessionsToday.length > 0 && <span className="text-[11px]" style={{ color: TEXT_2 }}>{sessionsToday.filter((x) => !x.done).length} of {sessionsToday.length} still to come</span>}
                <button onClick={() => setPanel('trainers')} className="text-[11px] font-semibold inline-flex items-center gap-1" style={{ color: YELLOW }}
                  data-tip="Coaches ranked by sessions run in the last 90 days, then by rating">
                  <Award size={12} /> Coach ranking
                </button>
              </span>
            } />
            <div className="flex-1 min-h-0 overflow-y-auto" data-today-sessions>
              {today === null ? (
                <p className="text-[12px]" style={{ color: TEXT_MUTED }}>Loading…</p>
              ) : sessionsToday === null ? (
                <Failed what="today's sessions" />
              ) : sessionsToday.length === 0 ? (
                <p className="text-[12px]" style={{ color: TEXT_2 }}>No 1-on-1 sessions today. <button className="font-semibold" style={{ color: YELLOW }} onClick={() => navigate('/personal-training?tab=sessions')}>Open Personal training</button></p>
              ) : sessionsToday.map((x) => (
                <div key={x.id} className="flex items-center gap-3 py-2 min-w-0" style={{ borderTop: `1px solid ${BORDER}` }}>
                  <span className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: 'var(--color-surface-raised)', color: x.done ? TEXT_MUTED : VIOLET_300 }}>
                    {x.done ? <Check size={14} /> : <Dumbbell size={14} />}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[13px] font-medium truncate" style={{ color: x.done ? TEXT_MUTED : '#fff' }}>
                      {timeOf(x.startsAt)} · {x.member ?? 'A member'}
                    </span>
                    <span className="block text-[11px] truncate" style={{ color: TEXT_2 }}>
                      {[x.coach ? `with ${x.coach}` : null, x.done ? 'done' : null].filter(Boolean).join(' · ') || 'Single session'}
                    </span>
                  </span>
                </div>
              ))}
            </div>
            </>)}
          </Card>
        </div>

        {/* Band 2 — this month, against the same days last month. */}
        <div className="grid gap-3 min-h-0" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }} data-month-numbers>
          <Card onClick={() => navigate('/revenue')} tip={`Completed payments from the 1st to today, compared with the same days of ${month?.previousLabel ?? 'last month'}`}>
            <p className="text-[12px] font-medium truncate" style={{ color: TEXT_2 }}>Revenue · {month?.monthLabel ?? 'this month'}</p>
            <p className="text-2xl font-bold text-white tabular-nums truncate">{month ? (month.revenue ? peso(month.revenue.value) : '—') : '…'}</p>
            {month?.revenue && <Delta d={deltaText(month.revenue, 'pct', month.previousLabel)} />}
          </Card>
          <Card onClick={() => navigate('/members')} tip="Memberships active right now">
            <p className="text-[12px] font-medium truncate" style={{ color: TEXT_2 }}>Active members</p>
            <p className="text-2xl font-bold text-white tabular-nums">{month ? (month.activeMembers ? month.activeMembers.value : '—') : '…'}</p>
            {month?.activeMembers && (
              <p className="text-[11px] font-semibold mt-1 truncate" style={{ color: month.activeMembers.joinedThisMonth > 0 ? VIOLET_300 : TEXT_MUTED }}>
                {month.activeMembers.joinedThisMonth > 0 ? `▲ ${month.activeMembers.joinedThisMonth} joined this month` : 'No one new this month yet'}
              </p>
            )}
          </Card>
          <Card onClick={() => setPanel('attendance')} tip="Check-ins in the last 30 days, compared with the 30 before">
            <p className="text-[12px] font-medium truncate" style={{ color: TEXT_2 }}>Visits · last 30 days</p>
            <p className="text-2xl font-bold text-white tabular-nums">{month ? (month.visits30 ? month.visits30.value : '—') : '…'}</p>
            {month?.visits30 && <Delta d={deltaText(month.visits30, 'pct', 'the 30 before')} />}
          </Card>
          <Card onClick={() => setPanel('members')} tip={`New members from the 1st to today, compared with the same days of ${month?.previousLabel ?? 'last month'}`}>
            <p className="text-[12px] font-medium truncate" style={{ color: TEXT_2 }}>New members · {month?.monthLabel ?? 'this month'}</p>
            <p className="text-2xl font-bold text-white tabular-nums">{month ? (month.newMembers ? month.newMembers.value : '—') : '…'}</p>
            {month?.newMembers && <Delta d={deltaText(month.newMembers, 'count', month.previousLabel)} />}
          </Card>
        </div>

        {/* Band 3 — the longer view. */}
        <div className="grid gap-3 min-h-0" style={{ gridTemplateColumns: 'minmax(0, 1.35fr) minmax(0, 1fr) minmax(0, 1fr)' }}>
          <Card>
            <div className="flex items-start justify-between gap-2 mb-2 flex-shrink-0">
              <div className="min-w-0">
                <h3 className="text-[13px] font-semibold text-white">Revenue by month</h3>
                <p className="text-[11px] mt-0.5" style={{ color: TEXT_MUTED }}>{peso(yearRevenue)} across {revenueYear}</p>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <div className="flex p-0.5 rounded-lg" style={{ background: 'var(--color-surface-high)' }}>
                  {(['bars', 'trend'] as const).map((m) => (
                    <button key={m} onClick={() => setChartMode(m)}
                      data-tip={m === 'bars' ? 'Each month as a bar' : 'The same months as a line'}
                      className="px-2 h-6 rounded-md text-[10px] font-semibold capitalize"
                      style={{ background: chartMode === m ? VIOLET : 'transparent', color: chartMode === m ? '#fff' : TEXT_2 }}>
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
                    <YAxis stroke={TEXT_MUTED as string} tick={{ fill: '#9CA3AF', fontSize: 10 }} axisLine={false} tickLine={false} width={48}
                      tickFormatter={(v: number) => (v >= 1000 ? `₱${Math.round(v / 1000)}k` : `₱${v}`)} />
                    <Tooltip formatter={(v) => peso(Number(v) || 0)}
                      contentStyle={{ backgroundColor: '#1E1B30', border: `1px solid ${BORDER}`, borderRadius: 12, color: '#fff', fontSize: 12 }}
                      cursor={{ fill: 'rgba(124,58,237,0.08)' }} />
                    <Bar dataKey="revenue" fill={VIOLET} radius={[8, 8, 0, 0]} maxBarSize={38} />
                  </BarChart>
                ) : (
                  <LineChart data={revenueData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={BORDER as string} vertical={false} />
                    <XAxis dataKey="month" stroke={TEXT_MUTED as string} tick={{ fill: '#9CA3AF', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis stroke={TEXT_MUTED as string} tick={{ fill: '#9CA3AF', fontSize: 10 }} axisLine={false} tickLine={false} width={48}
                      tickFormatter={(v: number) => (v >= 1000 ? `₱${Math.round(v / 1000)}k` : `₱${v}`)} />
                    <Tooltip formatter={(v) => peso(Number(v) || 0)} contentStyle={{ backgroundColor: '#1E1B30', border: `1px solid ${BORDER}`, borderRadius: 12, color: '#fff', fontSize: 12 }} />
                    <Line type="monotone" dataKey="revenue" stroke={VIOLET_300} strokeWidth={2.5} dot={{ fill: VIOLET_300, r: 3 }} activeDot={{ r: 6 }} />
                  </LineChart>
                )}
              </ResponsiveContainer>
            </div>
          </Card>

          <Card onClick={() => setPanel('heatmap')} tip="Check-ins by day and time over the last 30 days — open for the numbers">
            <CardHead title="Busy hours" right={<span className="text-[11px]" style={{ color: TEXT_MUTED }}>last 30 days</span>} />
            <div className="flex-1 min-h-0">
              {heatmapState === 'loading' ? (
                <p className="text-[11px]" style={{ color: TEXT_MUTED }}>Loading…</p>
              ) : heatmapState === 'failed' ? (
                <Failed what="check-ins" />
              ) : heatmap.length === 0 ? (
                <p className="text-[11px]" style={{ color: TEXT_MUTED }}>No check-ins in the last 30 days.</p>
              ) : <HeatmapGrid cells={heatmap} compact />}
            </div>
            {heatmapState === 'ready' && busiestCell && busiestCell.visits > 0 && (
              <p className="text-[11px] mt-2 flex-shrink-0 truncate" style={{ color: TEXT_2 }}>
                Busiest: {busiestCell.day} around {busiestCell.hour} · lighter is quieter
              </p>
            )}
          </Card>

          <Card>
            <CardHead title="Members to watch" right={Array.isArray(watch) && watch.length > 0 && (
              <button onClick={() => navigate('/retention')} className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                style={{ background: 'var(--color-primary-light)', color: VIOLET_300 }} data-tip="Everyone at risk, and the win-back messages">
                {watch.length} ›
              </button>
            )} />
            <div className="flex-1 min-h-0 overflow-y-auto" data-members-to-watch>
              {watch === 'loading' ? (
                <p className="text-[12px]" style={{ color: TEXT_MUTED }}>Loading…</p>
              ) : watch === null ? (
                <Failed what="who might leave" />
              ) : watch === undefined ? (
                <p className="text-[12px]" style={{ color: TEXT_2 }}>Risk scores appear once the retention update is live.</p>
              ) : watch.length === 0 ? (
                <p className="text-[12px]" style={{ color: TEXT_2 }}>No one looks likely to leave right now.</p>
              ) : watch.slice(0, 4).map((m) => (
                <button key={m.memberId} onClick={() => navigate(`/members?open=${m.memberId}`)}
                  className="w-full flex items-center gap-2.5 py-2 text-left min-w-0" style={{ borderTop: `1px solid ${BORDER}` }}>
                  <span className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                    style={m.level === 'high' ? { background: 'var(--color-secondary-light)', color: YELLOW } : { background: 'var(--color-surface-raised)', color: VIOLET_300 }}>
                    {m.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[13px] font-medium text-white truncate">{m.name}</span>
                    <span className="block text-[11px] truncate" style={{ color: TEXT_2 }}>{m.reasons[0] ?? 'needs a check-in'}</span>
                  </span>
                </button>
              ))}
            </div>
          </Card>
        </div>
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
              <p className="text-[11px]" style={{ color: TEXT_MUTED }}>{totalNewMembers} joined in {memberYear}</p>
              <FilterSelect value={memberYear} options={years} onChange={setMemberYear} />
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={memberData}>
                <CartesianGrid strokeDasharray="3 3" stroke={BORDER as string} vertical={false} />
                <XAxis dataKey="month" stroke={TEXT_MUTED as string} tick={{ fill: '#9CA3AF', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} stroke={TEXT_MUTED as string} tick={{ fill: '#9CA3AF', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ backgroundColor: '#1E1B30', border: `1px solid ${BORDER}`, borderRadius: 12, color: '#fff', fontSize: 12 }} />
                <Line type="monotone" dataKey="newMembers" name="New members" stroke={VIOLET_300} strokeWidth={2.5} dot={{ fill: VIOLET_300, r: 4 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </>
        )}

        {panel === 'attendance' && (
          <>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[11px]" style={{ color: TEXT_MUTED }}>{plural(totalAttendance, 'check-in')}</p>
              <div className="flex p-0.5 rounded-lg" style={{ background: 'var(--color-surface-high)', border: `1px solid ${BORDER}` }}>
                {(['weekly', 'monthly'] as const).map((sc) => (
                  <button key={sc} onClick={() => setAttendanceScope(sc)}
                    className="px-2.5 h-6 rounded-md text-[10px] font-semibold capitalize transition-colors"
                    style={{ background: attendanceScope === sc ? VIOLET : 'transparent', color: attendanceScope === sc ? '#fff' : TEXT_2 }}>
                    {sc === 'weekly' ? 'This week' : 'This month'}
                  </button>
                ))}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={attendanceData}>
                <CartesianGrid strokeDasharray="3 3" stroke={BORDER as string} vertical={false} />
                <XAxis dataKey="day" stroke={TEXT_MUTED as string} tick={{ fill: '#9CA3AF', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} stroke={TEXT_MUTED as string} tick={{ fill: '#9CA3AF', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ backgroundColor: '#1E1B30', border: `1px solid ${BORDER}`, borderRadius: 12, color: '#fff', fontSize: 12 }}
                  cursor={{ fill: 'rgba(124,58,237,0.08)' }} />
                <Bar dataKey="count" name="Check-ins" fill={VIOLET} radius={[8, 8, 0, 0]} maxBarSize={42} />
              </BarChart>
            </ResponsiveContainer>
            <p className="text-[11px] mt-3" style={{ color: TEXT_2 }}>
              Older days are in <button className="font-semibold" style={{ color: YELLOW }} onClick={() => { setPanel(null); navigate('/attendance-history'); }}>Attendance history</button>.
            </p>
          </>
        )}

        {panel === 'heatmap' && (
          <>
            <p className="text-[11px] mb-3" style={{ color: TEXT_MUTED }}>Check-ins by day and time over the last 30 days. Stronger colour means more visits.</p>
            {heatmap.length > 0 ? (
              <>
                <HeatmapGrid cells={heatmap} />
                <div className="flex items-center gap-1.5 mt-3 text-[10px]" style={{ color: TEXT_MUTED }}>
                  Quieter {HEAT_LEGEND.map((c) => <span key={c} className="w-3.5 h-3.5 rounded" style={{ background: c }} />)} Busier
                </div>
              </>
            ) : <div className="py-8 text-center text-sm" style={{ color: TEXT_MUTED }}>{heatmapState === 'failed' ? 'Couldn’t load check-ins.' : 'Loading…'}</div>}
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
            ) : topTrainers.map((t, i) => (
              <button key={t.id} onClick={() => { setPanel(null); navigate('/trainers'); }}
                className="w-full text-left flex items-center gap-2.5 p-2.5 rounded-xl"
                style={{ background: 'var(--color-surface-high)' }}>
                <span className="w-4 text-[11px] font-bold tabular-nums text-center flex-shrink-0" style={{ color: i === 0 ? YELLOW : TEXT_MUTED }}>{i + 1}</span>
                <span className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-[10px] flex-shrink-0" style={{ background: VIOLET }}>
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
            {!needs?.expiring || needs.expiring.length === 0 ? (
              <p className="text-[11px]" style={{ color: TEXT_MUTED }}>Nothing ends in the next seven days.</p>
            ) : needs.expiring.map((m) => (
              <button key={m.id} onClick={() => { setPanel(null); navigate(`/members?open=${m.memberId}`); }}
                className="w-full text-left flex items-center gap-2.5 p-2.5 rounded-xl"
                style={{ background: 'var(--color-surface-high)' }}>
                <span className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-[10px] flex-shrink-0"
                  style={{ background: 'var(--color-secondary-light)', color: YELLOW }}>
                  {m.firstName[0]}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[12px] text-white font-semibold truncate">{m.fullName}</span>
                  <span className="block text-[10px]" style={{ color: YELLOW }}>{plural(m.daysLeft, 'day')} left</span>
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
