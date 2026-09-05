import { SkeletonList } from '../../components/ui/Skeleton';
import Avatar from '../../components/ui/Avatar';
import SectionHeader from '../../components/ui/SectionHeader';
import { panelStyle } from '../../components/ui/Card';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import {
  Users, Calendar, Clock, ChevronRight, CalendarOff, ArrowRight,
  CheckCircle2, XCircle, CircleDashed, Trophy, CalendarClock, type LucideIcon,
} from 'lucide-react';
import {
  getCurrentTrainerId,
  getTrainerOverview,
  TRAINER_OVERVIEW_CACHE_KEY,
  type TrainerOverview,
} from '../../services/trainerService';
import { readCache, writeCache } from '../../lib/pageCache';
import type { BookingStatus } from '../../types/db';
import { errorMessage } from '../../utils/errorMessage';

/**
 * The trainer's home screen.
 *
 * The previous version was five stat tiles — Members / Classes today /
 * Awaiting approval, then Sessions taught / Members trained — and on a real
 * account four of the five read `0`. A wall of zeros is not a dashboard; it is
 * a screen that has nothing to say taking up the space of one that does.
 *
 * The rebuild is organised by **what needs doing**, not by what can be counted:
 *
 *   1. Anything waiting on the trainer, as a button. `pendingBookings` was a
 *      dead tile showing `0`; it is now an amber card that appears only when
 *      the number is non-zero and takes you straight to the queue.
 *   2. Today, as the hero. Either the next class with its time, or a real empty
 *      state — not a flat grey bar reading "No classes scheduled today."
 *   3. The week's numbers, condensed into one banded card instead of two more
 *      panels.
 *
 * Every figure still comes from `getTrainerOverview`. Nothing here invents a
 * number to fill the space the zeros used to occupy.
 */

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning, Coach';
  if (h < 18) return 'Good afternoon, Coach';
  return 'Good evening, Coach';
}

/** Status drives icon and colour — the thing a trainer scans this list for. */
const ACTIVITY: Record<BookingStatus, { icon: LucideIcon; color: string; tint: string; verb: string }> = {
  approved:  { icon: CheckCircle2,  color: 'var(--color-primary)', tint: 'var(--color-primary-light)',  verb: 'Approved' },
  pending:   { icon: CircleDashed,  color: 'var(--color-secondary)', tint: 'var(--color-secondary-light)', verb: 'New request' },
  rejected:  { icon: XCircle,       color: 'var(--color-secondary)', tint: 'var(--color-secondary-light)',  verb: 'Declined' },
  cancelled: { icon: XCircle,       color: 'var(--color-text-muted)', tint: 'var(--color-surface-high)',    verb: 'Cancelled' },
};

/**
 * The `Record<BookingStatus, …>` above makes a missing key impossible *at
 * compile time*, which is not the same as impossible. The status arrives from
 * Postgres, and a value this build doesn't know about — a future enum member,
 * a bad row — would make `meta.icon` throw and take the whole home screen down
 * with it. A neutral row is a far better failure than a white screen.
 */
function activityMeta(status: BookingStatus) {
  return ACTIVITY[status] ?? {
    icon: CircleDashed,
    color: 'var(--color-text-muted)',
    tint: 'var(--color-surface-high)',
    verb: String(status),
  };
}

