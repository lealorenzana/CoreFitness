import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { downloadCsv } from '../lib/csv';
import { AlertTriangle, BarChart3, Download, CheckCircle2, Filter, Mail, Sparkles } from 'lucide-react';
import MessageOwner from '../components/MessageOwner';
import { detail } from '../components/DetailLayer';
import GymMark from '../components/GymMark';
import DemoNotice from '../components/DemoNotice';
import './growth.css';
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
  /** The gym whose owner is being written to (0240). */
  const [writing, setWriting] = useState<{ id: string; name: string; reasons: string[] } | null>(null);
  const [sentNote, setSentNote] = useState<string | null>(null);
  /** The risk list: every gym worth a look, or only the high ones. */
  const [onlyHigh, setOnlyHigh] = useState(false);

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

  const GROWTH_TIPS: Record<string, string> = {
    MRR: 'Monthly recurring revenue: the monthly price of every gym whose paid time covers this month.',
    ARR: 'Annual run rate, this month\'s MRR times twelve. A pace, not money in the bank.',
    'Collected this month': 'Payments from gyms actually recorded this month, whatever period they cover.',
    Gyms: 'Gyms created by the end of this month, suspended ones included; the foot counts the new ones and those suspended this month.',
    Members: 'Active members across every gym at the end of the month, a floor, not a peak.',
    'Gyms at risk': 'Scored from quiet check-ins, lapsed payments, trials ending unpaid and owners not signing in (0136).',
  };
  const high = atRisk.filter((x) => x.level === 'high');
  const riskShown = [...(onlyHigh ? high : atRisk)].sort((x, y) => y.score - x.score);
  const noRevenue = months.every((m) => Number(m.mrr) === 0);
  const ranked = [...adopt].sort((x, y) => y.gyms_30d - x.gyms_30d);
  /** A gym added by hand skips "Applied", so a step can outnumber the one before it; a share over 100% would be nonsense. */
  const share = (i: number) => (i > 0 && stages[i - 1].n > 0 && stages[i].n <= stages[i - 1].n ? `${Math.round((stages[i].n / stages[i - 1].n) * 100)}%` : '');
  const skipped = stages.some((st, i) => i > 0 && st.n > stages[i - 1].n);
  const money = [
    { label: 'MRR', value: peso(mrr), foot: mrrChange === null ? 'monthly recurring revenue' : `${mrrChange >= 0 ? '+' : ''}${mrrChange}% vs last month` },
    { label: 'ARR', value: peso(mrr * 12), foot: 'MRR × 12' },
    { label: 'Collected this month', value: peso(now?.revenue ?? 0), foot: 'payments recorded' },
  ];

  return (
    <>
      <DemoNotice />
      {sentNote && <p className="meta" data-sent-note>{sentNote}</p>}
      {writing && (
        <MessageOwner open onClose={() => setWriting(null)} gymId={writing.id} gymName={writing.name} reasons={writing.reasons}
          onSent={(n) => setSentNote(`Sent to ${writing.name}'s owner${n > 1 ? `s (${n})` : ''}, it is in their bell and on their phone.`)} />
      )}
      {/* Every box here scrolls its own list, so the shell's View all stays out (data-va-keep). */}
      <div className="gw" data-va-keep>
        <section className="card gw-rev">
          <header className="gw-head">
            <h2 className="section-title" data-tip="MRR counts each paid plan whose paid time covers that month. Click a month for its gyms, members and what was collected."><BarChart3 size={14} /> Revenue</h2>
            <button className="btn ghost sm" disabled={months.length === 0}
              onClick={() => downloadCsv('core-fitness-growth', months, [
                ['Month', (m) => m.month.slice(0, 7)], ['Gyms', (m) => m.gyms], ['New gyms', (m) => m.new_gyms], ['Gyms lost', (m) => m.lost_gyms],
                ['Members', (m) => m.members], ['MRR', (m) => Number(m.mrr)], ['Collected', (m) => Number(m.revenue)],
              ])}><Download size={13} /> CSV</button>
          </header>
          <div className="gw-figs">
            {money.map((k) => (
              <div key={k.label} tabIndex={0} data-tip={GROWTH_TIPS[k.label]}>
                <span>{k.label}</span><b>{k.value}</b><small>{k.foot}</small>
              </div>
            ))}
          </div>
          {noRevenue ? (
            <div className="gw-none">
              <b>No revenue yet</b>
              <span>No gym's paid time has covered a month in the last twelve, so MRR is ₱0. It counts from the first month a gym's payment covers.</span>
            </div>
          ) : (
            <div className="bars gw-bars">
              {months.map((m, i) => {
                const v = Number(m.mrr);
                const label = new Date(`${m.month.slice(0, 10)}T00:00:00`).toLocaleDateString('en-PH', { month: 'short' });
                return (
                  <div key={m.month} className={`bar${i === months.length - 1 ? ' now' : ''}`}
                    data-detail={detail({ title: `MRR, ${new Date(`${m.month.slice(0, 10)}T00:00:00`).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })}`, value: peso(v), rows: [
                      ['Paying gyms', String(m.gyms)], ['New gyms', String(m.new_gyms)], ['Suspended', String(m.lost_gyms)],
                      ['Members across them', Number(m.members).toLocaleString('en-PH')], ['Collected that month', peso(m.revenue)],
                    ], note: 'MRR counts each paid plan whose paid time covers this month; collected is what was actually paid in it.' })}>
                    <span className="bar-value">{v ? `₱${short(v)}` : ''}</span>
                    <span className="bar-fill" style={{ height: `${Math.max(1.5, (v / topMrr) * 82)}%` }} />
                    <span className="bar-label">{label}</span>
                  </div>
                );
              })}
            </div>
          )}
          <p className="gw-foot">MRR counts each paid plan whose paid time covers that month. Click a month for its gyms, members and what was collected.</p>
        </section>

        <section className="card gw-risk">
          <header className="gw-head">
            <h2 className="section-title"><AlertTriangle size={14} /> Gyms at risk of leaving</h2>
            <div className="gw-seg" role="group" aria-label="Show">
              <button type="button" className={onlyHigh ? '' : 'on'} aria-pressed={!onlyHigh} onClick={() => setOnlyHigh(false)}>All <b>{atRisk.length}</b></button>
              <button type="button" className={onlyHigh ? 'on' : ''} aria-pressed={onlyHigh} onClick={() => setOnlyHigh(true)}>High <b>{high.length}</b></button>
            </div>
          </header>
          <p className="gw-sub">Scored from quiet check-ins, lapsed payments, trials ending unpaid and owners not signing in. Highest first.</p>
          {riskShown.length === 0 ? (
            <p className="gw-ok"><CheckCircle2 size={16} /> {onlyHigh && atRisk.length ? 'No gym is at high risk.' : 'Every gym looks healthy: checking in, paid up, owner around.'}</p>
          ) : (
            <ul className="gw-list">
              {riskShown.map((g) => (
                // The row opens the gym; Write to the owner sits beside it, never inside the link (0240).
                <li key={g.gym_id} data-risk-gym={g.name}>
                  <Link to={`/gyms/${g.gym_id}`} className="gw-gym">
                    <GymMark name={g.name} logoUrl={g.logo_url} accent={g.accent} size={32} />
                    <span className="gw-gym-text">
                      <b>{g.name}</b>
                      <span title={g.reasons.join(' · ')}>{g.reasons.join(' · ')}</span>
                    </span>
                    <span className={`gw-score${g.level === 'high' ? ' high' : ''}`}>{g.level === 'high' ? 'High' : 'Medium'} · {g.score}</span>
                  </Link>
                  <button type="button" className="gw-write" aria-label={`Write to the owner of ${g.name}`} data-tip="Write to the owner"
                    onClick={() => setWriting({ id: g.gym_id, name: g.name, reasons: g.reasons })} data-write-owner>
                    <Mail size={15} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card gw-fun">
          <h2 className="section-title"><Filter size={14} /> Gyms, from applying to paying</h2>
          <div className="gw-figs two">
            <div tabIndex={0} data-tip={GROWTH_TIPS.Gyms}><span>Gyms</span><b>{now?.gyms ?? 0}</b><small>{now?.new_gyms ?? 0} new · {now?.lost_gyms ?? 0} suspended this month</small></div>
            <div tabIndex={0} data-tip={GROWTH_TIPS.Members}><span>Members</span><b>{(now?.members ?? 0).toLocaleString('en-PH')}</b><small>active, across every gym</small></div>
          </div>
          <ol className="gw-steps">
            {stages.map((st, i) => (
              <li key={st.label} data-detail={detail({ title: st.label, value: String(st.n), rows: [
                ...(i > 0 ? [[`From "${stages[i - 1].label}"`, share(i) ? `${share(i)} (${st.n} of ${stages[i - 1].n})` : `${st.n}, more than the ${stages[i - 1].n} before: gyms added by hand skip a step`] as [string, string]] : []),
              ], note: 'Each step counts gyms that reached it; the percentage is how many of the step before got here.' })}>
                <span className="gw-step-name">{st.label}</span>
                <span className="gw-step-bar"><span style={{ width: `${(st.n / widest) * 100}%` }} /></span>
                <b>{st.n}</b>
                <small>{share(i)}</small>
              </li>
            ))}
          </ol>
          {skipped && <p className="gw-foot">Gyms added by hand skip Applied, so a step can count more than the one before. Its share is left out.</p>}
        </section>

        <section className="card gw-use">
          <h2 className="section-title"><Sparkles size={14} /> What gyms use, last 30 days</h2>
          <ol className="gw-steps">
            {ranked.map((a) => {
              const pct = a.gyms_total ? Math.round((a.gyms_30d / a.gyms_total) * 100) : 0;
              return (
                <li key={a.feature} data-detail={detail({ title: a.label, value: `${pct}%`, rows: [
                  ['Gyms that used it, 30 days', String(a.gyms_30d)], ['Gyms that could', String(a.gyms_total)], ['Gyms that did not', String(Math.max(0, a.gyms_total - a.gyms_30d))],
                ], note: 'A gym counts once it used this at least once in the last 30 days. Usage has every gym against every feature.' })}>
                  <span className="gw-step-name">{a.label}</span>
                  <span className="gw-step-bar"><span style={{ width: `${pct}%` }} /></span>
                  <b>{pct}%</b>
                  <small>{a.gyms_30d} of {a.gyms_total} gyms</small>
                </li>
              );
            })}
          </ol>
        </section>
      </div>
    </>
  );
}
