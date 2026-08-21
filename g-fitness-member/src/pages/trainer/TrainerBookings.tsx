import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Clock, Calendar, CalendarCheck } from 'lucide-react';
import Avatar from '../../components/ui/Avatar';
import { SkeletonList } from '../../components/ui/Skeleton';
import { Pill } from '../../components/ui/StatCard';
import { panelStyle } from '../../components/ui/Card';
import { listTrainerBookings, type BookingWithDetails } from '../../lib/api/bookings';
import { listMembers } from '../../lib/api/members';
import { getCurrentTrainerId } from '../../services/trainerService';
import { errorMessage } from '../../utils/errorMessage';
import { readCache, writeCache } from '../../lib/pageCache';
import type { BookingStatus } from '../../types/db';

/**
 * Bookings for the classes this trainer teaches (RLS `bookings_select_trainer`).
 *
 * **Read-only, deliberately.** The old fixture had Accept/Decline buttons, but
 * `bookings_update_admin` allows only an admin to change a booking's status — so
 * wiring those buttons to real data would have produced a silent RLS failure on
 * every tap. Approval lives with the front desk until we decide otherwise; if
 * trainers should approve their own classes' bookings, that needs a policy
 * change, and it belongs with the classes/personal-training booking model.
 */

const STATUS_CONFIG: Record<BookingStatus, { bg: string; color: string; label: string }> = {
  pending: { bg: 'rgba(245,158,11,0.15)', color: 'var(--color-secondary)', label: 'Pending' },
  approved: { bg: 'rgba(34,197,94,0.15)', color: '#22c55e', label: 'Approved' },
  rejected: { bg: 'rgba(239,68,68,0.15)', color: '#ef4444', label: 'Rejected' },
  cancelled: { bg: 'var(--color-primary-light)', color: 'var(--color-primary)', label: 'Cancelled' },
};

/** Rows and the member-name lookup they are rendered against, cached together. */
interface BookingsSnapshot {
  bookings: BookingWithDetails[];
  names: Record<string, string>;
}

const CACHE_KEY = 'trainer:bookings';

export default function TrainerBookings() {
  const cached = readCache<BookingsSnapshot>(CACHE_KEY);
  const [bookings, setBookings] = useState<BookingWithDetails[]>(cached?.bookings ?? []);
  const [names, setNames] = useState<Record<string, string>>(cached?.names ?? {});
  const [filter, setFilter] = useState<'all' | BookingStatus>('all');
  const [loading, setLoading] = useState(cached === undefined);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const trainerId = await getCurrentTrainerId();
        if (!trainerId) throw new Error('Not signed in');
        const [rows, members] = await Promise.all([
          listTrainerBookings(trainerId),
          listMembers().catch(() => []),
        ]);
        if (cancelled) return;
        const map: Record<string, string> = {};
        for (const m of members) map[m.profile.id] = `${m.profile.first_name} ${m.profile.last_name}`;
        setNames(map);
        setBookings(rows);
        writeCache<BookingsSnapshot>(CACHE_KEY, { bookings: rows, names: map });
      } catch (err) {
        console.error('Trainer bookings load failed:', err);
        // Quiet when the queue is already on screen — see TrainerHome.
        if (!cancelled && !cached) setError(errorMessage(err, 'Failed to load bookings'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // `cached` is the mount-time snapshot; re-running on it would refetch on
    // every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = filter === 'all' ? bookings : bookings.filter(b => b.status === filter);
  const pendingCount = bookings.filter(b => b.status === 'pending').length;

  // A centred "Loading…" collapses the layout and snaps it back open.
  if (loading) return <SkeletonList count={4} />;

  return (
    <div className="space-y-4 pb-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="display text-xl text-white">Bookings</h1>
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            Requests for your classes · approved at the front desk
          </p>
        </div>
        {pendingCount > 0 && (
          <div className="flex-shrink-0 mt-1">
            <Pill label={`${pendingCount} pending`} tone="secondary" />
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-xl p-3" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>
          <p className="text-xs" style={{ color: '#ef4444' }}>{error}</p>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
        {(['all', 'pending', 'approved', 'rejected', 'cancelled'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className="px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap flex-shrink-0 transition-colors capitalize"
            style={{
              background: filter === f ? 'var(--color-primary)' : 'var(--color-surface)',
              color: filter === f ? '#fff' : 'var(--color-text-muted)',
              border: `1px solid ${filter === f ? 'var(--color-primary)' : 'var(--color-border)'}`,
            }}>
            {f === 'all' ? `All (${bookings.length})` : `${f} (${bookings.filter(b => b.status === f).length})`}
          </button>
        ))}
      </div>

      {/* Bookings List */}
      <div className="space-y-2">
        {filtered.map((booking, i) => {
          const config = STATUS_CONFIG[booking.status];
          const memberName = names[booking.member_id] ?? 'Member';
          const scheduledAt = booking.classes?.scheduled_at;
          return (
            <motion.div key={booking.id}
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.04, 0.3) }}
              className="p-4"
              style={{ ...panelStyle, borderRadius: 'var(--radius-panel)' }}>
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar name={memberName} photoUrl={null} size={36} />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{memberName}</p>
                    <p className="text-xs truncate" style={{ color: 'var(--color-text-muted)' }}>
                      {booking.classes?.name ?? 'Class'}
                    </p>
                  </div>
                </div>
                <span className="text-xs px-2 py-0.5 rounded-full font-semibold whitespace-nowrap flex-shrink-0"
                  style={{ background: config.bg, color: config.color }}>
                  {config.label}
                </span>
              </div>

              <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                <span className="flex items-center gap-1.5">
                  <Calendar size={12} style={{ color: 'var(--color-secondary)' }} />
                  {scheduledAt
                    ? new Date(scheduledAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
                    : 'Not scheduled'}
                </span>
                {scheduledAt && (
                  <span className="flex items-center gap-1.5">
                    <Clock size={12} style={{ color: 'var(--color-secondary)' }} />
                    {new Date(scheduledAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                  </span>
                )}
              </div>
            </motion.div>
          );
        })}
        {filtered.length === 0 && !error && (
          <div className="p-8 text-center" style={{ ...panelStyle, borderRadius: 'var(--radius-panel)' }}>
            <CalendarCheck size={36} className="mx-auto mb-3" style={{ color: 'var(--color-border)' }} />
            <p className="text-sm font-semibold text-white">
              {filter === 'all' ? 'No booking requests yet' : `Nothing ${filter}`}
            </p>
            {/* This used to read "Class booking isn't built yet" — it has been
                built and working for some time. A stale apology in the UI is
                read as a broken feature. */}
            <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
              {filter === 'all'
                ? 'When a member requests one of your classes it appears here, and the front desk approves it.'
                : 'Try a different filter to see the rest.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
