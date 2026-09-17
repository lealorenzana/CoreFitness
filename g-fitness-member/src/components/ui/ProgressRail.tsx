import { useCallback, useEffect, useState } from 'react';

import { getProgression, type Progression } from '../../lib/api/achievements';
import { Skeleton } from './Skeleton';
import { InlineStat, Panel } from './noc';

/**
 * The week streak, and the three counts that stand behind it.
 *
 * ## The unit is weeks, and it says so
 *
 * `member_progression()` counts **consecutive weeks containing a workout** —
 * `current_week_streak` — and there is no day-level streak anywhere in the
 * schema. The obvious card to copy from a workout-tracker screenshot says
 * "6 DAYS"; printing that over a week count would be a straight lie, and a
 * flattering one, which is the kind that survives review. Weeks is also the
 * honest metric for a gym: a member training three times a week is doing well
 * and would show a *day* streak of 1 forever.
 *
 * Everything comes from one RPC. Nothing here depends on an animation having
 * run — an earlier version faded the numeral in from `opacity: 0` and measured
 * as permanently invisible on a page that was not compositing.
 */

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

/**
 * Whole days since the join date, or an em dash. Parsed as local midnight —
 * `new Date('YYYY-MM-DD')` reads as UTC and lands on the previous day for the
 * first eight hours of a Manila morning.
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
      // A missing progression hides the section rather than showing zeroes
      // that would read as a real record of never having trained.
      setProg(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // IIFE: the set-state-in-effect rule follows a directly called function into
  // its setState. The call is identical; only its shape changes.
  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  if (loading) return <Skeleton className="h-40 w-full" />;
  if (!prog) return null;

  const current = prog.currentWeekStreak;
  const live = current > 0;

  return (
    <div className="flex flex-col" style={{ gap: 16 }}>
      <Panel glow={live ? 'structure' : undefined}>
        <p className="eyebrow">Workout streak</p>
        <p className="flex items-baseline" style={{ gap: 8, marginTop: 8 }}>
          <span style={{
            fontSize: 'var(--text-hero)', fontWeight: 600, lineHeight: 1, letterSpacing: 'var(--tracking-hero)',
            color: live ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
          }}>
            {current}
          </span>
          <span style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>
            {plural(current, 'week', 'weeks')} in a row
          </span>
        </p>
        <p style={{ fontSize: 12.5, marginTop: 8, lineHeight: 1.5, color: 'var(--color-text-muted)' }}>
          {current === 0
            ? 'Train once this week to start a streak.'
            : 'At least one workout in each of those weeks.'}
          {prog.bestWeekStreak > current && ` Your best is ${prog.bestWeekStreak}.`}
        </p>
      </Panel>

      <div className="flex flex-wrap" style={{ gap: 24 }}>
        <InlineStat value={prog.trainingDays} label={`training days · ${prog.verifiedDays} checked in`} />
        <InlineStat value={prog.consistentWeeks} label="weeks with two or more" />
        <InlineStat value={daysSince(prog.memberSince)} label="days as a member" />
      </div>
    </div>
  );
}
