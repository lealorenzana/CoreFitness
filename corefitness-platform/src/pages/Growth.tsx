import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, BarChart3, Building2, CheckCircle2, Filter, Repeat, Sparkles, TrendingUp, Users, Wallet } from 'lucide-react';
import GymMark from '../components/GymMark';
import {
  adoption, explain, funnel, gymHealth, growth,
  type Adoption, type Funnel, type GrowthMonth, type GymHealth,
} from '../lib/platform';

const peso = (v: string | number) => `₱${Number(v).toLocaleString('en-PH', { maximumFractionDigits: 0 })}`;
const short = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : String(Math.round(v)));

/**
 * Growth (0136): the service as a business, and the gyms about to leave it.
 *
 * At-risk gyms first — the platform's own retention radar, with the reasons —
 * then MRR/ARR, the months, the funnel from applying to paying, and which parts
 * of the product gyms actually use. All platform_*() functions, computed on
 * read; counts and money only, never a gym's rows.
 */
export default function Growth() {
  const [health, setHealth] = useState<GymHealth[] | null>(null);
  const [months, setMonths] = useState<GrowthMonth[]>([]);
  const [fun, setFun] = useState<Funnel | null>(null);
  const [adopt, setAdopt] = useState<Adoption[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const [h, g, f, a] = await Promise.all([gymHealth(), growth(12), funnel(), adoption()]);
        if (!alive) return;
        setHealth(h); setMonths(g); setFun(f); setAdopt(a);
      } catch (e) {
        if (alive) { setError(explain(e, '0136')); setHealth([]); }
      }
    })();
    return () => { alive = false; };
  }, []);

  if (health === null) return <p className="empty">Reading the service…</p>;
  if (error) return <p className="err">{error}</p>;

  const now = months[months.length - 1];
  const mrr = Number(now?.mrr ?? 0);
  const prev = months[months.length - 2];
  const mrrChange = prev && Number(prev.mrr) ? Math.round(((mrr - Number(prev.mrr)) / Number(prev.mrr)) * 100) : null;
  const atRisk = health.filter((h) => h.level !== 'healthy');
  const topMrr = Math.max(1, ...months.map((m) => Number(m.mrr)));
  const stages = fun ? [
    { label: 'Applied', n: fun.applied }, { label: 'Let in', n: fun.let_in }, { label: 'Set up', n: fun.set_up },
    { label: 'Active, 30 days', n: fun.active_30d }, { label: 'Paying', n: fun.paying },
  ] : [];
  const widest = Math.max(1, ...stages.map((s) => s.n));

  const kpis = [
    { icon: Repeat, label: 'MRR', value: peso(mrr), foot: mrrChange === null ? 'monthly recurring revenue' : `${mrrChange >= 0 ? '+' : ''}${mrrChange}% vs last month` },
    { icon: TrendingUp, label: 'ARR', value: peso(mrr * 12), foot: 'MRR × 12' },
    { icon: Wallet, label: 'Collected this month', value: peso(now?.revenue ?? 0), foot: 'payments recorded' },
    { icon: Building2, label: 'Gyms', value: String(now?.gyms ?? 0), foot: `${now?.new_gyms ?? 0} new · ${now?.lost_gyms ?? 0} suspended this month` },
    { icon: Users, label: 'Members', value: (now?.members ?? 0).toLocaleString('en-PH'), foot: 'active, across every gym' },
    { icon: AlertTriangle, label: 'Gyms at risk', value: String(atRisk.length), foot: `${atRisk.filter((a) => a.level === 'high').length} high`, act: atRisk.length > 0 },
  ];

  return (
    <>
      <div className="kpis">
        {kpis.map((k) => {
          const Icon = k.icon;
          return (
            <div key={k.label} className={`kpi${k.act ? ' act' : ''}`}>
              <span className="kpi-icon"><Icon size={18} /></span>
              <span className="kpi-label">{k.label}</span>
              <span className="kpi-value">{k.value}</span>
              <span className="kpi-foot">{k.foot}</span>
            </div>
          );
        })}
      </div>

      <section className="card" style={{ marginTop: 16 }}>
        <h2 className="section-title"><AlertTriangle size={14} /> Gyms at risk of leaving</h2>
        {atRisk.length === 0 ? (
          <p className="empty" style={{ padding: '20px 0' }}>
            <CheckCircle2 size={20} style={{ color: 'var(--accent-text)', display: 'block', margin: '0 auto 6px' }} />
            Every gym looks healthy: checking in, paid up, owner around.
          </p>
        ) : atRisk.map((g) => (
          <Link key={g.gym_id} to={`/gyms/${g.gym_id}`} className="todo">
            <GymMark name={g.name} logoUrl={g.logo_url} accent={g.accent} size={36} />
            <span className="todo-text" style={{ fontWeight: 600 }}>{g.name}
              <span className="chips">{g.reasons.map((r) => <span key={r} className="chip warn">{r}</span>)}</span>
            </span>
            <span className={`pill ${g.level === 'high' ? 'warn' : ''}`}>{g.level === 'high' ? 'High' : 'Medium'} · {g.score}</span>
          </Link>
        ))}
      </section>

      <div className="grid-2">
        <section className="card">
          <h2 className="section-title"><BarChart3 size={14} /> MRR by month</h2>
          <div className="bars">
            {months.map((m, i) => {
              const v = Number(m.mrr);
              const label = new Date(`${m.month.slice(0, 10)}T00:00:00`).toLocaleDateString('en-PH', { month: 'short' });
              return (
                <div key={m.month} className={`bar${i === months.length - 1 ? ' now' : ''}`}
                  title={`${label}: MRR ${peso(v)} · ${m.gyms} gyms (${m.new_gyms} new, ${m.lost_gyms} suspended) · ${m.members} members · ${peso(m.revenue)} collected`}>
                  <span className="bar-value">{v ? `₱${short(v)}` : ''}</span>
                  <span className="bar-fill" style={{ height: `${Math.max(2, (v / topMrr) * 150)}px` }} />
                  <span className="bar-label">{label}</span>
                </div>
              );
            })}
          </div>
          <p className="meta" style={{ marginTop: 8 }}>MRR counts each paid plan whose paid time covers that month. Hover a month for its gyms and members.</p>
        </section>

        <section className="card">
          <h2 className="section-title"><Filter size={14} /> From applying to paying</h2>
          {stages.map((s, i) => (
            <div key={s.label} style={{ padding: '7px 0' }}>
              <div className="row" style={{ gap: 8 }}>
                <span className="grow" style={{ flexBasis: 100, fontSize: 13 }}>{s.label}</span>
                <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{s.n}</span>
                {i > 0 && stages[i - 1].n > 0 && (
                  <span className="muted" style={{ fontSize: 11.5, width: 44, textAlign: 'right' }}>{Math.round((s.n / stages[i - 1].n) * 100)}%</span>
                )}
              </div>
              <div className="meter"><span style={{ width: `${(s.n / widest) * 100}%` }} /></div>
            </div>
          ))}
        </section>
      </div>

      <section className="card" style={{ marginTop: 16 }}>
        <h2 className="section-title"><Sparkles size={14} /> What gyms use (last 30 days)</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '6px 24px' }}>
          {adopt.map((a) => {
            const pct = a.gyms_total ? Math.round((a.gyms_30d / a.gyms_total) * 100) : 0;
            return (
              <div key={a.feature} style={{ padding: '6px 0' }}>
                <div className="row" style={{ gap: 8 }}>
                  <span className="grow" style={{ flexBasis: 120, fontSize: 13 }}>{a.label}</span>
                  <span className="muted" style={{ fontSize: 12 }}>{a.gyms_30d} of {a.gyms_total} gyms</span>
                </div>
                <div className="meter"><span style={{ width: `${pct}%` }} /></div>
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}
