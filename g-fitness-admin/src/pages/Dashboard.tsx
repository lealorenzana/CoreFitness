import { useEffect, useRef, useState, type ReactNode, type CSSProperties } from 'react';
import { CountUp, Skel, Spark, Initials } from '../components/ui/rd';
import { useNavigate } from 'react-router-dom';
import { useGymModules, moduleOn } from '../hooks/useGymModules';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  ChevronRight, ChevronDown,
  QrCode, Banknote, Award,
} from 'lucide-react';

import DetailSheet from '../components/ui/DetailSheet';
import { winbackSweep, type AtRisk } from '../lib/api/retention';
import { streakNudgeSweep } from '../lib/api/streak';
import { supabase } from '../lib/supabaseClient';
import { runPermitReminders } from '../lib/api/applications';
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
import SkelRows from '../components/ui/SkelRows';

// The gym's own colour, never a fixed violet (Design V2).
const VIOLET     = 'var(--color-primary)';
// Text shades go through variables so light mode (light.css, 0234) can deepen them.
const VIOLET_300 = 'var(--tone-violet-fg, #C4B5FD)';
const YELLOW     = 'var(--color-secondary, #F59E0B)';
const TEXT_MUTED = 'var(--color-text-muted)';
const TEXT_2     = 'var(--color-text-secondary)';
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
        className="appearance-none pl-3 pr-7 py-1.5 rounded-md text-xs font-medium cursor-pointer"
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
  if (pct < 0.25) return HEAT_LEGEND[1];
  if (pct < 0.5)  return HEAT_LEGEND[2];
  if (pct < 0.75) return HEAT_LEGEND[3];
  return HEAT_LEGEND[4];
}
const HEAT_LEGEND = ['var(--color-surface-raised)', 'color-mix(in srgb, var(--color-primary) 22%, transparent)', 'color-mix(in srgb, var(--color-primary) 42%, transparent)',
  'color-mix(in srgb, var(--color-primary) 68%, transparent)', 'var(--color-primary)'];

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
/** Chart tooltips float above the page: solid, and readable in both modes. */
const TIP_STYLE = { backgroundColor: 'var(--surface-solid, #161622)', border: '1px solid var(--color-border)', borderRadius: 8, color: 'var(--color-text-primary)', fontSize: 12 };
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' }).toLowerCase();

/** "06:00" → "6:00 am". Null for anything unreadable rather than a guess. */
function clock(t: string | null | undefined): string | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(t ?? '');
  if (!m) return null;
  const h = Number(m[1]);
  return `${h % 12 === 0 ? 12 : h % 12}:${m[2]} ${h < 12 ? 'am' : 'pm'}`;
}

/** The comparison under a figure, in words: what it is compared with is always said (S5). Computed from
 *  real counts, never invented; null when there is nothing to compare with. */
function deltaWords(c: Compared, kind: 'pct' | 'count', vs: string): string | null {
  if (c.previous === null) return null;
  const diff = c.value - c.previous;
  if (diff === 0) return `no change on ${vs}`;
  if (kind === 'pct' && c.previous > 0) {
    const pct = Math.round((diff / c.previous) * 100);
    if (pct === 0) return `about the same as ${vs}`;
    return `${pct > 0 ? 'up' : 'down'} ${Math.abs(pct)}% on ${vs}`;
  }
  return `${diff > 0 ? 'up' : 'down'} ${Math.abs(diff)} on ${vs}`;
}

/** A section that failed to load says so: empty must only ever mean "nothing here". */
function Failed({ what }: { what: string }) {
  return <p className="dv2-note">Couldn&apos;t load {what}. This is a connection problem, not an empty list.</p>;
}

