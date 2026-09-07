import { useEffect, useState } from 'react';
import {
  getRefundQuote, formatPeso, basisLine, type RefundQuote,
} from '../../lib/api/refunds';
import { motion, AnimatePresence } from 'framer-motion';
import { Pause, Ban, X, AlertTriangle } from 'lucide-react';
import Button from './Button';
import { freezesThisMonth, type MembershipActionDetail } from '../../lib/api/memberships';

/**
 * Freezing or cancelling a membership, with the reason the gym will need later.
 *
 * ## Why this replaced a yes/no confirm
 *
 * The old dialog asked "are you sure?" and recorded nothing. Three weeks later
 * the member asks why they were frozen, or whether they were promised money
 * back, and the honest answer was that nobody wrote it down. 0057 now requires
 * a reason at the database level, so this is the screen that collects it.
 *
 * ## The refund question is asked even when the answer is no
 *
 * A cash-only gym has no refund mechanism, and the member is told so. But
 * "they asked and we explained" and "it never came up" are different facts,
 * and only the first one protects the front desk in an argument. So the box is
 * always here, and unticked is a recorded answer rather than a missing one.
 *
 * ## The limit is shown before it is hit
 *
 * Two freezes a month. The count is fetched when the dialog opens, so the desk
 * sees "1 of 2 used this month" while deciding — rather than filling in a
 * reason and being refused by a trigger afterwards. The trigger is still the
 * boundary; this is only the explanation.
 */

const FREEZE_REASONS = ['Injury', 'Travelling', 'Working away', 'Medical', 'Financial', 'Other'];
const CANCEL_REASONS = ['Moving away', 'Too expensive', 'Not using it', 'Injury', 'Went elsewhere', 'Other'];

interface Props {
  /**
   * Mounted only while a decision is being made — the caller renders it as
   * `{action && <MembershipActionDialog … />}` with a `key`.
   *
   * There is no `open` prop and no reset effect. Resetting six fields from an
   * effect when a boolean flipped is the pattern
   * `react-hooks/set-state-in-effect` exists to catch, and React already has
   * the answer: a component that should start fresh gets remounted. The key
   * does that, and the state simply initialises correctly.
   */
  kind: 'freeze' | 'cancel';
  memberName: string;
  memberId: string;
  /** The membership being acted on, so a cancellation can be quoted (0073). */
  membershipId: string;
  /** Drives the "what happens next" sentence — a lifetime plan has no days to credit. */
  neverExpires: boolean;
  expiryLabel: string | null;
  onClose: () => void;
  onConfirm: (detail: Omit<MembershipActionDetail, 'memberId'>) => Promise<void>;
}

