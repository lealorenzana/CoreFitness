import { useState, useEffect, useCallback } from 'react';
import { Barbell, CalendarBlank, Check, Clock, UsersThree, X } from '@phosphor-icons/react';
import Avatar from '../../components/ui/Avatar';
import { SkeletonList } from '../../components/ui/Skeleton';
import { Chip, NocButton, Panel, StatusPill } from '../../components/ui/noc';
import { toast } from '../../components/ui/Toast';
import { listTrainerBookings, updateBookingStatus } from '../../lib/api/bookings';
import { listTrainerPtSessions, setPtSessionStatus } from '../../lib/api/ptSessions';
import { listMembers } from '../../lib/api/members';
import { getCurrentTrainerId } from '../../services/trainerService';
import { errorMessage } from '../../utils/errorMessage';
import { readCache, writeCache } from '../../lib/pageCache';
import type { BookingStatus } from '../../types/db';
import { Page } from '../../components/ui/page';
import CancelBookingDialog from '../../components/ui/CancelBookingDialog';

/**
 * Requests for this trainer's classes and their own 1-on-1 sessions.
 *
 * **This screen used to be read-only, and said so.** The old docstring
 * explained that Accept/Decline had been removed because `bookings_update_admin`
 * allowed only an admin to change a booking's status, so wiring the buttons
 * would have produced a silent RLS failure on every tap. That was true until
 * migration 0071, which gives a trainer UPDATE on the bookings for classes they
 * teach and on their own PT sessions.
 *
 * ## The decision is final, and the gym can still reverse it
 *
 * Not a two-stage approval. Telling a member "approved" and then withdrawing it
 * after an admin looks would make the first message a lie. Instead the row
 * records `decided_by_role`, 0037 logs every decision to the admin's activity
 * feed, and an admin retains UPDATE on every row — so the gym oversees by
 * reversing and reviewing, not by holding the member in limbo.
 *
 * ## Ordering
 *
 * By how long the member has waited, longest first. First come, first served is
 * the only ordering this screen can justify: any prioritisation — by plan, by
 * tenure — needs a fairness rule the gym has not written down, and an
 * unexplained ordering is worse than an obvious one.
 */

/** Colour roles: amber is something still to do, violet something settled. */
const STATUS_CONFIG: Record<BookingStatus, { tone: 'action' | 'structure' | 'muted'; label: string }> = {
  pending: { tone: 'action', label: 'Pending' },
  approved: { tone: 'structure', label: 'Approved' },
  rejected: { tone: 'muted', label: 'Declined' },
  cancelled: { tone: 'muted', label: 'Cancelled' },
};

const FILTER_LABEL: Record<'all' | BookingStatus, string> = {
  pending: 'Pending', approved: 'Approved', rejected: 'Declined', cancelled: 'Cancelled', all: 'All',
};

/** A class booking and a PT session, flattened into the one queue a trainer works. */
interface Request {
  kind: 'class' | 'pt';
  id: string;
  memberId: string;
  title: string;
  status: BookingStatus;
  /** NULL for a class with no time on it — 0001 allows that. */
  startsAt: string | null;
  requestedAt: string;
}

/**
 * Still in the future, so `cancel_booking()` will accept it.
 *
 * A class with no time on it (0001 allows that) counts as ahead: it has not
 * happened, and refusing to let a coach cancel it would strand the booking.
 */
function isAhead(req: Request, now = Date.now()): boolean {
  if (!req.startsAt) return true;
  return new Date(req.startsAt).getTime() > now;
}

interface Snapshot {
  requests: Request[];
  names: Record<string, string>;
  photos: Record<string, string | null>;
}

const CACHE_KEY = 'trainer:bookings';

/**
 * How long the member has been waiting, in words.
 *
 * The point of the screen: a trainer scanning a list needs to see that
 * somebody has been waiting three days, not compute it from a request date.
 * Returns null under an hour — "waiting 12 minutes" is noise.
 */
