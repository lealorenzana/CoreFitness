import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import DatePicker from '../components/ui/DatePicker';
import DeskBookCard from '../components/bookings/DeskBookCard';
import { Av, Pager } from './attendance/parts';
import './attendance/att.css';
import { todayKey, addDays, localDateKey } from '../utils/dates';
import { usePaged } from '../hooks/usePaged';
import { useFitRows } from '../hooks/useFitRows';
import {
  CheckCircle, XCircle, AlertTriangle, RotateCcw, ShieldCheck, Settings2, CalendarDays, Hourglass, History, CalendarPlus,
  Search, CalendarRange, Download,
} from 'lucide-react';
import { showToast } from '../utils/toast';
import { recordReason, REASON_FIELD } from '../lib/api/reasons';
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

type BookingMode = 'instant' | 'coach' | 'desk' | 'coach_desk' | 'off';
const MODE_WORD: Record<BookingMode, string> = { instant: 'Instant', coach: 'Coach decides', desk: 'Desk decides', coach_desk: 'Coach, then desk', off: 'Off' };
/** Who decides, said as a sentence for the side card. */
const MODE_SAY: Record<BookingMode, string> = {
  instant: 'confirmed the moment a member books', coach: 'the coach decides · you see and remind',
  desk: 'you and the desk decide', coach_desk: 'the coach accepts, then you confirm', off: 'not booked in the app',
};

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

/**
 * `scope`: one kind only — Personal training's Sessions tab passes 'pt', the
 * Classes section's page 'class' (simplify, 2026-10-28). `embedded`: drawn
 * under Personal training's own title, so this page's title is left out.
 */
