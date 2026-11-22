import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { detail } from '../components/DetailLayer';
import {
  capacity as getCapacity, checkinsDaily, funnel as getFunnel, getOverview, growth as getGrowth, gymHealth, listDue, listEvents, listGyms,
  listRevenue, listSupportGrants, listTickets, paymentClaims,
  type CapacityRow, type CheckinDay, type Funnel, type GrowthMonth, type GymDue, type GymHealth, type Overview as O, type PaymentClaim,
  type PlatformEvent, type PlatformGym, type PlatformTicket, type RevenueMonth, type SupportGrant,
} from '../lib/platform';
import GymMark from '../components/GymMark';
import Modal from '../components/Modal';
import CheckinsBreakdown from '../components/CheckinsBreakdown';
import EventDetail from '../components/EventDetail';
import DemoNotice from '../components/DemoNotice';
import './overview.css';
import SkelRows from '../components/ui/SkelRows';

/**
 * The platform owner's morning (2026-11-22 rebuild; the owner: "the best statistics showing and all that a super
 * admin needs is everything on the Overview"). One screen, no decoration that is not a number:
 *   - the band: recurring revenue, collected this month, gyms live, members, check-ins, paying gyms, each with
 *     its change and a twelve-month (or thirty-day) line;
 *   - revenue collected and recurring revenue over twelve months, and recurring revenue split by plan;
 *   - check-ins every day for thirty days;
 *   - gyms by size with how full each plan is, gym health with the reasons, applying-to-paying, the free tier;
 *   - a rail: what needs the owner, then what happened.
 * Every figure is the database's (platform_overview, _revenue, _growth, _funnel, _gym_health, _checkins_daily,
 * _capacity, gyms_due, platform_gyms). Counts only: the platform processes gyms' data, it does not read members.
 * A section whose read failed says so; a missing number is a dash, never a guess.
 */
