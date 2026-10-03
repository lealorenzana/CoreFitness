import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity, AlertTriangle, Building2, Bug, CalendarClock, CheckCircle2, Clock, DoorOpen, Filter, HeartPulse, Inbox, TrendingUp,
  UserX, Users, Wallet,
} from 'lucide-react';
import {
  funnel as getFunnel, getOverview, growth as getGrowth, gymHealth, listDue, listEvents, listGyms, listRevenue,
  listSupportGrants, paymentClaims, type PaymentClaim, type SupportGrant,
  type Funnel, type GrowthMonth, type GymDue, type GymHealth, type Overview as O, type PlatformEvent, type PlatformGym,
  type RevenueMonth,
} from '../lib/platform';
import GymMark from '../components/GymMark';
import Modal from '../components/Modal';
import CheckinsBreakdown from '../components/CheckinsBreakdown';
import EventDetail from '../components/EventDetail';
import DemoNotice from '../components/DemoNotice';

const peso = (v: string | number | null | undefined) => `₱${Number(v ?? 0).toLocaleString('en-PH', { maximumFractionDigits: 0 })}`;
const short = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : String(Math.round(v)));
const monthLabel = (m: string) => new Date(`${m.slice(0, 7)}-01T00:00:00`).toLocaleDateString('en-PH', { month: 'short' });
/** This month in Manila — never toISOString()'s UTC month (CLAUDE.md). */
const manilaMonth = () => new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 7);
const ago = (iso: string) => {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
};

/**
 * The home screen, as a bento that fills the window (2026-09-28): six figures,
 * then revenue with its own statistics, members and gyms over a year, what
 * needs the owner, the gyms' health, the path from applying to paying, the
 * largest gyms and the latest events. Every figure is the database's
 * (platform_overview, platform_growth, platform_funnel, platform_gym_health);
 * counts only — the platform processes gyms' data, it does not read members.
 */
