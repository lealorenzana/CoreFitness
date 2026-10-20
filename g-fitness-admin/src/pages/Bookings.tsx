import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import {
  RdHeader, RdCard, StatTile, FilterChips, SearchField, RdSelect, RdButton, Pill, RdTable, Tr, Td, TableFooter, EmptyBlock,
  FitBody, RailCard, RailRow, RailAction, TipCard, Initials,
} from '../components/ui/rd';
import { TONE, type Tone } from '../components/ui/rdTokens';
import { usePaged } from '../hooks/usePaged';
import { useFitRows } from '../hooks/useFitRows';
import {
  CheckCircle, XCircle, Clock, Calendar, User, Dumbbell, AlertTriangle,
  RotateCcw, ShieldCheck, Settings2,
} from 'lucide-react';
import { showToast } from '../utils/toast';
import { supabase } from '../lib/supabaseClient';
import { updateBookingStatus } from '../lib/api/bookings';
import { setPtSessionStatus } from '../lib/api/ptSessions';
import { notifyUser } from '../lib/api/notify';
import { loadBookingQueue, type QueueRow } from '../services/bookingQueueService';
import { sweepStaleRequests } from '../lib/api/bookings';
import BookingAttentionPanel from '../components/ui/BookingAttentionPanel';
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
 *
 * 2026-10-12: one table paged by what fits, the bulk bar above it, and a rail
 * with what needs chasing and who approves at this gym. Nothing scrolls the page.
 */

const SECOND = 'var(--color-text-secondary)';
const MUTED = 'var(--color-text-muted)';
const LINE = '1px solid rgba(255,255,255,0.06)';
const STATUS_TONE: Record<BookingStatus, Tone> = { pending: 'amber', approved: 'violet', rejected: 'gray', cancelled: 'gray' };
type BookingMode = 'instant' | 'coach' | 'desk' | 'coach_desk' | 'off';
const MODE_WORD: Record<BookingMode, string> = { instant: 'Instant', coach: 'Coach', desk: 'Desk', coach_desk: 'Coach, then desk', off: 'Off' };

