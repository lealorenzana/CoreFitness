import { useEffect, useState } from 'react';
import { Download, FileJson, FileSpreadsheet, ShieldAlert } from 'lucide-react';
import Modal from './Modal';
import { exportAllowed, exportGym, type GymExport } from '../lib/insight';
import { downloadCsv } from '../lib/csv';

const manilaDay = () => new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10);
const say = (t: string) => t.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

/**
 * A gym's data, taken home (0140). The database decides whether it may happen
 * — only when the gym has left, or while it has granted support access — and
 * this button shows its sentence when it may not. What leaves is listed before
 * anything leaves; the gym's owner is told the same day.
 */
export default function ExportGym({ gymId, gymName }: { gymId: string; gymName: string }) {
  const [why, setWhy] = useState<string | null | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<GymExport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try { setWhy(await exportAllowed(gymId)); } catch { setWhy('Paste migration 0140 to export a gym.'); }
    })();
  }, [gymId]);

  const slug = gymName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const run = async () => {
    setBusy(true); setError(null);
    try {
      const data = await exportGym(gymId);
      setDone(data);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${slug}-export-${manilaDay()}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not export'); }
    finally { setBusy(false); }
  };
  const csv = (table: string, rows: Record<string, unknown>[]) => {
    const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))];
    downloadCsv(`${slug}-${table}`, rows, keys.map((k) => [k, (r: Record<string, unknown>) => {
      const v = r[k];
      return v === null || v === undefined ? null : typeof v === 'object' ? JSON.stringify(v) : (v as string | number | boolean);
    }] as [string, (r: Record<string, unknown>) => string | number | boolean | null]));
  };

  return (
    <>
      <button className="btn ghost" disabled={why !== null} onClick={() => { setOpen(true); setDone(null); }}
        data-tip={why === undefined ? 'Checking…' : why ?? `Download ${gymName}'s records — its owner is told`}>
        <Download size={14} /> Export data
      </button>
      <Modal open={open} onClose={() => setOpen(false)} size="md" title={`Export ${gymName}'s data`}
        subtitle="Allowed because the gym has left, or has granted you support access.">
        {!done ? (
          <>
            <div className="exp-cols">
              <div><b>What goes</b><p>People (name, contact, role, status), memberships and plans, payments, attendance, bookings and classes, events, 1-on-1 sessions, the shop, points and rewards, the gym's settings.</p></div>
              <div><b>What never goes</b><p>Chat, progress photos, health answers, body measurements and workouts, the assistant, invitations, trainers' credentials.</p></div>
            </div>
            <p className="exp-warn"><ShieldAlert size={15} /> The gym's owner gets a notification that Core Fitness exported its data, and it is written into the activity log.</p>
            {error && <p className="err">{error}</p>}
            <div className="qv-actions">
              <button className="btn" disabled={busy} onClick={() => void run()}><FileJson size={14} /> {busy ? 'Exporting…' : 'Export and download'}</button>
              <button className="btn ghost" onClick={() => setOpen(false)}>Cancel</button>
            </div>
          </>
        ) : (
          <>
            <p className="meta" style={{ marginTop: 0 }}>Downloaded as one JSON file. Any table as a spreadsheet:</p>
            <div className="exp-tables">
              {Object.entries(done.tables).map(([t, rows]) => (
                <button key={t} type="button" className="exp-table" disabled={rows.length === 0} onClick={() => csv(t, rows)}
                  data-tip={rows.length ? `Download ${say(t).toLowerCase()} as CSV` : 'Nothing in this table'}>
                  <FileSpreadsheet size={14} /><span>{say(t)}</span><b>{rows.length.toLocaleString('en-PH')}</b>
                </button>
              ))}
            </div>
          </>
        )}
      </Modal>
    </>
  );
}