export default function Overview() {
  const [o, setO] = useState<O | null | undefined>(undefined);
  const [rev, setRev] = useState<RevenueMonth[]>([]);
  const [due, setDue] = useState<GymDue[]>([]);
  const [gyms, setGyms] = useState<PlatformGym[]>([]);
  const [events, setEvents] = useState<PlatformEvent[]>([]);
  const [health, setHealth] = useState<GymHealth[] | null>(null);
  const [grow, setGrow] = useState<GrowthMonth[] | null>(null);
  const [fun, setFun] = useState<Funnel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [why, setWhy] = useState(false);
  const [ev, setEv] = useState<PlatformEvent | null>(null);
  const [grants, setGrants] = useState<SupportGrant[]>([]);
  const [claims, setClaims] = useState<PaymentClaim[]>([]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const [a, b, c, d, e] = await Promise.all([
          getOverview(), listRevenue(12).catch(() => []), listDue(14).catch(() => []),
          listGyms().catch(() => []), listEvents(8).catch(() => []),
        ]);
        if (!alive) return;
        setO(a); setRev(b); setDue(c); setGyms(d); setEvents(e);
        // 0136's statistics; before it is pasted each card says so rather than showing zeros.
        const [h, g, f] = await Promise.all([gymHealth().catch(() => null), getGrowth(12).catch(() => null), getFunnel().catch(() => null)]);
        if (alive) { setHealth(h); setGrow(g); setFun(f); }
        // 0113 / 0148: a gym waiting for you to look, and money waiting to be checked.
        const [sg, pc] = await Promise.all([listSupportGrants().catch(() => []), paymentClaims('pending').catch(() => [])]);
        if (alive) { setGrants(sg); setClaims(pc); }
      } catch (err) {
        if (alive) { setError(err instanceof Error ? err.message : 'The overview could not load'); setO(null); }
      }
    })();
    return () => { alive = false; };
  }, []);

  if (o === undefined) return <p className="empty">Loading the service…</p>;
  if (!o) return <p className="err">{error ?? 'The overview could not load.'}</p>;

  // ---- revenue ----
  const months = [...rev].sort((a, b) => a.month.localeCompare(b.month)).slice(-12);
  const top = Math.max(1, ...months.map((m) => Number(m.total)));
  const thisMonth = manilaMonth();
  const yearTotal = months.reduce((n, m) => n + Number(m.total), 0);
  const best = months.reduce<RevenueMonth | null>((b, m) => (!b || Number(m.total) > Number(b.total) ? m : b), null);
  const paidMonths = months.filter((m) => Number(m.total) > 0).length;
  const growth = grow ? [...grow].sort((a, b) => a.month.localeCompare(b.month)) : [];
  const mrr = growth.length ? Number(growth[growth.length - 1].mrr) : null;

  // ---- needs you ----
  const risky = (health ?? []).filter((x) => x.level === 'high');
  const todo: { icon: typeof Inbox; text: string; sub: string; to: string }[] = [];
  for (const g of grants) todo.push({ icon: DoorOpen, text: `${g.gym_name} opened its doors to you`, sub: g.reason ? `“${g.reason}” — look inside, read-only` : 'Look inside, read-only', to: `/support-access/${g.gym_id}` });
  if (claims.length > 0) todo.push({ icon: Wallet, text: `${claims.length} payment${claims.length === 1 ? '' : 's'} to verify`, sub: claims.slice(0, 2).map((c) => `${c.gym_name} · ref ${c.reference}`).join(' · '), to: '/money' });
  if (o.applications_waiting > 0) todo.push({ icon: Inbox, text: `${o.applications_waiting} gym${o.applications_waiting === 1 ? '' : 's'} asking to join`, sub: 'Let them in or say why not', to: '/applications' });
  for (const g of due.filter((d) => d.days_left < 0).slice(0, 3)) todo.push({ icon: Wallet, text: `${g.name} is ${-g.days_left} days overdue`, sub: `${g.plan} · record a payment or suspend`, to: '/money' });
  for (const g of due.filter((d) => d.days_left >= 0).slice(0, 3)) todo.push({ icon: CalendarClock, text: `${g.name} is due in ${g.days_left} day${g.days_left === 1 ? '' : 's'}`, sub: `${g.plan} · paid to ${new Date(g.paid_until).toLocaleDateString('en-PH', { day: 'numeric', month: 'short' })}`, to: '/money' });
  for (const g of risky.slice(0, 3)) todo.push({ icon: AlertTriangle, text: `${g.name} may be leaving`, sub: g.reasons.slice(0, 2).join(' · '), to: `/gyms/${g.gym_id}` });
  if (o.gyms_unclaimed > 0) todo.push({ icon: UserX, text: `${o.gyms_unclaimed} gym${o.gyms_unclaimed === 1 ? '' : 's'} with no owner`, sub: 'Nobody can sign in — invite the owner', to: '/gyms' });
  if (o.gyms_unset_up > 0) todo.push({ icon: Clock, text: `${o.gyms_unset_up} gym${o.gyms_unset_up === 1 ? '' : 's'} not set up yet`, sub: 'The owner has not finished setup', to: '/gyms' });
  if (o.crashes_open > 0) todo.push({ icon: Bug, text: `${o.crashes_open} open crash report${o.crashes_open === 1 ? '' : 's'}`, sub: 'Read them on Platform', to: '/platform' });

  const biggest = [...gyms].sort((a, b) => b.members - a.members).slice(0, 5);
  const mostMembers = Math.max(1, ...biggest.map((g) => g.members));

  const OV_TIPS: Record<string, string> = {
    'Gyms live': 'Gyms open for business: not suspended, not read-only. Click for every gym.',
    Members: 'Active members across every gym. Coaches and desk staff are counted separately.',
    'Revenue this month': 'What gyms paid Core Fitness this Manila month. Click for Money.',
    'Check-ins, 30 days': 'Visits recorded at every gym\'s desk or kiosk in the last 30 days. Click to see which gyms and which days.',
    Applications: 'Gyms that applied on the website and are waiting for your answer.',
    'Overdue or locked': 'Gyms past their paid-until date, or suspended by you. Click to record a payment.',
  };
  const kpis = [
    { icon: Building2, label: 'Gyms live', value: String(o.gyms_live), foot: `${o.gyms} in all${o.new_gyms_30d ? ` · ${o.new_gyms_30d} new this month` : ''}`, to: '/gyms' },
    { icon: Users, label: 'Members', value: o.members.toLocaleString('en-PH'), foot: `${o.trainers} coaches · ${o.staff} on desks`, to: '/gyms' },
    { icon: TrendingUp, label: 'Revenue this month', value: peso(o.revenue_this_month), foot: `${peso(o.revenue_all_time)} all time`, to: '/money' },
    { icon: Activity, label: 'Check-ins, 30 days', value: o.checkins_30d.toLocaleString('en-PH'), foot: o.gyms_live ? `≈ ${Math.round(o.checkins_30d / Math.max(1, o.gyms_live) / 30).toLocaleString('en-PH')} a day per live gym · why?` : 'Across every gym', to: '/gyms', open: () => setWhy(true) },
    { icon: Inbox, label: 'Applications', value: String(o.applications_waiting), foot: o.applications_waiting ? 'Waiting for you' : 'None waiting', to: '/applications', act: o.applications_waiting > 0 },
    { icon: AlertTriangle, label: 'Overdue or locked', value: String(o.overdue_gyms + o.gyms_suspended), foot: `${o.overdue_gyms} overdue · ${o.gyms_suspended} suspended`, to: '/money', act: o.overdue_gyms + o.gyms_suspended > 0 },
  ];

  return (
    <>
    <DemoNotice />
    <div className="ov">
      {kpis.map((k) => {
        const Icon = k.icon;
        return (
          <Link key={k.label} to={k.to} className={`kpi ov-kpi${k.act ? ' act' : ''}`} data-tip={OV_TIPS[k.label]}
            onClick={'open' in k && k.open ? (e) => { e.preventDefault(); k.open!(); } : undefined}>
            <span className="kpi-icon"><Icon size={18} /></span>
            <span className="kpi-label">{k.label}</span>
            <span className="kpi-value">{k.value}</span>
            <span className="kpi-foot">{k.foot}</span>
          </Link>
        );
      })}

      {/* ---- row 2 ---- */}
      <section className="card ov-card ov-5">
        <div className="ov-head">
          <h2 className="section-title"><TrendingUp size={14} /> Revenue, last 12 months</h2>
          <Link to="/money" className="ov-more">Money →</Link>
        </div>
        <div className="ov-figs">
          <span><b>{peso(yearTotal)}</b>12 months</span>
          <span><b>{best && Number(best.total) > 0 ? peso(best.total) : '—'}</b>best{best && Number(best.total) > 0 ? `, ${monthLabel(best.month)}` : ' month'}</span>
          <span><b>{paidMonths ? peso(yearTotal / paidMonths) : '—'}</b>avg month</span>
          <span><b>{mrr !== null ? peso(mrr) : '—'}</b>recurring now</span>
        </div>
        {months.length === 0 ? <p className="empty ov-fill">No payments from gyms recorded yet.</p> : (
          <div className="ov-bars" role="img" aria-label="Revenue per month">
            {months.map((m) => {
              const v = Number(m.total);
              return (
                <div key={m.month} className={`bar${m.month.startsWith(thisMonth) ? ' now' : ''}`} title={`${monthLabel(m.month)}: ${peso(v)} from ${m.gyms} gym${m.gyms === 1 ? '' : 's'}`}>
                  <span className="bar-value">{v ? `₱${short(v)}` : ''}</span>
                  <span className="ov-track"><span className="bar-fill" style={{ height: `${Math.max(2, (v / top) * 100)}%` }} /></span>
                  <span className="bar-label">{monthLabel(m.month)}</span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="card ov-card ov-4">
        <div className="ov-head">
          <h2 className="section-title"><Users size={14} /> Members and gyms, 12 months</h2>
          <Link to="/growth" className="ov-more">Growth →</Link>
        </div>
        {grow === null ? <p className="empty ov-fill">Paste migration 0136 to see growth.</p>
          : growth.length === 0 ? <p className="empty ov-fill">Nothing to chart yet.</p>
          : <GrowthChart months={growth} />}
      </section>

      <section className="card ov-card ov-3">
        <div className="ov-head"><h2 className="section-title"><AlertTriangle size={14} /> Needs you</h2>
          {todo.length > 0 && <span className="count">{todo.length}</span>}</div>
        <div className="ov-scroll">
          {todo.length === 0 ? (
            <p className="empty" style={{ padding: '28px 0' }}>
              <CheckCircle2 size={22} style={{ color: 'var(--accent-text)', display: 'block', margin: '0 auto 8px' }} />
              All clear. Nothing is waiting on you.
            </p>
          ) : todo.map((t, i) => {
            const Icon = t.icon;
            return (
              <Link key={i} to={t.to} className="todo">
                <span className="todo-icon"><Icon size={15} /></span>
                <span className="todo-text">{t.text}<small>{t.sub}</small></span>
              </Link>
            );
          })}
        </div>
      </section>

      {/* ---- row 3 ---- */}
      <section className="card ov-card ov-3">
        <div className="ov-head"><h2 className="section-title"><HeartPulse size={14} /> Gym health</h2>
          <Link to="/growth" className="ov-more">Why →</Link></div>
        {health === null ? <p className="empty ov-fill">Paste migration 0136 to see gym health.</p> : <HealthRing health={health} />}
      </section>

      <section className="card ov-card ov-3">
        <div className="ov-head"><h2 className="section-title"><Filter size={14} /> Applying to paying</h2></div>
        {fun === null ? <p className="empty ov-fill">Paste migration 0136 to see the funnel.</p> : <FunnelBars f={fun} />}
      </section>

      <section className="card ov-card ov-3">
        <div className="ov-head"><h2 className="section-title"><Building2 size={14} /> Largest gyms</h2>
          <Link to="/gyms" className="ov-more">All →</Link></div>
        <div className="ov-scroll">
          {biggest.length === 0 ? <p className="empty">No gyms yet.</p> : biggest.map((g, i) => (
            <Link key={g.id} to={`/gyms/${g.id}`} className="ov-gym">
              <span className="ov-rank">{i + 1}</span>
              <GymMark name={g.name} logoUrl={g.logo_url} accent={g.accent} size={30} />
              <span className="ov-gym-text">
                <span className="ov-gym-name">{g.name}</span>
                <span className="meter" style={{ marginTop: 5 }}><span style={{ width: `${(g.members / mostMembers) * 100}%` }} /></span>
              </span>
              <b>{g.members.toLocaleString('en-PH')}</b>
            </Link>
          ))}
        </div>
      </section>

      <section className="card ov-card ov-3">
        <div className="ov-head"><h2 className="section-title"><Activity size={14} /> Recent activity</h2>
          <Link to="/activity" className="ov-more">All →</Link></div>
        <div className="ov-scroll">
          {events.length === 0 ? <p className="empty">Nothing yet.</p> : events.map((e) => (
            <button key={e.id} type="button" className="ov-event" onClick={() => setEv(e)} data-tip="Open the details"
              style={{ width: '100%', textAlign: 'left', background: 'transparent', border: 0, cursor: 'pointer', color: 'inherit', font: 'inherit' }}>
              <span className="ov-dot" />
              <span className="ov-event-text">{e.summary}<small>{ago(e.created_at)}</small></span>
            </button>
          ))}
        </div>
      </section>
      <Modal open={!!ev} onClose={() => setEv(null)} size="md" title={ev ? ev.action.replace(/[._]/g, ' ').replace(/^./, (c) => c.toUpperCase()) : ''}>
        {ev && <EventDetail event={{ ...ev, gym_name: gyms.find((g) => g.id === ev.gym_id)?.name ?? null, actor_name: null, total: 0 }} />}
      </Modal>
      <Modal open={why} onClose={() => setWhy(false)} size="lg" title="Check-ins, last 30 days"
        subtitle="Where the number on the Overview comes from — per gym, per day and how they checked in.">
        {why && <CheckinsBreakdown days={30} />}
      </Modal>
    </div>
    </>
  );
}

/** Members as an area, gyms as small bars under it — one chart, two scales, each labelled. */
function GrowthChart({ months }: { months: GrowthMonth[] }) {
  const n = months.length;
  const maxM = Math.max(1, ...months.map((m) => m.members));
  const maxG = Math.max(1, ...months.map((m) => m.gyms));
  const x = (i: number) => (n === 1 ? 50 : (i / (n - 1)) * 100);
  const y = (v: number) => 100 - (v / maxM) * 88 - 4;
  const line = months.map((m, i) => `${i ? 'L' : 'M'}${x(i).toFixed(2)},${y(m.members).toFixed(2)}`).join(' ');
  const first = months[0], last = months[n - 1];
  const change = last.members - first.members;
  const joined = months.reduce((s, m) => s + m.new_gyms, 0);
  const lost = months.reduce((s, m) => s + m.lost_gyms, 0);
  return (
    <>
      <div className="ov-figs">
        <span><b>{last.members.toLocaleString('en-PH')}</b>members now</span>
        <span><b className={change < 0 ? 'down' : ''}>{change >= 0 ? '+' : ''}{change.toLocaleString('en-PH')}</b>in 12 months</span>
        <span><b>{last.gyms}</b>gyms · +{joined} / −{lost}</span>
      </div>
      <div className="ov-chart" role="img" aria-label={`Members from ${first.members} to ${last.members} over ${n} months`}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none">
          <defs>
            <linearGradient id="ov-area" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="#7C3AED" stopOpacity="0.45" />
              <stop offset="1" stopColor="#7C3AED" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[25, 50, 75].map((g) => <line key={g} x1="0" x2="100" y1={g} y2={g} className="ov-grid" />)}
          <path d={`${line} L${x(n - 1)},100 L${x(0)},100 Z`} fill="url(#ov-area)" />
          <path d={line} className="ov-line" />
        </svg>
        <div className="ov-gymbars">
          {months.map((m) => <span key={m.month} title={`${monthLabel(m.month)}: ${m.gyms} gyms, ${m.members} members`}
            style={{ height: `${Math.max(8, (m.gyms / maxG) * 100)}%` }} />)}
        </div>
      </div>
      <div className="ov-axis">
        {months.map((m, i) => <span key={m.month}>{i % 2 === (n - 1) % 2 ? monthLabel(m.month) : ''}</span>)}
      </div>
      <div className="ov-legend"><span><i className="lg-line" />Members</span><span><i className="lg-bar" />Gyms</span></div>
    </>
  );
}

/** Healthy / worth watching / at risk, as one ring — 0136's score, nothing recomputed. */
function HealthRing({ health }: { health: GymHealth[] }) {
  const parts = [
    { key: 'healthy', label: 'Healthy', n: health.filter((h) => h.level === 'healthy').length, color: '#7C3AED' },
    { key: 'medium', label: 'Worth watching', n: health.filter((h) => h.level === 'medium').length, color: '#FCD34D' },
    { key: 'high', label: 'At risk', n: health.filter((h) => h.level === 'high').length, color: '#F59E0B' },
  ];
  const total = health.length;
  const R = 40, C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <div className="ov-ring-wrap">
      <div className="ov-ring">
        <svg viewBox="0 0 100 100" role="img" aria-label={parts.map((p) => `${p.n} ${p.label.toLowerCase()}`).join(', ')}>
          <circle cx="50" cy="50" r={R} className="ov-ring-bg" />
          {total > 0 && parts.filter((p) => p.n > 0).map((p) => {
            const len = (p.n / total) * C;
            const el = <circle key={p.key} cx="50" cy="50" r={R} fill="none" stroke={p.color} strokeWidth="11"
              strokeDasharray={`${Math.max(0, len - 1.5)} ${C}`} strokeDashoffset={-offset} transform="rotate(-90 50 50)" strokeLinecap="butt" />;
            offset += len;
            return el;
          })}
        </svg>
        <span className="ov-ring-mid"><b>{total ? Math.round((parts[0].n / total) * 100) : 0}%</b>healthy</span>
      </div>
      <div className="ov-ring-legend">
        {parts.map((p) => <span key={p.key}><i style={{ background: p.color }} />{p.label}<b>{p.n}</b></span>)}
      </div>
    </div>
  );
}

/** From applying to paying: each step against the one before it. */
function FunnelBars({ f }: { f: Funnel }) {
  const steps = [
    { label: 'Applied', n: f.applied }, { label: 'Let in', n: f.let_in }, { label: 'Set up', n: f.set_up },
    { label: 'Active, 30 days', n: f.active_30d }, { label: 'Paying', n: f.paying },
  ];
  const top = Math.max(1, steps[0].n, ...steps.map((s) => s.n));
  return (
    <div className="ov-funnel">
      {steps.map((s, i) => {
        const prev = i ? steps[i - 1].n : null;
        return (
          <div key={s.label} className="ov-step">
            <span className="ov-step-label">{s.label}</span>
            <span className="ov-step-track"><span style={{ width: `${Math.max(3, (s.n / top) * 100)}%` }} className={i === steps.length - 1 ? 'pay' : ''} /></span>
            <b>{s.n}</b>
            <small>{prev ? `${Math.round((s.n / prev) * 100)}%` : ''}</small>
          </div>
        );
      })}
      <p className="meta" style={{ marginTop: 'auto' }}>
        {f.applied ? `${Math.round((f.paying / f.applied) * 100)}% of gyms that applied now pay.` : 'No applications yet.'}
      </p>
    </div>
  );
}
