import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Clock, Calendar, CalendarCheck, Check, X, Dumbbell, Users } from 'lucide-react';
import Avatar from '../../components/ui/Avatar';
import { SkeletonList } from '../../components/ui/Skeleton';
import { Pill } from '../../components/ui/StatCard';
import { panelStyle } from '../../components/ui/Card';
import { toast } from '../../components/ui/Toast';
import { listTrainerBookings, updateBookingStatus } from '../../lib/api/bookings';
import { listTrainerPtSessions, setPtSessionStatus } from '../../lib/api/ptSessions';
import { listMembers } from '../../lib/api/members';
import { getCurrentTrainerId } from '../../services/trainerService';
import { errorMessage } from '../../utils/errorMessage';
import { readCache, writeCache } from '../../lib/pageCache';
import type { BookingStatus } from '../../types/db';

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

const STATUS_CONFIG: Record<BookingStatus, { bg: string; color: string; label: string }> = {
  pending: { bg: 'rgba(245,158,11,0.15)', color: 'var(--color-secondary)', label: 'Pending' },
  approved: { bg: 'var(--color-primary-light)', color: 'var(--color-primary)', label: 'Approved' },
  rejected: { bg: 'var(--color-secondary-light)', color: 'var(--color-secondary)', label: 'Declined' },
  cancelled: { bg: 'var(--color-primary-light)', color: 'var(--color-primary)', label: 'Cancelled' },
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
    <div className="space-y-4 pb-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="display text-xl text-white">Bookings</h1>
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            Your classes and 1-on-1 sessions · you decide these
          </p>
        </div>
        {pendingCount > 0 && (
          <div className="flex-shrink-0 mt-1">
            <Pill label={`${pendingCount} pending`} tone="secondary" />
          </div>
        )}
      </div>

      {/* Named separately from the pending count: "4 pending" is a workload,
          "1 waiting over a day" is a person who has not heard back. The gym is
          notified about these too (0071), so the trainer is better off seeing
          it here first. */}
      {overdueCount > 0 && (
        <div className="rounded-xl p-3"
          style={{ background: 'var(--color-secondary-light)', border: '1px solid var(--color-secondary)' }}>
          <p className="text-xs font-semibold" style={{ color: 'var(--color-secondary)' }}>
            {overdueCount === 1
              ? 'One member has been waiting more than a day.'
              : `${overdueCount} members have been waiting more than a day.`}
          </p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
            Declining is a decision too — it lets them book someone else.
          </p>
        </div>
      )}

      {error && (
        <div className="rounded-xl p-3" style={{ background: 'var(--color-secondary-light)', border: '1px solid var(--color-secondary)' }}>
          <p className="text-xs" style={{ color: 'var(--color-secondary)' }}>{error}</p>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
        {(['pending', 'approved', 'rejected', 'cancelled', 'all'] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className="px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap flex-shrink-0 transition-colors capitalize"
            style={{
              background: filter === f ? 'var(--color-primary)' : 'var(--color-surface)',
              color: filter === f ? '#fff' : 'var(--color-text-muted)',
              border: `1px solid ${filter === f ? 'var(--color-primary)' : 'var(--color-border)'}`,
            }}>
            {f === 'all'
              ? `All (${requests.length})`
              : `${f} (${requests.filter((r) => r.status === f).length})`}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {filtered.map((req, i) => {
          const config = STATUS_CONFIG[req.status];
          const memberName = names[req.memberId] ?? 'Member';
          const waited = req.status === 'pending' ? waitedLabel(req.requestedAt) : null;
          const overdue = req.status === 'pending' && isOverdue(req.requestedAt);
          const busy = deciding === req.id;

          return (
            <motion.div key={`${req.kind}:${req.id}`}
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.04, 0.3) }}
              className="p-4"
              style={{
                ...panelStyle,
                borderRadius: 'var(--radius-panel)',
                // The only row that gets an edge is one somebody is waiting on.
                // Highlighting every pending row highlights nothing.
                ...(overdue ? { borderColor: 'var(--color-secondary)' } : {}),
              }}>
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar name={memberName} photoUrl={photos[req.memberId] ?? null} size={36} />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{memberName}</p>
                    <p className="text-xs truncate flex items-center gap-1"
                      style={{ color: 'var(--color-text-muted)' }}>
                      {req.kind === 'pt'
                        ? <Dumbbell size={10} style={{ color: 'var(--color-secondary)' }} />
                        : <Users size={10} style={{ color: 'var(--color-secondary)' }} />}
                      {req.title}
                    </p>
                  </div>
                </div>
                <span className="text-xs px-2 py-0.5 rounded-full font-semibold whitespace-nowrap flex-shrink-0"
                  style={{ background: config.bg, color: config.color }}>
                  {config.label}
                </span>
              </div>

              <div className="flex items-center gap-3 text-xs flex-wrap"
                style={{ color: 'var(--color-text-secondary)' }}>
                <span className="flex items-center gap-1.5">
                  <Calendar size={12} style={{ color: 'var(--color-secondary)' }} />
                  {req.startsAt
                    ? new Date(req.startsAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
                    : 'Not scheduled'}
                </span>
                {req.startsAt && (
                  <span className="flex items-center gap-1.5">
                    <Clock size={12} style={{ color: 'var(--color-secondary)' }} />
                    {new Date(req.startsAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                  </span>
                )}
                {waited && (
                  <span className="font-semibold"
                    style={{ color: overdue ? 'var(--color-secondary)' : 'var(--color-text-muted)' }}>
                    {waited}
                  </span>
                )}
              </div>

              {req.status === 'pending' && (
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => decide(req, 'approved')}
                    disabled={busy}
                    className="flex-1 h-9 rounded-full font-bold text-xs flex items-center justify-center gap-1.5 transition-all active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
                    style={{ background: 'var(--color-secondary)', color: '#000' }}>
                    <Check size={13} /> Accept
                  </button>
                  <button
                    onClick={() => decide(req, 'rejected')}
                    disabled={busy}
                    className="flex-1 h-9 rounded-full font-bold text-xs flex items-center justify-center gap-1.5 transition-all active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
                    style={{
                      background: 'transparent',
                      color: 'var(--color-text-secondary)',
                      border: '1px solid var(--color-border)',
                    }}>
                    <X size={13} /> Decline
                  </button>
                </div>
              )}
            </motion.div>
          );
        })}

        {filtered.length === 0 && !error && (
          <div className="p-8 text-center" style={{ ...panelStyle, borderRadius: 'var(--radius-panel)' }}>
            <CalendarCheck size={36} className="mx-auto mb-3" style={{ color: 'var(--color-border)' }} />
            <p className="text-sm font-semibold text-white">
              {filter === 'all' ? 'No booking requests yet' : `Nothing ${filter}`}
            </p>
            <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
              {filter === 'pending'
                ? 'Nobody is waiting on you. Requests appear here as they come in.'
                : filter === 'all'
                  ? 'When a member requests one of your classes or a 1-on-1 session, it appears here for you to accept or decline.'
                  : 'Try a different filter to see the rest.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
