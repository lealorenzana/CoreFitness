import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Database, HardDrive, Users } from 'lucide-react';
import { capacity, explain, type CapacityRow } from '../lib/platform';

const size = (b: number) => b >= 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(2)} GB`
  : b >= 1024 ** 2 ? `${(b / 1024 ** 2).toFixed(1)} MB` : b >= 1024 ? `${Math.round(b / 1024)} KB` : `${b} B`;

/**
 * Capacity (0138): how close the service is to Supabase's free tier — 500 MB of
 * database, 1 GB of storage, 50,000 monthly sign-ins. Sizes and counts only,
 * never a gym's rows. Egress is not measurable from inside the database, so it
 * is not shown rather than guessed.
 */
export default function Capacity() {
  const [rows, setRows] = useState<CapacityRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void (async () => {
      try { setRows(await capacity()); } catch (e) { setError(explain(e, '0138')); setRows([]); }
    })();
  }, []);

  if (rows === null) return <p className="empty">Measuring…</p>;
  const of = (kind: CapacityRow['kind']) => rows.filter((r) => r.kind === kind);
  const big = (r: CapacityRow | undefined, icon: React.ReactNode, fmt: (n: number) => string) => {
    if (!r) return null;
    const pct = r.cap ? Math.min(100, (r.used / r.cap) * 100) : 0;
    return (
      <section className="card" key={r.kind}>
        <h2 className="section-title">{icon} {r.label}</h2>
        <div className="kpi-value" style={{ fontSize: 26, fontWeight: 800 }}>{fmt(r.used)}</div>
        <div className="meta">of {r.cap ? fmt(r.cap) : '—'} on the free tier · {pct.toFixed(pct < 1 ? 2 : 0)}% used</div>
        <div className="meter" style={{ marginTop: 12 }}>
          <span style={{ width: `${Math.max(pct, 0.5)}%`, background: pct >= 80 ? 'var(--warn)' : undefined }} />
        </div>
        {pct >= 80 && <p className="meta" style={{ color: 'var(--warn)' }}>Past 80% — the bell is ringing about this.</p>}
      </section>
    );
  };
  const list = (items: CapacityRow[], empty: string, link?: boolean) => {
    if (items.length === 0) return <p className="empty"><HardDrive size={22} className="empty-icon" />{empty}</p>;
    const most = Math.max(1, ...items.map((r) => r.used));
    const total = items.reduce((n, r) => n + r.used, 0);
    return (
      <>
        <div className="cap-list">
          {items.map((r, i) => (
            <div className="cap-row" key={r.kind + r.key}>
              <span className="cap-rank">{i + 1}</span>
              <span className="cap-name">{link ? <Link to={`/gyms/${r.key}`}>{r.label}</Link> : <code>{r.label}</code>}</span>
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
    <>
      {error && <p className="err">{error}</p>}
      <div className="grid-3" style={{ marginTop: 0 }}>
        {big(of('database')[0], <Database size={14} />, size)}
        {big(of('storage')[0], <HardDrive size={14} />, size)}
        {big(of('users')[0], <Users size={14} />, (n) => n.toLocaleString('en-PH'))}
      </div>
      <div className="grid-3">
        <section className="card"><h2 className="section-title"><Database size={14} /> Biggest tables</h2>{list(of('table'), 'Nothing measured.')}</section>
        <section className="card"><h2 className="section-title"><HardDrive size={14} /> Storage by bucket</h2>{list(of('bucket'), 'No files stored yet.')}</section>
        <section className="card"><h2 className="section-title"><Users size={14} /> Each gym's own files</h2>{list(of('gym'), 'No gym has uploaded anything yet.', true)}</section>
      </div>
    </>
  );
}