const peso = (v: string | number | null | undefined) => `₱${Number(v ?? 0).toLocaleString('en-PH', { maximumFractionDigits: 0 })}`;
const short = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : String(Math.round(v)));
const n0 = (v: number) => v.toLocaleString('en-PH');
const monthLabel = (m: string) => new Date(`${m.slice(0, 7)}-01T00:00:00`).toLocaleDateString('en-PH', { month: 'short' });
const monthLong = (m: string) => new Date(`${m.slice(0, 7)}-01T00:00:00`).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });
/** This month in Manila, never toISOString()'s UTC month (CLAUDE.md). */
const manilaMonth = () => new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 7);
const ago = (iso: string | null) => {
  if (!iso) return 'never';
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
};
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const signed = (v: number, fmt: (x: number) => string = n0) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${fmt(Math.abs(v))}`;
const bytes = (b: number) => (b >= 1073741824 ? `${(b / 1073741824).toFixed(1)} GB` : b >= 1048576 ? `${Math.round(b / 1048576)} MB` : `${Math.round(b / 1024)} KB`);

/** A small line of a series: the shape of the trend, the last point marked. Nothing drawn without two points. */
function Spark({ values }: { values: number[] }) {
  if (values.length < 2) return <span className="ox-spark" />;
  const lo = Math.min(...values), hi = Math.max(...values), span = hi - lo || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * 100, 28 - ((v - lo) / span) * 24 - 2]);
  const last = pts[pts.length - 1]!;
  return (
    <svg className="ox-spark" viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true">
      <polyline points={pts.map((p) => p.join(',')).join(' ')} />
      <circle cx={last[0]} cy={last[1]} r="2.2" />
    </svg>
  );
}

type Cell = { label: string; value: string; delta?: { text: string; dir: 'up' | 'down' | 'flat' }; foot: string; spark: number[]; to: string; tip: string; onOpen?: () => void };

export default function Overview() {
  const [o, setO] = useState<O | null | undefined>(undefined);
  const [rev, setRev] = useState<RevenueMonth[]>([]);
  const [due, setDue] = useState<GymDue[]>([]);
  const [gyms, setGyms] = useState<PlatformGym[]>([]);
  const [events, setEvents] = useState<PlatformEvent[]>([]);
  const [health, setHealth] = useState<GymHealth[] | null>(null);
  const [grow, setGrow] = useState<GrowthMonth[] | null>(null);
  const [fun, setFun] = useState<Funnel | null>(null);
  const [daily, setDaily] = useState<CheckinDay[] | null>(null);
  const [cap, setCap] = useState<CapacityRow[] | null>(null);
  const [grants, setGrants] = useState<SupportGrant[]>([]);
  const [claims, setClaims] = useState<PaymentClaim[]>([]);
  const [tickets, setTickets] = useState<PlatformTicket[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [why, setWhy] = useState(false);
  const [ev, setEv] = useState<PlatformEvent | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const [a, b, c, d, e] = await Promise.all([
          getOverview(), listRevenue(12).catch(() => []), listDue(14).catch(() => []), listGyms().catch(() => []), listEvents(12).catch(() => []),
        ]);
        if (!alive) return;
        setO(a); setRev(b); setDue(c); setGyms(d); setEvents(e);
        const [h, g, f, dd, cp] = await Promise.all([gymHealth().catch(() => null), getGrowth(12).catch(() => null), getFunnel().catch(() => null),
          checkinsDaily(30).catch(() => null), getCapacity().catch(() => null)]);
        if (alive) { setHealth(h); setGrow(g); setFun(f); setDaily(dd); setCap(cp); }
        const [sg, pc, tk] = await Promise.all([listSupportGrants().catch(() => []), paymentClaims('pending').catch(() => []), listTickets().catch(() => [])]);
        if (alive) { setGrants(sg); setClaims(pc); setTickets(tk); }
      } catch (err) {
        if (alive) { setError(err instanceof Error ? err.message : 'The overview could not load'); setO(null); }
      }
    })();
    return () => { alive = false; };
  }, []);

  if (o === undefined) return <SkelRows label="Loading the service…" />;
  if (!o) return <p className="err">{error ?? 'The overview could not load.'}</p>;

  // ---- series ----
  const months = [...rev].sort((a, b) => a.month.localeCompare(b.month)).slice(-12);
  const thisMonth = manilaMonth();
  const growth = grow ? [...grow].sort((a, b) => a.month.localeCompare(b.month)) : [];
  const lastG = growth[growth.length - 1], prevG = growth[growth.length - 2], firstG = growth[0];
  const mrr = lastG ? Number(lastG.mrr) : null;
  const mrrPrev = prevG ? Number(prevG.mrr) : null;
  const revNow = Number(o.revenue_this_month);
  const prevMonthKey = (() => { const d = new Date(`${thisMonth}-01T00:00:00`); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 7); })();
  const revPrev = months.find((m) => m.month.startsWith(prevMonthKey));
  const days = daily ? [...daily].sort((a, b) => a.day.localeCompare(b.day)) : [];
  const paying = fun?.paying ?? null;

  const dir = (v: number) => (v > 0 ? 'up' : v < 0 ? 'down' : 'flat') as 'up' | 'down' | 'flat';
  const cells: Cell[] = [
    { label: 'Recurring revenue', value: mrr !== null ? peso(mrr) : '—',
      delta: mrr !== null && mrrPrev !== null ? { text: `${signed(mrr - mrrPrev, (x) => peso(x))} vs last month`, dir: dir(mrr - mrrPrev) } : undefined,
      foot: paying ? `${peso((mrr ?? 0) / Math.max(1, paying))} a paying gym` : 'What gyms pay each month, by plan', spark: growth.map((m) => Number(m.mrr)), to: '/growth',
      tip: 'What the gyms on paid plans pay each month (0136). Twelve months of it, as the line.' },
    { label: 'Revenue this month', value: peso(revNow),
      delta: revPrev ? { text: `${signed(revNow - Number(revPrev.total), (x) => peso(x))} vs ${monthLabel(revPrev.month)}`, dir: dir(revNow - Number(revPrev.total)) } : undefined,
      foot: `${peso(o.revenue_all_time)} all time`, spark: months.map((m) => Number(m.total)), to: '/money',
      tip: 'What gyms paid Core Fitness this Manila month, by the day it was paid. Click for Money.' },
    { label: 'Gyms live', value: String(o.gyms_live),
      delta: o.new_gyms_30d ? { text: `+${o.new_gyms_30d} in 30 days`, dir: 'up' } : undefined,
      foot: `${o.gyms} in all · ${o.gyms_suspended} suspended`, spark: growth.map((m) => m.gyms), to: '/gyms',
      tip: 'Gyms open for business: not suspended, not read-only.' },
    { label: 'Members', value: n0(o.members),
      delta: lastG && firstG && growth.length > 1 ? { text: `${signed(lastG.members - firstG.members)} in ${growth.length} months`, dir: dir(lastG.members - firstG.members) } : undefined,
      foot: `${n0(o.trainers)} coaches · ${n0(o.staff)} on desks`, spark: growth.map((m) => m.members), to: '/gyms',
      tip: 'Active members across every gym. Coaches and desk staff are counted separately.' },
    { label: 'Check-ins, 30 days', value: n0(o.checkins_30d), foot: o.gyms_live ? `${n0(Math.round(o.checkins_30d / Math.max(1, o.gyms_live) / 30))} a day per live gym · where?` : 'Across every gym',
      spark: days.map((d) => d.checkins), to: '/gyms', onOpen: () => setWhy(true),
      tip: 'Visits recorded at every gym\'s desk or kiosk in the last 30 days. Click to see which gyms and which days.' },
    { label: 'Paying gyms', value: paying !== null ? String(paying) : '—',
      foot: fun && fun.applied ? `${pct(fun.paying, fun.applied)}% of gyms that applied` : 'Of the gyms that applied', spark: [], to: '/money',
      tip: 'Gyms on a paid plan that are paid up (0136 funnel).' },
  ];

  // ---- needs you (wording kept: the shell check reads it) ----
  const risky = (health ?? []).filter((x) => x.level === 'high');
  const supportOpen = tickets.filter((t) => t.status !== 'closed' && t.last_from === 'gym');
  const todo: { tone: 'act' | 'warn' | 'info'; text: string; sub: string; to: string }[] = [];
  for (const g of grants) todo.push({ tone: 'act', text: `${g.gym_name} opened its doors to you`, sub: g.reason ? `“${g.reason}”. Look inside, read-only` : 'Look inside, read-only', to: `/support-access/${g.gym_id}` });
  if (claims.length > 0) todo.push({ tone: 'act', text: `${claims.length} payment${claims.length === 1 ? '' : 's'} to verify`, sub: claims.slice(0, 2).map((c) => `${c.gym_name} · ref ${c.reference}`).join(' · '), to: '/money' });
  if (o.applications_waiting > 0) todo.push({ tone: 'act', text: `${o.applications_waiting} gym${o.applications_waiting === 1 ? '' : 's'} asking to join`, sub: 'Let them in or say why not', to: '/applications' });
  if (supportOpen.length > 0) todo.push({ tone: 'act', text: `${supportOpen.length} support question${supportOpen.length === 1 ? '' : 's'} waiting`, sub: supportOpen.slice(0, 2).map((t) => `${t.gym_name}: ${t.subject}`).join(' · '), to: '/support' });
  for (const g of due.filter((d) => d.days_left < 0).slice(0, 3)) todo.push({ tone: 'warn', text: `${g.name} is ${-g.days_left} days overdue`, sub: `${g.plan} · record a payment or suspend`, to: '/money' });
  for (const g of due.filter((d) => d.days_left >= 0).slice(0, 3)) todo.push({ tone: 'info', text: `${g.name} is due in ${g.days_left} day${g.days_left === 1 ? '' : 's'}`, sub: `${g.plan} · paid to ${new Date(g.paid_until).toLocaleDateString('en-PH', { day: 'numeric', month: 'short' })}`, to: '/money' });
  for (const g of risky.slice(0, 3)) todo.push({ tone: 'warn', text: `${g.name} may be leaving`, sub: g.reasons.slice(0, 2).join(' · '), to: `/gyms/${g.gym_id}` });
  if (o.gyms_unclaimed > 0) todo.push({ tone: 'info', text: `${o.gyms_unclaimed} gym${o.gyms_unclaimed === 1 ? '' : 's'} with no owner`, sub: 'Nobody can sign in. Invite the owner', to: '/gyms' });
  if (o.gyms_unset_up > 0) todo.push({ tone: 'info', text: `${o.gyms_unset_up} gym${o.gyms_unset_up === 1 ? '' : 's'} not set up yet`, sub: 'The owner has not finished setup', to: '/gyms' });
  if (o.crashes_open > 0) todo.push({ tone: 'warn', text: `${o.crashes_open} open crash report${o.crashes_open === 1 ? '' : 's'}`, sub: 'Read them on Platform', to: '/platform' });

  return (
    <>
      <DemoNotice />
      <div className="ox" data-va-keep>
        {/* ---- the band ---- */}
        <div className="ox-band" role="list">
          {cells.map((c) => (
            <Link key={c.label} to={c.to} role="listitem" className="ox-cell" data-tip={c.tip}
              onClick={c.onOpen ? (e) => { e.preventDefault(); c.onOpen!(); } : undefined}>
              <span className="ox-label">{c.label}</span>
              <span className="ox-value">{c.value}</span>
              {c.delta ? <span className={`ox-delta ${c.delta.dir}`}>{c.delta.text}</span> : <span className="ox-delta flat">{' '}</span>}
              <span className="ox-foot">{c.foot}</span>
              <Spark values={c.spark} />
            </Link>
          ))}
        </div>

        <RevenueBox months={months} growth={growth} gyms={gyms} thisMonth={thisMonth} mrr={mrr} />
        <CheckinsBox days={days} failed={daily === null} total={o.checkins_30d} live={o.gyms_live} onWhy={() => setWhy(true)} />

        {/* ---- the rail ---- */}
        <section className="ox-box ox-rail">
          <div className="ox-head"><h2>Needs you</h2>{todo.length > 0 && <span className="count">{todo.length}</span>}</div>
          <div className="ox-scroll ox-todo">
            {todo.length === 0 ? <p className="ox-quiet">All clear. Nothing is waiting on you.</p> : todo.map((t, i) => (
              <Link key={i} to={t.to} className={`ox-task ${t.tone}`}>
                <i aria-hidden="true" />
                <span><b>{t.text}</b><small>{t.sub}</small></span>
              </Link>
            ))}
          </div>
          <div className="ox-head ox-head-2"><h2>Recent activity</h2><Link to="/activity" className="ox-more">All</Link></div>
          <div className="ox-scroll ox-events">
            {events.length === 0 ? <p className="ox-quiet">Nothing yet.</p> : events.map((e) => (
              <button key={e.id} type="button" className="ox-event" onClick={() => setEv(e)}>
                <span>{e.summary}</span><time>{ago(e.created_at)}</time>
              </button>
            ))}
          </div>
        </section>

        <GymsBox gyms={gyms} />
        <HealthBox health={health} />
        <PipelineBox f={fun} cap={cap} />

        <Modal open={!!ev} onClose={() => setEv(null)} size="md" title={ev ? ev.action.replace(/[._]/g, ' ').replace(/^./, (c) => c.toUpperCase()) : ''}>
          {ev && <EventDetail event={{ ...ev, gym_name: gyms.find((g) => g.id === ev.gym_id)?.name ?? null, actor_name: null, total: 0 }} />}
        </Modal>
        <Modal open={why} onClose={() => setWhy(false)} size="lg" title="Check-ins, last 30 days"
          subtitle="Where the number on the Overview comes from: per gym, per day and how they checked in.">
          {why && <CheckinsBreakdown days={30} />}
        </Modal>
      </div>
    </>
  );
}

/** Revenue collected as bars, recurring revenue as a line over them, then recurring revenue split by plan. */
function RevenueBox({ months, growth, gyms, thisMonth, mrr }: { months: RevenueMonth[]; growth: GrowthMonth[]; gyms: PlatformGym[]; thisMonth: string; mrr: number | null }) {
  const total = months.reduce((n, m) => n + Number(m.total), 0);
  const paid = months.filter((m) => Number(m.total) > 0);
  const best = months.reduce<RevenueMonth | null>((b, m) => (!b || Number(m.total) > Number(b.total) ? m : b), null);
  const mrrByMonth = new Map(growth.map((g) => [g.month.slice(0, 7), Number(g.mrr)]));
  const top = Math.max(1, ...months.map((m) => Number(m.total)), ...months.map((m) => mrrByMonth.get(m.month.slice(0, 7)) ?? 0));
  const n = months.length;
  const line = months.map((m, i) => {
    const v = mrrByMonth.get(m.month.slice(0, 7));
    return v === undefined ? null : [((i + .5) / n) * 100, 100 - (v / top) * 100] as const;
  });
  const linePts = line.filter((p): p is readonly [number, number] => p !== null);
  // Recurring revenue by plan: the gyms live on a priced plan, grouped by plan (platform_gyms).
  const byPlan = new Map<string, { gyms: number; mrr: number }>();
  for (const g of gyms) {
    const price = Number(g.price_monthly ?? 0);
    if (g.status !== 'active' || price <= 0) continue;
    const k = g.plan_name ?? g.plan ?? 'Plan';
    const p = byPlan.get(k) ?? { gyms: 0, mrr: 0 };
    p.gyms++; p.mrr += price; byPlan.set(k, p);
  }
  const plans = [...byPlan.entries()].sort((a, b) => b[1].mrr - a[1].mrr);
  const planTotal = plans.reduce((s, [, p]) => s + p.mrr, 0);
  const shades = ['var(--accent)', '#a78bfa', '#5b21b6', '#ddd6fe', '#4c1d95'];
  return (
    <section className="ox-box ox-rev">
      <div className="ox-head">
        <h2>Revenue, last 12 months</h2>
        <span className="ox-legend"><span><i className="sq" />Collected</span><span><i className="ln" />Recurring</span></span>
        <Link to="/money" className="ox-more">Money</Link>
      </div>
      <dl className="ox-figs">
        <div><dt>12 months</dt><dd>{peso(total)}</dd></div>
        <div><dt>Average month</dt><dd>{paid.length ? peso(total / paid.length) : '—'}</dd></div>
        <div><dt>Best month</dt><dd>{best && Number(best.total) > 0 ? `${peso(best.total)}` : '—'}{best && Number(best.total) > 0 && <small> {monthLabel(best.month)}</small>}</dd></div>
        <div><dt>Recurring now</dt><dd>{mrr !== null ? peso(mrr) : '—'}</dd></div>
      </dl>
      {n === 0 ? <p className="ox-quiet ox-grow">No payments from gyms recorded yet.</p> : (
        <div className="ox-chart">
          <div className="ox-grid" aria-hidden="true"><span>{`₱${short(top)}`}</span><span>{`₱${short(top / 2)}`}</span><span>₱0</span></div>
          <div className="ox-bars" role="img" aria-label="Revenue per month">
            {months.map((m) => {
              const v = Number(m.total);
              const r = mrrByMonth.get(m.month.slice(0, 7));
              return (
                <div key={m.month} className={`bar${m.month.startsWith(thisMonth) ? ' now' : ''}`}
                  data-detail={detail({ title: `Revenue, ${monthLong(m.month)}`, value: peso(v), rows: [
                    ['Gyms that paid', String(m.gyms)], ['Average per paying gym', m.gyms ? peso(v / m.gyms) : '—'],
                    ['Recurring that month', r !== undefined ? peso(r) : '—'], ['Share of the 12 months', total ? `${pct(v, total)}%` : '—'],
                  ], note: 'What gyms paid Core Fitness in this month, by the day it was paid. Money has every payment.' })}>
                  <span className="ox-track"><span className="bar-fill" style={{ height: `${v ? Math.max(1.5, (v / top) * 100) : 0}%` }} /></span>
                  <span className="bar-label">{monthLabel(m.month)}</span>
                </div>
              );
            })}
            {linePts.length > 1 && (
              <svg className="ox-mrr" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                <polyline points={linePts.map((p) => p.join(',')).join(' ')} />
              </svg>
            )}
          </div>
        </div>
      )}
      <div className="ox-plans">
        <span className="ox-sub">Recurring by plan</span>
        {plans.length === 0 ? <span className="ox-quiet">No gym on a paid plan yet.</span> : (
          <>
            <span className="ox-stack" role="img" aria-label={plans.map(([k, p]) => `${k} ${peso(p.mrr)}`).join(', ')}>
              {plans.map(([k, p], i) => <span key={k} style={{ width: `${(p.mrr / planTotal) * 100}%`, background: shades[i % shades.length] }}
                data-detail={detail({ title: k, value: `${peso(p.mrr)} a month`, rows: [['Gyms on it', String(p.gyms)], ['Share of recurring', `${pct(p.mrr, planTotal)}%`]] })} />)}
            </span>
            <span className="ox-keys">{plans.map(([k, p], i) => <span key={k}><i style={{ background: shades[i % shades.length] }} />{k}<b>{p.gyms}</b></span>)}</span>
          </>
        )}
      </div>
    </section>
  );
}

/** Check-ins every day for thirty days: the line, the average, the busiest day, and where they came from. */
function CheckinsBox({ days, failed, total, live, onWhy }: { days: CheckinDay[]; failed: boolean; total: number; live: number; onWhy: () => void }) {
  const vals = days.map((d) => d.checkins);
  const top = Math.max(1, ...vals);
  const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  const busiest = days.reduce<CheckinDay | null>((b, d) => (!b || d.checkins > b.checkins ? d : b), null);
  const week = vals.slice(-7).reduce((a, b) => a + b, 0), weekBefore = vals.slice(-14, -7).reduce((a, b) => a + b, 0);
  const x = (i: number) => (vals.length === 1 ? 50 : (i / (vals.length - 1)) * 100);
  const y = (v: number) => 96 - (v / top) * 88;
  const path = vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(' ');
  const dayName = (d: string) => new Date(`${d.slice(0, 10)}T00:00:00`).toLocaleDateString('en-PH', { weekday: 'short', day: 'numeric', month: 'short' });
  return (
    <section className="ox-box ox-chk">
      <div className="ox-head"><h2>Check-ins, every day</h2><button type="button" className="ox-more" onClick={onWhy}>By gym</button></div>
      <dl className="ox-figs">
        <div><dt>30 days</dt><dd>{n0(total)}</dd></div>
        <div><dt>A day</dt><dd>{vals.length ? n0(Math.round(avg)) : '—'}</dd></div>
        <div><dt>Last 7 days</dt><dd>{vals.length >= 7 ? n0(week) : '—'}{vals.length >= 14 && weekBefore > 0 && <small className={week >= weekBefore ? 'up' : 'down'}> {signed(pct(week, weekBefore) - 100)}%</small>}</dd></div>
      </dl>
      {failed ? <p className="ox-quiet ox-grow">The daily check-ins could not be read.</p> : vals.length < 2 ? <p className="ox-quiet ox-grow">Not enough days to chart yet.</p> : (
        <div className="ox-line" role="img" aria-label={`Check-ins a day, from ${vals[0]} to ${vals[vals.length - 1]}`}>
          <svg viewBox="0 0 100 100" preserveAspectRatio="none">
            <line x1="0" x2="100" y1={y(avg)} y2={y(avg)} className="avg" />
            <path d={`${path} L100,100 L0,100 Z`} className="area" />
            <path d={path} className="ln" />
          </svg>
          <div className="ox-hits">
            {days.map((d) => <span key={d.day} data-detail={detail({ title: dayName(d.day), value: `${n0(d.checkins)} check-ins`,
              rows: [['Against the 30-day average', `${signed(Math.round(d.checkins - avg))}`], ...(d.demo ? [['Of them, demo data', n0(d.demo)] as [string, string]] : [])] })} />)}
          </div>
        </div>
      )}
      <p className="ox-note">{busiest && busiest.checkins > 0 ? `Busiest: ${dayName(busiest.day)}, ${n0(busiest.checkins)}.` : ''} {live ? `About ${n0(Math.round(total / Math.max(1, live) / 30))} a day per live gym.` : ''}</p>
    </section>
  );
}

/** Gyms by size: members, how full their plan is, and when the gym was last active. */
function GymsBox({ gyms }: { gyms: PlatformGym[] }) {
  const rows = [...gyms].sort((a, b) => b.members - a.members);
  return (
    <section className="ox-box ox-gyms">
      <div className="ox-head"><h2>Gyms by size</h2><span className="ox-dim">{rows.length}</span><Link to="/gyms" className="ox-more">All gyms</Link></div>
      <div className="ox-scroll">
        {rows.length === 0 ? <p className="ox-quiet">No gyms yet.</p> : (
          <table className="ox-table">
            <thead><tr><th>Gym</th><th className="r">Members</th><th>Use</th></tr></thead>
            <tbody>
              {rows.map((g) => {
                const use = g.max_members ? Math.min(100, pct(g.members, g.max_members)) : null;
                return (
                  <tr key={g.id}>
                    <td><Link to={`/gyms/${g.id}`} className="ox-gym"><GymMark name={g.name} logoUrl={g.logo_url} accent={g.accent} size={22} />
                      <span><b>{g.name}</b><small>{g.plan_name ?? g.plan} · {ago(g.last_activity)}</small></span></Link></td>
                    <td className="r num">{n0(g.members)}</td>
                    <td>{use === null ? <span className="ox-dim">No limit</span> : (
                      <span className={`ox-use${use >= 90 ? ' hot' : ''}`} title={`${g.members} of ${g.max_members}`}><span className="trk"><span style={{ width: `${use}%` }} /></span><em>{use}%</em></span>
                    )}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

/** 0136's score, nothing recomputed: one bar split three ways, then the gyms worth a look and why. */
function HealthBox({ health }: { health: GymHealth[] | null }) {
  if (health === null) return <section className="ox-box ox-health"><div className="ox-head"><h2>Gym health</h2></div><p className="ox-quiet">Gym health could not be read.</p></section>;
  const parts = [
    { key: 'healthy', label: 'Healthy', n: health.filter((h) => h.level === 'healthy').length },
    { key: 'medium', label: 'Worth watching', n: health.filter((h) => h.level === 'medium').length },
    { key: 'high', label: 'At risk', n: health.filter((h) => h.level === 'high').length },
  ];
  const total = health.length;
  const watch = health.filter((h) => h.level !== 'healthy').sort((a, b) => b.score - a.score);
  return (
    <section className="ox-box ox-health">
      <div className="ox-head"><h2>Gym health</h2><Link to="/growth" className="ox-more">Growth</Link></div>
      <div className="ox-hbar" role="img" aria-label={parts.map((p) => `${p.n} ${p.label.toLowerCase()}`).join(', ')}>
        {parts.map((p) => p.n > 0 && <span key={p.key} className={p.key} style={{ flexGrow: p.n }} />)}
      </div>
      <div className="ox-hkeys">
        {parts.map((p) => <span key={p.key} className={p.key} title={`${pct(p.n, total)}% of gyms`}><i />{p.label}<b>{p.n}</b></span>)}
      </div>
      <div className="ox-scroll">
        {watch.length === 0 ? <p className="ox-quiet">Every gym is checking in, paid up, with its owner around.</p> : watch.map((h) => (
          <Link key={h.gym_id} to={`/gyms/${h.gym_id}`} className={`ox-risk ${h.level}`}>
            <span><b>{h.name}</b><small>{h.reasons.slice(0, 2).join(' · ') || `score ${h.score}`}</small></span>
            <span className="num" title="Check-ins in the last 14 days, and what this gym usually has">{h.checkins_14}<small>usually {Math.round(Number(h.usual_14))}</small></span>
          </Link>
        ))}
      </div>
    </section>
  );
}

/** From applying to paying, each step against the one before; then how close the service is to the free tier. */
function PipelineBox({ f, cap }: { f: Funnel | null; cap: CapacityRow[] | null }) {
  const steps = f ? [
    { label: 'Applied', n: f.applied }, { label: 'Let in', n: f.let_in }, { label: 'Set up', n: f.set_up },
    { label: 'Active, 30 days', n: f.active_30d }, { label: 'Paying', n: f.paying },
  ] : [];
  const top = Math.max(1, ...steps.map((s) => s.n));
  const limits = (cap ?? []).filter((r) => r.cap !== null && (r.kind === 'database' || r.kind === 'storage' || r.kind === 'users'));
  return (
    <section className="ox-box ox-pipe">
      <div className="ox-head"><h2>Applying to paying</h2><Link to="/applications" className="ox-more">Applications</Link></div>
      {!f ? <p className="ox-quiet">The pipeline could not be read.</p> : (
        <div className="ox-funnel">
          {steps.map((s, i) => {
            const prev = i ? steps[i - 1]!.n : null;
            return (
              <div key={s.label} className="ox-step" data-detail={detail({ title: s.label, value: String(s.n), rows: [
                ...(prev !== null ? [['Of the step before', prev ? `${pct(s.n, prev)}% (${s.n} of ${prev})` : '—'] as [string, string]] : []),
                ['Of all who applied', steps[0]!.n ? `${pct(s.n, steps[0]!.n)}%` : '—'],
              ] })}>
                <span className="lbl">{s.label}</span>
                <span className="trk"><span className={i === steps.length - 1 ? 'pay' : ''} style={{ width: `${s.n ? Math.max(2, (s.n / top) * 100) : 0}%` }} /></span>
                <b className="num">{s.n}</b>
                <small className="num">{prev ? `${pct(s.n, prev)}%` : ''}</small>
              </div>
            );
          })}
        </div>
      )}
      <div className="ox-head ox-head-2"><h2>Free tier</h2><Link to="/capacity" className="ox-more">Capacity</Link></div>
      {cap === null ? <p className="ox-quiet">Capacity could not be read.</p> : limits.length === 0 ? <p className="ox-quiet">No limits to show.</p> : (
        <div className="ox-limits">
          {limits.map((r) => {
            const u = pct(r.used, r.cap!);
            const isBytes = r.kind !== 'users';
            return (
              <div key={r.kind + r.key} className={`ox-limit${u >= 80 ? ' hot' : ''}`}>
                <span className="lbl">{r.kind === 'users' ? 'People signed in, 30 days' : r.kind === 'storage' ? 'File storage' : 'Database'}</span>
                <span className="val num">{isBytes ? `${bytes(r.used)} of ${bytes(r.cap!)}` : `${n0(r.used)} of ${n0(r.cap!)}`}</span>
                <span className="trk"><span style={{ width: `${Math.min(100, Math.max(u ? 1.5 : 0, u))}%` }} /></span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
