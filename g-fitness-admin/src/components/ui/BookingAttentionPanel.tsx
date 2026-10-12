import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, Bell, UserCog, XCircle, Clock } from 'lucide-react';
import Modal from './Modal';
import { EmptyState } from './kit';
import { RdCard, RdButton } from './rd';
import { showToast } from '../../utils/toast';
import {
  listBookingsNeedingAttention, suggestTrainers, reassignSession, remindTrainer,
  type AttentionRow, type TrainerSuggestion,
} from '../../lib/api/attention';
import {
  listCancellationReasons, cancelBooking, type CancellationReason,
} from '../../lib/api/cancellations';

/**
 * Bookings nobody answered, and the three things the desk can do about them.
 *
 * The escalation is not new — `sweep_stale_requests()` has been notifying every
 * admin at 72 hours since 0071. What was missing is where that notification
 * sends them: `/bookings` is the approve/decline queue, which does not say how
 * long anyone has waited and offers no way to move a session to a coach who is
 * free. This is the screen that notification should have been pointing at.
 *
 * It renders **nothing at all** when there is nothing waiting. An empty
 * "Requires attention" panel sitting permanently above the queue trains the
 * desk to scroll past the one place that is supposed to interrupt them.
 */

const URGENCY: Record<AttentionRow['urgency'], { label: string; tone: string; bg: string }> = {
  // Amber for the two that need acting on, muted for the two that do not yet.
  // No reds: a booking waiting three days is not an error state, it is a job.
  urgent:  { label: 'Session is imminent', tone: 'var(--color-secondary)', bg: 'var(--color-secondary-light)' },
  overdue: { label: 'No answer in 3 days', tone: 'var(--color-secondary)', bg: 'var(--color-secondary-light)' },
  waiting: { label: 'Waiting',             tone: 'var(--color-text-secondary)', bg: 'var(--color-surface-high)' },
  new:     { label: 'New',                 tone: 'var(--color-text-muted)', bg: 'var(--color-surface-high)' },
};