function waitedLabel(requestedAt: string): string | null {
  const hours = (Date.now() - new Date(requestedAt).getTime()) / 3_600_000;
  if (hours < 1) return null;
  if (hours < 24) return `waiting ${Math.floor(hours)}h`;
  const days = Math.floor(hours / 24);
  return `waiting ${days} day${days === 1 ? '' : 's'}`;
}

/** True once a member has waited long enough that the delay is the story. */
function isOverdue(requestedAt: string): boolean {
  return Date.now() - new Date(requestedAt).getTime() >= 24 * 3_600_000;
}

export default function TrainerBookings() {
  const cached = readCache<Snapshot>(CACHE_KEY);
  const [requests, setRequests] = useState<Request[]>(cached?.requests ?? []);
  const [names, setNames] = useState<Record<string, string>>(cached?.names ?? {});
  const [photos, setPhotos] = useState<Record<string, string | null>>(cached?.photos ?? {});
  const [filter, setFilter] = useState<'all' | BookingStatus>('pending');
  const [loading, setLoading] = useState(cached === undefined);
  const [error, setError] = useState('');
  /** The row currently being decided, so its two buttons disable together. */
  const [deciding, setDeciding] = useState<string | null>(null);
  /** The booking whose cancellation dialog is open, or null. */
  const [pendingCancel, setPendingCancel] = useState<Request | null>(null);

  const load = useCallback(async (quiet = false) => {
    try {
      const trainerId = await getCurrentTrainerId();
      if (!trainerId) throw new Error('Not signed in');
      const [classRows, ptRows, members] = await Promise.all([
        listTrainerBookings(trainerId),
        listTrainerPtSessions(trainerId).catch(() => []),
        listMembers().catch(() => []),
      ]);

      const nameMap: Record<string, string> = {};
      const photoMap: Record<string, string | null> = {};
      for (const m of members) {
        nameMap[m.profile.id] = `${m.profile.first_name} ${m.profile.last_name}`;
        photoMap[m.profile.id] = m.profile.photo_url ?? null;
      }

      const merged: Request[] = [
        ...classRows.map((b): Request => ({
          kind: 'class',
          id: b.id,
          memberId: b.member_id,
          title: b.classes?.name ?? 'Class',
          status: b.status,
          startsAt: b.classes?.scheduled_at ?? null,
          requestedAt: b.requested_at,
        })),
        ...ptRows.map((s): Request => ({
          kind: 'pt',
          id: s.id,
          memberId: s.member_id,
          title: 'Personal training',
          status: s.status,
          startsAt: s.starts_at,
          requestedAt: s.requested_at,
        })),
      ].sort((a, b) => {
        // Pending first — this is a work queue, not an archive. Within pending,
        // longest wait at the top.
        if ((a.status === 'pending') !== (b.status === 'pending')) {
          return a.status === 'pending' ? -1 : 1;
        }
        return a.requestedAt.localeCompare(b.requestedAt);
      });

      setNames(nameMap);
      setPhotos(photoMap);
      setRequests(merged);
      setError('');
      writeCache<Snapshot>(CACHE_KEY, { requests: merged, names: nameMap, photos: photoMap });
    } catch (err) {
      console.error('Trainer bookings load failed:', err);
      // Quiet when a queue is already on screen — see TrainerHome.
      if (!quiet) setError(errorMessage(err, 'Failed to load bookings'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Wrapped rather than `void load(...)`: the lint rule traces a directly
    // called function into its setState calls and reports the
    // set-state-in-effect cascade, even though every one of them here is behind
    // an await. An async IIFE is the form the rest of this codebase uses.
    (async () => { await load(cached !== undefined); })();
    // `cached` is the mount-time snapshot; re-running on it would refetch on
    // every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Accept or decline.
   *
   * Both API calls guard against a zero-row write, so a decision RLS declines —
   * someone else's class, or a session that has already been decided — raises
   * here instead of showing a success toast over an unchanged row. That was the
   * failure mode this screen was originally disabled to avoid; it is now
   * caught rather than avoided.
   */
  const decide = async (req: Request, status: 'approved' | 'rejected') => {
    setDeciding(req.id);
    try {
      const trainerId = await getCurrentTrainerId();
      if (!trainerId) throw new Error('Not signed in');

      if (req.kind === 'class') {
        await updateBookingStatus(req.id, status, trainerId);
      } else {
        await setPtSessionStatus(req.id, status);
      }

      toast.success(
        status === 'approved'
          ? `Confirmed for ${names[req.memberId] ?? 'the member'}.`
          : `Declined. ${names[req.memberId] ?? 'The member'} has been told.`
      );
      await load(true);
    } catch (err) {
      toast.error(errorMessage(err, 'Could not save that decision'));
    } finally {
      setDeciding(null);
    }
  };

  const filtered = filter === 'all' ? requests : requests.filter((r) => r.status === filter);
  const pendingCount = requests.filter((r) => r.status === 'pending').length;
  const overdueCount = requests.filter(
    (r) => r.status === 'pending' && isOverdue(r.requestedAt)
  ).length;

  // A centred "Loading…" collapses the layout and snaps it back open.
  if (loading) return <SkeletonList count={4} />;

  return (
    <Page>
      {/* The title is the shell's header now. */}
      <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>
        Your classes and 1-on-1 sessions
        {pendingCount > 0 && <span style={{ color: 'var(--color-secondary)' }}> · {pendingCount} pending</span>}
      </p>

      {/* Named separately from the pending count: "4 pending" is a workload,
          "1 waiting over a day" is a person who has not heard back. The gym is
          notified about these too (0071), so the trainer is better off seeing
          it here first. */}
      {overdueCount > 0 && (
        <Panel glow="action">
          <p style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--color-secondary)' }}>
            {overdueCount === 1
              ? 'One member has been waiting more than a day.'
              : `${overdueCount} members have been waiting more than a day.`}
          </p>
          <p style={{ fontSize: 12.5, marginTop: 4, color: 'var(--color-text-secondary)' }}>
            Declining is a decision too — it lets them book someone else.
          </p>
        </Panel>
      )}

      {error && <p style={{ fontSize: 12.5, color: 'var(--color-secondary)' }}>{error}</p>}

      <div className="flex overflow-x-auto scrollbar-hide" style={{ gap: 8, margin: '0 calc(var(--gutter) * -1)', padding: '2px var(--gutter)' }}>
        {(['pending', 'approved', 'rejected', 'cancelled', 'all'] as const).map((f) => (
          <Chip key={f} on={filter === f} onClick={() => setFilter(f)}
            label={f === 'all'
              ? `All (${requests.length})`
              : `${FILTER_LABEL[f]} (${requests.filter((r) => r.status === f).length})`} />
        ))}
      </div>

      <div className="noc-rows">
        {filtered.map((req, i) => {
          const config = STATUS_CONFIG[req.status];
          const memberName = names[req.memberId] ?? 'Member';
          const waited = req.status === 'pending' ? waitedLabel(req.requestedAt) : null;
          const overdue = req.status === 'pending' && isOverdue(req.requestedAt);
          const busy = deciding === req.id;

          return (
            <div key={`${req.kind}:${req.id}`}>
              <div style={{ padding: '14px 0' }}>
                <div className="flex items-center" style={{ gap: 12 }}>
                  <Avatar name={memberName} photoUrl={photos[req.memberId] ?? null} size={38} />
                  <div className="flex-1 min-w-0">
                    <p className="truncate" style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--color-text-primary)' }}>{memberName}</p>
                    <p className="truncate flex items-center" style={{ gap: 5, fontSize: 12, marginTop: 2, color: 'var(--color-text-secondary)' }}>
                      {req.kind === 'pt'
                        ? <Barbell size={13} style={{ color: 'var(--color-primary-300)' }} />
                        : <UsersThree size={13} style={{ color: 'var(--color-primary-300)' }} />}
                      {req.title}
                    </p>
                  </div>
                  <StatusPill label={config.label} tone={config.tone} />
                </div>

                <div className="flex items-center flex-wrap" style={{ gap: 14, marginTop: 9, paddingLeft: 50, fontSize: 12.5, color: 'var(--color-text-secondary)' }}>
                  <span className="inline-flex items-center" style={{ gap: 5 }}>
                    <CalendarBlank size={13} style={{ color: 'var(--color-text-muted)' }} />
                    {req.startsAt
                      ? new Date(req.startsAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
                      : 'Not scheduled'}
                  </span>
                  {req.startsAt && (
                    <span className="inline-flex items-center" style={{ gap: 5 }}>
                      <Clock size={13} style={{ color: 'var(--color-text-muted)' }} />
                      {new Date(req.startsAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                    </span>
                  )}
                  {/* The only row that gets colour is one somebody is waiting
                      on. Highlighting every pending row highlights nothing. */}
                  {waited && (
                    <span style={{ fontWeight: 600, color: overdue ? 'var(--color-secondary)' : 'var(--color-text-muted)' }}>
                      {waited}
                    </span>
                  )}
                </div>

                {/* An accepted session the coach can no longer make. 0081 lets a
                    trainer cancel, with a reason, through the same dialog the
                    member uses — only while it is still ahead, because
                    `cancel_booking()` refuses a session that has started. */}
                {req.status === 'approved' && isAhead(req) && (
                  <div style={{ marginTop: 11, paddingLeft: 50 }}>
                    <NocButton variant="ghost" className="w-full" disabled={busy} icon={<X size={14} />}
                      onClick={() => setPendingCancel(req)} style={{ height: 40 }}>
                      Cancel this session
                    </NocButton>
                  </div>
                )}

                {req.status === 'pending' && (
                  <div className="flex" style={{ gap: 8, marginTop: 11, paddingLeft: 50 }}>
                    <NocButton variant="action" className="flex-1" disabled={busy} icon={<Check size={14} weight="bold" />}
                      onClick={() => decide(req, 'approved')} style={{ height: 40 }}>
                      Accept
                    </NocButton>
                    <NocButton variant="ghost" className="flex-1" disabled={busy} icon={<X size={14} />}
                      onClick={() => decide(req, 'rejected')} style={{ height: 40 }}>
                      Decline
                    </NocButton>
                  </div>
                )}
              </div>
              {i < filtered.length - 1 && <div className="hair" />}
            </div>
          );
        })}

        {filtered.length === 0 && !error && (
          <div className="text-center" style={{ padding: '32px 12px' }}>
            <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)' }}>
              {filter === 'all' ? 'No booking requests yet' : `Nothing ${FILTER_LABEL[filter].toLowerCase()}`}
            </p>
            <p style={{ fontSize: 12.5, marginTop: 4, lineHeight: 1.5, color: 'var(--color-text-muted)' }}>
              {filter === 'pending'
                ? 'Nobody is waiting on you. Requests appear here as they come in.'
                : filter === 'all'
                  ? 'When a member requests one of your classes or a 1-on-1 session, it appears here for you to accept or decline.'
                  : 'Try a different filter to see the rest.'}
            </p>
          </div>
        )}
      </div>

      <CancelBookingDialog
        open={pendingCancel !== null}
        kind={pendingCancel?.kind === 'pt' ? 'pt' : 'class'}
        id={pendingCancel?.id ?? null}
        title={pendingCancel?.title ?? ''}
        actor="trainer"
        onClose={() => setPendingCancel(null)}
        onCancelled={async () => {
          const who = pendingCancel ? names[pendingCancel.memberId] : null;
          setPendingCancel(null);
          toast.success(`Cancelled. ${who ?? 'The member'} has been told.`);
          await load();
        }}
      />
    </Page>
  );
}
