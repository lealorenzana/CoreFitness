import { useEffect, useState } from 'react';
import { getBookingPause, getBookingRecord, getBookingRules, type Pause, type RecordRow } from '../../lib/api/bookingRules';

/**
 * 0260, for the coach: a trainee's recent no-shows and late cancels, and a booking pause if one is running — so
 * the coach is warned by what the member's own screens already say. booking_record() refuses anyone who does not
 * train them; nothing is drawn then, while no-shows are off and nothing was recorded, or before 0260.
 */
export default function TraineeShowingUp({ memberId, firstName }: { memberId: string; firstName: string }) {
  const [rows, setRows] = useState<RecordRow[] | null>(null);
  const [pause, setPause] = useState<Pause | null>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    let alive = true;
    void (async () => {
      const [r, rec, p] = await Promise.all([getBookingRules(), getBookingRecord(memberId), getBookingPause(memberId).catch(() => null)]);
      if (!alive) return;
      setOn(!!r && r.noshowsOn && r.noshowMode !== 'off'); setRows(rec); setPause(p);
    })();
    return () => { alive = false; };
  }, [memberId]);

  const misses = (rows ?? []).filter((x) => x.mark !== 'came');
  if (rows === null || (!on && misses.length === 0 && !pause)) return null;
  const noShows = misses.filter((x) => x.mark === 'no_show').length;
  const late = misses.length - noShows;
  return (
    <div style={{ marginTop: 14 }} data-trainee-showing-up>
      <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-primary-300)' }}>Showing up</p>
      <p style={{ fontSize: 13.5, marginTop: 4, color: 'var(--color-text-primary)' }}>
        {misses.length === 0 ? 'No no-shows or late cancels in the last 90 days'
          : [noShows ? `${noShows} no-show${noShows === 1 ? '' : 's'}` : '', late ? `${late} late cancel${late === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ') + ' in 90 days'}
      </p>
      {misses.slice(0, 3).map((m) => (
        <p key={`${m.kind}-${m.id}`} style={{ fontSize: 12, marginTop: 2, color: 'var(--color-text-muted)' }}>
          {m.mark === 'late_cancel' ? 'Late cancel' : 'No-show'} · {m.what}
        </p>
      ))}
      {pause && (
        <p style={{ fontSize: 12, marginTop: 4, color: 'var(--color-secondary)' }}>
          {firstName} can’t book in the app until {new Date(pause.until).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })} — {pause.reason}. The front desk can still book.
        </p>
      )}
    </div>
  );
}
