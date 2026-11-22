import { useCallback, useEffect, useState } from 'react';
import { Eraser } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import DatePicker from './DatePicker';
import './gymdocs.css';

/**
 * Clean-ups (0264): handled crash reports older than a date, and nothing else. The count comes first; deleting needs
 * the word delete typed; the last week is always kept. Notifications and the activity logs are left alone on purpose:
 * one keeps automated messages from being sent twice, the other is the record of who did what.
 */
const manila = (n: number) => new Date(Date.now() + 8 * 3_600_000 - n * 86_400_000).toISOString().slice(0, 10);

export default function CleanupCrashes() {
  const [before, setBefore] = useState(manila(90));
  const [preview, setPreview] = useState<{ handled_crashes: number; open_crashes: number } | null | undefined>(undefined);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);

  const count = useCallback(async (d: string) => {
    const { data, error } = await supabase.rpc('platform_cleanup_preview', { p_before: d });
    // An error means 0264 is not pasted; an answer without the two counts is treated the same, never printed as "undefined".
    const got = data as { handled_crashes?: unknown; open_crashes?: unknown } | null;
    setPreview(!error && got && typeof got.handled_crashes === 'number' && typeof got.open_crashes === 'number'
      ? { handled_crashes: got.handled_crashes, open_crashes: got.open_crashes } : null);
  }, []);
  useEffect(() => { void (async () => { await count(before); })(); }, [count, before]);

  const run = async () => {
    setBusy(true); setMsg(null);
    const { data, error } = await supabase.rpc('platform_cleanup_crashes', { p_before: before, p_confirm: typed });
    setBusy(false);
    if (error) { setMsg({ text: error.message, bad: true }); return; }
    setTyped('');
    setMsg({ text: `Deleted ${data} handled crash report${data === 1 ? '' : 's'}.` });
    await count(before);
  };

  return (
    <section className="mx" data-cleanup>
      <header className="mx-head">
        <span className="mx-icon"><Eraser size={18} /></span>
        <span className="mx-title"><b>Clean up handled crash reports</b>
          <em>{preview === null ? 'Needs migration 0264, paste it first.'
            : preview === undefined ? 'Counting…'
            : `${preview.handled_crashes} handled report${preview.handled_crashes === 1 ? '' : 's'} from before this date can go. ${preview.open_crashes} still open stay.`}</em></span>
      </header>
      {preview && (
        <div className="mx-row" style={{ marginTop: 10 }}>
          <span style={{ width: 170 }}><DatePicker id="cl-before" mode="history" value={before} onChange={(v) => { if (v) setBefore(v); }} /></span>
          <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Type delete" aria-label="Type delete to confirm" style={{ width: 140, height: 34 }} />
          <button type="button" className="btn sm" disabled={busy || typed.trim().toLowerCase() !== 'delete' || preview.handled_crashes === 0} onClick={() => void run()}>
            Delete {preview.handled_crashes}
          </button>
        </div>
      )}
      {msg && <p className={msg.bad ? 'mx-warn' : 'mx-sub'} style={{ marginTop: 8 }}>{msg.text}</p>}
      <p className="mx-sub" style={{ marginTop: 8 }}>Only handled crash reports, never notifications or the activity logs: those stop messages being sent twice and record who did what.</p>
    </section>
  );
}
