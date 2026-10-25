import { useEffect, useState } from 'react';
import { CloudOff, X } from 'lucide-react';
import { getGymContext } from '../../lib/gymContext';
import { clearRefused, flushScans, refusedScans, savedScans, type RefusedScan } from '../../lib/checkinOutbox';

const when = (iso: string) => new Date(iso).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' });

/**
 * Attendance → the scans saved with no connection (0211): how many are still
 * waiting on this computer, and the ones the gym's rules refused once they were
 * sent — by name and why, because the kiosk faces the room and never says.
 * Sends the queue when the connection is back and every minute; draws nothing
 * when there is nothing to say.
 */
export default function OfflineScans({ onRecorded }: { onRecorded: () => void }) {
  const [gym, setGym] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(0);
  const [refused, setRefused] = useState<RefusedScan[]>([]);
  const [offline, setOffline] = useState(() => navigator.onLine === false);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let alive = true;
    const send = async (g: string | null) => {
      if (!g) return;
      setOffline(navigator.onLine === false);
      const r = await flushScans(g);
      if (!alive) return;
      setWaiting(r.left); setRefused(refusedScans(g)); setMissing(r.missing);
      if (r.recorded) onRecorded();
    };
    let g: string | null = null;
    void getGymContext().then((c) => { g = c?.gymId ?? null; if (!alive) return; setGym(g); if (g) { setWaiting(savedScans(g).length); setRefused(refusedScans(g)); } void send(g); });
    const up = () => void send(g);
    const down = () => setOffline(true);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    // Scans saved at the desk by the box above land here too.
    const t = window.setInterval(() => { if (g) { setWaiting(savedScans(g).length); void send(g); } }, 30_000);
    return () => { alive = false; window.removeEventListener('online', up); window.removeEventListener('offline', down); window.clearInterval(t); };
  }, [onRecorded]);

  if (!gym || (!offline && waiting === 0 && refused.length === 0)) return null;
  return (
    <div className="a-toast amber" style={{ flex: 'none', alignItems: 'flex-start' }} data-offline-scans>
      <span className="ok"><CloudOff size={15} /></span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <b>{offline ? 'No connection — check-ins are saved on this computer' : waiting > 0 ? 'Sending saved check-ins' : 'Saved check-ins sent'}</b>
        <div className="a-sub" style={{ marginTop: 2 }}>
          {waiting > 0 ? `${waiting} waiting. Each is recorded at the time it was scanned once the rules are checked.` : offline ? 'Scans at the desk and the kiosk are saved and sent when the connection is back.' : ''}
          {missing ? ' They wait until migration 0211 is pasted — nothing is lost.' : ''}
        </div>
        {refused.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <div className="a-lbl" style={{ color: 'var(--a-a300)' }}>Not recorded — tell them at the desk</div>
            {refused.map((s) => (
              <div key={s.id} className="a-sub" style={{ marginTop: 2 }}><b style={{ color: '#fff' }}>{s.name}</b> · scanned {when(s.scannedAt)} at the {s.source} · {s.reason}</div>
            ))}
          </div>
        )}
      </div>
      {refused.length > 0 && (
        <button type="button" className="a-btn ghost sm" onClick={() => { clearRefused(gym); setRefused([]); }} aria-label="Dismiss the refused check-ins"><X size={13} />Dismiss</button>
      )}
    </div>
  );
}