/** "6:00", "6:30 pm" → hours as a number (6, 18.5). Null for anything unreadable. */
function hourOf(t: string | null | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(t ?? '');
  return m ? Number(m[1]) + Number(m[2]) / 60 : null;
}
/** An ISO time as hours since Manila midnight. */
const manilaHours = (iso: string) => { const d = new Date(new Date(iso).getTime() + 8 * 3600000); return d.getUTCHours() + d.getUTCMinutes() / 60; };
const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12}${h < 12 || h === 24 ? 'am' : 'pm'}`;

/** One line of "Needs you": a dot, what, detail, one action. Amber dot = someone is waiting on you. */
function TaskRow({ waiting, title, detail, action, onClick, testId }: {
  waiting?: boolean; title: string; detail: string; action: string; onClick: () => void; testId: string;
}) {
  return (
    <div className="dv2-row" data-task={testId}>
      <span className={`dv2-dot${waiting ? ' warn' : ''}`} />
      <span className="t"><b>{title}</b><span>{detail}</span></span>
      <button className="dv2-act" onClick={onClick}>{action}</button>
    </div>
  );
}

interface DayItem { id: string; start: number; minutes: number; label: string; sub: string; done: boolean; tip: string }

/**
 * The gym's day (Design V2, mock-up B, owner's pick 2026-11-22): opening to closing along the bottom,
 * check-ins per hour as bars, classes (or 1-on-1 sessions) on their real times, a line for now.
 * Drawn at its real pixel size (ResizeObserver), so words are never stretched.
 *
 * 2026-11-23 (owner: "is it really like this? fix the chart"): the classes floated mid-chart with the hour
 * grid running through them. Now they sit in their own labelled lane under the axis, as blocks as long as
 * the class; the grid stops above the lane; the busiest hour's count is the scale; the part of the day that
 * has passed is faintly shaded; and an empty bar area says so even when classes are on.
 */
function DayLine({ perHour, items, open, close, itemWord }: { perHour: number[]; items: DayItem[]; open: number; close: number; itemWord: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: Math.round(e.contentRect.width), h: Math.round(e.contentRect.height) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const { w: W, h: H } = size;
  const GUT = 30;                       // left gutter: the scale and the lane's name
  const PW = Math.max(1, W - GUT);      // plot width
  const span = Math.max(1, close - open);
  const x = (h: number) => GUT + ((h - open) / span) * PW;
  const hourW = PW / span;
  const LANE_H = 26;
  // Lanes for the class blocks: a block's label sits inside it, after it, or (near closing) before it,
  // so it never runs off the chart; two blocks with their words never overlap.
  const ends: number[] = [];
  const placed = [...items].sort((p, q) => p.start - q.start).map((it) => {
    const left = x(it.start);
    const right = x(it.start + it.minutes / 60);
    const textW = (it.label.length + it.sub.length + 1) * 6.6;
    const blockW = Math.max(6, right - left - 2);
    const side: 'in' | 'after' | 'before' = textW + 16 <= blockW ? 'in' : left + blockW + 7 + textW <= W ? 'after' : 'before';
    const from = side === 'before' ? left - 7 - textW : left;
    const to = side === 'after' ? left + blockW + 7 + textW : left + blockW;
    let lane = ends.findIndex((e) => e + 6 <= from);
    if (lane === -1) { lane = ends.length; ends.push(0); }
    ends[lane] = to;
    return { ...it, lane, left, blockW, side };
  });
  const lanes = Math.min(3, Math.max(items.length ? 1 : 0, ends.length));
  const axisY = H - 18;                          // hour labels under this
  const laneTop = axisY - lanes * LANE_H - (lanes ? 6 : 0);
  const barBottom = lanes ? laneTop - 8 : axisY;
  const barTop = 18;
  const slice = perHour.slice(Math.floor(open), Math.ceil(close));
  const peak = Math.max(0, ...slice);
  const max = Math.max(1, peak);
  const nowH = manilaHours(new Date().toISOString());
  const step = hourW < 44 ? 2 : 1;
  const passedTo = Math.min(Math.max(nowH, open), close);
  const noCheckIns = slice.every((v) => v === 0);
  return (
    <div ref={ref} className="dv2-day" data-day-line>
      {W > 0 && H > 0 && (
        <svg width={W} height={H} role="img" aria-label={`Check-ins per hour today, with ${itemWord} on their times`}>
          {/* the part of today that has already happened */}
          {passedTo > open && <rect className="passed" x={x(open)} y={0} width={x(passedTo) - x(open)} height={axisY} />}
          {/* the scale: the busiest hour so far, and the floor */}
          <line className="grid-h" x1={GUT} x2={W} y1={barTop} y2={barTop} />
          {peak > 0 && <text className="scale" x={GUT - 6} y={barTop + 4} textAnchor="end">{peak}</text>}
          <line className="base" x1={GUT} x2={W} y1={barBottom} y2={barBottom} />
          <text className="scale" x={GUT - 6} y={barBottom + 4} textAnchor="end">0</text>
          {Array.from({ length: Math.floor(span) + 1 }, (_, i) => Math.ceil(open) + i).filter((h) => h <= close).map((h) => (
            <g key={h}>
              <line className="grid-line" x1={x(h)} x2={x(h)} y1={barTop} y2={barBottom} />
              {(h - Math.ceil(open)) % step === 0 && h < close && <text x={x(h)} y={H - 4} textAnchor={h === Math.ceil(open) ? 'start' : 'middle'}>{hourLabel(h)}</text>}
            </g>
          ))}
          {Array.from({ length: 24 }, (_, h) => h).filter((h) => h >= Math.floor(open) && h < close && perHour[h] > 0).map((h) => {
            const bh = Math.max(3, (perHour[h] / max) * (barBottom - barTop));
            const bw = Math.min(30, Math.max(4, hourW * 0.6));
            const bx = x(h) + (hourW - bw) / 2;
            return (
              <g key={h}>
                <rect className={`bar${h > nowH ? ' ahead' : ''}`} style={{ '--i': h - Math.floor(open) } as CSSProperties} x={bx} y={barBottom - bh} width={bw} height={bh} rx={3}
                  data-tip={`${hourLabel(h)} to ${hourLabel(h + 1)}: ${perHour[h]} check-in${perHour[h] === 1 ? '' : 's'}`} />
                {bw >= 14 && perHour[h] < peak && <text className="bar-n" x={bx + bw / 2} y={barBottom - bh - 5} textAnchor="middle">{perHour[h]}</text>}
              </g>
            );
          })}
          {noCheckIns && (
            <text className="empty" x={GUT + PW / 2} y={(barTop + barBottom) / 2} textAnchor="middle">
              {nowH < open ? `Opens at ${hourLabel(Math.ceil(open))}. Check-ins show here hour by hour.` : 'No check-ins yet today. They show here hour by hour.'}
            </text>
          )}
          {lanes > 0 && (
            <g>
              <line className="lane-top" x1={0} x2={W} y1={laneTop - 3} y2={laneTop - 3} />
              <text className="lane-name" x={0} y={laneTop + 15}>{itemWord === 'classes' ? 'Class' : '1-on-1'}</text>
            </g>
          )}
          {placed.filter((it) => it.lane < 3).map((it) => {
            const y = laneTop + it.lane * LANE_H;
            return (
              <g key={it.id} className={`cls${it.done ? ' done' : ''}`} data-tip={it.tip}>
                <rect className="cls-block" x={it.left + 1} y={y} width={it.blockW} height={LANE_H - 6} rx={4} />
                <text x={it.side === 'in' ? it.left + 8 : it.side === 'after' ? it.left + it.blockW + 7 : it.left - 6}
                  textAnchor={it.side === 'before' ? 'end' : 'start'} y={y + 14}>{it.label} <tspan className="sub">{it.sub}</tspan></text>
              </g>
            );
          })}
          {nowH >= open && nowH <= close && (
            <g>
              <line className="now-line" x1={x(nowH)} x2={x(nowH)} y1={0} y2={axisY} />
              <text className="now-text" x={x(nowH) + 4} y={11}>now</text>
            </g>
          )}
        </svg>
      )}
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

  const [hours, setHours] = useState<{ open: string | null; close: string | null; openH: number | null; closeH: number | null }>({ open: null, close: null, openH: null, closeH: null });
  /** Which tab of the lower box is showing. */
  const [tab, setTab] = useState<'month' | 'revenue' | 'busy'>('month');
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
    getGymSettings().then((s) => setHours({ open: clock(s?.opening_time), close: clock(s?.closing_time), openH: hourOf(s?.opening_time), closeH: hourOf(s?.closing_time) })).catch(() => {});
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
    // Accounts whose 7 days are up (0225): erased, and their Storage files removed. Only those; never throws.
    void supabase.functions.invoke('erase-accounts').then(() => undefined, () => undefined);
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
      <TaskRow key="bookings" testId="bookings" waiting
        title={`${plural(b.count, 'booking')} to decide`}
        detail={b.oldestDays == null ? 'classes and 1-on-1 requests' : b.oldestDays === 0 ? 'oldest asked today' : `oldest waiting ${plural(b.oldestDays, 'day')}`}
        action="Review" onClick={() => navigate('/personal-training')} />) });
  }
  if (needs?.signups && needs.signups.count > 0) {
    const s = needs.signups;
    const rest = s.count - s.names.length;
    tasks.push({ key: 'signups', count: s.count, node: (
      <TaskRow key="signups" testId="signups" waiting
        title={`${plural(s.count, 'sign-up')} waiting`}
        detail={`${s.names.join(', ')}${rest > 0 ? `, +${rest}` : ''}`}
        action="Approve" onClick={() => navigate('/members?pending=1')} />) });
  }
  if (needs?.payments && needs.payments.count > 0) {
    const p = needs.payments;
    tasks.push({ key: 'payments', count: p.count, node: (
      <TaskRow key="payments" testId="payments" waiting
        title={`${plural(p.count, 'online payment')} to confirm`}
        detail={`${p.methods.join(', ') || 'Sent by members'} · ${peso(p.total)}`}
        action="Confirm" onClick={() => navigate('/payments')} />) });
  }
  if (needs?.requests && needs.requests.count > 0) {
    const r = needs.requests;
    const what = r.freezes && r.cancels ? 'freeze / cancel' : r.freezes ? 'freeze' : 'cancel';
    tasks.push({ key: 'requests', count: r.count, node: (
      <TaskRow key="requests" testId="requests"
        title={`${plural(r.count, `${what} request`)}`}
        detail="the refund quote is ready to check"
        action="Decide" onClick={() => navigate('/members')} />) });
  }
  if (needs?.expiring && needs.expiring.length > 0) {
    const e = needs.expiring;
    const first = e[0];
    tasks.push({ key: 'expiring', count: e.length, node: (
      <TaskRow key="expiring" testId="expiring"
        title={`${plural(e.length, 'membership')} end${e.length === 1 ? 's' : ''} this week`}
        detail={`${first.fullName} in ${plural(first.daysLeft, 'day')}`}
        action="View" onClick={() => setPanel('expiring')} />) });
  }
  // Coach dues (0235): a coach with an unpaid month before this one — the same rule as Trainers → Coach pay.
  if (needs?.coachDues && needs.coachDues.count > 0) {
    const d = needs.coachDues;
    const rest = d.count - d.names.length;
    tasks.push({ key: 'coachdues', count: d.count, node: (
      <TaskRow key="coachdues" testId="coachdues"
        title={`${plural(d.count, 'coach', 'coaches')} behind on dues`}
        detail={`${d.names.join(', ')}${rest > 0 ? `, +${rest}` : ''}`}
        action="View" onClick={() => navigate('/trainers?view=pay')} />) });
  }
  // Gym chat (0246): messages members reported — the same list the chat's Reports button opens.
  if (needs?.chatReports && needs.chatReports.count > 0) {
    const c = needs.chatReports;
    tasks.push({ key: 'chatreports', count: c.count, node: (
      <TaskRow key="chatreports" testId="chatreports" waiting
        title={`${plural(c.count, 'chat message')} reported`}
        detail="members flagged them in the gym chat"
        action="Review" onClick={() => navigate('/gym-chat?reports=1')} />) });
  }
  const todo = tasks.reduce((s, t) => s + t.count, 0);
  const needsFailed = needs !== null && [needs.bookings, needs.signups, needs.payments, needs.requests, needs.expiring].some((x) => x === null);

  const dateLine = new Date().toLocaleDateString('en-PH', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Manila' });

  const classes = today?.classes ?? null;
  const sessionsToday = today?.sessions ?? null;
  const stillToCome = classes ? classes.filter((c) => !c.done).length : 0;

  // What goes on the day line's lane: classes, or 1-on-1 sessions where the gym runs no classes.
  const dayItems: DayItem[] = classesOn
    ? (classes ?? []).map((c) => {
      const full = c.capacity > 0 && c.booked >= c.capacity;
      const seats = c.capacity > 0 ? (full && !c.done ? 'Full' : `${c.booked}/${c.capacity}`) : String(c.booked);
      return { id: c.id, start: manilaHours(c.startsAt), minutes: c.minutes, label: c.name, sub: seats, done: c.done,
        tip: `${timeOf(c.startsAt)} · ${c.name} · ${[c.coach ?? 'No coach yet', c.location].filter(Boolean).join(' · ')} · ${seats}${c.done ? ' · done' : ''}` };
    })
    : (sessionsToday ?? []).map((x) => ({ id: x.id, start: manilaHours(x.startsAt), minutes: x.minutes, label: x.member ?? 'A member',
      sub: x.coach ? `with ${x.coach}` : '', done: x.done, tip: `${timeOf(x.startsAt)} · ${x.member ?? 'A member'}${x.coach ? ` with ${x.coach}` : ''}${x.done ? ' · done' : ''}` }));
  // The range drawn: the gym's hours when set, widened to hold anything that happened outside them.
  const activeHours = (today?.perHour ?? []).map((v, h) => (v > 0 ? h : null)).filter((h): h is number => h !== null);
  const dayOpen = Math.floor(Math.min(hours.openH ?? 6, ...activeHours, ...dayItems.map((i) => i.start)));
  const dayClose = Math.ceil(Math.max(hours.closeH ?? 22, ...activeHours.map((h) => h + 1), ...dayItems.map((i) => i.start + i.minutes / 60)));

  return (
    <div className="dv2" data-dashboard="v2">
      <div className="dv2-head">
        <div className="min-w-0">
          <h1>Today</h1>
          <p className="truncate">{dateLine}{hours.open && hours.close ? ` · open ${hours.open} to ${hours.close}` : ''}</p>
        </div>
        <div className="dv2-actions">
          <PinGymChip />
          <button className="dv2-btn" onClick={() => navigate('/attendance')}><QrCode size={14} /> Check in</button>
          <button className="dv2-btn go" onClick={() => navigate('/payments?record=new')}><Banknote size={14} /> Record payment</button>
        </div>
      </div>

      <div className="dv2-grid">
        <div className="dv2-left">
          {/* The day so far: the hero number, then the day from opening to closing. */}
          <section className="dv2-box" aria-label="The day so far">
            <header>
              <h2>The day so far</h2>
              <span className="dv2-aside">bars are check-ins per hour</span>
            </header>
            <div className="dv2-figs">
              <button className="dv2-fig as-btn" onClick={() => navigate('/attendance')} data-tip="Everyone checked in today, at the desk, kiosk or by QR">
                <div className="l">Checked in today</div>
                <div className="n hero">{today ? (today.checkIns === null ? '—' : <CountUp value={today.checkIns} />) : <Skel w={56} h={40} />}</div>
              </button>
              <div className="dv2-fig">
                <div className="l">Walk-ins</div>
                <div className="n">{today ? (today.walkIns === null ? '—' : <CountUp value={today.walkIns} />) : <Skel w={36} h={24} />}</div>
                <div className="d">guests, apart from members</div>
              </div>
              <button className="dv2-fig as-btn" onClick={() => navigate('/payments')} data-tip="Cash payments recorded today, from the same figure as End of day">
                <div className="l">Cash today</div>
                <div className="n">{today ? (today.cash ? peso(today.cash.cashIn) : '—') : <Skel w={72} h={24} />}</div>
                <div className="d">{today?.cash ? `${plural(today.cash.payments, 'payment')} · ${today.cash.closed ? 'drawer closed' : 'drawer open'}` : ''}</div>
              </button>
              {classesOn ? (
                <div className="dv2-fig">
                  <div className="l">Classes</div>
                  <div className="n">{classes === null ? '—' : classes.length === 0 ? 'None' : `${stillToCome} of ${classes.length}`}</div>
                  <div className="d">{classes && classes.length > 0 ? 'still to come' : <button className="dv2-link" onClick={() => navigate('/schedule')}>Open the schedule</button>}</div>
                </div>
              ) : (
                <div className="dv2-fig">
                  <div className="l">1-on-1 sessions</div>
                  <div className="n">{sessionsToday === null ? '—' : sessionsToday.length === 0 ? 'None' : `${sessionsToday.filter((x) => !x.done).length} of ${sessionsToday.length}`}</div>
                  <div className="d">{sessionsToday && sessionsToday.length > 0 ? 'still to come' : <button className="dv2-link" onClick={() => navigate('/personal-training?tab=sessions')}>Open Personal training</button>}</div>
                </div>
              )}
            </div>
            <div className="flex-1 min-h-0 flex flex-col" data-today-classes={classesOn ? '' : undefined} data-today-sessions={classesOn ? undefined : ''}>
              {today === null ? (
                <SkelRows label="Loading…" />
              ) : today.perHour === null ? (
                <Failed what="today's check-ins" />
              ) : (classesOn ? classes : sessionsToday) === null ? (
                <Failed what={classesOn ? "today's classes" : "today's sessions"} />
              ) : (
                <div className="dv2-dayempty">
                  <DayLine perHour={today.perHour} items={dayItems} open={dayOpen} close={dayClose} itemWord={classesOn ? 'classes' : 'sessions'} />
                </div>
              )}
              {/* The lane's words, for screen readers and the checks (the drawing is an image). */}
              <ul className="sr-only">
                {dayItems.map((i) => <li key={i.id}>{i.tip}</li>)}
              </ul>
            </div>
          </section>

          <div className="dv2-low">
            {/* This month, Revenue by month and Busy hours: one box with tabs instead of three. */}
            <section className="dv2-box">
              <div className="dv2-tabs" role="tablist">
                <button role="tab" aria-selected={tab === 'month'} onClick={() => setTab('month')}>This month</button>
                <button role="tab" aria-selected={tab === 'revenue'} onClick={() => setTab('revenue')}>Revenue by month</button>
                <button role="tab" aria-selected={tab === 'busy'} onClick={() => setTab('busy')}>Busy hours</button>
                {tab === 'revenue' && (
                  <span className="dv2-aside">
                    <span className="dv2-seg">
                      {(['bars', 'trend'] as const).map((m) => (
                        <button key={m} aria-pressed={chartMode === m} onClick={() => setChartMode(m)}
                          data-tip={m === 'bars' ? 'Each month as a bar' : 'The same months as a line'}>{m === 'bars' ? 'Bars' : 'Line'}</button>
                      ))}
                    </span>
                    <FilterSelect value={revenueYear} options={years} onChange={setRevenueYear} />
                  </span>
                )}
                {tab === 'busy' && <span className="dv2-aside">last 30 days</span>}
              </div>

              {tab === 'month' && (
                <div className="dv2-mfig" data-month-numbers>
                  <button className="dv2-fig as-btn" onClick={() => navigate('/revenue')}
                    data-tip={`Completed payments from the 1st to today, compared with the same days of ${month?.previousLabel ?? 'last month'}`}>
                    <div className="l">Revenue, {month?.monthLabel ?? 'this month'} so far</div>
                    <div className="n">{month ? (month.revenue ? peso(month.revenue.value) : '—') : <Skel w={96} h={26} />}</div>
                    <div className="d">{month?.revenue ? deltaWords(month.revenue, 'pct', `the same days of ${month.previousLabel}`) : ''}</div>
                    {month?.revenue && (
                      <div className="spark" data-revenue-trend>
                        <Spark values={month.revenue.daily.cur} compare={month.revenue.daily.prev}
                          label={`Running total: ${peso(month.revenue.value)} so far this month, against ${peso(month.revenue.previous ?? 0)} by the same day of ${month.previousLabel} (dashed)`} />
                      </div>
                    )}
                  </button>
                  <button className="dv2-fig as-btn" onClick={() => navigate('/members')} data-tip="Memberships active right now">
                    <div className="l">Active members</div>
                    <div className="n">{month ? (month.activeMembers ? <CountUp value={month.activeMembers.value} /> : '—') : <Skel w={48} h={26} />}</div>
                    <div className="d">{month?.activeMembers ? (month.activeMembers.joinedThisMonth > 0 ? `${month.activeMembers.joinedThisMonth} joined in ${month.monthLabel}` : `no one new in ${month.monthLabel} yet`) : ''}</div>
                  </button>
                  <button className="dv2-fig as-btn" onClick={() => setPanel('attendance')} data-tip="Check-ins in the last 30 days, compared with the 30 before">
                    <div className="l">Visits, last 30 days</div>
                    <div className="n">{month ? (month.visits30 ? <CountUp value={month.visits30.value} /> : '—') : <Skel w={48} h={26} />}</div>
                    <div className="d">{month?.visits30 ? deltaWords(month.visits30, 'pct', 'the 30 days before') : ''}</div>
                  </button>
                  <button className="dv2-fig as-btn" onClick={() => setPanel('members')}
                    data-tip={`New members from the 1st to today, compared with the same days of ${month?.previousLabel ?? 'last month'}`}>
                    <div className="l">New members, {month?.monthLabel ?? 'this month'} so far</div>
                    <div className="n">{month ? (month.newMembers ? <CountUp value={month.newMembers.value} /> : '—') : <Skel w={36} h={26} />}</div>
                    <div className="d">{month?.newMembers ? deltaWords(month.newMembers, 'count', `the same days of ${month.previousLabel}`) : ''}</div>
                  </button>
                </div>
              )}

              {tab === 'revenue' && (
                <div className="flex-1 min-h-0 flex flex-col" data-revenue-chart>
                  <div className="dv2-chart">
                    <ResponsiveContainer width="100%" height="100%">
                      {chartMode === 'bars' ? (
                        <BarChart data={revenueData}>
                          <CartesianGrid stroke={BORDER as string} vertical={false} />
                          <XAxis dataKey="month" tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} width={52}
                            tickFormatter={(v: number) => (v >= 1000 ? `₱${Math.round(v / 1000)}k` : `₱${v}`)} />
                          <Tooltip formatter={(v) => peso(Number(v) || 0)} contentStyle={TIP_STYLE} cursor={{ fill: 'rgb(var(--hair-rgb, 255 255 255) / 0.05)' }} />
                          <Bar dataKey="revenue" fill={VIOLET} radius={[3, 3, 0, 0]} maxBarSize={32} />
                        </BarChart>
                      ) : (
                        <LineChart data={revenueData}>
                          <CartesianGrid stroke={BORDER as string} vertical={false} />
                          <XAxis dataKey="month" tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} width={52}
                            tickFormatter={(v: number) => (v >= 1000 ? `₱${Math.round(v / 1000)}k` : `₱${v}`)} />
                          <Tooltip formatter={(v) => peso(Number(v) || 0)} contentStyle={TIP_STYLE} />
                          <Line type="monotone" dataKey="revenue" stroke={VIOLET} strokeWidth={2} dot={{ fill: VIOLET, r: 3 }} activeDot={{ r: 5 }} />
                        </LineChart>
                      )}
                    </ResponsiveContainer>
                  </div>
                  <p className="dv2-note" style={{ paddingTop: 8, paddingBottom: 12 }}>{peso(yearRevenue)} across {revenueYear}</p>
                </div>
              )}

              {tab === 'busy' && (
                <button className="dv2-heat text-left" onClick={() => setPanel('heatmap')} data-tip="Check-ins by day and time over the last 30 days. Open for the numbers">
                  <div className="flex-1 min-h-0 w-full">
                    {heatmapState === 'loading' ? (
                      <SkelRows label="Loading…" />
                    ) : heatmapState === 'failed' ? (
                      <Failed what="check-ins" />
                    ) : heatmap.length === 0 ? (
                      <p className="text-[12px]" style={{ color: TEXT_MUTED }}>No check-ins in the last 30 days.</p>
                    ) : <HeatmapGrid cells={heatmap} compact />}
                  </div>
                  {heatmapState === 'ready' && busiestCell && busiestCell.visits > 0 && (
                    <p className="text-[12px] flex-shrink-0 truncate" style={{ color: TEXT_2 }}>
                      Busiest: {busiestCell.day} around {busiestCell.hour} · lighter is quieter
                    </p>
                  )}
                </button>
              )}
            </section>

            <section className="dv2-box">
              <header>
                <h2>Members to watch{Array.isArray(watch) && watch.length > 0 && <span className="dv2-count">{watch.length}</span>}</h2>
                {Array.isArray(watch) && watch.length > 0 && (
                  <span className="dv2-aside"><button className="dv2-link" onClick={() => navigate('/retention')} data-tip="Everyone at risk, and the win-back messages">All</button></span>
                )}
              </header>
              <div className="dv2-scroll" data-members-to-watch>
                {watch === 'loading' ? (
                  <SkelRows label="Loading…" />
                ) : watch === null ? (
                  <Failed what="who might leave" />
                ) : watch === undefined ? (
                  <p className="dv2-note">Risk scores appear once the retention update is live.</p>
                ) : watch.length === 0 ? (
                  <div className="dv2-empty"><b>No one looks likely to leave</b><span>Members who stop coming will show here.</span></div>
                ) : watch.slice(0, 6).map((m) => (
                  <button key={m.memberId} onClick={() => navigate(`/members?open=${m.memberId}`)} className="dv2-row">
                    {m.photoUrl ? <Initials name={m.name} photo={m.photoUrl} size={32} /> : <span className="dv2-av">{m.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}</span>}
                    <span className="t"><b>{m.name}</b><span>{m.reasons[0] ?? 'needs a check-in'}</span></span>
                    <span className="dv2-state"><span className={`dv2-dot${m.level === 'high' ? ' warn' : ''}`} />{m.level === 'high' ? 'High' : 'Medium'}</span>
                  </button>
                ))}
              </div>
            </section>
          </div>
        </div>

        {/* Needs you: the queue, one action each. */}
        <section className="dv2-box" aria-label="Needs you">
          <header>
            <h2>Needs you{needs && todo > 0 && <span className="dv2-count">{todo} to do</span>}</h2>
            {needs && todo === 0 && <span className="dv2-aside">all clear</span>}
          </header>
          <div className="dv2-scroll" data-needs-you>
            {needs === null ? (
              <SkelRows label="Loading…" />
            ) : tasks.length === 0 ? (
              <div className="dv2-empty"><b>Nothing is waiting for you</b><span>New bookings, sign-ups and payments will show here.</span></div>
            ) : tasks.map((t) => t.node)}
            {needsFailed && <p className="dv2-note">Part of this list couldn&apos;t load. Open the pages in the sidebar to be sure.</p>}
          </div>
          <button className="dv2-row" style={{ borderTop: '1px solid var(--color-border)', borderBottom: 0 }} onClick={() => setPanel('trainers')}
            data-tip="Coaches ranked by sessions run in the last 90 days, then by rating">
            <Award size={14} style={{ color: TEXT_MUTED }} />
            <span className="t"><b>Coach ranking</b><span>who ran the most sessions in 90 days</span></span>
            <ChevronRight size={14} style={{ color: TEXT_MUTED }} />
          </button>
        </section>
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
                <XAxis dataKey="month" stroke={TEXT_MUTED as string} tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} stroke={TEXT_MUTED as string} tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={TIP_STYLE} />
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
                <XAxis dataKey="day" stroke={TEXT_MUTED as string} tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} stroke={TEXT_MUTED as string} tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={TIP_STYLE}
                  cursor={{ fill: 'rgb(var(--hair-rgb, 255 255 255) / 0.05)' }} />
                <Bar dataKey="count" name="Check-ins" fill={VIOLET} radius={[3, 3, 0, 0]} maxBarSize={36} />
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
              Ranked by sessions run in the last 90 days (approved PT sessions and classes
              taught, both already past), then by the gym&apos;s evaluation average.
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
