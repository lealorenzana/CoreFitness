import { useEffect, useState } from 'react';
import { WarningCircle } from '@phosphor-icons/react';
import { Panel } from '../ui/noc';
import { getBookingRules } from '../../lib/api/bookingRules';

/**
 * 0260: a member whose booking is paused (the gym's no-show rule) is told on every booking screen — why, until
 * when, and that the desk can still book for them — before they try, never only after a refusal. Nothing when
 * there is no pause or the read fails.
 */
export default function PauseNotice() {
  const [pause, setPause] = useState<{ until: string; reason: string } | null>(null);
  useEffect(() => {
    let gone = false;
    void (async () => { const r = await getBookingRules(); if (!gone) setPause(r?.myPause ?? null); })();
    return () => { gone = true; };
  }, []);
  if (!pause) return null;
  return (
    <Panel glow="action">
      <div className="flex items-start" data-booking-paused style={{ gap: 10 }}>
        <WarningCircle size={18} style={{ color: 'var(--color-secondary)', flexShrink: 0, marginTop: 1 }} />
        <p style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--color-text-primary)' }}>
          You can’t book in the app until{' '}
          <b>{new Date(pause.until).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</b>
          {' '}— {pause.reason}. The front desk can still book for you.
        </p>
      </div>
    </Panel>
  );
}
