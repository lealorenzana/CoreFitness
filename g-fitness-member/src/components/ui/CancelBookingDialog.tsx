import { useEffect, useState } from 'react';
import { WarningCircle } from '@phosphor-icons/react';
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

  /*
    Reset during render when `open` flips, not in an effect.

    The draft did both of these as effects and lint was right to refuse it: a
    setState called synchronously inside an effect is the rule this project has
    now shipped four times. The documented alternatives are a lazy initialiser,
    separating the fetch from the state application, or — for exactly this case,
    state that has to follow a prop — comparing against the previous value
    during render. That is React's own "adjusting state when a prop changes".

    The clearing matters: without it the next cancellation opens pre-filled with
    the last one's reason, and a stray double tap files a reason nobody chose.
  */
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    setReason('');
    setNote('');
    setError(null);
  }

  // Loaded once the dialog is actually opened, not on every mount of the page
  // behind it: a list that is never shown does not need fetching. The IIFE is
  // the house workaround — the same lint rule follows a directly called async
  // function into the setState inside it.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      try {
        const rows = await listCancellationReasons(actor);
        if (!cancelled) setReasons(rows);
      } catch (err) {
        if (!cancelled) setError(errorMessage(err, 'Could not load the reasons.'));
      }
    })();
    return () => { cancelled = true; };
  }, [open, actor]);

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
      <div className="flex flex-col" style={{ gap: 14 }}>
        <p style={{ fontSize: 12.5, lineHeight: 1.55, color: 'var(--color-text-muted)' }}>
          {actor === 'member'
            ? (kind === 'pt'
                ? 'Your coach is told, and the slot goes back on their calendar. You can book another time afterwards.'
                : 'Your seat is released back to the class. You can book it again if it stays open.')
            : 'The member is told that you cancelled, and the reason you give here is shown to them.'}
        </p>

        <div>
          <p style={{ fontSize: 13.5, marginBottom: 10, color: 'var(--color-text-primary)' }}>Why is it being cancelled?</p>
          <div className="flex flex-col" style={{ gap: 8 }}>
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
                  className="w-full text-left disabled:opacity-50"
                  // 50px rows: a reason is picked mid-conversation at the desk
                  // or on the way out the door, not with a steady finger.
                  // Selection is state, so violet.
                  style={{
                    minHeight: 50, padding: '0 16px', fontSize: 14.5, borderRadius: 'var(--radius-btn)',
                    background: on ? 'color-mix(in srgb, var(--color-primary) 16%, transparent)' : 'transparent',
                    color: on ? 'var(--color-primary-300)' : 'var(--color-text-primary)',
                    border: `1px solid ${on ? 'var(--color-primary)' : 'var(--color-hairline)'}`,
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
            <label htmlFor="cancel-note" className="block" style={{ fontSize: 13.5, marginBottom: 8, color: 'var(--color-text-primary)' }}>
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
              // No inline border: `.field-input` owns it, and an inline one
              // would silently beat the focus ring (DESIGN_SYSTEM).
              className="field-input w-full resize-none"
              style={{ fontSize: 14, padding: 12 }}
            />
            {note.trim() === '' && (
              <p style={{ fontSize: 12, marginTop: 6, color: 'var(--color-text-muted)' }}>
                Needed before you can confirm.
              </p>
            )}
          </div>
        )}

        {error && (
          <div className="flex items-start" style={{ gap: 8, fontSize: 12.5, lineHeight: 1.5, color: 'var(--color-secondary)' }}>
            <WarningCircle size={15} className="flex-shrink-0" style={{ marginTop: 1 }} />
            <span>{error}</span>
          </div>
        )}
      </div>
    </Modal>
  );
}
