import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, Building2, DollarSign, Download, Grid3x3, Sparkles, TrendingDown } from 'lucide-react';
import { listGyms, type PlatformGym } from '../lib/platform';
import { aiUsage, gymUsage, usd, USAGE_FEATURES, type GymAiUse, type GymUse } from '../lib/insight';
import { downloadCsv } from '../lib/csv';
import GymMark from '../components/GymMark';
import Tiles from '../components/Tiles';
import InfoDot from '../components/InfoDot';

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
  const [error, setError] = useState<string | null>(null);
  /** Null until loaded, or when 0147 is not pasted — the tile then says which. */
  const [ai, setAi] = useState<GymAiUse[] | null>(null);
  const [aiMissing, setAiMissing] = useState(false);

  useEffect(() => { void (async () => setGyms(await listGyms().catch(() => [])))(); }, []);
  useEffect(() => {
    void (async () => {
      try { setUse(await gymUsage(days)); setError(null); }
      catch { setUse([]); setError('Paste migration 0140 to see what each gym uses.'); }
    })();
    void (async () => {
      try { setAi(await aiUsage(days)); setAiMissing(false); }
      catch { setAi(null); setAiMissing(true); }
    })();
  }, [days]);

  const n = (gym: string, f: string) => use?.find((u) => u.gym_id === gym && u.feature === f)?.n ?? 0;
  const most = (f: string) => Math.max(1, ...gyms.map((g) => n(g.id, f)));
  const total = (gym: string) => USAGE_FEATURES.reduce((s, f) => s + n(gym, f.key), 0);
  const breadth = (gym: string) => USAGE_FEATURES.filter((f) => n(gym, f.key) > 0).length;
  const rows = [...gyms].sort((a, b) => sort === 'total' ? total(b.id) - total(a.id)
    : sort === 'breadth' ? breadth(b.id) - breadth(a.id) : n(b.id, sort) - n(a.id, sort));
  const unused = USAGE_FEATURES.filter((f) => gyms.every((g) => n(g.id, f.key) === 0));
  const quiet = gyms.filter((g) => total(g.id) === 0 && !g.lock_reason);
  const spendOf = (gym: string) => ai?.find((a) => a.gym_id === gym)?.est_cost_usd ?? 0;
  const spend = (ai ?? []).reduce((s, a) => s + a.est_cost_usd, 0);
  const nameOf = (gym: string) => gyms.find((g) => g.id === gym)?.name ?? 'A gym no longer listed';
  const topSpend = (ai ?? []).filter((a) => a.est_cost_usd > 0)
    .sort((a, b) => b.est_cost_usd - a.est_cost_usd).slice(0, 5);
  const spendTip = aiMissing ? 'Paste migration 0147 to see what the coach costs.'
    : "Estimated at Claude Sonnet 5.5's list price; the real bill is on console.anthropic.com.\n"
      + (topSpend.length ? topSpend.map((a) => `${nameOf(a.gym_id)}: ${usd(a.est_cost_usd)}`).join('\n') : 'No gym used the coach.');

  return (
    <>
      <Tiles items={[
        { icon: Building2, value: String(gyms.length), label: 'Gyms compared' },
        { icon: Activity, value: use ? gyms.reduce((s, g) => s + total(g.id), 0).toLocaleString('en-PH') : '…', label: `Things done, ${days} days`, tip: 'Every counted action across every gym and feature' },
        { icon: Sparkles, value: use ? `${USAGE_FEATURES.length - unused.length}/${USAGE_FEATURES.length}` : '…', label: 'Features in use', tip: unused.length ? `Nobody used: ${unused.map((f) => f.label).join(', ')}` : 'Every feature is used somewhere' },
        { icon: TrendingDown, value: use ? String(quiet.length) : '…', label: 'Open gyms doing nothing', act: quiet.length > 0, tip: quiet.map((g) => g.name).join('\n') || 'None' },
        { icon: DollarSign, value: ai ? usd(spend) : aiMissing ? '—' : '…', label: `AI coach spend (${days} days)`, tip: spendTip },
      ]} />
      <div className="toolbar">
        <div className="filters">
          {[7, 30, 90].map((d) => <button key={d} type="button" className={days === d ? 'on' : ''} onClick={() => setDays(d)}>{d} days</button>)}
        </div>
        <select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value)} style={{ width: 200 }}>
          <option value="total">Busiest first</option>
          <option value="breadth">Most features used</option>
          {USAGE_FEATURES.map((f) => <option key={f.key} value={f.key}>Most {f.label.toLowerCase()}</option>)}
        </select>
        <span className="spacer" />
        <button className="btn ghost" disabled={!use?.length} onClick={() => downloadCsv(`core-fitness-usage-${days}d`, rows, [
          ['Gym', (g) => g.name], ...USAGE_FEATURES.map((f) => [f.label, (g: PlatformGym) => n(g.id, f.key)] as [string, (g: PlatformGym) => number]),
          ['Total', (g) => total(g.id)],
        ])}><Download size={15} /> Export CSV</button>
      </div>
      {error && <p className="err">{error}</p>}

      <section className="card use-card">
        <h2 className="section-title"><Grid3x3 size={14} /> Every gym, every feature, last {days} days
          <InfoDot tip="Each cell is a count. The deeper the violet, the closer that gym is to the busiest gym for that feature. Hover a cell for the number in words." /></h2>
        <div className="use-wrap">
          <table className="use-table">
            <thead>
              <tr>
                <th className="use-gym">Gym</th>
                {USAGE_FEATURES.map((f) => <th key={f.key} data-tip={f.tip}><button type="button" className={sort === f.key ? 'on' : ''} onClick={() => setSort(f.key)}>{f.label}</button></th>)}
                <th data-tip="How many of the features this gym used at all"><button type="button" className={sort === 'breadth' ? 'on' : ''} onClick={() => setSort('breadth')}>Breadth</button></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((g) => (
                <tr key={g.id}>
                  <td className="use-gym"><Link to={`/gyms/${g.id}`}><GymMark name={g.name} logoUrl={g.logo_url} accent={g.accent} size={26} /><span>{g.name}</span></Link></td>
                  {USAGE_FEATURES.map((f) => {
                    const v = n(g.id, f.key);
                    const a = v ? 0.12 + (v / most(f.key)) * 0.72 : 0;
                    return (
                      <td key={f.key} className={v ? '' : 'zero'} style={v ? { background: `rgba(124, 58, 237, ${a.toFixed(2)})` } : undefined}
                        data-tip={f.key === 'coach'
                          ? `${g.name}: ${v.toLocaleString('en-PH')} coach messages in ${days} days`
                            + (ai ? `, about ${usd(spendOf(g.id))} at list price (an estimate)` : '')
                          : `${g.name}: ${v.toLocaleString('en-PH')} ${f.label.toLowerCase()} in ${days} days`}>
                        {v ? v.toLocaleString('en-PH') : '·'}
                      </td>
                    );
                  })}
                  <td className="use-breadth" data-tip={`${breadth(g.id)} of ${USAGE_FEATURES.length} features used`}>
                    <span className="meter"><span style={{ width: `${(breadth(g.id) / USAGE_FEATURES.length) * 100}%` }} /></span>
                    <b>{breadth(g.id)}</b>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {unused.length > 0 && use && use.length > 0 && (
          <p className="meta use-foot">Nobody used {unused.map((f) => f.label.toLowerCase()).join(', ')} in these {days} days — worth an announcement.</p>
        )}
      </section>
    </>
  );
}
