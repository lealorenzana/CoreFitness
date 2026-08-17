import { useCallback, useEffect, useState } from 'react';
import { CalendarCheck, Flame, TrendingUp, Trophy } from 'lucide-react';

import { getProgression, type Progression } from '../../lib/api/achievements';
import { Skeleton } from './Skeleton';
import { panelStyle } from './Card';

/**
 * The streak hero and the stat rail beside it.
 *
 * ## The unit is weeks, and it says so
 *
 * `member_progression()` counts **consecutive weeks containing a workout** —
 * `current_week_streak` — and there is no day-level streak anywhere in the
 * schema. The obvious card to copy from a workout-tracker screenshot says
 * "6 DAYS"; printing that over a week count would be a straight lie, and a
 * flattering one, which is the kind that survives review.
 *
 * Weeks is also the honest metric for a gym. A member training three times a
 * week is doing well and would show a *day* streak of 1 forever.
 *
 * Both numbers come from one RPC. The rail deliberately shows nothing that
 * would need a second query — an extra round trip on the home screen of a phone
 * app on mobile data is not worth a fifth tile.
 */

interface Tile {
  key: string;
  icon: typeof Flame;
  value: string;
  label: string;
  hint: string;
  accent: string;
}

const AMBER = 'var(--color-secondary)';
const VIOLET = 'var(--color-primary)';

/** Pluralises without the "1 weeks" that gives a demo away. */
function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

function StatTile({ tile }: { tile: Tile }) {
  const Icon = tile.icon;
  return (
    <div
      className="flex-shrink-0 w-[128px] rounded-2xl p-3 snap-start"
      style={{ ...panelStyle, borderRadius: 'var(--radius-card)' }}
    >
      <span
        className="w-7 h-7 rounded-full flex items-center justify-center mb-2"
        style={{ background: 'var(--color-bg)', color: tile.accent }}
      >
        <Icon size={14} />
      </span>
      <p className="display text-2xl text-white leading-none">{tile.value}</p>
      <p className="text-xs font-semibold mt-1" style={{ color: 'var(--color-text-secondary)' }}>
        {tile.label}
      </p>
      <p className="text-xs mt-0.5 leading-tight" style={{ color: 'var(--color-text-muted)' }}>
        {tile.hint}
      </p>
    </div>
  );
}

/**
 * The split-flap streak card.
 *
 * The seam across the middle is a border on an inner element, not an animation:
 * it has to be right on a phone that is not compositing, where
 * `requestAnimationFrame` never fires and a Framer transition would leave the
 * card mid-flip forever.
 */
function StreakCard({ current, best }: { current: number; best: number }) {
  const dim = current === 0;

  return (
    <div
      className="rounded-2xl p-4"
      style={{ ...panelStyle, borderRadius: 'var(--radius-panel)', boxShadow: 'var(--shadow-panel)' }}
    >
      <div className="flex items-center gap-2 mb-3">
        <Flame size={14} style={{ color: dim ? 'var(--color-text-muted)' : AMBER }} />
        <span className="text-xs font-bold uppercase tracking-[0.16em]"
          style={{ color: 'var(--color-text-secondary)' }}>
          Workout streak
        </span>
      </div>

      <div
        className="relative rounded-2xl flex flex-col items-center justify-center py-5"
        // No entrance animation. The first draft faded this in from `opacity: 0`
        // on a timer, which measured as a permanently invisible card: on a page
        // that is not compositing the transition never advances, so the card
        // would have sat at zero opacity holding the one number this component
        // exists to show. Nothing whose visibility matters may depend on an
        // animation having run.
        style={{
          background: 'var(--color-bg)',
          border: `1px solid ${dim ? 'var(--color-border)' : AMBER}`,
        }}
      >
        {/* The split-flap seam. */}
        <span
          className="absolute left-0 right-0 top-1/2 pointer-events-none"
          style={{ borderTop: '1px solid var(--color-border)' }}
        />
        <span className="display text-6xl leading-none"
          style={{ color: dim ? 'var(--color-text-muted)' : '#FFFFFF' }}>
          {current}
        </span>
        <span className="text-xs font-semibold mt-2"
          style={{ color: 'var(--color-text-secondary)' }}>
          {plural(current, 'Week', 'Weeks')}
        </span>
      </div>

      <p className="text-xs mt-3 leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
        {current === 0
          ? 'Train once this week to start a streak.'
          : `${current} ${plural(current, 'week', 'weeks')} in a row with at least one workout.`}
        {best > current && ` Your best is ${best}.`}
      </p>
    </div>
  );
}

/**
 * Whole days since the join date, or an em dash.
 *
 * Parsed as local midnight rather than `new Date(dateString)`, which reads a
 * bare YYYY-MM-DD as UTC and lands on the previous day for the first eight
 * hours of every Manila morning — the same shift that once hid pre-8am
 * check-ins from the admin Attendance page.
 */
function daysSince(isoDate: string | null): string {
  if (!isoDate) return '—';
  const then = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(then.getTime())) return '—';
  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((midnight.getTime() - then.getTime()) / 86_400_000);
  return days < 0 ? '—' : String(days);
}

export default function ProgressRail() {
  const [prog, setProg] = useState<Progression | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setProg(await getProgression());
    } catch {
      // Same posture as LevelProgressCard: a missing progression hides the
      // section rather than showing zeroes that would read as a real record of
      // never having trained.
      setProg(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Skeleton className="h-52 w-full" />;
  if (!prog) return null;

  // No level tile. `LevelProgressCard` sits directly above this on both screens
  // that use the rail, and two level readouts under one word is the exact
  // confusion that made Home and Book a Session look self-contradictory.
  const tiles: Tile[] = [
    {
      key: 'days',
      icon: CalendarCheck,
      value: String(prog.trainingDays),
      label: 'Training days',
      hint: `${prog.verifiedDays} checked in`,
      accent: AMBER,
    },
    {
      key: 'weeks',
      icon: Trophy,
      value: String(prog.consistentWeeks),
      label: 'Consistent weeks',
      hint: 'Two or more sessions',
      accent: VIOLET,
    },
    {
      key: 'member',
      icon: TrendingUp,
      value: daysSince(prog.memberSince),
      label: 'Days as a member',
      // The join date, or nothing. Never "today" as a stand-in.
      hint: prog.memberSince
        ? `Since ${new Date(`${prog.memberSince}T00:00:00`).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`
        : 'Join date unknown',
      accent: AMBER,
    },
  ];

  return (
    <div className="space-y-3">
      <StreakCard current={prog.currentWeekStreak} best={prog.bestWeekStreak} />

      {/* Its own overflow-x container. The page body must never scroll
          sideways — `<main>` is the scroller and a wide child would drag it. */}
      <div
        className="flex gap-2 overflow-x-auto snap-x snap-mandatory -mx-1 px-1 pb-1"
        style={{ scrollbarWidth: 'none' }}
      >
        {tiles.map((t) => <StatTile key={t.key} tile={t} />)}
      </div>
    </div>
  );
}