export default function Bookings({ scope, embedded = false }: { scope?: 'pt' | 'class'; embedded?: boolean } = {}) {
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [filter, setFilter] = useState<'all' | BookingStatus>('all');
  const [kindFilter, setKindFilter] = useState<'all' | 'class' | 'pt'>(scope ?? 'all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState<'approved' | 'rejected' | null>(null);
  const [bulkRunning, setBulkRunning] = useState(false);
  const [toReverse, setToReverse] = useState<QueueRow | null>(null);
  /** The redesign's three views (2026-10-20): the days ahead, what waits, and everything before today. */
  const [view, setView] = useState<'day' | 'waiting' | 'history'>('day');
  const [today] = useState(() => todayKey());
  const [preset, setPreset] = useState<'today' | 'tomorrow' | 'week' | 'month' | 'pick'>('week');
  const [pickDay, setPickDay] = useState('');
  const [historyFrom, setHistoryFrom] = useState('');
  /** Bumped by the head's button: the desk-booking card reloads its lists. */
  const [focusBook, setFocusBook] = useState(0);
  const range = preset === 'today' ? { from: today, to: today } : preset === 'tomorrow' ? { from: addDays(today, 1), to: addDays(today, 1) }
    : preset === 'week' ? { from: today, to: addDays(today, 6) } : preset === 'month' ? { from: today, to: addDays(today, 29) } : { from: pickDay || today, to: pickDay || today };

  // Declared before the handlers because `runBulk` reads it. It resolves either
  // way — the closure runs long after this line — but a handler referring to a
  // binding defined thirty lines below it is a trap for the next reader.
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const day = (r: QueueRow) => (r.when ? localDateKey(r.when) : null);
    const inView = (r: QueueRow) => view === 'waiting' ? r.status === 'pending'
      : view === 'history' ? !!day(r) && day(r)! < today && day(r)! >= (historyFrom || addDays(today, -30))
        : !!day(r) && day(r)! >= range.from && day(r)! <= range.to;
    return rows.filter(
      (r) =>
        inView(r) &&
        (filter === 'all' || r.status === filter) &&
        (kindFilter === 'all' || r.kind === kindFilter) &&
        (!q ||
          r.memberName.toLowerCase().includes(q) ||
          r.title.toLowerCase().includes(q) ||
          (r.trainerName ?? '').toLowerCase().includes(q))
    );
  }, [rows, filter, kindFilter, search, view, today, historyFrom, range.from, range.to]).sort((a, b) => view === 'history'
    ? (b.when ?? '').localeCompare(a.when ?? '') : (a.when ?? '').localeCompare(b.when ?? ''));

  /** Rows that fit the queue's own box — the page never scrolls (2026-10-12). */
  const { ref: fitRef, perPage } = useFitRows(10);
  const paged = usePaged(visible, perPage);
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
      actionUrl: '/trainer/schedule', dedupe: `remind:${r.kind}:${r.id}:${todayKey()}`,
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
      actionUrl: '/member/sessions',
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
  const reverse = async (why?: string) => {
    const row = toReverse;
    if (!row) return;
    const next = row.status === 'approved' ? 'rejected' : 'approved';
    setBusyId(row.id);
    try {
      await applyDecision(row, next);
      if (why) await recordReason({ action: 'booking.reversed', subjectType: 'booking', subjectId: row.id,
        summary: `Changed ${row.memberName}'s booking to ${next}`, reason: why });
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
  const runBulk = async (why?: string) => {
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
    if (why && done > 0) {
      await recordReason({ action: 'booking.rejected', subjectType: 'booking', subjectId: null,
        summary: `Rejected ${done} booking${done === 1 ? '' : 's'}`, reason: why }).catch(() => {});
    }
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
  const yours = rows.filter((r) => r.status === 'pending' && gymMayApprove(r)).length;
  const flaggedCount = rows.filter((r) => r.status === 'pending' && r.warnings.length > 0).length;
  const bookedToday = rows.filter((r) => r.status === 'approved' && r.when && localDateKey(r.when) === today);
  const weekRows = rows.filter((r) => r.kind === 'class' && r.when && localDateKey(r.when) >= today && localDateKey(r.when) <= addDays(today, 6) && r.seats);
  const seatsByClass = new Map<string, { t: number; c: number }>();
  for (const r of weekRows) seatsByClass.set(r.title + r.when, { t: r.seats!.taken, c: r.seats!.capacity });
  const seatT = [...seatsByClass.values()].reduce((a, x) => a + x.t, 0); const seatC = [...seatsByClass.values()].reduce((a, x) => a + x.c, 0);
  const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
  const dayTitle = (key: string) => {
    const [y, m, d] = key.split('-').map(Number);
    const base = new Date(y, m - 1, d).toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' });
    return key === today ? `Today · ${base}` : key === addDays(today, 1) ? `Tomorrow · ${base}` : key === addDays(today, -1) ? `Yesterday · ${base}` : base;
  };
  const rangeLabel = range.from === range.to ? dayTitle(range.from) : `${dayTitle(range.from)} – ${dayTitle(range.to)}`;
  // The page's rows grouped by the day they happen, on this page of the list.
  const groups: { key: string; rows: QueueRow[] }[] = [];
  for (const r of paged.visible) {
    const k = r.when ? localDateKey(r.when) : 'none';
    const g = groups[groups.length - 1];
    if (g && g.key === k) g.rows.push(r); else groups.push({ key: k, rows: [r] });
  }
  const exportCsv = () => {
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const lines = [['Date', 'Time', 'Member', 'Booking', 'Coach', 'Status', 'Decided by'].join(',')];
    for (const r of visible) {
      lines.push([r.when ? localDateKey(r.when) : '', r.when ? fmtTime(r.when) : '', r.memberName, r.title, r.trainerName ?? '', STATUS_BADGE[r.status],
        r.decidedByRole ? (r.decidedByRole === 'system' ? 'automatic' : `${r.decidedByName ?? DECIDER_WORD[r.decidedByRole]}`) : ''].map((v) => esc(String(v))).join(','));
    }
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `bookings-${today}.csv`; a.click(); URL.revokeObjectURL(a.href);
  };

  const outcome = (row: QueueRow) => {
    if (row.status === 'pending' && !gymMayApprove(row)) return <span data-waiting-coach className="a-sub" style={{ color: 'var(--a-p300)' }}>Waiting for {row.trainerName ?? 'the coach'} to decide</span>;
    if (row.coachOkName) return <span data-coach-ok className="a-sub" style={{ color: 'var(--a-p300)' }}>{row.coachOkName} accepted — your turn to confirm</span>;
    if (row.decidedByRole) return (
      <span className="a-sub">{row.decidedByRole === 'system' && row.status === 'approved' ? 'Confirmed automatically — your gym books instantly'
        : row.decidedByRole === 'system' ? 'Expired — nobody answered in time'
          : `${row.status === 'approved' ? 'Accepted' : 'Declined'} by ${row.decidedByName ?? DECIDER_WORD[row.decidedByRole]}${row.decidedByName ? ` (${DECIDER_WORD[row.decidedByRole]})` : ''}`}</span>
    );
    return null;
  };

  return (
    <div className="att" data-bookings>
      <div className="a-head">
        {!embedded && <div className="min-w-0">
          <h1>{scope === 'class' ? 'Class bookings' : 'Bookings'}</h1>
          <p>{scope === 'class' ? 'Every class booking, by day' : 'Every class booking and 1-on-1, by day'}{modes ? <> · <span style={{ color: 'var(--a-p300)' }}>classes: {MODE_WORD[modes.class].toLowerCase()} · 1-on-1: {MODE_WORD[modes.pt].toLowerCase()}</span></> : ''}</p>
        </div>}
        <nav className="a-tabs" aria-label="Bookings views" data-rd-tabs>
          <button type="button" className={view === 'day' ? 'on' : ''} onClick={() => { setView('day'); setFilter('all'); }}><CalendarDays size={14} />By day</button>
          <button type="button" className={view === 'waiting' ? 'on' : ''} onClick={() => { setView('waiting'); setFilter('pending'); }} data-view="waiting"><Hourglass size={14} />Waiting <em>{pendingCount}</em></button>
          <button type="button" className={view === 'history' ? 'on' : ''} onClick={() => { setView('history'); setFilter('all'); }} data-view="history"><History size={14} />History</button>
        </nav>
        <button type="button" className="a-btn amber" onClick={() => setFocusBook((n) => n + 1)}><CalendarPlus size={15} />Book for a member</button>
      </div>

      <div className="flex items-center gap-2 flex-none flex-wrap">
        <label className="a-input" style={{ flex: 1, maxWidth: 440, padding: '9px 13px' }}><Search size={15} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Member, class, coach or room…" aria-label="Search bookings" /></label>
        {view === 'day' && (<>
          {([['today', 'Today'], ['tomorrow', 'Tomorrow'], ['week', 'This week'], ['month', 'Next 30 days']] as const).map(([k, l]) => (
            <button key={k} type="button" className={`a-chip ${preset === k ? 'v' : ''}`} onClick={() => setPreset(k)}>{l}</button>
          ))}
          {/* One tap opens the calendar (the picker's own trigger, in the toolbar's look). */}
          <DatePicker value={preset === 'pick' ? range.from : ''} mode="future" bounds={{ today: addDays(today, -60), aheadDays: 60 + 120 }}
            triggerClassName={`a-btn ${preset === 'pick' ? 'soft' : ''} a-btn-tight`} triggerAriaLabel="Pick a date"
            triggerLabel={<><CalendarRange size={15} />{preset === 'pick' ? rangeLabel : 'Pick a date'}</>}
            onChange={(v) => { if (v) { setPickDay(v); setPreset('pick'); } }} />
        </>)}
        {view === 'history' && (
          <DatePicker value={historyFrom} mode="history" onChange={setHistoryFrom} triggerClassName="a-btn a-btn-tight" triggerAriaLabel="History from"
            triggerLabel={<><CalendarRange size={15} />{historyFrom ? `From ${dayTitle(historyFrom)}` : 'Last 30 days'}</>} />
        )}
        {!scope && <select className={`a-chip ${kindFilter !== 'all' ? 'on' : ''}`} value={kindFilter} onChange={(e) => setKindFilter(e.target.value as typeof kindFilter)} aria-label="Kind">
          <option value="all">Both kinds</option><option value="class">Classes</option><option value="pt">1-on-1</option>
        </select>}
        {view !== 'waiting' && (
          <select className={`a-chip ${filter !== 'all' ? 'on' : ''}`} value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} aria-label="Status">
            <option value="all">Any status</option><option value="pending">Waiting</option><option value="approved">Confirmed</option><option value="rejected">Declined</option><option value="cancelled">Cancelled</option>
          </select>
        )}
        {view === 'history' && <button type="button" className="a-btn" style={{ padding: '7px 11px', marginLeft: 'auto' }} onClick={exportCsv}><Download size={15} />Export</button>}
      </div>

      <div className="a-grid flex-none" style={{ gridTemplateColumns: 'repeat(4,minmax(0,1fr))' }} data-booking-cards>
        <button type="button" className="a-card press text-left" style={pendingCount ? { borderColor: '#3e310f', padding: '12px 14px' } : { padding: '12px 14px' }} onClick={() => { setView('waiting'); setFilter('pending'); }}>
          <div className="a-lbl" style={pendingCount ? { color: 'var(--a-a300)' } : undefined}>Waiting for a decision</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}><div className="a-num">{pendingCount}</div><span className="a-sub">{pendingCount - yours} with coaches · {yours} yours</span></div>
        </button>
        <div className="a-card" style={{ padding: '12px 14px' }}><div className="a-lbl">Booked today</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}><div className="a-num">{bookedToday.length}</div><span className="a-sub">{bookedToday.filter((r) => r.kind === 'class').length} in classes · {bookedToday.filter((r) => r.kind === 'pt').length} 1-on-1</span></div></div>
        <div className="a-card" style={{ padding: '12px 14px' }}><div className="a-lbl">Seats filled · next 7 days</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}><div className="a-num">{seatC ? `${Math.round((seatT / seatC) * 100)}%` : '—'}</div><span className="a-sub">{seatC ? `${seatT} of ${seatC} in booked classes` : 'no class bookings yet'}</span></div></div>
        <button type="button" className="a-card press text-left" style={flaggedCount ? { borderColor: '#3e310f', padding: '12px 14px' } : { padding: '12px 14px' }} onClick={() => { setView('waiting'); setFilter('pending'); }}>
          <div className="a-lbl" style={flaggedCount ? { color: 'var(--a-a300)' } : undefined}>Need checking</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}><div className="a-num">{flaggedCount}</div><span className="a-sub">waiting with a warning</span></div>
        </button>
      </div>

      <div className="a-grid" style={{ gridTemplateColumns: 'minmax(0,1fr) 340px', flex: 1 }}>
        <div className="a-card" style={{ padding: '6px 14px 12px' }} data-queue>
          {selectablePending.length > 0 && (
            <div className="flex items-center gap-3 py-2" style={{ borderBottom: '1px solid var(--a-border)' }} data-bulk>
              <label className="flex items-center gap-2 a-sub cursor-pointer">
                <input type="checkbox" className="accent-violet-500" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(selectablePending.map((r) => r.id)))} />
                Select all {selectablePending.length} pending
              </label>
              {selectedPending.length > 0 && (
                <>
                  <b style={{ fontSize: 12.5 }}>{selectedPending.length} selected</b>
                  <div className="ml-auto flex gap-2">
                    <button type="button" className="a-btn violet sm" onClick={() => setBulk('approved')}><CheckCircle size={13} />Approve selected</button>
                    <button type="button" className="a-btn soft sm" onClick={() => setBulk('rejected')}><XCircle size={13} />Reject selected</button>
                  </div>
                </>
              )}
            </div>
          )}
          {loading ? <p className="a-sub" style={{ padding: 20 }}>Loading bookings…</p> : (
            <div ref={fitRef} className="a-scroll" style={{ flex: 1 }} data-rd-table>
              {visible.length === 0 ? (
                <p className="a-sub text-center" style={{ padding: 30 }}>{rows.length === 0 ? 'No bookings yet — members book from the phone app, or book one for them here.' : view === 'waiting' ? 'Nothing is waiting for a decision.' : 'Nothing matches — try another day or clear the search.'}</p>
              ) : groups.map((g) => (
                <div key={g.key}>
                  <div className="a-daygroup"><CalendarDays size={13} />{g.key === 'none' ? 'Not scheduled' : dayTitle(g.key)} <em>{g.rows.length}</em></div>
                  <table className="a-table" style={{ tableLayout: 'fixed' }}>
                    <colgroup><col style={{ width: 30 }} /><col style={{ width: '28%' }} /><col style={{ width: '30%' }} /><col style={{ width: '24%' }} /><col /></colgroup><tbody>
                    {g.rows.map((row) => {
                      const full = !!row.seats && row.seats.taken >= row.seats.capacity;
                      return (
                        <tr key={`${row.kind}-${row.id}`} data-booking-row>
                          <td>
                            {row.status === 'pending' && gymMayApprove(row) && (
                              <input type="checkbox" className="accent-violet-500" checked={selected.has(row.id)} onChange={() => toggle(row.id)} aria-label={`Select ${row.memberName}'s booking`} />
                            )}
                          </td>
                          <td><div className="a-who"><Av name={row.memberName} small /><div className="min-w-0"><b className="block truncate">{row.memberName}</b>
                            {row.warnings.length > 0 && <div className="a-sub truncate" style={{ color: 'var(--a-a300)' }} data-tip={row.warnings.map((w) => w.message).join(' — ')}><AlertTriangle size={11} className="inline" /> {row.warnings[0].message}</div>}</div></div></td>
                          <td><b className="block truncate">{row.title}</b>
                            <div className="a-sub truncate">{row.when ? fmtTime(row.when) : '—'}{row.trainerName ? ` · ${row.trainerName}` : ''}{row.seats ? <> · <span style={{ color: full ? 'var(--a-a300)' : undefined }}>{row.seats.taken}/{row.seats.capacity}</span></> : ' · 1-on-1'}{row.notes ? ` · “${row.notes}”` : ''}</div></td>
                          <td><span className={`a-pill ${row.status === 'approved' ? 'v' : row.status === 'pending' ? 'a' : ''}`}>{STATUS_BADGE[row.status]}</span><div>{outcome(row)}</div></td>
                          <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                            {row.status === 'pending' && !gymMayApprove(row) ? (
                              <button type="button" className="a-btn sm" disabled={reminded.has(row.id)} onClick={() => void remindCoach(row)} data-remind-coach
                                data-tip={`Send ${row.trainerName ?? 'the coach'} a reminder in the app`}>{reminded.has(row.id) ? 'Reminded' : 'Remind coach'}</button>
                            ) : row.status === 'pending' ? (
                              <span className="inline-flex gap-1">
                                <button type="button" className="a-btn violet sm" disabled={busyId === row.id} onClick={() => void decide(row, 'approved')}>{row.coachOkName ? 'Confirm' : 'Approve'}</button>
                                {gymMayReject(row) && <button type="button" className="a-btn ghost sm" aria-label="Reject" data-tip="Reject — the member is told" disabled={busyId === row.id} onClick={() => void decide(row, 'rejected')}><XCircle size={14} /></button>}
                              </span>
                            ) : (row.status === 'approved' || row.status === 'rejected') && gymMayReverse(row) ? (
                              <button type="button" className="a-btn ghost sm" aria-label="Change decision" disabled={busyId === row.id} onClick={() => setToReverse(row)}
                                data-tip={`Change decision — make it ${row.status === 'approved' ? 'rejected' : 'approved'}`}><RotateCcw size={14} /></button>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody></table>
                </div>
              ))}
            </div>
          )}
          {visible.length > 0 && (
            <div className="a-sub" style={{ paddingTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }} data-rd-footer>
              <span>{(paged.page - 1) * paged.perPage + 1}–{Math.min(paged.total, paged.page * paged.perPage)} of {paged.total}{view === 'day' ? ` · ${rangeLabel}` : ''}{search.trim() ? ` · “${search.trim()}”` : ''}</span>
              <Pager page={paged.page} pages={paged.totalPages} onPage={paged.setPage} />
            </div>
          )}
        </div>

        <div className="a-scroll" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <DeskBookCard onBooked={() => void load()} focusKey={focusBook} />
          <BookingAttentionPanel onChanged={load} />
          {modes && (
            <div className="a-card" style={{ flexShrink: 0 }}>
              <div className="a-ct"><h3><ShieldCheck size={16} />Who decides here</h3><button type="button" className="a-btn ghost sm" onClick={() => navigate('/settings?tab=bookings')}><Settings2 size={13} />Change</button></div>
              <div className="a-row"><span className="a-dot v" /><div className="t"><b>Classes</b><small>{MODE_SAY[modes.class]}</small></div></div>
              <div className="a-row"><span className="a-dot a" /><div className="t"><b>1-on-1</b><small>{MODE_SAY[modes.pt]}</small></div></div>
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        isOpen={!!bulk}
        onClose={() => setBulk(null)}
        onConfirm={(why) => void runBulk(why)} reason={bulk === 'rejected' ? REASON_FIELD : undefined}
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
        onConfirm={(why) => void reverse(why)} reason={REASON_FIELD}
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
