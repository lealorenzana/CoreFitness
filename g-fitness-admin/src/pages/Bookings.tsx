import { motion } from 'framer-motion';
import { useState, useEffect, useCallback, useMemo } from 'react';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import {
  CheckCircle, XCircle, Clock, Calendar, User, Dumbbell, Search, AlertTriangle,
  RotateCcw, Users,
} from 'lucide-react';
import { showToast } from '../utils/toast';
import { supabase } from '../lib/supabaseClient';
import { updateBookingStatus } from '../lib/api/bookings';
import { setPtSessionStatus } from '../lib/api/ptSessions';
import { notifyUser } from '../lib/api/notify';
import { loadBookingQueue, type QueueRow } from '../services/bookingQueueService';
import type { BookingStatus } from '../types/db';

/**
 * One approval queue for both booking kinds.
 *
 * Class bookings live in `bookings` (a member joining a scheduled class) and
 * personal training in `pt_sessions` (one member, one trainer, one slot). They
 * are separate tables for good reason — see migration 0015 — but they are the
 * same job for whoever is on the desk, so splitting them across two screens
 * would just mean two places to forget to look.
 *
 * Approval is a front-desk action. Trainers see requests for their own classes
 * read-only; RLS enforces that, this page is the other side of it.
 *
 * Row assembly and the pre-approval checks live in `bookingQueueService`.
 */

/** Statuses map onto the design system's three tones — no greens, no reds. */
const STATUS_BADGE: Record<BookingStatus, string> = {
  pending: 'Pending',
  approved: 'Confirmed',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};