export default function MembershipActionDialog({
  kind, memberName, memberId, membershipId, neverExpires, expiryLabel, onClose, onConfirm,
}: Props) {
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [refund, setRefund] = useState(false);
  const [refundNote, setRefundNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [used, setUsed] = useState<number | null>(null);
  /**
   * What the gym owes, worked out before anyone commits to anything.
   *
   * `undefined` = still loading, `null` = the read failed. Those render
   * differently: a failure says so, because showing nothing where a refund
   * figure belongs reads as "no refund due".
   */
  const [quote, setQuote] = useState<RefundQuote | null | undefined>(undefined);

  // The only effect left is the fetch, whose setState lands after an await.
  useEffect(() => {
    if (kind !== 'freeze') return;
    let alive = true;
    freezesThisMonth(memberId).then((n) => { if (alive) setUsed(n); });
    return () => { alive = false; };
  }, [kind, memberId]);

  // Quoted on open, for a cancellation only. The desk should be reading the
  // figure while it decides, not discovering it after the member has gone.
  useEffect(() => {
    if (kind !== 'cancel') return;
    let alive = true;
    getRefundQuote(membershipId)
      .then((q) => { if (alive) setQuote(q); })
      .catch(() => { if (alive) setQuote(null); });
    return () => { alive = false; };
  }, [kind, membershipId]);

  const isFreeze = kind === 'freeze';
  const presets = isFreeze ? FREEZE_REASONS : CANCEL_REASONS;
  // "Other" on its own says nothing, so it has to be typed out.
  const finalReason = reason === 'Other' ? note.trim() : [reason, note.trim()].filter(Boolean).join(' — ');
  const canSubmit = reason !== '' && (reason !== 'Other' || note.trim() !== '');
  const atLimit = isFreeze && used != null && used >= 2;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm({
        reason: finalReason,
        refundRequested: refund,
        refundNote: refund ? refundNote : '',
        // What the policy said at the time, copied onto the row. Editing the
        // rules next year must not rewrite what this member was told today.
        refundPercent: quote?.percent ?? null,
        refundAmount: quote?.amount ?? null,
        refundRule: quote?.rule_label ?? null,
      });
      onClose();
    } catch (err) {
      // The database's own message is the useful one here — it says "already
      // frozen twice this month", which is what the desk needs to read out.
      setError(err instanceof Error ? err.message : 'That did not go through');
    } finally {
      setBusy(false);
    }
  };

  const consequence = isFreeze
    ? neverExpires
      ? `They won't be able to check in or book while it's frozen. This plan has no expiry date, so there are no days to credit back — resuming simply restores access.`
      : `They won't be able to check in or book while it's frozen, and every frozen day is added back to their expiry when you resume it. Their expiry is currently ${expiryLabel ?? 'not set'}.`
    : neverExpires
      ? `This plan has no expiry date, so there are no paid-for days left to honour — their access ends immediately rather than running to a date.`
      : `It won't renew, but they keep access until ${expiryLabel ?? 'their expiry date'} — they've already paid for those days.`;

  // Kept out of the JSX so the two branches are readable side by side.
  const basis = quote ? basisLine(quote) : null;

  return (
    <AnimatePresence>
      <>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/70 z-50" onClick={busy ? undefined : onClose} />
        <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
          <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}
            className="w-full max-w-md rounded-2xl shadow-2xl overflow-hidden"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
            onClick={(e) => e.stopPropagation()}>

            <div className="p-5 flex items-start justify-between gap-3"
              style={{ borderBottom: '1px solid var(--color-border)' }}>
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: isFreeze ? 'var(--color-secondary-light)' : 'var(--color-secondary-light)' }}>
                  {isFreeze
                    ? <Pause size={16} style={{ color: 'var(--color-secondary)' }} />
                    : <Ban size={16} style={{ color: 'var(--color-secondary)' }} />}
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    {isFreeze ? 'Freeze' : 'Cancel'} membership
                  </h3>
                  <p className="text-[11px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                    {memberName}
                  </p>
                </div>
              </div>
              <button onClick={busy ? undefined : onClose} aria-label="Close"
                style={{ color: 'var(--color-text-muted)' }}>
                <X size={16} />
              </button>
            </div>

            <div className="p-5 space-y-4 max-h-[65vh] overflow-y-auto">
              <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                {consequence}
              </p>

              {isFreeze && (
                <div className="px-3 py-2 rounded-lg text-[11px] flex items-center justify-between"
                  style={{
                    background: atLimit ? 'var(--color-secondary-light)' : 'var(--color-surface-high)',
                    color: atLimit ? 'var(--color-secondary)' : 'var(--color-text-secondary)',
                  }}>
                  <span>Freezes used this month</span>
                  <strong>{used == null ? '…' : `${used} of 2`}</strong>
                </div>
              )}

              {atLimit && (
                <div className="px-3 py-2.5 rounded-lg flex items-start gap-2 text-[11px] leading-relaxed"
                  style={{ background: 'var(--color-secondary-light)', color: 'var(--color-secondary)' }}>
                  <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
                  <span>
                    This member has already been frozen twice this month. Only an admin can
                    override the limit — a staff account will be refused.
                  </span>
                </div>
              )}

              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide mb-2"
                  style={{ color: 'var(--color-text-muted)' }}>
                  Reason <span style={{ color: 'var(--color-secondary)' }}>*</span>
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {presets.map((r) => (
                    <button key={r} onClick={() => setReason(r)}
                      className="px-2.5 py-1.5 rounded-full text-[11px] font-semibold transition-colors"
                      style={{
                        background: reason === r ? 'var(--color-primary)' : 'var(--color-surface-high)',
                        border: `1px solid ${reason === r ? 'var(--color-primary)' : 'var(--color-border)'}`,
                        color: reason === r ? '#fff' : 'var(--color-text-secondary)',
                      }}>
                      {r}
                    </button>
                  ))}
                </div>
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={reason === 'Other' ? 'Say what happened (required)' : 'Anything to add? (optional)'}
                  className="w-full h-10 px-3 rounded-lg text-xs text-white mt-2"
                  style={{ background: 'var(--color-surface-high)', border: '1px solid var(--color-border)' }}
                />
                <p className="text-[10px] mt-1.5" style={{ color: 'var(--color-text-muted)' }}>
                  The member can see this on their own membership screen, so write it the way you
                  would say it to them.
                </p>
              </div>

              <div className="pt-3" style={{ borderTop: '1px solid var(--color-border)' }}>
                <label className="flex items-start gap-2 cursor-pointer">
                  <input type="checkbox" checked={refund} className="mt-0.5"
                    onChange={(e) => setRefund(e.target.checked)} />
                  <span className="text-[11px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                    They asked about a refund
                  </span>
                </label>
                {refund ? (
                  <input
                    value={refundNote}
                    onChange={(e) => setRefundNote(e.target.value)}
                    placeholder="What was agreed? e.g. paid in cash from the till, receipt reprinted"
                    className="w-full h-10 px-3 rounded-lg text-xs text-white mt-2"
                    style={{ background: 'var(--color-surface-high)', border: '1px solid var(--color-border)' }}
                  />
                ) : (
                  <p className="text-[10px] mt-1.5 ml-6" style={{ color: 'var(--color-text-muted)' }}>
                    Tick this if it came up, so there is a record of what was said.
                  </p>
                )}

                {/* The quote, always shown for a cancellation — not gated behind
                    the checkbox. Whoever is at the desk needs to know what the
                    policy owes before the member asks, not after.

                    This block used to read "the gym is cash-only with no refund
                    process". Cash-only is true; "no refund process" was not,
                    and under RA 7394 a prepaid membership is expected to be
                    refunded pro-rata for the unused term. See 0073. */}
                {!isFreeze && (
                  <div className="mt-3 rounded-lg px-3 py-2.5"
                    style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
                    {quote === undefined ? (
                      <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                        Working out what is owed…
                      </p>
                    ) : quote === null ? (
                      /* A failed read says so. Silence here would read as
                         "nothing is owed", which may be false. */
                      <p className="text-[11px]" style={{ color: 'var(--color-secondary)' }}>
                        Could not work out the refund. Check the policy before promising anything.
                      </p>
                    ) : (
                      <>
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-[10px] uppercase tracking-wide"
                            style={{ color: 'var(--color-text-muted)' }}>
                            Refund due
                          </span>
                          <span className="text-base font-bold tabular-nums"
                            style={{ color: quote.percent == null ? 'var(--color-text-muted)' : 'var(--color-secondary)' }}>
                            {formatPeso(quote.amount)}
                            {quote.percent != null && (
                              <span className="text-[10px] font-semibold ml-1.5"
                                style={{ color: 'var(--color-text-muted)' }}>
                                {quote.percent}%
                              </span>
                            )}
                          </span>
                        </div>
                        <p className="text-[10px] mt-1 leading-relaxed"
                          style={{ color: 'var(--color-text-secondary)' }}>
                          {quote.rule_label}
                        </p>
                        {basis && (
                          <p className="text-[10px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                            {basis}
                          </p>
                        )}
                        {quote.fee_deducted > 0 && (
                          <p className="text-[10px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                            Less {formatPeso(quote.fee_deducted)} processing fee.
                          </p>
                        )}
                        <p className="text-[10px] mt-1.5" style={{ color: 'var(--color-text-muted)' }}>
                          Paid to date {formatPeso(quote.paid_total)} · cash refund handed over at the desk.
                        </p>
                      </>
                    )}
                  </div>
                )}
              </div>

              {error && (
                <div className="px-3 py-2.5 rounded-lg flex items-start gap-2 text-[11px] leading-relaxed"
                  style={{ background: 'var(--color-secondary-light)', color: 'var(--color-secondary)' }}>
                  <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}
            </div>

            <div className="p-4 flex items-center justify-end gap-2"
              style={{ borderTop: '1px solid var(--color-border)' }}>
              <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
              <Button variant={isFreeze ? 'secondary' : 'danger'} onClick={submit} disabled={!canSubmit || busy}>
                {busy ? 'Saving…' : isFreeze ? 'Freeze membership' : 'Cancel membership'}
              </Button>
            </div>
          </motion.div>
        </div>
      </>
    </AnimatePresence>
  );
}
