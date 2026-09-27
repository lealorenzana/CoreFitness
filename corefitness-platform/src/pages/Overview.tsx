import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity, AlertTriangle, Building2, Bug, CalendarClock, CheckCircle2, Clock, Inbox, TrendingUp, UserX, Users, Wallet,
} from 'lucide-react';
import {
  getOverview, listDue, listEvents, listGyms, listRevenue,
  type GymDue, type Overview as O, type PlatformEvent, type PlatformGym, type RevenueMonth,
} from '../lib/platform';

const peso = (v: string | number | null | undefined) => `₱${Number(v ?? 0).toLocaleString('en-PH', { maximumFractionDigits: 0 })}`;
const short = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : String(Math.round(v)));
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
 * The home screen: the service in six numbers, a year of revenue, and what
 * needs the platform owner — applications waiting, gyms overdue, gyms nobody
 * can sign into yet, crashes. Every figure is platform_overview()'s (0106+),
 * the same one the Platform screen shows; nothing here is computed twice.
 * Counts only — the platform processes gyms' data, it does not read members.
 */
export default function Overview() {
  const [o, setO] = useState<O | null | undefined>(undefined);
  const [rev, setRev] = useState<RevenueMonth[]>([]);
  const [due, setDue] = useState<GymDue[]>([]);
  const [gyms, setGyms] = useState<PlatformGym[]>([]);
  const [events, setEvents] = useState<PlatformEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

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
      } catch (err) {
        if (alive) { setError(err instanceof Error ? err.message : 'The overview could not load'); setO(null); }
      }
    })();
    return () => { alive = false; };
  }, []);

  if (o === undefined) return <p className="empty">Loading the service…</p>;
  if (!o) return <p className="err">{error ?? 'The overview could not load.'}</p>;

  const months = [...rev].sort((a, b) => a.month.localeCompare(b.month)).slice(-12);
  const top = Math.max(1, ...months.map((m) => Number(m.total)));
  const thisMonth = new Date().toISOString().slice(0, 7);
  const biggest = [...gyms].sort((a, b) => b.members - a.members).slice(0, 5);
  const mostMembers = Math.max(1, ...biggest.map((g) => g.members));

  const todo: { icon: typeof Inbox; text: string; sub: string; to: string }[] = [];
  if (o.applications_waiting > 0) todo.push({ icon: Inbox, text: `${o.applications_waiting} gym${o.applications_waiting === 1 ? '' : 's'} asking to join`, sub: 'Let them in or say why not', to: '/applications' });
  for (const g of due.filter((d) => d.days_left < 0).slice(0, 3)) todo.push({ icon: Wallet, text: `${g.name} is ${-g.days_left} days overdue`, sub: `${g.plan} · record a payment or suspend`, to: '/money' });
  for (const g of due.filter((d) => d.days_left >= 0).slice(0, 3)) todo.push({ icon: CalendarClock, text: `${g.name} is due in ${g.days_left} day${g.days_left === 1 ? '' : 's'}`, sub: `${g.plan} · paid to ${new Date(g.paid_until).toLocaleDateString('en-PH', { day: 'numeric', month: 'short' })}`, to: '/money' });
  if (o.gyms_unclaimed > 0) todo.push({ icon: UserX, text: `${o.gyms_unclaimed} gym${o.gyms_unclaimed === 1 ? '' : 's'} with no owner`, sub: 'Nobody can sign in — invite the owner', to: '/gyms' });
  if (o.gyms_unset_up > 0) todo.push({ icon: Clock, text: `${o.gyms_unset_up} gym${o.gyms_unset_up === 1 ? '' : 's'} not set up yet`, sub: 'The owner has not finished setup', to: '/gyms' });
  if (o.crashes_open > 0) todo.push({ icon: Bug, text: `${o.crashes_open} open crash report${o.crashes_open === 1 ? '' : 's'}`, sub: 'Read them on Platform', to: '/platform' });

  const kpis = [
    { icon: Building2, label: 'Gyms live', value: String(o.gyms_live), foot: `${o.gyms} in all${o.new_gyms_30d ? ` · ${o.new_gyms_30d} new this month` : ''}`, to: '/gyms' },
    { icon: Users, label: 'Members', value: o.members.toLocaleString('en-PH'), foot: `${o.trainers} coaches · ${o.staff} on desks`, to: '/gyms' },
    { icon: TrendingUp, label: 'Revenue this month', value: peso(o.revenue_this_month), foot: `${peso(o.revenue_all_time)} all time`, to: '/money' },
    { icon: Activity, label: 'Check-ins, 30 days', value: o.checkins_30d.toLocaleString('en-PH'), foot: 'Across every gym', to: '/gyms' },
    { icon: Inbox, label: 'Applications', value: String(o.applications_waiting), foot: o.applications_waiting ? 'Waiting for you' : 'None waiting', to: '/applications', act: o.applications_waiting > 0 },
    { icon: AlertTriangle, label: 'Overdue or locked', value: String(o.overdue_gyms + o.gyms_suspended), foot: `${o.overdue_gyms} overdue · ${o.gyms_suspended} suspended`, to: '/money', act: o.overdue_gyms + o.gyms_suspended > 0 },
  ];

  return (
    <>
      <div className="kpis">
        {kpis.map((k) => {
          const Icon = k.icon;
          return (
            <Link key={k.label} to={k.to} className={`kpi${k.act ? ' act' : ''}`}>
              <span className="kpi-icon"><Icon size={18} /></span>
              <span className="kpi-label">{k.label}</span>
              <span className="kpi-value">{k.value}</span>
              <span className="kpi-foot">{k.foot}</span>
            </Link>
          );
        })}
      </div>

      <div className="grid-2">
        <section className="card">
          <h2 className="section-title"><TrendingUp size={14} /> Revenue, last 12 months</h2>
          {months.length === 0 ? <p className="empty">No payments from gyms recorded yet.</p> : (
            <div className="bars" role="img" aria-label="Revenue per month">
              {months.map((m) => {
                const v = Number(m.total);
                const label = new Date(`${m.month.slice(0, 7)}-01T00:00:00`).toLocaleDateString('en-PH', { month: 'short' });
                return (
                  <div key={m.month} className={`bar${m.month.startsWith(thisMonth) ? ' now' : ''}`} title={`${label}: ${peso(v)} from ${m.gyms} gym${m.gyms === 1 ? '' : 's'}`}>
                    <span className="bar-value">{v ? `₱${short(v)}` : ''}</span>
                    <span className="bar-fill" style={{ height: `${Math.max(2, (v / top) * 150)}px` }} />
                    <span className="bar-label">{label}</span>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="card">
          <h2 className="section-title"><AlertTriangle size={14} /> Needs you</h2>
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
        </section>
      </div>

      <div className="grid-2">
        <section className="card">
          <h2 className="section-title"><Building2 size={14} /> Largest gyms</h2>
          {biggest.length === 0 ? <p className="empty">No gyms yet.</p> : biggest.map((g) => (
            <div key={g.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border-soft)' }}>
              <div className="row" style={{ gap: 12 }}>
                <span className="avatar" style={{ width: 34, height: 34, fontSize: 12, borderRadius: 10 }}>{initials(g.name)}</span>
                <span className="grow" style={{ flexBasis: 140 }}>
                  <span className="name" style={{ fontSize: 13.5 }}>{g.name}</span>
                  <span className="meta" style={{ marginTop: 1 }}>{g.plan_name ?? g.plan}{g.lock_reason ? ` · ${g.lock_reason}` : ''}</span>
                </span>
                <span style={{ fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{g.members.toLocaleString('en-PH')}</span>
              </div>
              <div className="meter"><span style={{ width: `${(g.members / mostMembers) * 100}%` }} /></div>
            </div>
          ))}
        </section>

        <section className="card">
          <h2 className="section-title"><Activity size={14} /> Recent activity</h2>
          {events.length === 0 ? <p className="empty">Nothing yet.</p> : events.map((e) => (
            <div key={e.id} className="log" style={{ display: 'flex', gap: 10 }}>
              <span style={{ flex: 1, minWidth: 0, color: 'var(--text)' }}>{e.summary}</span>
              <span className="muted" style={{ whiteSpace: 'nowrap', fontSize: 11.5 }}>{ago(e.created_at)}</span>
            </div>
          ))}
        </section>
      </div>
    </>
  );
}

function initials(name: string): string {
  const w = name.trim().split(/\s+/).filter(Boolean);
  return (w.length > 1 ? w[0][0] + w[1][0] : (w[0] ?? '?').slice(0, 2)).toUpperCase();
}
