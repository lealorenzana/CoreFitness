import { useState, useEffect, useCallback, useMemo } from 'react';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import Pagination from '../components/ui/Pagination';
import {
  PageHeader, StatTiles, Section, EmptyState, CardGrid, TileCard,
  SearchBox, Chips, Toolbar, PageSummary,
} from '../components/ui/kit';
import { usePaged } from '../hooks/usePaged';
import {
  CheckCircle, XCircle, Clock, Calendar, User, Dumbbell, AlertTriangle,
  RotateCcw, Users,
} from 'lucide-react';
import { showToast } from '../utils/toast';
import { supabase } from '../lib/supabaseClient';
import { updateBookingStatus } from '../lib/api/bookings';
import { setPtSessionStatus } from '../lib/api/ptSessions';
import { notifyUser } from '../lib/api/notify';
import { loadBookingQueue, type QueueRow } from '../services/bookingQueueService';
import { sweepStaleRequests } from '../lib/api/bookings';
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

/**
 * How each decider is described to the admin.
 *
 * 'system' never reaches this map — an automatic expiry is worded as an event
 * rather than as an actor, because nobody decided anything.
 */
const DECIDER_WORD: Record<'admin' | 'staff' | 'trainer' | 'system', string> = {
  admin: 'admin',
  staff: 'front desk',
  trainer: 'their trainer',
  system: 'the system',
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

  const paged = usePaged(visible, 12);

  // Bulk selection deliberately spans the whole filtered queue, not just the
  // page you can see: "select all 20 pending" after a weekend should mean all
  // twenty, and silently meaning "the twelve on this page" is how a desk ends
  // up believing it cleared a queue it did not.
  const selectablePending = visible.filter((r) => r.status === 'pending');
  const selectedPending = selectablePending.filter((r) => selected.has(r.id));
  const allSelected = selectablePending.length > 0 && selectedPending.length === selectablePending.length;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Reminds, escalates and expires requests nobody answered (0071).
      //
      // Here rather than only in pg_cron, because pg_cron is optional on this
      // deployment — so a member waiting on a trainer is told late at worst,
      // never not at all. It runs before the read so an expiry it performs is
      // already reflected in the queue below rather than appearing next visit.
      //
      // Never throws into the page: a failed sweep must not stop the queue
      // rendering, and the queue is what the admin came for.
      await sweepStaleRequests();

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

  return (
    <div className="space-y-4">
      <PageHeader
        title="Bookings"
        subtitle="Class bookings and personal-training requests, in one queue"
        actions={<SearchBox value={search} onChange={setSearch} placeholder="Member, class or trainer…" width={230} />}
      />

      <StatTiles items={[
        { label: 'Awaiting approval', value: pendingCount, icon: Clock, tone: pendingCount > 0 ? 'secondary' : 'primary',
          onClick: () => setFilter('pending') },
        { label: 'Need checking', value: flaggedCount, icon: AlertTriangle,
          tone: flaggedCount > 0 ? 'secondary' : 'primary', onClick: () => setFilter('pending') },
        { label: 'Classes', value: rows.filter((r) => r.kind === 'class').length, icon: Dumbbell,
          onClick: () => setKindFilter('class') },
        { label: 'Personal training', value: rows.filter((r) => r.kind === 'pt').length, icon: User,
          onClick: () => setKindFilter('pt') },
      ]} />

      <Section
        title="Queue" icon={Calendar} count={visible.length}
        actions={
          <Toolbar>
            <Chips
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: 'All' },
                { value: 'pending', label: 'Pending', count: pendingCount },
                { value: 'approved', label: 'Approved' },
                { value: 'rejected', label: 'Rejected' },
                { value: 'cancelled', label: 'Cancelled' },
              ]}
            />
            <Chips
              value={kindFilter}
              onChange={setKindFilter}
              options={[
                { value: 'all', label: 'Both' },
                { value: 'class', label: 'Classes' },
                { value: 'pt', label: 'PT' },
              ]}
            />
          </Toolbar>
        }
      >
        {/* Bulk bar. A queue after a weekend is twenty near-identical requests,
            and twenty separate round trips is how the desk stops using the
            queue. It sits inside the section now, directly above the things it
            acts on, rather than as a floating strip above the filters. */}
        {selectablePending.length > 0 && (
          <div className="rounded-lg px-3 py-2 flex items-center gap-3 mb-3"
            style={{ background: 'var(--color-surface-high)' }}>
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
          <EmptyState
            icon={Calendar}
            title={rows.length === 0 ? 'No bookings yet' : 'Nothing matches those filters'}
            hint={rows.length === 0
              ? 'Members book classes and PT sessions from the phone app.'
              : 'Clear a filter to widen the queue.'}
          />
        ) : (
          <>
            {/* Cards in a grid rather than full-width rows: a request is about
                240px of information, and stretching it to 1,600 puts the member's
                name and the Approve button at opposite ends of the desk's screen. */}
            <CardGrid min={330}>
              {paged.visible.map((row) => {
                const flagged = row.warnings.length > 0;
                return (
                  <TileCard key={`${row.kind}-${row.id}`} accent={flagged}>
                    <div className="flex items-start gap-2.5">
                      {row.status === 'pending' && (
                        <input type="checkbox" className="mt-1 flex-shrink-0"
                          checked={selected.has(row.id)} onChange={() => toggle(row.id)}
                          aria-label={`Select ${row.memberName}'s booking`} />
                      )}
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ background: row.kind === 'pt' ? 'var(--color-secondary-light)' : 'var(--color-primary-light)' }}>
                        {row.kind === 'pt'
                          ? <User size={14} style={{ color: 'var(--color-secondary)' }} />
                          : <Dumbbell size={14} style={{ color: 'var(--color-primary)' }} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-[12px] font-semibold text-white truncate">{row.memberName}</p>
                          <Badge variant={STATUS_BADGE[row.status]} className="!text-[9px] !px-1.5 !py-0 flex-shrink-0">{row.status}</Badge>
                        </div>
                        <p className="text-[11px] truncate" style={{ color: 'var(--color-text-secondary)' }}>
                          {row.title}{row.trainerName && ` · ${row.trainerName}`}
                        </p>
                        {/* Since 0071 a trainer decides their own classes and
                            sessions, so a decided row that said only
                            "approved" would imply the desk did it. NULL is
                            left silent rather than guessed: it means undecided,
                            or decided before this column existed, and neither
                            of those is "the front desk". */}
                        {row.decidedByRole && (
                          <p className="text-[10px] truncate" style={{ color: 'var(--color-text-muted)' }}>
                            {row.decidedByRole === 'system'
                              ? 'Expired automatically — nobody answered in time'
                              : `${row.status === 'approved' ? 'Accepted' : 'Declined'} by ${
                                  row.decidedByName ?? DECIDER_WORD[row.decidedByRole]
                                }${row.decidedByName ? ` (${DECIDER_WORD[row.decidedByRole]})` : ''}`}
                          </p>
                        )}
                      </div>
                    </div>

                    <p className="text-[10px] mt-1.5 flex items-center gap-2.5 flex-wrap" style={{ color: 'var(--color-text-muted)' }}>
                      <span className="flex items-center gap-1">
                        <Calendar size={9} />
                        {row.when
                          ? new Date(row.when).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
                          : 'Not scheduled'}
                      </span>
                      {row.when && (
                        <span className="flex items-center gap-1">
                          <Clock size={9} />
                          {new Date(row.when).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}
                        </span>
                      )}
                      {row.seats && (
                        <span className="flex items-center gap-1"
                          style={{ color: row.seats.taken >= row.seats.capacity ? 'var(--color-secondary)' : undefined }}>
                          <Users size={9} /> {row.seats.taken}/{row.seats.capacity}
                        </span>
                      )}
                    </p>

                    {row.notes && (
                      <p className="text-[10px] mt-1.5 px-2 py-1 rounded-lg"
                        style={{ background: 'var(--color-bg)', color: 'var(--color-text-muted)' }}>
                        {row.notes}
                      </p>
                    )}

                    {/* Warnings, not blocks — the desk overrides these for real
                        reasons, so they inform rather than refuse. */}
                    {flagged && (
                      <div className="mt-1.5 space-y-0.5">
                        {row.warnings.map((w) => (
                          <p key={w.kind + w.message} className="text-[10px] flex items-start gap-1.5"
                            style={{ color: 'var(--color-secondary)' }}>
                            <AlertTriangle size={10} className="mt-0.5 flex-shrink-0" /> {w.message}
                          </p>
                        ))}
                      </div>
                    )}

                    <div className="flex gap-1.5 mt-2.5">
                      {row.status === 'pending' ? (
                        <>
                          <Button variant="primary" size="sm" className="!text-[10px] flex-1"
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
                          <RotateCcw size={12} className="mr-1" /> Change decision
                        </Button>
                      ) : null}
                    </div>
                  </TileCard>
                );
              })}
            </CardGrid>

            <div className="flex items-center justify-between mt-3">
              <PageSummary page={paged.page} perPage={paged.perPage} total={paged.total} noun="requests" />
              <Pagination currentPage={paged.page} totalItems={paged.total}
                itemsPerPage={paged.perPage} onPageChange={paged.setPage} />
            </div>
          </>
        )}
      </Section>

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
