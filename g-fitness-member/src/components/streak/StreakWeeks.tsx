import { useState } from 'react';
import { Flame, Snowflake } from '@phosphor-icons/react';
import type { StreakWeek } from '../../lib/api/streak';

const weekLabel = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });

/**
 * The last twelve weeks as tokens to tap (0152/0153) — a member's own, or their
 * squad's. Which week counted is SQL's call; this only draws it. Tokens scale in
 * but are never hidden waiting for an animation (CLAUDE.md, motion).
 */
export default function StreakWeeks({ weeks, words, unit = 'training' }: {
  weeks: StreakWeek[];
  /** What each state means, in this context ("Target reached", "Frozen — …"). */
  words: Record<StreakWeek['state'], string>;
  /** "training" for a member, "squad" for a squad's summed days. */
  unit?: 'training' | 'squad';
}) {
  const [picked, setPicked] = useState<number | null>(null);
  if (weeks.length === 0) return null;
  const pw = picked !== null ? weeks[picked] : null;
  const days = (n: number) => `${n} ${unit === 'squad' ? 'training days between you' : `training ${n === 1 ? 'day' : 'days'}`}`;
  return (
    <>
      <div className="streak-weeks" role="list">
        {weeks.map((w, i) => (
          <button key={w.week} role="listitem" onClick={() => setPicked(picked === i ? null : i)}
            className={`streak-week streak-week--${w.state}${picked === i ? ' is-picked' : ''}`}
            aria-label={`Week of ${weekLabel(w.week)}: ${words[w.state]}, ${days(w.days)}`}
            style={{ ['--i' as string]: i }}>
            {w.state === 'hit' ? <Flame size={15} weight="fill" />
              : w.state === 'frozen' ? <Snowflake size={14} weight="bold" />
              : w.state === 'current' ? <span className="streak-week__dot" />
              : null}
          </button>
        ))}
      </div>
      <p style={{ minHeight: 18, marginTop: 8, fontSize: 12.5, color: 'var(--color-text-secondary)' }}>
        {pw ? `Week of ${weekLabel(pw.week)} · ${days(pw.days)} · ${words[pw.state]}` : 'Tap a week to see it.'}
      </p>
    </>
  );
}