function when(iso: string): string {
  return new Date(iso).toLocaleString('en-PH', {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

export default function BookingAttentionPanel({ onChanged }: { onChanged: () => void }) {
  const [rows, setRows] = useState<AttentionRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  // Reassignment
  const [moving, setMoving] = useState<AttentionRow | null>(null);
  const [suggestions, setSuggestions] = useState<TrainerSuggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [pickedTrainer, setPickedTrainer] = useState('');

  // Cancellation
  const [cancelling, setCancelling] = useState<AttentionRow | null>(null);
  const [reasons, setReasons] = useState<CancellationReason[]>([]);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    try {
      setRows(await listBookingsNeedingAttention());
    } catch {
      // Silent: this panel is an extra on top of the queue below it, and a
      // failure here must not make the page look broken when the queue loaded.
      setRows([]);
    }
  }, []);

  // The IIFE is the documented fix, not a style: the set-state-in-effect rule
  // follows a *directly called* async function into the setState inside it, so
  // `useEffect(() => { load(); })` is flagged and this is not.
  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  const openMove = async (row: AttentionRow) => {
    setMoving(row);
    setPickedTrainer('');
    setSuggestions([]);
    setLoadingSuggestions(true);
    try {
      setSuggestions(await suggestTrainers(row.id));
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not find another trainer', 'error');
    } finally {
      setLoadingSuggestions(false);
    }
  };

  const openCancel = async (row: AttentionRow) => {
    setCancelling(row);
    setReason('');
    setNote('');
    try {
      setReasons(await listCancellationReasons('staff'));
    } catch {
      setReasons([]);
    }
  };

  const nudge = async (row: AttentionRow) => {
    setBusy(row.id);
    try {
      const sent = await remindTrainer(row.kind, row.id);
      // Says which actually happened. A desk that thinks it chased someone and
      // did not is worse off than one that knows the reminder did not go.
      showToast(
        sent
          ? `Reminder sent to ${row.trainer_name ?? 'the trainer'}.`
          : 'A reminder already went to them today.',
        sent ? 'success' : 'info'
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not send the reminder', 'error');
    } finally {
      setBusy(null);
    }
  };

  const confirmMove = async () => {
    if (!moving || !pickedTrainer) return;
    setBusy(moving.id);
    try {
      await reassignSession(moving.id, pickedTrainer);
      showToast('Moved. The new coach has been asked to confirm it.', 'success');
      setMoving(null);
      await load();
      onChanged();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not reassign that session', 'error');
    } finally {
      setBusy(null);
    }
  };

  const chosenReason = reasons.find((r) => r.key === reason) ?? null;
  const cancelIncomplete = !chosenReason || (chosenReason.needs_note && note.trim() === '');

  const confirmCancel = async () => {
    if (!cancelling || cancelIncomplete) return;
    setBusy(cancelling.id);
    try {
      await cancelBooking(cancelling.kind, cancelling.id, reason, chosenReason?.needs_note ? note : null);
      showToast('Cancelled, and both sides have been told.', 'success');
      setCancelling(null);
      await load();
      onChanged();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not cancel that booking', 'error');
    } finally {
      setBusy(null);
    }
  };

  // Nothing waiting is the good outcome, and it says nothing at all.
  if (rows.length === 0) return null;

  return (
    <>
      {/* A rail card on Bookings (2026-10-12): rows stack, so it fits a 320px column. */}
      <RdCard className="p-4" data-attention-panel>
        <div className="flex items-center gap-2.5">
          <AlertTriangle size={20} style={{ color: '#FBBF24' }} />
          <h3 className="text-[16px] font-semibold text-white flex-1">Requires attention</h3>
          <span className="text-[12.5px] font-semibold px-2 rounded-full" style={{ background: 'rgba(245,158,11,0.15)', color: '#FBBF24' }}>{rows.length}</span>
        </div>
        <p className="text-[12.5px] mt-1" style={{ color: 'var(--color-text-secondary)' }}>Bookings the coach has not answered, worst first.</p>
        <div className="mt-3 flex flex-col gap-2">
          {rows.map((row) => {
            const u = URGENCY[row.urgency];
            const working = busy === row.id;
            return (
              <div key={`${row.kind}:${row.id}`} className="rounded-xl p-3"
                style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <span className="inline-block px-2 py-0.5 rounded-full text-[11.5px] font-semibold" style={{ background: u.bg, color: u.tone }}>{u.label}</span>
                <p className="text-[13.5px] font-semibold text-white truncate mt-1.5">{row.member_name} — {row.what}</p>
                <p className="text-[12px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                  {row.kind === 'pt' ? '1-on-1' : 'Class'} with {row.trainer_name ?? 'no coach assigned'}, {when(row.starts_at)}
                </p>
                <p className="text-[12px] mt-0.5 flex items-center gap-1" style={{ color: 'var(--color-text-muted)' }}>
                  <Clock size={12} />
                  Waiting {row.days_waiting === 0 ? 'less than a day' : `${row.days_waiting} day${row.days_waiting === 1 ? '' : 's'}`}
                </p>
                <div className="flex items-center gap-1 mt-2 flex-wrap">
                  <RdButton variant="ghost" size="sm" icon={Bell} disabled={working || !row.trainer_id} onClick={() => nudge(row)}>Remind</RdButton>
                  {/* Only 1-on-1 can move: a class booking is a seat in a timetabled class. */}
                  {row.kind === 'pt' && (
                    <RdButton variant="soft" size="sm" icon={UserCog} disabled={working} onClick={() => openMove(row)}>Another coach</RdButton>
                  )}
                  <RdButton variant="ghost" size="sm" icon={XCircle} disabled={working} onClick={() => openCancel(row)}>Cancel</RdButton>
                </div>
              </div>
            );
          })}
        </div>
      </RdCard>

      {/* ── Move it to someone who is free ──────────────────────────────── */}
      <Modal
        isOpen={moving !== null}
        onClose={() => setMoving(null)}
        title="Assign another coach"
        subtitle={moving ? `${moving.member_name} · ${when(moving.starts_at)}` : undefined}
        confirmLabel={busy ? 'Moving…' : 'Assign'}
        confirmDisabled={busy !== null || !pickedTrainer}
        onConfirm={confirmMove}
      >
        {loadingSuggestions ? (
          <p className="text-[12px]" style={{ color: 'var(--color-text-muted)' }}>
            Checking who is free…
          </p>
        ) : suggestions.length === 0 ? (
          <EmptyState
            compact
            icon={UserCog}
            title="Nobody else is free then"
            hint="Every other coach is either not working that hour or already booked. Contacting the member to rearrange is the honest next step."
          />
        ) : (
          <div className="space-y-2">
            <p className="text-[12px] leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
              These coaches work that hour and have nothing clashing with it. The session stays
              pending — whoever you pick still has to accept it.
            </p>
            {suggestions.map((s) => {
              const on = s.trainer_id === pickedTrainer;
              return (
                <button key={s.trainer_id} type="button"
                  onClick={() => setPickedTrainer(s.trainer_id)}
                  className="w-full text-left rounded-xl px-3 py-2.5"
                  style={{
                    background: on ? 'var(--color-primary)' : 'var(--color-surface-high)',
                    border: `1px solid ${on ? 'var(--color-primary)' : 'var(--color-border)'}`,
                    color: on ? '#fff' : 'var(--color-text-secondary)',
                  }}>
                  <p className="text-[13px] font-semibold" style={{ color: on ? '#fff' : '#fff' }}>
                    {s.trainer_name}
                  </p>
                  <p className="text-[11px] mt-0.5">
                    {s.specialization ?? 'General training'}
                    {s.shared_focus > 0 && ' · shares the member’s focus'}
                    {` · ${s.upcoming_load} session${s.upcoming_load === 1 ? '' : 's'} booked this week`}
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </Modal>

      {/* ── Or call it off ──────────────────────────────────────────────── */}
      <Modal
        isOpen={cancelling !== null}
        onClose={() => setCancelling(null)}
        title="Cancel this booking"
        subtitle={cancelling ? `${cancelling.member_name} · ${cancelling.what}` : undefined}
        confirmLabel={busy ? 'Cancelling…' : 'Confirm cancellation'}
        confirmDisabled={busy !== null || cancelIncomplete}
        onConfirm={confirmCancel}
      >
        <div className="space-y-3">
          <p className="text-[12px] leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
            The member is told, and the reason is kept on the booking. Since 0081 a cancellation
            without a reason is refused by the database, so this is not optional.
          </p>
          <div className="space-y-1.5">
            {reasons.map((r) => {
              const on = r.key === reason;
              return (
                <button key={r.key} type="button" onClick={() => setReason(r.key)}
                  className="w-full text-left rounded-xl px-3 py-2 text-[13px] font-medium"
                  style={{
                    background: on ? 'var(--color-primary)' : 'var(--color-surface-high)',
                    border: `1px solid ${on ? 'var(--color-primary)' : 'var(--color-border)'}`,
                    color: on ? '#fff' : 'var(--color-text-secondary)',
                  }}>
                  {r.label}
                </button>
              );
            })}
          </div>
          {chosenReason?.needs_note && (
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Say what happened (required)"
              className="w-full rounded-xl p-3 text-[13px] text-white resize-none"
              style={{ background: 'var(--color-surface-high)', border: '1px solid var(--color-border)' }}
            />
          )}
        </div>
      </Modal>
    </>
  );
}