export default function Bookings() {
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [filter, setFilter] = useState<'all' | BookingStatus>('pending');
  const [kindFilter, setKindFilter] = useState<'all' | 'class' | 'pt'>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState<'approved' | 'rejected' | null>(null);
  const [bulkRunning, setBulkRunning] = useState(false);
  const [toReverse, setToReverse] = useState<QueueRow | null>(null);

  // Declared before the handlers because `runBulk` reads it. It resolves either
  // way — the closure runs long after this line — but a handler referring to a
  // binding defined thirty lines below it is a trap for the next reader.
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (filter === 'all' || r.status === filter) &&
        (kindFilter === 'all' || r.kind === kindFilter) &&
        (!q ||
          r.memberName.toLowerCase().includes(q) ||
          r.title.toLowerCase().includes(q) ||
          (r.trainerName ?? '').toLowerCase().includes(q))
    );
  }, [rows, filter, kindFilter, search]);

  const selectablePending = visible.filter((r) => r.status === 'pending');
  const selectedPending = selectablePending.filter((r) => selected.has(r.id));
  const allSelected = selectablePending.length > 0 && selectedPending.length === selectablePending.length;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { rows: queue } = await loadBookingQueue();
      setRows(queue);
      setSelected(new Set());
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to load bookings', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  /** The write plus the member's notification. Shared by single and bulk paths. */
  const applyDecision = async (row: QueueRow, decision: 'approved' | 'rejected') => {
    if (row.kind === 'pt') {
      await setPtSessionStatus(row.id, decision);
    } else {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Your session could not be verified. Please refresh.');
      await updateBookingStatus(row.id, decision, user.id);
    }

    // Telling the member is the whole point of the queue. Deliberately after the
    // status write: the decision is already committed, so a failure here cannot
    // leave the booking half-decided.
    const whenText = row.when
      ? new Date(row.when).toLocaleString('en-PH', {
          weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
        })
      : 'a time to be confirmed';

    await notifyUser({
      userId: row.memberId,
      type: 'booking',
      title: decision === 'approved' ? 'Booking confirmed' : 'Booking not approved',
      message:
        decision === 'approved'
          ? `${row.title} on ${whenText} is confirmed. See you there.`
          : `${row.title} on ${whenText} could not be approved. Ask the front desk for another slot.`,
      actionUrl: '/member/booking-history',
    }).catch(() => {
      // The booking IS decided; only the notice failed. Saying "failed to update
      // booking" here would be a lie that sends staff to re-approve.
      showToast('Decision saved, but the member could not be notified', 'error');
    });
  };

  const decide = async (row: QueueRow, decision: 'approved' | 'rejected') => {
    setBusyId(row.id);
    try {
      await applyDecision(row, decision);
      showToast(decision === 'approved' ? 'Booking approved' : 'Booking rejected', 'success');
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to update booking', 'error');
    } finally {
      setBusyId('');
    }
  };

  /**
   * Reverses a decision already made.
   *
   * A mis-tap on Reject was final: nothing on this page could move a row out of
   * rejected, and the member just saw a refusal. `bookings_update_admin` and
   * `pt_sessions_update_frontdesk` both allow it, so the only thing missing was
   * the button.
   */
  const reverse = async () => {
    const row = toReverse;
    if (!row) return;
    const next = row.status === 'approved' ? 'rejected' : 'approved';
    setBusyId(row.id);
    try {
      await applyDecision(row, next);
      showToast(`Changed to ${next}. The member has been told.`, 'success');
      setToReverse(null);
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not change that decision', 'error');
    } finally {
      setBusyId('');
    }
  };

  /**
   * Bulk decide. Sequential, not `Promise.all`: each one writes a row and sends
   * a notification, and firing twenty at once at a free-tier project is how you
   * get a partial failure nobody can untangle. Failures are counted and named
   * rather than aborting the rest.
   */
  const runBulk = async () => {
    if (!bulk) return;
    const targets = visible.filter((r) => selected.has(r.id) && r.status === 'pending');
    setBulkRunning(true);
    let done = 0;
    const failed: string[] = [];
    for (const row of targets) {
      try {
        await applyDecision(row, bulk);
        done++;
      } catch {
        failed.push(row.memberName);
      }
    }
    setBulkRunning(false);
    setBulk(null);
    showToast(
      failed.length === 0
        ? `${done} booking${done === 1 ? '' : 's'} ${bulk}`
        : `${done} ${bulk}, ${failed.length} failed (${failed.slice(0, 3).join(', ')})`,
      failed.length === 0 ? 'success' : 'error'
    );
    await load();
  };

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const pendingCount = rows.filter((r) => r.status === 'pending').length;
  const flaggedCount = rows.filter((r) => r.status === 'pending' && r.warnings.length > 0).length;
  const panel = { background: 'var(--color-surface)', border: '1px solid var(--color-border)' };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">Bookings</h1>
          <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
            Class bookings and personal-training requests
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-text-muted)' }} />
            <input type="text" placeholder="Search member, class or trainer…" value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-60 pl-9 pr-3 h-8 rounded-full text-xs text-white"
              style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }} />
          </div>
          {pendingCount > 0 && (
            <span className="text-[11px] px-3 py-1.5 rounded-full font-bold whitespace-nowrap"
              style={{ background: 'var(--color-secondary-light)', color: 'var(--color-secondary)' }}>
              {pendingCount} awaiting approval
            </span>
          )}
        </div>
      </div>

      {/* Requests that need a second look before anyone taps Approve. */}
      {flaggedCount > 0 && filter !== 'pending' && (
        <button onClick={() => setFilter('pending')}
          className="w-full text-left rounded-xl p-3 flex items-center gap-2"
          style={{ background: 'var(--color-secondary-light)', border: '1px solid rgba(245,158,11,0.30)' }}>
          <AlertTriangle size={13} style={{ color: 'var(--color-secondary)' }} />
          <span className="text-[11px]" style={{ color: 'var(--color-secondary)' }}>
            {flaggedCount} pending request{flaggedCount === 1 ? '' : 's'} need checking — full class, lapsed membership or a plan that doesn't cover it.
          </span>
        </button>
      )}

      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex gap-1.5">
          {(['all', 'pending', 'approved', 'rejected', 'cancelled'] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className="px-3 py-1.5 rounded-full text-[10px] font-semibold capitalize transition-colors"
              style={{
                background: filter === f ? 'var(--color-primary)' : 'var(--color-surface)',
                color: filter === f ? '#fff' : 'var(--color-text-muted)',
                border: `1px solid ${filter === f ? 'var(--color-primary)' : 'var(--color-border)'}`,
              }}>
              {f}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5">
          {([['all', 'All types'], ['class', 'Classes'], ['pt', 'Personal Training']] as const).map(([k, label]) => (
            <button key={k} onClick={() => setKindFilter(k)}
              className="px-3 py-1.5 rounded-full text-[10px] font-semibold transition-colors"
              style={{
                background: kindFilter === k ? 'var(--color-secondary)' : 'var(--color-surface)',
                color: kindFilter === k ? '#000' : 'var(--color-text-muted)',
                border: `1px solid ${kindFilter === k ? 'var(--color-secondary)' : 'var(--color-border)'}`,
              }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Bulk bar. A queue after a weekend is twenty near-identical requests, and
          twenty separate round trips is how the desk stops using the queue. */}
      {selectablePending.length > 0 && (
        <div className="rounded-xl px-3 py-2 flex items-center gap-3" style={panel}>
          <label className="flex items-center gap-2 text-[11px] cursor-pointer" style={{ color: 'var(--color-text-secondary)' }}>
            <input type="checkbox" checked={allSelected}
              onChange={() => setSelected(allSelected ? new Set() : new Set(selectablePending.map((r) => r.id)))} />
            Select all {selectablePending.length} pending
          </label>
          {selectedPending.length > 0 && (
            <>
              <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                {selectedPending.length} selected
              </span>
              <div className="ml-auto flex gap-2">
                <Button variant="primary" size="sm" className="!text-[10px]" onClick={() => setBulk('approved')}>
                  <CheckCircle size={12} className="mr-1" /> Approve selected
                </Button>
                <Button variant="danger" size="sm" className="!text-[10px]" onClick={() => setBulk('rejected')}>
                  <XCircle size={12} className="mr-1" /> Reject selected
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {loading ? (
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Loading bookings…</p>
      ) : visible.length === 0 ? (
        <div className="rounded-xl p-10 text-center" style={panel}>
          <Calendar size={26} className="mx-auto mb-2 opacity-40" style={{ color: 'var(--color-text-muted)' }} />
          <p className="text-sm text-white mb-1">Nothing here</p>
          <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
            {rows.length === 0
              ? 'No bookings yet — members book classes and PT sessions from the phone app.'
              : 'No bookings match this filter.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((row, i) => {
            const flagged = row.warnings.length > 0;
            return (
              <motion.div key={`${row.kind}-${row.id}`}
                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.03, 0.25) }}
                className="rounded-xl p-4 flex items-start gap-3"
                style={{ ...panel, borderColor: flagged ? 'var(--color-secondary)' : 'var(--color-border)' }}>

                {row.status === 'pending' && (
                  <input type="checkbox" className="mt-3 flex-shrink-0"
                    checked={selected.has(row.id)} onChange={() => toggle(row.id)}
                    aria-label={`Select ${row.memberName}'s booking`} />
                )}

                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
                  style={{ background: row.kind === 'pt' ? 'var(--color-secondary-light)' : 'var(--color-primary-light)' }}>
                  {row.kind === 'pt'
                    ? <User size={16} style={{ color: 'var(--color-secondary)' }} />
                    : <Dumbbell size={16} style={{ color: 'var(--color-primary)' }} />}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-white truncate">{row.memberName}</p>
                    <Badge variant={STATUS_BADGE[row.status]} className="!text-[9px] !px-2 !py-0.5">{row.status}</Badge>
                    {row.seats && (
                      <span className="text-[9px] flex items-center gap-1"
                        style={{ color: row.seats.taken >= row.seats.capacity ? 'var(--color-secondary)' : 'var(--color-text-muted)' }}>
                        <Users size={9} /> {row.seats.taken}/{row.seats.capacity}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                    {row.title}
                    {row.trainerName && ` · with ${row.trainerName}`}
                  </p>
                  <p className="text-[10px] mt-1 flex items-center gap-3" style={{ color: 'var(--color-text-muted)' }}>
                    <span className="flex items-center gap-1">
                      <Calendar size={9} />
                      {row.when
                        ? new Date(row.when).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
                        : 'Not scheduled'}
                    </span>
                    {row.when && (
                      <span className="flex items-center gap-1">
                        <Clock size={9} />
                        {new Date(row.when).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}
                      </span>
                    )}
                  </p>
                  {row.notes && (
                    <p className="text-[10px] mt-1.5 px-2 py-1 rounded-lg inline-block"
                      style={{ background: 'var(--color-bg)', color: 'var(--color-text-muted)' }}>
                      {row.notes}
                    </p>
                  )}

                  {/* Warnings, not blocks — the desk overrides these for real
                      reasons, so they inform rather than refuse. */}
                  {flagged && (
                    <div className="mt-2 space-y-0.5">
                      {row.warnings.map((w) => (
                        <p key={w.kind + w.message} className="text-[10px] flex items-start gap-1.5"
                          style={{ color: 'var(--color-secondary)' }}>
                          <AlertTriangle size={10} className="mt-0.5 flex-shrink-0" /> {w.message}
                        </p>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex gap-2 flex-shrink-0">
                  {row.status === 'pending' ? (
                    <>
                      <Button variant="ghost" size="sm" className="!text-[10px]"
                        disabled={busyId === row.id} onClick={() => decide(row, 'approved')}>
                        <CheckCircle size={12} className="mr-1" /> Approve
                      </Button>
                      <Button variant="danger" size="sm" className="!text-[10px]"
                        disabled={busyId === row.id} onClick={() => decide(row, 'rejected')}>
                        <XCircle size={12} className="mr-1" /> Reject
                      </Button>
                    </>
                  ) : row.status === 'approved' || row.status === 'rejected' ? (
                    <Button variant="ghost" size="sm" className="!text-[10px]"
                      disabled={busyId === row.id} onClick={() => setToReverse(row)}
                      title={`Change this to ${row.status === 'approved' ? 'rejected' : 'approved'}`}>
                      <RotateCcw size={12} className="mr-1" /> Change
                    </Button>
                  ) : null}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        isOpen={!!bulk}
        onClose={() => setBulk(null)}
        onConfirm={runBulk}
        title={bulk === 'approved' ? 'Approve Selected' : 'Reject Selected'}
        message={
          `${selectedPending.length} booking${selectedPending.length === 1 ? '' : 's'} will be ${bulk}, and every member is notified.` +
          (selectedPending.some((r) => r.warnings.length > 0)
            ? ` ${selectedPending.filter((r) => r.warnings.length > 0).length} of them carry a warning — a full class, a lapsed membership or a plan that doesn't cover it.`
            : '') +
          (bulkRunning ? ' Working…' : '')
        }
        confirmText={bulk === 'approved' ? 'Approve all' : 'Reject all'}
        type={bulk === 'approved' ? 'info' : 'warning'}
      />

      <ConfirmDialog
        isOpen={!!toReverse}
        onClose={() => setToReverse(null)}
        onConfirm={reverse}
        title="Change This Decision"
        message={
          toReverse
            ? `Change ${toReverse.memberName}'s ${toReverse.title} from ${toReverse.status} to ${toReverse.status === 'approved' ? 'rejected' : 'approved'}? They will be notified again with the new outcome.`
            : ''
        }
        confirmText="Change it"
        type="warning"
      />
    </div>
  );
}
