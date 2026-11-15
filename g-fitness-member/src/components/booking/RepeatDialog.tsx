import { useState } from 'react';
import Modal from '../ui/Modal';
import { Chip } from '../ui/noc';
import { toast } from '../ui/Toast';
import { repeatBooking, type BookingKind, type BookingRules } from '../../lib/api/bookingRules';

/**
 * 0260: "Repeat weekly" for a booking that is still on — the member's own (Your sessions) or the coach's (This
 * week). The gym's kind decides the question: a number of weeks (2 … its maximum) or until stopped. Every week is
 * booked by the database the way this one was; a week that cannot be booked is listed with the reason.
 */
export default function RepeatDialog({ booking, rules, onClose, onDone }: {
  booking: { kind: BookingKind; id: string; title: string; startsAt: string | null } | null;
  rules: BookingRules | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [weeks, setWeeks] = useState(2);
  const [busy, setBusy] = useState(false);
  const [shownFor, setShownFor] = useState<string | null>(null);
  // A fresh choice each time it opens (adjusting state when a prop changes — never in an effect).
  if ((booking?.id ?? null) !== shownFor) {
    setShownFor(booking?.id ?? null);
    setWeeks(Math.min(4, rules?.repeatMaxWeeks ?? 4));
  }
  const byWeeks = rules?.repeatKind !== 'until_stopped';
  const save = async () => {
    if (!booking || !rules) return;
    setBusy(true);
    const res = await repeatBooking(booking.kind, booking.id, byWeeks ? weeks : null);
    setBusy(false);
    if (!res.ok) { toast.error(res.message); return; }
    toast.success(byWeeks ? `Repeats for ${weeks} weeks` : 'Repeats every week until it is stopped');
    onDone();
  };
  return (
    <Modal
      isOpen={booking !== null}
      onClose={() => !busy && onClose()}
      title="Repeat every week?"
      subtitle={booking ? `${booking.title}${booking.startsAt ? `, ${new Date(booking.startsAt).toLocaleString('en-US', { weekday: 'long', hour: 'numeric', minute: '2-digit' })}` : ''}` : ''}
      confirmLabel={busy ? 'Booking…' : byWeeks ? `Repeat for ${weeks} weeks` : 'Repeat until stopped'}
      cancelLabel="Not now"
      confirmDisabled={busy}
      onConfirm={save}
    >
      <div className="flex flex-col" style={{ gap: 12 }} data-repeat-dialog>
        <p style={{ fontSize: 12.5, lineHeight: 1.55, color: 'var(--color-text-muted)' }}>
          {byWeeks
            ? 'Each week is booked on its own, the same way as this one. A week that cannot be booked is listed with the reason.'
            : `The next weeks are booked ${rules?.repeatAheadDays ?? 7} days ahead, until it is stopped. A week that cannot be booked is listed with the reason.`}
        </p>
        {byWeeks && rules && (
          <div className="flex flex-wrap" style={{ gap: 8 }} role="radiogroup" aria-label="How many weeks">
            {Array.from({ length: Math.max(1, rules.repeatMaxWeeks - 1) }, (_, i) => i + 2).map((n) => (
              <Chip key={n} label={`${n} weeks`} on={weeks === n} onClick={() => setWeeks(n)} />
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
