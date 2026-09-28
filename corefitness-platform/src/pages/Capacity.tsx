import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, Database, FileImage, Gauge, HardDrive, LineChart, Lightbulb, Table2, Users } from 'lucide-react';
import { capacity, explain, type CapacityRow } from '../lib/platform';
import {
  capacityDetails, capacityHistory, gymFootprint, snapshotCapacity,
  type CapacityDay, type CapacityDetail, type GymFootprint,
} from '../lib/insight';
import InfoDot from '../components/InfoDot';

const size = (b: number) => b >= 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(2)} GB`
  : b >= 1024 ** 2 ? `${(b / 1024 ** 2).toFixed(1)} MB` : b >= 1024 ? `${Math.round(b / 1024)} KB` : `${b} B`;
const count = (n: number) => n.toLocaleString('en-PH');
const shortDay = (d: string) => new Date(d + 'T00:00:00+08:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });

/** Growth per 30 days from the snapshots, and when the limit is reached at that pace. */
function pace(hist: CapacityDay[], key: 'db_bytes' | 'storage_bytes' | 'mau', cap: number | null) {
  if (hist.length < 2) return null;
  const a = hist[0], b = hist[hist.length - 1];
  const days = Math.max(1, (new Date(b.day).getTime() - new Date(a.day).getTime()) / 86_400_000);
  const perMonth = ((b[key] - a[key]) / days) * 30;
  const months = cap && perMonth > 0 ? (cap - b[key]) / perMonth : null;
  return { perMonth, months, days };
}

/**
 * Capacity (0138, deepened by 0140): how close the service is to Supabase's free
 * tier, how fast it is getting there, and where the space goes — per table, per
 * bucket, per gym, and the largest files (by size and gym, never by name).
 * Sizes and counts only, never a gym's rows. Limits that cannot be measured
 * from inside the database are listed as such rather than guessed.
 */
export default function Capacity() {
  const [rows, setRows] = useState<CapacityRow[] | null>(null);
  const [hist, setHist] = useState<CapacityDay[] | null>(null);
  const [det, setDet] = useState<CapacityDetail[] | null>(null);
  const [foot, setFoot] = useState<GymFootprint[] | null>(null);
  const [range, setRange] = useState(90);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try { setRows(await capacity()); } catch (e) { setError(explain(e, '0138')); setRows([]); }
      // 0140's half: today's reading first, so the trend includes today.
      await snapshotCapacity();
      const [h, d, f] = await Promise.all([capacityHistory(365).catch(() => null), capacityDetails().catch(() => null), gymFootprint().catch(() => null)]);
      setHist(h); setDet(d); setFoot(f);
    })();
  }, []);

  const shown = useMemo(() => {
    if (!hist) return [];
    const since = new Date(Date.now() - range * 86_400_000).toISOString().slice(0, 10);
    return hist.filter((h) => h.day >= since);
  }, [hist, range]);

  if (rows === null) return <p className="empty">Measuring…</p>;
  const of = (kind: CapacityRow['kind']) => rows.filter((r) => r.kind === kind);
  const dbRow = of('database')[0], stRow = of('storage')[0], usRow = of('users')[0];
  const tables: CapacityDetail[] = det?.filter((d) => d.kind === 'table') ?? of('table').map((r) => ({ kind: 'table', key: r.key, label: r.label, used: r.used, n: null }));
  const buckets: CapacityDetail[] = det?.filter((d) => d.kind === 'bucket') ?? of('bucket').map((r) => ({ kind: 'bucket', key: r.key, label: r.label, used: r.used, n: null }));
  const files = det?.filter((d) => d.kind === 'file') ?? [];
  const gyms = foot ?? of('gym').map((r) => ({ gym_id: r.key, name: r.label, rows: 0, files: 0, file_bytes: r.used }));

  const meter = (r: CapacityRow | undefined, icon: React.ReactNode, fmt: (n: number) => string, key: 'db_bytes' | 'storage_bytes' | 'mau', tip: string) => {
    if (!r) return null;
    const pct = r.cap ? Math.min(100, (r.used / r.cap) * 100) : 0;
    const p = hist ? pace(hist, key, r.cap) : null;
    return (
      <section className="card cap-meter" key={r.kind}>
        <h2 className="section-title">{icon} {r.label} <InfoDot tip={tip} /></h2>
        <div className="cap-big"><b>{fmt(r.used)}</b><span>of {r.cap ? fmt(r.cap) : '—'}</span></div>
        <div className="meter" data-tip={`${pct.toFixed(pct < 1 ? 2 : 1)}% of the free tier used`}>
          <span style={{ width: `${Math.max(pct, 0.6)}%`, background: pct >= 80 ? 'var(--warn)' : undefined }} />
        </div>
        <div className="cap-pace">
          <span data-tip="How much it grew per 30 days, from the daily readings">
            {p ? `${p.perMonth >= 0 ? '+' : '−'}${fmt(Math.abs(Math.round(p.perMonth)))} a month` : 'Trend from tomorrow'}
          </span>
          <span className={p?.months !== null && p?.months !== undefined && p.months < 6 ? 'warn' : ''}
            data-tip="At this pace, when the free tier would be full. It is a straight line, not a forecast.">
            {!p ? 'one reading a day' : p.months === null ? 'not growing' : p.months > 120 ? 'full in 10+ years' : `full in ~${p.months < 1 ? 'under a month' : `${Math.round(p.months)} months`}`}
          </span>
        </div>
        {pct >= 80 && <p className="meta" style={{ color: 'var(--warn)', margin: 0 }}>Past 80% — the bell is ringing about this.</p>}
      </section>
    );
  };

  const bars = (items: { key: string; label: React.ReactNode; used: number; sub?: string; tip?: string }[], empty: string) => {
    if (items.length === 0) return <p className="empty"><HardDrive size={22} className="empty-icon" />{empty}</p>;
    const most = Math.max(1, ...items.map((r) => r.used));
    const total = items.reduce((n, r) => n + r.used, 0);
    return (
      <>
        <div className="cap-list ov-scroll">
          {items.map((r, i) => (
            <div className="cap-row" key={r.key} data-tip={r.tip}>
              <span className="cap-rank">{i + 1}</span>
              <span className="cap-name">{r.label}{r.sub && <small className="cap-sub">{r.sub}</small>}</span>
              <span className="cap-size"><strong>{size(r.used)}</strong><small>{total ? Math.round((r.used / total) * 100) : 0}%</small></span>
              <span className="cap-bar"><span style={{ width: `${Math.max(2, (r.used / most) * 100)}%` }} /></span>
            </div>
          ))}
        </div>
        <div className="cap-foot"><span>{items.length} listed</span><strong>{size(total)}</strong></div>
      </>
    );
  };

  return (
    <div className="cap">
      {error && <p className="err cap-12">{error}</p>}
      {meter(dbRow, <Database size={14} />, size, 'db_bytes', 'Everything in Postgres: every gym\'s rows, indexes and the platform\'s own tables. The free tier allows 500 MB.')}
      {meter(stRow, <HardDrive size={14} />, size, 'storage_bytes', 'Files in Supabase Storage: logos, photos, credentials, progress photos. The free tier allows 1 GB.')}
      {meter(usRow, <Users size={14} />, count, 'mau', 'Accounts that signed in during the last 30 days, across every gym. The free tier allows 50,000.')}

      <section className="card cap-8">
        <div className="ov-head">
          <h2 className="section-title"><LineChart size={14} /> Size over time <InfoDot tip="One reading per Manila day, taken when this page opens (pg_cron is optional here). Database in violet, storage in amber." /></h2>
          <div className="filters" style={{ marginLeft: 'auto' }}>
            {[30, 90, 365].map((d) => <button key={d} type="button" className={range === d ? 'on' : ''} onClick={() => setRange(d)}>{d === 365 ? '1 year' : `${d} days`}</button>)}
          </div>
        </div>
        {hist === null ? <p className="empty"><LineChart size={22} className="empty-icon" />Paste migration 0140 to keep a daily history.</p>
          : shown.length < 2 ? <p className="empty"><LineChart size={22} className="empty-icon" />{shown.length === 1 ? `First reading taken ${shortDay(shown[0].day)}. The line starts with tomorrow's.` : 'No readings yet.'}</p>
          : <TrendChart days={shown} />}
      </section>

      <div className="cap-4 cap-col">
        <section className="card">
          <h2 className="section-title"><Gauge size={14} /> Limits this page cannot see</h2>
          <ul className="cap-limits">
            <li data-tip="Data sent out of Supabase — every page load and photo shown. Measured only by Supabase itself."><b>Egress</b><span>5 GB a month</span></li>
            <li data-tip="Calls to the Edge Functions (approve-gym, push, the assistant)."><b>Edge function calls</b><span>500,000 a month</span></li>
            <li data-tip="Live connections for realtime updates at the same moment."><b>Realtime connections</b><span>200 at once</span></li>
            <li data-tip="A free project with no activity for a week is paused until someone restores it."><b>Inactivity pause</b><span>after 7 quiet days</span></li>
          </ul>
          <p className="meta" style={{ margin: 0 }}>See them in the Supabase dashboard → Usage.</p>
        </section>
        <section className="card side-fill">
          <h2 className="section-title"><Lightbulb size={14} /> Near a limit</h2>
          <ul className="cap-tips">
            <li><b>Database:</b> remove demo data (Platform), then look at the biggest tables below — notifications and logs grow fastest.</li>
            <li><b>Storage:</b> the largest files are listed by gym; a gym's photo allowance is on its plan.</li>
            <li><b>Past what free allows:</b> Supabase Pro is $25 a month for 8 GB of database and 100 GB of files.</li>
          </ul>
        </section>
      </div>

      <section className="card cap-3">
        <h2 className="section-title"><Table2 size={14} /> Biggest tables <InfoDot tip="Size on disk including indexes; rows are Postgres's own estimate, never counted by reading them." /></h2>
        {bars(tables.map((t) => ({ key: t.key, label: <code>{t.label}</code>, used: t.used, sub: t.n !== null ? `${count(t.n)} rows` : undefined })), 'Nothing measured.')}
      </section>
      <section className="card cap-3">
        <h2 className="section-title"><HardDrive size={14} /> Storage by bucket</h2>
        {bars(buckets.map((b) => ({ key: b.key, label: <code>{b.label}</code>, used: b.used, sub: b.n !== null ? `${count(b.n)} files` : undefined })), 'No files stored yet.')}
      </section>
      <section className="card cap-3">
        <h2 className="section-title"><Building2 size={14} /> Each gym's footprint <InfoDot tip="Rows the gym owns across every gym table, and its own files under gyms/<id>/. Counts only." /></h2>
        {bars(gyms.map((g) => ({ key: g.gym_id, label: <Link to={`/gyms/${g.gym_id}`}>{g.name}</Link>, used: g.file_bytes,
          sub: foot ? `${count(g.rows)} rows · ${count(g.files)} files` : undefined })), 'No gym has uploaded anything yet.')}
      </section>
      <section className="card cap-3">
        <h2 className="section-title"><FileImage size={14} /> Largest files <InfoDot tip="By size and the gym that owns them. A file's name is never shown — it can be a person's." /></h2>
        {det === null ? <p className="empty"><FileImage size={22} className="empty-icon" />Paste migration 0140 to list them.</p>
          : bars(files.map((f) => ({ key: f.key, label: f.label, used: f.used })), 'No files stored yet.')}
      </section>
    </div>
  );
}