function timeOf(iso: string | null): string {
  if (!iso) return 'Time not set';
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export default function TrainerHome() {
  const navigate = useNavigate();
  // Shared with Trainer Profile — same query, two views. See lib/pageCache.ts.
  const cached = readCache<TrainerOverview>(TRAINER_OVERVIEW_CACHE_KEY);
  const [overview, setOverview] = useState<TrainerOverview | null>(cached ?? null);
  const [loading, setLoading] = useState(cached === undefined);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const id = await getCurrentTrainerId();
        if (!id) throw new Error('Not signed in');
        const data = await getTrainerOverview(id);
        if (cancelled) return;
        if (!data) throw new Error('No trainer profile found for this account');
        setOverview(writeCache(TRAINER_OVERVIEW_CACHE_KEY, data));
      } catch (err) {
        console.error('Trainer dashboard load failed:', err);
        // A failed *refresh* over good cached content stays quiet — the screen
        // is not empty, and an error banner replacing a working dashboard on a
        // dropped packet is worse than a few seconds of staleness.
        if (!cancelled && !cached) setError(errorMessage(err, 'Failed to load'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // `cached` is the mount-time snapshot; re-running on it would refetch on
    // every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <SkeletonList count={4} />;

  if (error || !overview) {
    return (
      <div className="py-16 text-center px-6">
        <p className="text-xs text-white mb-1">Couldn't load your dashboard</p>
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{error}</p>
      </div>
    );
  }

  const { profile, trainer } = overview.trainer;
  const fullName = `${profile.first_name} ${profile.last_name}`;

  // Earliest first, so "next" is genuinely next rather than whatever the query
  // happened to return first.
  const todaySorted = [...overview.todayClasses].sort((a, b) =>
    (a.scheduled_at ?? '').localeCompare(b.scheduled_at ?? '')
  );
  const nextClass = todaySorted[0] ?? null;
  const laterToday = Math.max(0, todaySorted.length - 1);

  const weekStats = [
    { label: 'Sessions', value: overview.sessionsThisWeek, icon: Calendar },
    { label: 'Members trained', value: overview.membersTrainedThisWeek, icon: Users },
    { label: 'Total members', value: overview.membersAssigned, icon: Users },
  ];

  return (
    <div className="space-y-5 pb-4">
      {/* ── Hero ───────────────────────────────────────────────────────────
          Bigger than before, and the specialisation is a pill rather than a
          line of loose violet text — as bare text a one-word specialisation
          read like a rendering error sitting under the name. */}
      <motion.div
        initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-3.5"
      >
        <div className="relative flex-shrink-0">
          <Avatar name={fullName} photoUrl={profile.photo_url} size={56} />
          <span
            className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full"
            style={{ background: 'var(--color-primary)', border: '2px solid var(--color-bg)' }}
            aria-hidden
          />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{greeting()}</p>
          <h1 className="display text-2xl text-white truncate leading-tight">{profile.first_name}</h1>
          {trainer.specialization && (
            <span
              className="inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-semibold truncate max-w-full"
              style={{
                background: 'var(--color-primary-light)',
                color: 'var(--color-primary)',
                border: '1px solid rgba(124,58,237,0.30)',
              }}
            >
              {trainer.specialization}
            </span>
          )}
        </div>
      </motion.div>

      {/* ── Needs you ──────────────────────────────────────────────────────
          Renders only when there is something to act on. The old tile showed
          "Awaiting approval — 0", which is a number nobody can do anything
          with; when it mattered it looked identical to when it didn't. */}
      {overview.pendingBookings > 0 && (
        <motion.button
          initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
          onClick={() => navigate('/trainer/bookings')}
          className="w-full p-4 flex items-center gap-3 text-left active:scale-[0.99] transition-transform"
          style={{
            background: 'var(--color-secondary-light)',
            border: '1px solid rgba(245,158,11,0.35)',
            borderRadius: 'var(--radius-panel)',
            boxShadow: '0 0 24px -8px rgba(245,158,11,0.35)',
          }}
        >
          <span
            className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'var(--color-secondary)', color: '#000' }}
          >
            <Clock size={20} />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-bold text-white">
              {overview.pendingBookings} booking {overview.pendingBookings === 1 ? 'request' : 'requests'}
            </span>
            <span className="block text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
              Waiting on your approval
            </span>
          </span>
          <ArrowRight size={18} className="flex-shrink-0" style={{ color: 'var(--color-secondary)' }} />
        </motion.button>
      )}

      {/* ── Today ──────────────────────────────────────────────────────────*/}
      <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
        <SectionHeader
          title="Today"
          action={
            <button onClick={() => navigate('/trainer/schedule')}
              className="text-xs font-semibold flex items-center gap-0.5"
              style={{ color: 'var(--color-secondary)' }}>
              Schedule <ChevronRight size={12} />
            </button>
          }
        />

        {nextClass ? (
          <button
            onClick={() => navigate('/trainer/schedule')}
            className="w-full p-4 text-left active:scale-[0.99] transition-transform"
            style={{
              ...panelStyle,
              borderRadius: 'var(--radius-panel)',
              boxShadow: 'var(--shadow-panel)',
              borderLeft: '4px solid var(--color-primary)',
            }}
          >
            <div className="flex items-start gap-3">
              <span
                className="w-12 h-12 rounded-2xl flex flex-col items-center justify-center flex-shrink-0"
                style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary)' }}
              >
                <CalendarClock size={20} />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold" style={{ color: 'var(--color-secondary)' }}>
                  {timeOf(nextClass.scheduled_at)}
                </p>
                <p className="text-base font-bold text-white truncate mt-0.5">{nextClass.name}</p>
                <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                  {nextClass.location ? `${nextClass.location} · ` : ''}
                  {nextClass.capacity} places · {nextClass.duration_minutes} min
                </p>
              </div>
              <ChevronRight size={18} className="flex-shrink-0 mt-1" style={{ color: 'var(--color-text-muted)' }} />
            </div>

            {laterToday > 0 && (
              <p
                className="text-xs mt-3 pt-3 font-semibold"
                style={{ borderTop: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}
              >
                + {laterToday} more {laterToday === 1 ? 'class' : 'classes'} later today
              </p>
            )}
          </button>
        ) : (
          /* A designed empty state, not a grey bar. It says what would fill the
             space and gives the one control that leads there. */
          <div
            className="p-6 flex flex-col items-center text-center"
            style={{ ...panelStyle, borderRadius: 'var(--radius-panel)' }}
          >
            <span
              className="w-12 h-12 rounded-2xl flex items-center justify-center mb-3"
              style={{ background: 'var(--color-surface-high)', color: 'var(--color-text-muted)' }}
            >
              <CalendarOff size={20} />
            </span>
            <p className="text-sm font-bold text-white">No classes today</p>
            <p className="text-xs mt-1 leading-relaxed max-w-[16rem]" style={{ color: 'var(--color-text-muted)' }}>
              Nothing on your schedule. Members can still book you one-to-one in your bookable hours.
            </p>
            <button
              onClick={() => navigate('/trainer/availability')}
              className="mt-4 h-10 px-5 rounded-full text-xs font-bold text-black"
              style={{ background: 'var(--color-secondary)' }}
            >
              Check my hours
            </button>
          </div>
        )}
      </motion.section>

      {/* ── This week ──────────────────────────────────────────────────────
          One banded card rather than three separate panels. Three empty boxes
          in a row read as three things that are broken; one card with three
          columns reads as a summary that happens to be quiet.

          The old third figure here was a hardcoded "96% attendance". There is
          no per-trainer attendance source, so it stays gone. */}
      <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <SectionHeader title="This week" />
        <div
          className="flex items-stretch"
          style={{ ...panelStyle, borderRadius: 'var(--radius-panel)', boxShadow: 'var(--shadow-panel)' }}
        >
          {weekStats.map((s, i) => (
            <div
              key={s.label}
              className="flex-1 min-w-0 p-4 flex flex-col items-center text-center"
              style={i > 0 ? { borderLeft: '1px solid var(--color-border)' } : undefined}
            >
              <s.icon size={15} style={{ color: 'var(--color-secondary)' }} className="mb-1.5" />
              <span className="display text-2xl text-white leading-none">{s.value}</span>
              <span className="text-xs mt-1.5 leading-tight" style={{ color: 'var(--color-text-muted)' }}>
                {s.label}
              </span>
            </div>
          ))}
        </div>
      </motion.section>

      {/* ── Shortcuts ──────────────────────────────────────────────────────
          Only the two destinations the bottom bar does *not* carry. Repeating
          Members/Schedule/Bookings here would be four taps to the same place. */}
      <motion.section
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
        className="grid grid-cols-2 gap-2"
      >
        {[
          { title: 'Bookable hours', subtitle: 'When members can book you', icon: Clock, to: '/trainer/availability' },
          { title: 'Achievements', subtitle: 'Milestones from your coaching', icon: Trophy, to: '/trainer/achievements' },
        ].map((a) => (
          <button
            key={a.to}
            onClick={() => navigate(a.to)}
            className="p-3.5 text-left flex flex-col gap-2 active:scale-[0.98] transition-transform"
            style={{ ...panelStyle, borderRadius: 'var(--radius-card)' }}
          >
            <span className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: 'var(--color-primary-light)' }}>
              <a.icon size={17} style={{ color: 'var(--color-primary)' }} />
            </span>
            <span className="block text-sm font-semibold text-white leading-tight">{a.title}</span>
            <span className="block text-xs leading-snug" style={{ color: 'var(--color-text-muted)' }}>
              {a.subtitle}
            </span>
          </button>
        ))}
      </motion.section>

      {/* ── Recent activity ────────────────────────────────────────────────
          Every row used to be the same amber clock whether the booking was
          approved, cancelled or waiting — the status was buried mid-sentence
          in a pre-baked string. It now drives the icon and the colour. */}
      <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        <SectionHeader
          title="Recent activity"
          action={
            overview.recentActivity.length > 0 ? (
              <button onClick={() => navigate('/trainer/bookings')}
                className="text-xs font-semibold flex items-center gap-0.5"
                style={{ color: 'var(--color-secondary)' }}>
                All <ChevronRight size={12} />
              </button>
            ) : undefined
          }
        />
        {overview.recentActivity.length === 0 ? (
          <div className="p-5 text-center" style={{ ...panelStyle, borderRadius: 'var(--radius-panel)' }}>
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              No booking activity yet.
            </p>
          </div>
        ) : (
          <div
            className="overflow-hidden"
            style={{ ...panelStyle, borderRadius: 'var(--radius-panel)' }}
          >
            {overview.recentActivity.map((act, i) => {
              const meta = activityMeta(act.status);
              const Icon = meta.icon;
              return (
                <div
                  key={act.id}
                  className="px-4 py-3 flex items-center gap-3"
                  style={i > 0 ? { borderTop: '1px solid var(--color-border)' } : undefined}
                >
                  <span
                    className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: meta.tint, color: meta.color }}
                  >
                    <Icon size={17} />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold text-white truncate">
                      {act.className}
                    </span>
                    <span className="block text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                      {new Date(act.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  </span>
                  <span
                    className="px-2 py-0.5 rounded-full text-xs font-bold flex-shrink-0"
                    style={{ background: meta.tint, color: meta.color }}
                  >
                    {meta.verb}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </motion.section>
    </div>
  );
}
