import { useEffect, useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import Modal from './Modal';
import { csvOf, manilaToday, saveFile } from '../lib/csv';
import { EXPORT_EVENT, toXlsx, type ExportRequest } from '../lib/exportRequest';
import './exportWindow.css';

/** Rows drawn in the preview; every row is in the file unless unticked. */
const SHOWN = 300;
const titleOf = (n: string) => { const t = n.replace(/^core-fitness-/, '').replace(/[_-]+/g, ' ').trim(); return t ? t[0].toUpperCase() + t.slice(1) : 'Export'; };

/**
 * The export window (owner, 2026-11-27): tick the columns and rows that go in the file, see exactly what it holds,
 * pick CSV or Excel, then Download. The same window as the gym owner's app, in this app's style.
 */
function ExportWindow({ req, onClose }: { req: ExportRequest; onClose: () => void }) {
  const cols = useMemo(() => [...new Set(req.rows.flatMap((r) => Object.keys(r)))], [req.rows]);
  const [offCols, setOffCols] = useState<Set<string>>(new Set());
  const [offRows, setOffRows] = useState<Set<number>>(new Set());
  const [format, setFormat] = useState<'csv' | 'xlsx'>('csv');
  const [saving, setSaving] = useState(false);
  const on = cols.filter((c) => !offCols.has(c));
  const rowCount = req.rows.length - offRows.size;
  const file = `${req.name}-${manilaToday()}.${format}`;
  const flip = <T,>(set: Set<T>, v: T) => { const n = new Set(set); if (n.has(v)) n.delete(v); else n.add(v); return n; };
  const allOn = offRows.size === 0, noneOn = rowCount === 0;
  const title = req.title ?? titleOf(req.name);

  const save = async () => {
    setSaving(true);
    try {
      const rows = req.rows.filter((_, i) => !offRows.has(i)).map((r) => on.map((c) => r[c]));
      if (format === 'xlsx') saveFile(file, (await toXlsx(title, on, rows)) as BlobPart, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      else saveFile(file, csvOf(on, rows), 'text/csv;charset=utf-8');
      onClose();
    } finally { setSaving(false); }
  };

  return (
    <Modal open onClose={onClose} title={`Export ${title.toLowerCase()}`} subtitle={`${req.rows.length.toLocaleString('en-PH')} row${req.rows.length === 1 ? '' : 's'}`} size="lg">
      <div className="xw" data-export-window>
        <div className="xw-top">
          <div className="xw-cols" aria-label="Columns in the file">
            {cols.map((c) => (
              <label key={c} className={`xw-chip ${offCols.has(c) ? '' : 'on'}`}>
                <input type="checkbox" checked={!offCols.has(c)} onChange={() => setOffCols(flip(offCols, c))} data-export-col={c} />{c}
              </label>
            ))}
            <span className="xw-links"><button type="button" onClick={() => setOffCols(new Set())}>All</button><button type="button" onClick={() => setOffCols(new Set(cols))}>None</button></span>
          </div>
          <div className="xw-seg" role="radiogroup" aria-label="File type">
            {(['csv', 'xlsx'] as const).map((f) => (
              <button key={f} type="button" role="radio" aria-checked={format === f} className={format === f ? 'on' : ''} onClick={() => setFormat(f)} data-format={f}>{f === 'csv' ? 'CSV' : 'Excel'}</button>
            ))}
          </div>
        </div>
        <div className="xw-table">
          {on.length === 0 ? <p className="xw-note">Tick at least one column to see what the file holds.</p> : (
            <table>
              <thead><tr>
                <th className="xw-tick"><input type="checkbox" aria-label="All rows" checked={allOn} ref={(e) => { if (e) e.indeterminate = !allOn && !noneOn; }}
                  onChange={() => setOffRows(allOn ? new Set(req.rows.map((_, i) => i)) : new Set())} /></th>
                {on.map((c) => <th key={c}>{c}</th>)}
              </tr></thead>
              <tbody>
                {req.rows.slice(0, SHOWN).map((r, i) => (
                  <tr key={i} className={offRows.has(i) ? 'off' : ''} data-export-row>
                    <td className="xw-tick"><input type="checkbox" aria-label={`Row ${i + 1}`} checked={!offRows.has(i)} onChange={() => setOffRows(flip(offRows, i))} /></td>
                    {on.map((c) => <td key={c}>{r[c] === null || r[c] === undefined ? '' : String(r[c])}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {req.rows.length > SHOWN && on.length > 0 && <p className="xw-note">The first {SHOWN} rows are shown here; the other {(req.rows.length - SHOWN).toLocaleString('en-PH')} go in the file too.</p>}
        </div>
        <div className="xw-foot">
          <span className="xw-sum" data-export-summary><b>{rowCount.toLocaleString('en-PH')}</b> of {req.rows.length.toLocaleString('en-PH')} rows · <b>{on.length}</b> of {cols.length} columns <code>{file}</code></span>
          <span style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
            <button type="button" className="btn" onClick={() => void save()} disabled={saving || noneOn || on.length === 0} data-export-download>
              <Download size={15} />{saving ? 'Saving…' : 'Download'}
            </button>
          </span>
        </div>
      </div>
    </Modal>
  );
}

/** Mounted once beside the tooltip layer: opens the window for each export. */
export default function ExportHost() {
  const [req, setReq] = useState<ExportRequest | null>(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    const open = (e: Event) => {
      const r = (e as CustomEvent<ExportRequest>).detail;
      if (!r.rows.length) return; // the buttons are disabled with nothing to export; never an empty window
      setReq(r); setN((x) => x + 1);
    };
    window.addEventListener(EXPORT_EVENT, open);
    return () => window.removeEventListener(EXPORT_EVENT, open);
  }, []);
  return req ? <ExportWindow key={n} req={req} onClose={() => setReq(null)} /> : null;
}