/** Database (violet) and storage (amber) over the chosen days — each on its own scale, both labelled. */
function TrendChart({ days }: { days: CapacityDay[] }) {
  const n = days.length;
  const x = (i: number) => (i / (n - 1)) * 100;
  // Two lanes, one per measure: on shared axes two lines growing alike draw on top of each other.
  const line = (key: 'db_bytes' | 'storage_bytes', top: number, bottom: number) => {
    const max = Math.max(1, ...days.map((d) => d[key]));
    const min = Math.min(...days.map((d) => d[key]));
    const span = Math.max(1, max - min);
    return days.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(2)},${(bottom - ((d[key] - min) / span) * (bottom - top)).toFixed(2)}`).join(' ');
  };
  const first = days[0], last = days[n - 1];
  return (
    <>
      <div className="ov-figs">
        <span><b>{size(last.db_bytes)}</b>database now</span>
        <span><b>{`${last.db_bytes >= first.db_bytes ? '+' : '−'}${size(Math.abs(last.db_bytes - first.db_bytes))}`}</b>since {shortDay(first.day)}</span>
        <span><b>{size(last.storage_bytes)}</b>storage now</span>
        <span><b>{count(last.storage_objects)}</b>files</span>
      </div>
      <div className="ov-chart" role="img" aria-label={`Database from ${size(first.db_bytes)} to ${size(last.db_bytes)}`}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none">
          <line x1="0" x2="100" y1="54" y2="54" className="ov-grid" />
          <path d={line('db_bytes', 6, 48)} className="ov-line" />
          <path d={line('storage_bytes', 60, 96)} className="cap-line-st" />
        </svg>
        <div className="cap-hit">
          {days.map((d) => <span key={d.day} data-tip={`${shortDay(d.day)} — database ${size(d.db_bytes)}, storage ${size(d.storage_bytes)}, ${count(d.mau)} signed in`} />)}
        </div>
      </div>
      <div className="ov-axis"><span>{shortDay(first.day)}</span><span>{shortDay(days[Math.floor(n / 2)].day)}</span><span>{shortDay(last.day)}</span></div>
      <div className="ov-legend"><span><i className="lg-line" />Database</span><span><i className="lg-line" style={{ background: '#F59E0B' }} />Storage</span></div>
    </>
  );
}
