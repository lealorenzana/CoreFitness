import { SkeletonList } from '../../components/ui/Skeleton';
import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import {
  getCurrentTrainerId,
  getTrainerOverview,
  TRAINER_OVERVIEW_CACHE_KEY,
  type TrainerOverview,
} from '../../services/trainerService';
import { readCache, writeCache } from '../../lib/pageCache';
import type { BookingStatus } from '../../types/db';
import { errorMessage } from '../../utils/errorMessage';
import { Page } from '../../components/ui/page';
import { Eyebrow, InlineStat, LineRow, NocButton, Panel, SectionHead, StatusPill } from '../../components/ui/noc';

/**
 * The trainer's home screen (Nocturne, aligned with the member Today screen on
 * the trainer's request, 2026-09-18).
 *
 * The previous version was five stat tiles — and on a real account four of the
 * five read `0`. A wall of zeros is not a dashboard. It is organised by **what
 * needs doing**, not by what can be counted:
 *
 *   1. Anything waiting on the trainer, as the lit panel. It appears only when
 *      the number is non-zero and takes you straight to the queue.
 *   2. Today: the next class with its time, or a real empty state.
 *   3. The week's numbers as bare figures, then recent activity as rows.
 *
 * Who is signed in, the greeting, the bell and the shortcuts (Bookable hours,
 * Achievements) now live in the shell's header and rail, as on the member side.
 *
 * Every figure still comes from `getTrainerOverview`. Nothing here invents a
 * number to fill the space the zeros used to occupy.
 */

/** Status drives the pill — the thing a trainer scans this list for. */
const ACTIVITY: Record<BookingStatus, { verb: string; tone: 'action' | 'structure' | 'muted' }> = {
  approved: { verb: 'Approved', tone: 'structure' },
  pending: { verb: 'New request', tone: 'action' },
  rejected: { verb: 'Declined', tone: 'muted' },
  cancelled: { verb: 'Cancelled', tone: 'muted' },
};

/**
 * The `Record<BookingStatus, …>` above makes a missing key impossible *at
 * compile time*, which is not the same as impossible. The status arrives from
 * Postgres, and a value this build doesn't know about must not take the whole
 * home screen down. A neutral row is a far better failure than a white screen.
 */
