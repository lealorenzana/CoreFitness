import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import Modal from './Modal';
import {
  listCancellationReasons, cancelBooking, type CancellationReason,
} from '../../lib/api/cancellations';
import { errorMessage } from '../../utils/errorMessage';

/**
 * Cancel a booking, with a reason. One dialog, both sides of the app.
 *
 * The member and the trainer ask the same question and are subject to the same
 * rules, so they share this rather than growing two dialogs that drift — the
 * `actor` prop changes which reasons are offered and one sentence of copy, and
 * nothing else.
 *
 * ## The reasons come from the database
 *
 * Not a hardcoded array. `cancellation_reasons` is a table the front desk can
 * edit (0081), so a gym that wants "Gym closed" adds a row rather than waiting
 * for a release. The list is filtered by `applies_to` so a member is never
 * offered "Trainer unavailable" — offering a choice that would be refused is
 * its own small lie — and `sort_order` keeps "Other" at the bottom.
 *
 * ## Confirm is disabled until the answer is complete
 *
 * No reason, or "Other" with an empty note, and the button cannot be pressed.
 * The same two rules are enforced again inside `cancel_booking()`, because a
 * disabled button is a courtesy and not a boundary; if the server refuses, its
 * sentence is what gets shown rather than a generic failure.
 */
export default function CancelBookingDialog({
  open, kind, id, title, actor, onClose, onCancelled,
}: {
  open: boolean;
  kind: 'class' | 'pt';
  id: string | null;
  /** What is being cancelled, shown back so nobody cancels the wrong thing. */
  title: string;
  actor: 'member' | 'trainer' | 'staff';
  onClose: () => void;
  onCancelled: () => void;
}) {
  const [reasons, setReasons] = useState<CancellationReason[]>([]);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Loaded once the dialog is actually opened, not on every mount of the page
  // behind it: a list that is never shown does not need fetching.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);
    listCancellationReasons(actor)
      .then((rows) => { if (!cancelled) setReasons(rows); })
      .catch((err) => { if (!cancelled) setError(errorMessage(err, 'Could not load the reasons.')); });
    return () => { cancelled = true; };
  }, [open, actor]);

  // Cleared when the dialog closes, so the next cancellation does not open
  // pre-filled with the last one's reason — which would make a stray double tap
  // file a reason nobody chose.
  useEffect(() => {
    if (open) return;
    setReason('');
    setNote('');
    setError(null);
  }, [open]);

  const chosen = reasons.find((r) => r.key === reason) ?? null;
  const noteRequired = chosen?.needs_note === true;
  const incomplete = !chosen || (noteRequired && note.trim() === '');

  const submit = async () => {
    if (!id || incomplete) return;
    setBusy(true);
    setError(null);
    try {
      await cancelBooking(kind, id, reason, noteRequired ? note : null);
      onCancelled();
    } catch (err) {
      // The server's own sentence, not a generic one: it says *which* rule
      // refused — already started, already cancelled, not yours — and that is
      // the part the person needs.
      setError(errorMessage(err, 'That booking could not be cancelled.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      isOpen={open}
      onClose={() => !busy && onClose()}
      title={kind === 'pt' ? 'Cancel this session?' : 'Cancel this booking?'}
      subtitle={title}
      confirmLabel={busy ? 'Cancelling…' : 'Confirm cancellation'}
      cancelLabel="Keep it"
      confirmDisabled={busy || incomplete}
      onConfirm={submit}
    >
      <div className="space-y-3">
        <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
          {actor === 'member'
            ? (kind === 'pt'
                ? 'Your coach is told, and the slot goes back on their calendar. You can book another time afterwards.'
                : 'Your seat is released back to the class. You can book it again if it stays open.')
            : 'The member is told that you cancelled, and the reason you give here is shown to them.'}
        </p>

        <div>
          <p className="text-xs font-bold text-white mb-2">Why is it being cancelled?</p>
          <div className="space-y-1.5">
            {reasons.map((r) => {
              const on = r.key === reason;
              return (
                <button
                  key={r.key}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  disabled={busy}
                  onClick={() => setReason(r.key)}
                  className="w-full px-3 py-2.5 rounded-xl text-left font-semibold transition-colors disabled:opacity-50"
                  style={{
                    fontSize: 'var(--text-body)',
                    background: on ? 'var(--color-primary)' : 'var(--color-surface-high)',
                    color: on ? '#fff' : 'var(--color-text-secondary)',
                    border: `1px solid ${on ? 'var(--color-primary)' : 'var(--color-border)'}`,
                  }}
                >
                  {r.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Only for the reason that needs it, and required when shown. */}
        {noteRequired && (
          <div>
            <label htmlFor="cancel-note" className="text-xs font-bold text-white block mb-1.5">
              Tell us why
            </label>
            <textarea
              id="cancel-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              maxLength={500}
              disabled={busy}
              placeholder="A sentence is plenty"
              className="field-input w-full rounded-xl p-3 text-white resize-none"
              style={{
                fontSize: 'var(--text-meta)',
                background: 'var(--color-surface-high)',
                border: '1px solid var(--color-border)',
              }}
            />
            {note.trim() === '' && (
              <p className="mt-1" style={{ fontSize: 'var(--text-meta)', color: 'var(--color-text-muted)' }}>
                Needed before you can confirm.
              </p>
            )}
          </div>
        )}

        {error && (
          <div className="px-3 py-2.5 rounded-xl flex items-start gap-2 leading-relaxed"
            style={{ fontSize: 'var(--text-meta)', background: 'var(--color-secondary-light)', color: 'var(--color-secondary)' }}>
            <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
      </div>
    </Modal>
  );
}
