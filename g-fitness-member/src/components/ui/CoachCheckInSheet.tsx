import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { CheckCircle } from '@phosphor-icons/react';
import GlassSheet from './GlassSheet';
import { generateCoachQR, getQRTimeRemaining } from '../../utils/qrCode';
import { formatCheckInCode } from '../../utils/checkInCode';
import { myCoachCheckins, type MyCoachDays } from '../../lib/api/door';

/**
 * A coach's own check-in QR (0200), opened from the hub's bottom panel when
 * the owner has coach check-in on. The desk or the kiosk scans it; the code
 * rolls over every 60 seconds like a member's, and carries its own prefix so
 * it is never taken as a member visit.
 *
 * Polls while open, so the coach sees the scan land — as the member sheet does.
 */
export default function CoachCheckInSheet({ open, onClose, trainerId }: { open: boolean; onClose: () => void; trainerId: string }) {
  const [qr, setQr] = useState('');
  const [days, setDays] = useState<MyCoachDays | null>(null);

  // A fresh code each time it opens, rolling over a second before it dies.
  useEffect(() => {
    if (!open) return;
    let code = '';
    // From a timer, not the effect body: the first tick (at once) makes the code.
    const tick = () => { if (!code || getQRTimeRemaining(code) <= 0) { code = generateCoachQR(trainerId); setQr(code); } };
    const first = window.setTimeout(tick, 0);
    const t = window.setInterval(tick, 1000);
    return () => { window.clearTimeout(first); window.clearInterval(t); };
  }, [open, trainerId]);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    const read = () => myCoachCheckins(trainerId).then((d) => { if (alive) setDays(d); }, () => undefined);
    void read();
    const t = window.setInterval(() => { void read(); }, 4000);
    return () => { alive = false; window.clearInterval(t); };
  }, [open, trainerId]);

  const inAt = days?.today ? new Date(days.today).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' }) : null;
  return (
    <GlassSheet open={open} onClose={onClose} title="My check-in" subtitle="Show this at the desk or the kiosk">
      <div className="flex flex-col items-center" style={{ gap: 12, padding: '0 var(--gutter) 18px' }} data-coach-checkin>
        {inAt ? (
          <div className="grid place-items-center" style={{ width: 224, height: 224, borderRadius: 14, background: 'var(--color-surface-high)' }}>
            <div className="text-center">
              <CheckCircle size={84} style={{ color: 'var(--color-primary-400)' }} />
              <p style={{ fontSize: 15, fontWeight: 700, marginTop: 6, color: 'var(--color-text-primary)' }}>In at {inAt}</p>
            </div>
          </div>
        ) : (
          // White, always: a desk webcam reads black on white (as the member's code).
          <div style={{ borderRadius: 14, overflow: 'hidden', background: '#FFFFFF', lineHeight: 0, boxShadow: '0 0 40px -10px var(--color-primary)' }}>
            <QRCodeSVG value={qr || trainerId} size={224} level="M" marginSize={4} />
          </div>
        )}
        <p className="selectable" style={{ fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontSize: 19, letterSpacing: '0.34em', color: 'var(--color-primary-300)' }}>
          {formatCheckInCode(trainerId)}
        </p>
        <div className="w-full flex" style={{ gap: 10 }}>
          <div className="flex-1" style={{ padding: '10px 12px', borderRadius: 12, background: 'var(--color-surface-high)' }}>
            <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Today</p>
            <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text-primary)' }}>{inAt ? `In at ${inAt}` : 'Not in yet'}</p>
          </div>
          <div className="flex-1" style={{ padding: '10px 12px', borderRadius: 12, background: 'var(--color-surface-high)' }}>
            <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>This week</p>
            <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text-primary)' }}>{days ? `${days.week} day${days.week === 1 ? '' : 's'}` : '—'}</p>
          </div>
        </div>
        <p className="text-center" style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--color-text-muted)' }}>
          Your gym’s desk sees when you came in. It never counts as a member visit, points or a streak.
        </p>
      </div>
    </GlassSheet>
  );
}
