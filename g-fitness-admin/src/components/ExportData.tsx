import { useState } from 'react';
import { Download, Eye, FileJson, FileSpreadsheet, FileText, Lock, Table2 } from 'lucide-react';
import { DATA_SETS, readGymData, saveExport, type ExportFormat, type ExportResult } from '../lib/gymDataExport';
import { getGymContext } from '../lib/gymContext';
import { showToast } from '../utils/toast';
import { openExport } from '../lib/exportRequest';

const FORMATS: [ExportFormat, string, string, typeof Download][] = [
  ['xlsx', 'Excel', 'One workbook, a sheet for each kind of record', FileSpreadsheet],
  ['csv', 'CSV', 'Plain spreadsheet files, zipped when there is more than one', Table2],
  ['pdf', 'PDF', 'A printable report: your browser saves it as PDF', FileText],
  ['json', 'JSON', 'Everything in one file, for moving to another system', FileJson],
];

/**
 * Settings → Export your data (owner, 2026-11-23): the owner chooses which records and which file, then downloads
 * them. Reading and writing are in lib/gymDataExport.ts; nothing leaves the browser except the file they save.
 */
export default function ExportData() {
  const [chosen, setChosen] = useState<string[]>(DATA_SETS.map((d) => d.key));
  const [format, setFormat] = useState<ExportFormat>('xlsx');
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<{ file: string; res: ExportResult } | null>(null);

  const toggle = (k: string) => setChosen((c) => (c.includes(k) ? c.filter((x) => x !== k) : [...c, k]));
  const all = chosen.length === DATA_SETS.length;

  const run = async () => {
    if (chosen.length === 0) { showToast('Choose at least one kind of record', 'error'); return; }
    // The print window must open on the click itself, or the browser blocks it as a pop-up.
    const printWindow = format === 'pdf' ? window.open('', '_blank') : null;
    printWindow?.document.write('<p style="font:14px system-ui;padding:24px">Preparing your report…</p>');
    setBusy('Starting…'); setDone(null);
    try {
      const ctx = await getGymContext();
      if (!ctx?.gymId) throw new Error('Your gym could not be found. Reload and try again.');
      const res = await readGymData(ctx.gymId, chosen, setBusy);
      setBusy('Writing the file…');
      const file = await saveExport(ctx.gymName ?? 'gym', format, res, printWindow);
      setDone({ file, res });
    } catch (e) {
      printWindow?.close();
      showToast(e instanceof Error ? e.message : 'The export could not be made', 'error');
    } finally {
      setBusy(null);
    }
  };

  /** View one kind of record before exporting (owner, 2026-11-27): it opens in the export window, which can also download just it. */
  const [viewing, setViewing] = useState<string | null>(null);
  const view = async (key: string, label: string) => {
    setViewing(key);
    try {
      const ctx = await getGymContext();
      if (!ctx?.gymId) throw new Error('Your gym could not be found. Reload and try again.');
      const res = await readGymData(ctx.gymId, [key]);
      const sheets = res.sheets.filter((s) => s.rows.length > 0);
      if (!res.sheets.length) throw new Error(res.unavailable[0]?.reason ?? `${label} could not be read.`);
      if (!sheets.length) { showToast(`There are no ${label.toLowerCase()} to show yet.`, 'info'); return; }
      const slug = (ctx.gymName ?? 'gym').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'gym';
      const as = (s: { name: string; rows: Record<string, unknown>[] }) => ({ rows: s.rows, title: s.name, filename: `${slug}-${s.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}` });
      openExport({ ...as(sheets[0]), more: sheets.slice(1).map(as) });
    } catch (e) {
      showToast(e instanceof Error ? e.message : `${label} could not be read`, 'error');
    } finally { setViewing(null); }
  };

  const rows = done?.res.sheets.reduce((n, s) => n + s.rows.length, 0) ?? 0;
  return (
    <div data-export-data>
      <div className="v3-row-h" style={{ marginTop: 0 }}>What to export</div>
      <button type="button" className="a-link" onClick={() => setChosen(all ? [] : DATA_SETS.map((d) => d.key))} data-export-all>
        {all ? 'Clear all' : 'Choose all'}</button>
      <div style={{ marginTop: 6 }}>
        {DATA_SETS.map((d) => (
          <div key={d.key} className="a-setting" data-export-set={d.key}>
            <div className="t"><b>{d.label}</b><small>{d.blurb}</small></div>
            <button type="button" className="a-btn ghost sm" style={{ marginRight: 10 }} disabled={!!viewing} onClick={() => void view(d.key, d.label)}
              data-export-view={d.key} data-tip={`See the ${d.label.toLowerCase()} before exporting`}><Eye size={14} />{viewing === d.key ? 'Reading…' : 'View'}</button>
            <button type="button" className={`a-toggle ${chosen.includes(d.key) ? '' : 'off'}`} aria-pressed={chosen.includes(d.key)}
              aria-label={`Export ${d.label}`} onClick={() => toggle(d.key)} />
          </div>
        ))}
      </div>

      <div className="v3-row-h">As</div>
      <div className="a-grid" role="radiogroup" aria-label="File type" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))' }}>
        {FORMATS.map(([k, label, hint, Icon]) => (
          <button key={k} type="button" role="radio" aria-checked={format === k} className={`a-what ${format === k ? 'on' : ''}`}
            onClick={() => setFormat(k)} data-export-format={k}>
            <div className="a-ic"><Icon size={16} /></div>
            <div><b>{label}</b><p>{hint}</p></div>
          </button>
        ))}
      </div>

      <p className="a-hint" style={{ marginTop: 14 }}><Lock size={14} />
        <span>Never in an export: chats, progress photos, health answers, body measurements and workouts, the assistant, invitations and coaches' credentials. The file is made on this computer; nothing is sent anywhere.</span></p>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
        <button type="button" className="a-btn violet" disabled={!!busy || chosen.length === 0} onClick={() => void run()} data-export-go>
          <Download size={15} />{busy ? 'Exporting…' : `Export ${chosen.length} ${chosen.length === 1 ? 'kind' : 'kinds'} as ${FORMATS.find(([k]) => k === format)![1]}`}
        </button>
        {busy && <span className="a-sub" role="status" data-export-progress>{busy}</span>}
      </div>

      {done && (
        <div className="a-hint" style={{ marginTop: 14 }} data-export-done>
          <Download size={14} />
          <span>
            Saved as <b>{done.file}</b>: {rows.toLocaleString('en-PH')} rows in {done.res.sheets.length} {done.res.sheets.length === 1 ? 'sheet' : 'sheets'}
            {' '}({done.res.sheets.map((s) => `${s.name} ${s.rows.length.toLocaleString('en-PH')}`).join(', ')}).
            {done.res.unavailable.length > 0 && <> Not included, because they could not be read: {done.res.unavailable.map((u) => u.sheet).join(', ')}.</>}
          </span>
        </div>
      )}
    </div>
  );
}
