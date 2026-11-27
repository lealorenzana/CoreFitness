import { useEffect, useMemo, useState } from 'react';
import { Download, FileSpreadsheet } from 'lucide-react';
import FloatingWindow from './FloatingWindow';
import { toCsv, toXlsx, download } from '../../lib/gymDataExport';
import { todayKey } from '../../utils/dates';
import './exportWindow.css';
import { EXPORT_EVENT, type ExportRequest } from '../../lib/exportRequest';

/**
 * The export window (owner, 2026-11-27): every Export button in the app opens this instead of downloading at once.
 * Tick the columns and the rows that go in the file, see exactly what the file will hold, pick CSV or Excel, then
 * Download. `exportToCSV()` (utils/exportUtils.ts) opens it through `openExport()`, so no Export button needed changing.
 */
/** Rows drawn in the preview. Every row is in the file (unless unticked); past this many, the preview says so. */
const SHOWN = 300;
const text = (v: unknown) => (v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v));
const titleOf = (f: string) => {
  const t = f.replace(/[_-]+/g, ' ').replace(/\b\d{4} \d{2} \d{2}\b/g, '').trim();
  return t ? t[0].toUpperCase() + t.slice(1) : 'Export';
};

/** The window itself, for a request. Mounted once by ExportHost. */
function ExportWindow({ req, onClose, tabs }: { req: ExportRequest; onClose: () => void; tabs?: React.ReactNode }) {
  const cols = useMemo(() => [...new Set(req.rows.flatMap((r) => Object.keys(r)))], [req.rows]);
  const [offCols, setOffCols] = useState<Set<string>>(new Set());
  const [offRows, setOffRows] = useState<Set<number>>(new Set());
  const [format, setFormat] = useState<'csv' | 'xlsx'>('csv');
  const [saving, setSaving] = useState(false);
  const on = cols.filter((c) => !offCols.has(c));
  const rowCount = req.rows.length - offRows.size;
  const name = `${req.stampDate === false ? req.filename : `${req.filename}_${todayKey()}`}.${format}`;
  const flip = <T,>(set: Set<T>, v: T) => { const n = new Set(set); if (n.has(v)) n.delete(v); else n.add(v); return n; };
  const allRowsOn = offRows.size === 0, noRowsOn = rowCount === 0;

  const save = async () => {
    setSaving(true);
    try {
      const rows = req.rows.filter((_, i) => !offRows.has(i)).map((r) => Object.fromEntries(on.map((c) => [c, r[c]])));
      if (format === 'xlsx') download(name, (await toXlsx([{ name: req.title ?? titleOf(req.filename), rows }])) as BlobPart, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      else download(name, toCsv(rows), 'text/csv;charset=utf-8');
      onClose();
    } finally { setSaving(false); }
  };

  return (
    <FloatingWindow open onClose={onClose} title={req.title ?? titleOf(req.filename)} icon={FileSpreadsheet} count={req.rows.length} data-export-window
      tools={(
        <span className="flex items-center gap-2">{tabs}<div className="xw-seg" role="radiogroup" aria-label="File type">
          {(['csv', 'xlsx'] as const).map((f) => (
            <button key={f} type="button" role="radio" aria-checked={format === f} className={format === f ? 'on' : ''} onClick={() => setFormat(f)} data-format={f}>
              {f === 'csv' ? 'CSV' : 'Excel'}
            </button>
          ))}
        </div></span>
      )}
      footer={(
        <>
          <span className="xw-sum" data-export-summary>
            <b>{rowCount.toLocaleString('en-PH')}</b> of {req.rows.length.toLocaleString('en-PH')} rows · <b>{on.length}</b> of {cols.length} columns
            <span className="xw-file">{name}</span>
          </span>
          <span className="flex items-center gap-2">
            <button type="button" className="xw-btn" onClick={onClose}>Cancel</button>
            <button type="button" className="xw-btn go" onClick={() => void save()} disabled={saving || noRowsOn || on.length === 0} data-export-download>
              <Download size={15} />{saving ? 'Saving…' : 'Download'}
            </button>
          </span>
        </>
      )}>
      <div className="xw" data-export-body>
        <div className="xw-cols" aria-label="Columns in the file">
          <span className="xw-lbl">Columns</span>
          {cols.map((c) => (
            <label key={c} className={`xw-chip ${offCols.has(c) ? '' : 'on'}`}>
              <input type="checkbox" checked={!offCols.has(c)} onChange={() => setOffCols(flip(offCols, c))} data-export-col={c} />{c}
            </label>
          ))}
          <span className="xw-links">
            <button type="button" onClick={() => setOffCols(new Set())}>All</button>
            <button type="button" onClick={() => setOffCols(new Set(cols))}>None</button>
          </span>
        </div>
        <div className="xw-table">
          {on.length === 0 ? <p className="xw-none">Tick at least one column to see what the file holds.</p> : (
            <table>
              <thead>
                <tr>
                  <th className="xw-tick">
                    <input type="checkbox" aria-label="All rows" checked={allRowsOn} ref={(e) => { if (e) e.indeterminate = !allRowsOn && !noRowsOn; }}
                      onChange={() => setOffRows(allRowsOn ? new Set(req.rows.map((_, i) => i)) : new Set())} data-export-all-rows />
                  </th>
                  {on.map((c) => <th key={c}>{c}</th>)}
                </tr>
              </thead>
              <tbody>
                {req.rows.slice(0, SHOWN).map((r, i) => (
                  <tr key={i} className={offRows.has(i) ? 'off' : ''} data-export-row>
                    <td className="xw-tick"><input type="checkbox" aria-label={`Row ${i + 1}`} checked={!offRows.has(i)} onChange={() => setOffRows(flip(offRows, i))} /></td>
                    {on.map((c) => <td key={c}>{text(r[c])}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {req.rows.length > SHOWN && on.length > 0 && (
            <p className="xw-more">The first {SHOWN} rows are shown here; the other {(req.rows.length - SHOWN).toLocaleString('en-PH')} go in the file too.</p>
          )}
        </div>
      </div>
    </FloatingWindow>
  );
}

/** Mounted once in the layout: opens the window for each openExport() call. */
export default function ExportHost() {
  const [req, setReq] = useState<ExportRequest | null>(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    const open = (e: Event) => { setReq((e as CustomEvent<ExportRequest>).detail); setN((x) => x + 1); };
    window.addEventListener(EXPORT_EVENT, open);
    return () => window.removeEventListener(EXPORT_EVENT, open);
  }, []);
  const [tab, setTab] = useState(0);
  if (!req) return null;
  const all = [req, ...(req.more ?? [])];
  const cur = all[Math.min(tab, all.length - 1)];
  const close = () => { setReq(null); setTab(0); };
  const tabs = all.length > 1 ? (
    <div className="xw-seg" role="tablist" aria-label="Tables">
      {all.map((r, i) => (
        <button key={i} type="button" role="tab" aria-selected={cur === r} className={cur === r ? 'on' : ''} onClick={() => setTab(i)} data-export-tab={i}>
          {r.title ?? titleOf(r.filename)} <span style={{ opacity: 0.6 }}>{r.rows.length}</span>
        </button>
      ))}
    </div>
  ) : null;
  // A fresh window per request and per tab, so ticks never carry over to another table.
  return <ExportWindow key={`${n}-${tab}`} req={cur} onClose={close} tabs={tabs} />;
}
