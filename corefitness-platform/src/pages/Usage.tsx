import { useEffect, useState } from 'react';
import { detail } from '../components/DetailLayer';
import { Link } from 'react-router-dom';
import { Activity, Bot, Building2, DollarSign, Download, Grid3x3, MessageSquareWarning, Sparkles, TrendingDown } from 'lucide-react';
import { listGyms, type PlatformGym } from '../lib/platform';
import { aiUsage, gymUsage, isMissingFunction, usd, USAGE_FEATURES, type GymAiUse, type GymUse } from '../lib/insight';
import { downloadCsv } from '../lib/csv';
import GymMark from '../components/GymMark';
import Tiles from '../components/Tiles';
import InfoDot from '../components/InfoDot';
import AiUsage from '../components/AiUsage';
import Pagination from '../components/Pagination';
import { usePaged } from '../lib/usePaged';
import './usage.css';

/**
 * What each gym uses (0140): every gym against every feature, counted over the
 * chosen days. The deeper the violet, the more a feature is used there relative
 * to the busiest gym for it — so an empty column is a feature nobody has
 * found, and an empty row is a gym that is paying for less than it could use.
 * Counts only; chat and photos are counted, never read or seen.
 *
 * The AI coach (0147) is the one feature that costs money per use, so it also
 * gets an estimated spend: tokens at the coach model's list price, in US
 * dollars, labelled as an estimate — the real bill is on console.anthropic.com.
 */