function activityMeta(status: BookingStatus) {
  return ACTIVITY[status] ?? { verb: String(status), tone: 'muted' as const };
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
      <Page>
        <div className="text-center" style={{ padding: '48px 24px' }}>
          <p style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--color-text-primary)' }}>Couldn't load your dashboard</p>
          <p style={{ fontSize: 12.5, marginTop: 4, color: 'var(--color-text-muted)' }}>{error}</p>
        </div>
      </Page>
    );
  }

  const { trainer } = overview.trainer;

  // Earliest first, so "next" is genuinely next rather than whatever the query
  // happened to return first.
  const todaySorted = [...overview.todayClasses].sort((a, b) =>
    (a.scheduled_at ?? '').localeCompare(b.scheduled_at ?? '')
  );
  const nextClass = todaySorted[0] ?? null;
  const laterToday = Math.max(0, todaySorted.length - 1);

  const pending = overview.pendingBookings;

  return (
    <Page>
      {/* ── The lead panel ─────────────────────────────────────────────────
          What needs you, when something does (amber — something to do);
          otherwise today's next class (violet — what you have). */}
      <div className="flex flex-col" style={{ gap: 10 }}>
        {pending > 0 && (
          <Panel glow="action" onClick={() => navigate('/trainer/bookings')}>
            <Eyebrow tone="action">Needs you</Eyebrow>
            <p className="flex items-baseline" style={{ gap: 8, marginTop: 6 }}>
              <span style={{
                fontSize: 'var(--text-hero)', fontWeight: 600, lineHeight: 1,
                letterSpacing: 'var(--tracking-hero)', color: 'var(--color-text-primary)',
              }}>
                {pending}
              </span>
              <span style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>
                booking {pending === 1 ? 'request' : 'requests'} waiting on you
              </span>
            </p>
            <span className="inline-block" style={{ marginTop: 10, fontSize: 12.5, color: 'var(--color-secondary)' }}>
              Review requests
            </span>
          </Panel>
        )}

        {nextClass ? (
          <Panel glow={pending > 0 ? undefined : 'structure'} filled={pending > 0}
            onClick={() => navigate('/trainer/schedule')}>
            <Eyebrow>Next today · {timeOf(nextClass.scheduled_at)}</Eyebrow>
            <p className="truncate" style={{ fontSize: 20, fontWeight: 700, marginTop: 6, color: 'var(--color-text-primary)' }}>
              {nextClass.name}
            </p>
            <p style={{ fontSize: 12.5, marginTop: 4, color: 'var(--color-text-muted)' }}>
              {nextClass.location ? `${nextClass.location} · ` : ''}
              {nextClass.capacity} places · {nextClass.duration_minutes} min
            </p>
            {laterToday > 0 && (
              <p style={{ fontSize: 12.5, marginTop: 10, color: 'var(--color-primary-300)' }}>
                + {laterToday} more {laterToday === 1 ? 'class' : 'classes'} later today
              </p>
            )}
          </Panel>
        ) : (
          /* A designed empty state: what would fill the space, and the one
             control that leads there. */
          <Panel glow={pending > 0 ? undefined : 'structure'}>
            <Eyebrow>Today</Eyebrow>
            <p style={{ fontSize: 20, fontWeight: 700, marginTop: 6, color: 'var(--color-text-primary)' }}>No classes today</p>
            <p style={{ fontSize: 12.5, marginTop: 4, lineHeight: 1.5, color: 'var(--color-text-muted)' }}>
              Nothing on your schedule. Members can still book you one-to-one in your bookable hours.
            </p>
            <NocButton variant="action" className="w-full" style={{ marginTop: 14 }}
              onClick={() => navigate('/trainer/availability')}>
              Check my hours
            </NocButton>
          </Panel>
        )}

        {trainer.specialization && (
          <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>
            Coaching <span style={{ color: 'var(--color-primary-300)' }}>{trainer.specialization}</span>
          </p>
        )}
      </div>

      {/* ── This week ──────────────────────────────────────────────────────
          Bare figures, no boxes. The old third figure was a hardcoded "96%
          attendance"; there is no per-trainer attendance source, so it stays gone. */}
      <section>
        <SectionHead title="This week" meta={
          <button onClick={() => navigate('/trainer/schedule')} style={{ color: 'var(--color-secondary)' }}>Schedule</button>
        } />
        <div className="grid grid-cols-3" style={{ gap: 12, marginTop: 14 }}>
          <InlineStat value={overview.sessionsThisWeek} label="Sessions" />
          <InlineStat value={overview.membersTrainedThisWeek} label="Members trained" />
          <InlineStat value={overview.membersAssigned} label="Total members" />
        </div>
      </section>

      <div className="rule" />

      {/* ── Recent activity ────────────────────────────────────────────────
          The status drives the pill; it used to be buried mid-sentence. */}
      <section>
        <SectionHead title="Recent activity" meta={
          overview.recentActivity.length > 0 ? (
            <button onClick={() => navigate('/trainer/bookings')} style={{ color: 'var(--color-secondary)' }}>All</button>
          ) : undefined
        } />
        {overview.recentActivity.length === 0 ? (
          <p style={{ fontSize: 12.5, marginTop: 10, color: 'var(--color-text-muted)' }}>No booking activity yet.</p>
        ) : (
          <div className="noc-rows" style={{ marginTop: 4 }}>
            {overview.recentActivity.map((act, i) => {
              const meta = activityMeta(act.status);
              return (
                <LineRow
                  key={act.id}
                  gutter={new Date(act.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  title={act.className}
                  action={<StatusPill label={meta.verb} tone={meta.tone} />}
                  last={i === overview.recentActivity.length - 1}
                />
              );
            })}
          </div>
        )}
      </section>
    </Page>
  );
}
