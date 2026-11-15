import { useState } from 'react';
import Modal from '../ui/Modal';
import { showToast } from '../../utils/toast';
import { repeatBooking, type BookingKind, type BookingRules } from '../../lib/api/bookingRules';

/**
 * 0260, the desk's "Repeat weekly" (when the owner lets the front desk set repeats). The gym's kind decides the
 * question: a number of weeks or until stopped. Each week is booked by the database the way the desk books — the
 * member is told by the usual booking messages, and a week that cannot be booked is listed with the reason on the
 * member's drawer.
 */
export default function RepeatDialog({ booking, rules, onClose, onDone }: {
  booking: { kind: BookingKind; id: string; title: string } | null;
  rules: BookingRules | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [weeks, setWeeks] = useState(2);
  const [busy, setBusy] = useState(false);
  const [shownFor, setShownFor] = useState<string | null>(null);
  if ((booking?.id ?? null) !== shownFor) {
    setShownFor(booking?.id ?? null);
    setWeeks(Math.min(4, rules?.repeatMaxWeeks ?? 4));
  }
  const byWeeks = rules?.repeatKind !== 'until_stopped';
  const save = async () => {
    if (!booking) return;
    setBusy(true);
    const r = await repeatBooking(booking.kind, booking.id, byWeeks ? weeks : null);
    setBusy(false);
    if (!r.ok) { showToast(r.message, 'error'); return; }
    showToast(byWeeks ? `Repeats for ${weeks} weeks` : 'Repeats every week until it is stopped', 'success');
    onDone();
  };
  return (
    <Modal isOpen={booking !== null} onClose={() => !busy && onClose()} title="Repeat every week" subtitle={booking?.title}
      confirmLabel={busy ? 'Booking…' : byWeeks ? `Repeat for ${weeks} weeks` : 'Repeat until stopped'} confirmDisabled={busy} onConfirm={() => void save()} size="sm">
      <div className="space-y-3" data-desk-repeat>
        <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
          {byWeeks ? 'Each week is booked on its own, the way the desk books. A week that cannot be booked is listed with the reason.'
            : `The next weeks are booked ${rules?.repeatAheadDays ?? 7} days ahead until someone stops it.`}
        </p>
        {byWeeks && rules && (
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="How many weeks">
            {Array.from({ length: Math.max(1, rules.repeatMaxWeeks - 1) }, (_, i) => i + 2).map((n) => (
              <button key={n} type="button" role="radio" aria-checked={weeks === n} className={`a-chip ${weeks === n ? 'v' : ''}`} onClick={() => setWeeks(n)}>{n} weeks</button>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