export default function Usage() {
  const [days, setDays] = useState(30);
  const [use, setUse] = useState<GymUse[] | null>(null);
  const [gyms, setGyms] = useState<PlatformGym[]>([]);
  const [sort, setSort] = useState<string>('total');
  /** The big box shows the heatmap or the AI table; one at a time, each with the whole width. */
  const [view, setView] = useState<'features' | 'ai'>('features');
  const [error, setError] = useState<string | null>(null);
  /** Null until loaded, or when 0147 is not pasted — the tile then says which. */
  const [ai, setAi] = useState<GymAiUse[] | null>(null);
  const [aiMissing, setAiMissing] = useState(false);
  const [aiFailed, setAiFailed] = useState(false);

  useEffect(() => { void (async () => setGyms(await listGyms().catch(() => [])))(); }, []);
  useEffect(() => {
    void (async () => {
      try { setUse(await gymUsage(days)); setError(null); }
      catch { setUse([]); setError('Paste migration 0140 to see what each gym uses.'); }
    })();
    void (async () => {
      try { setAi(await aiUsage(days)); setAiMissing(false); setAiFailed(false); }
      catch (e) { setAi(null); const m = isMissingFunction(e); setAiMissing(m); setAiFailed(!m); }
    })();
  }, [days]);

  const n = (gym: string, f: string) => use?.find((u) => u.gym_id === gym && u.feature === f)?.n ?? 0;
  const most = (f: string) => Math.max(1, ...gyms.map((g) => n(g.id, f)));
  const total = (gym: string) => USAGE_FEATURES.reduce((s, f) => s + n(gym, f.key), 0);
  const breadth = (gym: string) => USAGE_FEATURES.filter((f) => n(gym, f.key) > 0).length;
  const rows = [...gyms].sort((a, b) => sort === 'total' ? total(b.id) - total(a.id)
    : sort === 'breadth' ? breadth(b.id) - breadth(a.id) : n(b.id, sort) - n(a.id, sort));
  const usagePage = usePaged(rows);
  const unused = USAGE_FEATURES.filter((f) => gyms.every((g) => n(g.id, f.key) === 0));
  const quiet = gyms.filter((g) => total(g.id) === 0 && !g.lock_reason);
  const spendOf = (gym: string) => ai?.find((a) => a.gym_id === gym)?.est_cost_usd ?? 0;
  const spend = (ai ?? []).reduce((s, a) => s + a.est_cost_usd, 0);
  const nameOf = (gym: string) => gyms.find((g) => g.id === gym)?.name ?? 'A gym no longer listed';
  const topSpend = (ai ?? []).filter((a) => a.est_cost_usd > 0)
    .sort((a, b) => b.est_cost_usd - a.est_cost_usd).slice(0, 5);
  const spendTip = aiMissing ? 'Paste migration 0147 to see what the coach costs.'
    : aiFailed ? "Couldn't load the coach's spend."
    : "Estimated at Claude Sonnet 5.5's list price; the real bill is on console.anthropic.com.\n"
      + (topSpend.length ? topSpend.map((a) => `${nameOf(a.gym_id)}: ${usd(a.est_cost_usd)}`).join('\n') : 'No gym used the coach.');

  return (
    <>
      <Tiles items={[
        { icon: Building2, value: String(gyms.length), label: 'Gyms compared' },
        { icon: Activity, value: use ? gyms.reduce((s, g) => s + total(g.id), 0).toLocaleString('en-PH') : '…', label: `Things done, ${days} days`, tip: 'Every counted action across every gym and feature' },
        { icon: Sparkles, value: use ? `${USAGE_FEATURES.length - unused.length}/${USAGE_FEATURES.length}` : '…', label: 'Features in use', tip: unused.length ? `Nobody used: ${unused.map((f) => f.label).join(', ')}` : 'Every feature is used somewhere' },
        { icon: TrendingDown, value: use ? String(quiet.length) : '…', label: 'Open gyms doing nothing', act: quiet.length > 0, tip: quiet.map((g) => g.name).join('\n') || 'None' },
        { icon: DollarSign, value: ai ? usd(spend) : aiMissing || aiFailed ? '—' : '…', label: `AI coach spend (${days} days)`, tip: spendTip },
      ]} />
      {error && <p className="err">{error}</p>}

      {/* One box with two views and its own controls; the gyms and features worth a word beside it (2026-11-22). */}
      <div className="ux" data-va-keep>
        <section className="card ux-main">
          <header className="ux-head">
            <div className="ux-seg" role="tablist" aria-label="Show">
              <button type="button" role="tab" aria-selected={view === 'features'} className={view === 'features' ? 'on' : ''} onClick={() => setView('features')}>
                <Grid3x3 size={14} /> Every feature</button>
              <button type="button" role="tab" aria-selected={view === 'ai'} className={view === 'ai' ? 'on' : ''} onClick={() => setView('ai')}>
                <Bot size={14} /> AI</button>
            </div>
            <div className="ux-seg" role="group" aria-label="Days">
              {[7, 30, 90].map((d) => <button key={d} type="button" className={days === d ? 'on' : ''} onClick={() => setDays(d)}>{d} days</button>)}
            </div>
            {view === 'features' && (
              <select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value)}>
                <option value="total">Busiest first</option>
                <option value="breadth">Most features used</option>
                {USAGE_FEATURES.map((f) => <option key={f.key} value={f.key}>Most {f.label.toLowerCase()}</option>)}
              </select>
            )}
            <span className="spacer" />
            {view === 'features' && (
              <button className="btn ghost" disabled={!use?.length} onClick={() => downloadCsv(`core-fitness-usage-${days}d`, rows, [
                ['Gym', (g) => g.name], ...USAGE_FEATURES.map((f) => [f.label, (g: PlatformGym) => n(g.id, f.key)] as [string, (g: PlatformGym) => number]),
                ['Total', (g) => total(g.id)],
              ])}><Download size={15} /> Export</button>
            )}
          </header>

          {view === 'ai' ? <div className="ux-ai"><AiUsage days={days} /></div> : (
            <>
              <p className="ux-sub">Each cell is a count for the last {days} days. The deeper the violet, the closer that gym is to the busiest gym for that feature.
                <InfoDot tip="Hover a cell for the number in words; click it for the busiest gym and a daily average." /></p>
              <div className="use-wrap ux-wrap">
                <table className="use-table ux-table">
                  <colgroup><col className="ux-col-gym" />{USAGE_FEATURES.map((f) => <col key={f.key} />)}<col className="ux-col-breadth" /></colgroup>
                  <thead>
                    <tr>
                      <th className="use-gym">Gym</th>
                      {USAGE_FEATURES.map((f) => <th key={f.key} data-tip={f.tip}><button type="button" className={sort === f.key ? 'on' : ''} onClick={() => setSort(f.key)}>{f.label}</button></th>)}
                      <th data-tip="How many of the features this gym used at all"><button type="button" className={sort === 'breadth' ? 'on' : ''} onClick={() => setSort('breadth')}>Breadth</button></th>
                    </tr>
                  </thead>
                  <tbody>
                    {usagePage.rows.map((g) => (
                      <tr key={g.id}>
                        <td className="use-gym"><Link to={`/gyms/${g.id}`}><GymMark name={g.name} logoUrl={g.logo_url} accent={g.accent} size={24} /><span>{g.name}</span></Link></td>
                        {USAGE_FEATURES.map((f) => {
                          const v = n(g.id, f.key);
                          const a = v ? 0.12 + (v / most(f.key)) * 0.72 : 0;
                          return (
                            <td key={f.key} className={v ? 'ux-v' : 'zero'}
                              data-detail={detail({ title: `${g.name}, ${f.label}`, value: `${v.toLocaleString('en-PH')} in ${days} days`, rows: [
                                ['The busiest gym at this', most(f.key).toLocaleString('en-PH')], ['A day, on average', (v / days).toFixed(1)],
                                ...(f.key === 'coach' && ai ? [['Estimated cost at list price', usd(spendOf(g.id))] as [string, string]] : []),
                              ], note: v ? undefined : 'Not used in this window, worth a word with the owner.' })}
                              data-tip={f.key === 'coach'
                                ? `${g.name}: ${v.toLocaleString('en-PH')} coach messages in ${days} days`
                                  + (ai ? `, about ${usd(spendOf(g.id))} at list price (an estimate)` : '')
                                : `${g.name}: ${v.toLocaleString('en-PH')} ${f.label.toLowerCase()} in ${days} days`}>
                              {v ? <span style={{ background: `rgba(124, 58, 237, ${a.toFixed(2)})` }}>{v.toLocaleString('en-PH')}</span> : '·'}
                            </td>
                          );
                        })}
                        <td className="use-breadth" data-tip={`${breadth(g.id)} of ${USAGE_FEATURES.length} features used`}>
                          <b>{breadth(g.id)}</b><small>/{USAGE_FEATURES.length}</small>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination page={usagePage.page} perPage={usagePage.perPage} total={usagePage.total} noun={usagePage.total === 1 ? 'gym' : 'gyms'} onPage={usagePage.setPage} />
            </>
          )}
        </section>

        <aside className="card ux-side">
          <h2 className="section-title"><MessageSquareWarning size={14} /> Worth a word</h2>
          <div className="ux-block">
            <span className="ux-label">Open gyms doing nothing <b>{use ? quiet.length : '…'}</b></span>
            {use && quiet.length === 0 && <p className="ux-none">Every open gym did something in these {days} days.</p>}
            <ul className="ux-list">
              {quiet.map((g) => (
                <li key={g.id}><Link to={`/gyms/${g.id}`}><GymMark name={g.name} logoUrl={g.logo_url} accent={g.accent} size={22} /><span>{g.name}</span></Link></li>
              ))}
            </ul>
          </div>
          <div className="ux-block">
            <span className="ux-label">Features nobody used <b>{use ? unused.length : '…'}</b></span>
            {use && unused.length === 0 && <p className="ux-none">Every feature was used somewhere.</p>}
            {unused.length > 0 && <p className="ux-chips">{unused.map((f) => <span key={f.key}>{f.label}</span>)}</p>}
            {unused.length > 0 && use && use.length > 0 && <p className="ux-none">Worth an announcement to every gym.</p>}
          </div>
        </aside>
      </div>
    </>
  );
}