/** Statuses as the desk says them. */
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

  /** Rows that fit the queue's own box — the page never scrolls (2026-10-12). */
  const fit = useFitRows(10);
  const paged = usePaged(visible, fit.perPage);
  const navigate = useNavigate();
  /** Who approves, per kind (0180) — read so the rail can say it. Null before 0180. */
  const [modes, setModes] = useState<{ class: BookingMode; pt: BookingMode } | null>(null);
  useEffect(() => {
    void (async () => {
      const { data, error } = await supabase.from('gym_settings').select('class_booking_approval, pt_booking_approval').maybeSingle();
      if (error || !data) return;
      const r = data as { class_booking_approval: BookingMode | null; pt_booking_approval: BookingMode | null };
      setModes({ class: r.class_booking_approval ?? 'coach', pt: r.pt_booking_approval ?? 'coach' });
    })();
  }, []);

  // Bulk selection deliberately spans the whole filtered queue, not just the
  // page you can see: "select all 20 pending" after a weekend should mean all
  // twenty, and silently meaning "the twelve on this page" is how a desk ends
  // up believing it cleared a queue it did not.
  /**
   * What the gym may do with a row (0203 — the database enforces the same):
   * "Coach approves" leaves every decision to an active coach; "Coach, then
   * desk" lets the gym confirm only what the coach accepted. No active coach →
   * the gym decides, so nothing is stranded.
   */
  const modeOf = (r: QueueRow): BookingMode => (modes ? modes[r.kind === 'class' ? 'class' : 'pt'] : 'desk');
  const gymMayApprove = (r: QueueRow) => !r.coachActive || (modeOf(r) !== 'coach' && (modeOf(r) !== 'coach_desk' || !!r.coachOkName));
  const gymMayReject = (r: QueueRow) => !r.coachActive || (modeOf(r) !== 'coach' && modeOf(r) !== 'coach_desk');
  const gymMayReverse = (r: QueueRow) => !r.coachActive || (modeOf(r) !== 'coach' && modeOf(r) !== 'coach_desk');
  /** Reminded this visit — the button says so instead of sending twice. */
  const [reminded, setReminded] = useState<Set<string>>(new Set());
  const remindCoach = async (r: QueueRow) => {
    if (!r.trainerId) return;
    await notifyUser({
      userId: r.trainerId, type: 'booking', title: 'A booking is waiting for you',
      message: `${r.memberName} asked for ${r.title}${r.when ? ' on ' + new Date(r.when).toLocaleString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''}. Accept or decline it in the app.`,
      actionUrl: '/trainer/bookings', dedupe: `remind:${r.kind}:${r.id}:${new Date().toISOString().slice(0, 10)}`,
    }).then(() => { setReminded((s) => new Set(s).add(r.id)); showToast(`${r.trainerName ?? 'The coach'} was reminded`, 'success'); })
      .catch(() => showToast('The reminder could not be sent', 'error'));
  };
  const selectablePending = visible.filter((r) => r.status === 'pending' && gymMayApprove(r));
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

  useEffect(() => { void (async () => { await load(); })(); }, [load]);

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
  const count = (s: 'all' | BookingStatus) => (s === 'all' ? rows.length : rows.filter((r) => r.status === s).length);
  const fmtDay = (iso: string) => new Date(iso).toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' });
  const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });

  const rail = (
    <>
      {/* Bookings the escalation ladder has been shouting about (0071), with somewhere to act.
          It renders nothing when nothing waits. */}
      <BookingAttentionPanel onChanged={load} />
      {modes && (
        <RailCard icon={ShieldCheck} title="Who approves here" sub="Set in Settings → Bookings (0180).">
          <RailRow tone="violet" label="Classes" count={MODE_WORD[modes.class]} />
          <RailRow tone="amber" label="1-on-1" count={MODE_WORD[modes.pt]} />
          <RailAction icon={Settings2} label="Change who approves" onClick={() => navigate('/settings?tab=bookings')} />
        </RailCard>
      )}
      <TipCard>
        A warning never blocks — a full class, a lapsed membership or a plan that does not cover it is for you to weigh. Ticking rows lets you decide a whole weekend at once.
      </TipCard>
    </>
  );

  return (
    <div className="rd-fit" data-bookings>
      <RdHeader title="Bookings" subtitle="Class bookings and 1-on-1 requests, in one queue."
        actions={<div className="w-[300px]"><SearchField value={search} onChange={setSearch} placeholder="Member, class or coach" /></div>} />

      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        <StatTile compact icon={Clock} tone={pendingCount ? 'amber' : 'violet'} label="Awaiting approval" value={pendingCount} sub="decide or remind"
          active={filter === 'pending' && kindFilter === 'all'} onClick={() => { setFilter('pending'); setKindFilter('all'); }} />
        <StatTile compact icon={AlertTriangle} tone={flaggedCount ? 'amber' : 'violet'} label="Need checking" value={flaggedCount} sub="pending with a warning"
          onClick={() => { setFilter('pending'); setKindFilter('all'); }} />
        <StatTile compact icon={Dumbbell} label="Classes" value={rows.filter((r) => r.kind === 'class').length} sub="seats in timetabled classes"
          active={kindFilter === 'class'} onClick={() => setKindFilter(kindFilter === 'class' ? 'all' : 'class')} />
        <StatTile compact icon={User} label="1-on-1" value={rows.filter((r) => r.kind === 'pt').length} sub="sessions with a coach"
          active={kindFilter === 'pt'} onClick={() => setKindFilter(kindFilter === 'pt' ? 'all' : 'pt')} />
      </div>

      <FitBody rail={rail}>
        <RdCard className="overflow-hidden rd-fit-fill" data-queue>
          <div className="flex items-center gap-2.5 flex-wrap px-4 py-3" style={{ borderBottom: LINE }}>
            <FilterChips<'all' | BookingStatus> compact value={filter} onChange={setFilter} items={[
              { key: 'pending', label: 'Pending', count: count('pending'), tone: pendingCount ? 'amber' : undefined },
              { key: 'approved', label: 'Confirmed', count: count('approved') },
              { key: 'rejected', label: 'Rejected', count: count('rejected') },
              { key: 'cancelled', label: 'Cancelled', count: count('cancelled') },
              { key: 'all', label: 'All', count: rows.length },
            ]} />
            <RdSelect label="Kind" value={kindFilter} onChange={(v) => setKindFilter(v as typeof kindFilter)} className="w-[150px]">
              <option value="all">Both kinds</option>
              <option value="class">Classes</option>
              <option value="pt">1-on-1</option>
            </RdSelect>
          </div>

          {/* Bulk bar. A queue after a weekend is twenty near-identical requests; selection spans
              the whole filtered queue, not just this page — "select all 20 pending" means twenty. */}
          {selectablePending.length > 0 && (
            <div className="flex items-center gap-3 px-4 py-2" style={{ borderBottom: LINE, background: selectedPending.length ? 'rgba(124,58,237,0.08)' : 'rgba(255,255,255,0.015)' }} data-bulk>
              <label className="flex items-center gap-2 text-[13px] cursor-pointer" style={{ color: SECOND }}>
                <input type="checkbox" className="accent-violet-500" checked={allSelected}
                  onChange={() => setSelected(allSelected ? new Set() : new Set(selectablePending.map((r) => r.id)))} />
                Select all {selectablePending.length} pending
              </label>
              {selectedPending.length > 0 && (
                <>
                  <span className="text-[13px] font-medium text-white">{selectedPending.length} selected</span>
                  <div className="ml-auto flex gap-2">
                    <RdButton variant="primary" size="sm" icon={CheckCircle} onClick={() => setBulk('approved')}>Approve selected</RdButton>
                    <RdButton variant="amber" size="sm" icon={XCircle} onClick={() => setBulk('rejected')}>Reject selected</RdButton>
                  </div>
                </>
              )}
            </div>
          )}

          {loading ? <p className="text-[14px] p-5" style={{ color: MUTED }}>Loading bookings…</p> : (
            <RdTable boxRef={fit.ref} head={['', 'Member', 'Booking', 'When', 'Status', { label: '', align: 'right' }]}
              empty={visible.length === 0 ? (
                <EmptyBlock compact icon={Calendar} title={rows.length === 0 ? 'No bookings yet' : 'Nothing matches those filters'}
                  body={rows.length === 0 ? 'Members book classes and 1-on-1 sessions from the phone app.' : 'Clear a filter to widen the queue.'} />
              ) : undefined}>
              {paged.visible.map((row) => {
                const flagged = row.warnings.length > 0;
                const full = !!row.seats && row.seats.taken >= row.seats.capacity;
                return (
                  <Tr key={`${row.kind}-${row.id}`} style={{ height: visible.length > paged.perPage ? fit.rowHeight : undefined }} data-booking-row>
                    <Td className="w-10">
                      {row.status === 'pending' && (
                        <input type="checkbox" className="accent-violet-500" checked={selected.has(row.id)} onChange={() => toggle(row.id)}
                          aria-label={`Select ${row.memberName}'s booking`} />
                      )}
                    </Td>
                    <Td>
                      <span className="flex items-center gap-3 min-w-0">
                        <Initials name={row.memberName} size={32} />
                        <span className="font-semibold text-white truncate max-w-[130px]">{row.memberName}</span>
                      </span>
                    </Td>
                    <Td>
                      <span className="flex items-center gap-2.5 min-w-0">
                        <span className="min-w-0 max-w-[180px]">
                          <span className="block text-white truncate">{row.title}</span>
                          <span className="block text-[12px] truncate" style={{ color: row.kind === 'pt' ? TONE.amber.fg : MUTED }}>
                            {row.kind === 'pt' ? '1-on-1' : 'Class'}{row.trainerName ? ` with ${row.trainerName}` : ''}
                            {row.notes ? ` — “${row.notes}”` : ''}
                          </span>
                        </span>
                      </span>
                    </Td>
                    <Td>
                      {row.when ? (
                        <span className="block whitespace-nowrap">
                          <span className="block text-white">{fmtDay(row.when)}, {fmtTime(row.when)}</span>
                          <span className="block text-[12px]" style={{ color: MUTED }}>
                            {row.seats ? <span style={{ color: full ? TONE.amber.fg : undefined }}>{row.seats.taken}/{row.seats.capacity} seats taken</span> : '1-on-1 slot'}
                          </span>
                        </span>
                      ) : <span style={{ color: MUTED }}>Not scheduled</span>}
                    </Td>
                    <Td>
                      <span className="flex flex-col items-start gap-1 max-w-[190px]">
                        <Pill tone={STATUS_TONE[row.status]} solidDot>{STATUS_BADGE[row.status]}</Pill>
                        {/* Since 0071 a trainer decides their own bookings, so a decided row says by whom.
                            NULL is left silent rather than guessed. */}
                        {row.status === 'pending' && !gymMayApprove(row) && (
                          <span data-waiting-coach className="text-[12px] font-semibold truncate max-w-full" style={{ color: '#C4B5FD' }}>
                            Waiting for {row.trainerName ?? 'the coach'} to decide</span>
                        )}
                        {row.coachOkName && (
                          <span data-coach-ok className="text-[12px] font-semibold truncate max-w-full" style={{ color: '#C4B5FD' }}>{row.coachOkName} accepted — your turn to confirm</span>
                        )}
                        {row.decidedByRole && (
                          <span className="text-[12px] truncate max-w-full" style={{ color: MUTED }}>
                            {row.decidedByRole === 'system' && row.status === 'approved'
                              ? 'Confirmed automatically — your gym books instantly'
                              : row.decidedByRole === 'system'
                              ? 'Expired — nobody answered in time'
                              : `${row.status === 'approved' ? 'Accepted' : 'Declined'} by ${row.decidedByName ?? DECIDER_WORD[row.decidedByRole]}${row.decidedByName ? ` (${DECIDER_WORD[row.decidedByRole]})` : ''}`}
                          </span>
                        )}
                        {/* Warnings, not blocks — the desk overrides these for real reasons. */}
                        {flagged && (
                          <span className="text-[12px] flex items-center gap-1 max-w-full" style={{ color: TONE.amber.fg }}
                            data-tip={row.warnings.map((w) => w.message).join(' — ')}>
                            <AlertTriangle size={12} className="flex-none" /> <span className="truncate">{row.warnings[0].message}</span>{row.warnings.length > 1 ? <span className="flex-none">(+{row.warnings.length - 1})</span> : null}
                          </span>
                        )}
                      </span>
                    </Td>
                    <Td align="right">
                      {row.status === 'pending' && !gymMayApprove(row) ? (
                        // The coach's to decide (0203): the gym sees it and can nudge.
                        <RdButton size="sm" disabled={reminded.has(row.id)} onClick={() => void remindCoach(row)} data-remind-coach
                          data-tip={`Send ${row.trainerName ?? 'the coach'} a reminder in the app`}>{reminded.has(row.id) ? 'Reminded' : 'Remind coach'}</RdButton>
                      ) : row.status === 'pending' ? (
                        <span className="inline-flex gap-1 whitespace-nowrap">
                          <RdButton variant="primary" size="sm" disabled={busyId === row.id} onClick={() => decide(row, 'approved')}>Approve</RdButton>
                          {gymMayReject(row) && <button type="button" aria-label="Reject" data-tip="Reject — the member is told" disabled={busyId === row.id} onClick={() => decide(row, 'rejected')}
                            className="w-9 h-9 rounded-xl grid place-items-center hover:bg-white/[0.06] disabled:opacity-50" style={{ color: SECOND, border: '1px solid rgba(255,255,255,0.1)' }}><XCircle size={16} /></button>}
                        </span>
                      ) : (row.status === 'approved' || row.status === 'rejected') && gymMayReverse(row) ? (
                        <button type="button" aria-label="Change decision" disabled={busyId === row.id} onClick={() => setToReverse(row)}
                          data-tip={`Change decision — make it ${row.status === 'approved' ? 'rejected' : 'approved'}`}
                          className="w-9 h-9 rounded-xl grid place-items-center hover:bg-white/[0.06] disabled:opacity-50" style={{ color: SECOND, border: '1px solid rgba(255,255,255,0.1)' }}><RotateCcw size={16} /></button>
                      ) : null}
                    </Td>
                  </Tr>
                );
              })}
            </RdTable>
          )}
          <TableFooter page={paged.page} perPage={paged.perPage} total={paged.total} noun="requests" onPage={paged.setPage} />
        </RdCard>
      </FitBody>

      <ConfirmDialog
        isOpen={!!bulk}
        onClose={() => setBulk(null)}
        onConfirm={runBulk}
        title={bulk === 'approved' ? 'Approve selected' : 'Reject selected'}
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
        title="Change this decision"
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
