import { motion } from 'framer-motion';

/**
 * A horizontal strip of dates with a load indicator on each — the app's
 * "calendar", and deliberately not a month grid.
 *
 * A month grid on a 375px phone gives roughly 45px cells: too small for a class
 * name, so every day needs a tap to find out what is on it, and with one or two
 * sessions a day most of the grid is empty. The agenda underneath already
 * answers "what's next"; what it cannot show is the *shape* of the fortnight —
 * whether Thursday is free, whether next week is busy. That is what this adds,
 * and tapping filters the agenda rather than opening a separate day view, so
 * the detail never leaves the screen you are on.
 *
 * Counts come from real rows. A day with nothing scheduled is dimmed and says
 * nothing, rather than showing a zero.
 */

const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export interface RailDay {
  /** Local calendar key — must match whatever the caller groups by. */
  key: string;
  date: Date;
  count: number;
}

/**
 * `days` consecutive dates starting today.
 *
 * `keyOf` is the caller's own key function rather than one defined here: the
 * rail's keys have to match whatever the page groups its rows by, and the two
 * screens using this format theirs differently. Passing it in makes a mismatch
 * impossible instead of merely unlikely.
 *
 * Always build keys from a `Date`, never from `toISOString()` — that shifts a
 * Manila evening into tomorrow.
 */
export function buildRail(
  days: number,
  keyOf: (d: Date) => string,
  countFor: (key: string) => number
): RailDay[] {
  const today = new Date();
  return Array.from({ length: days }, (_, i) => {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
    const key = keyOf(date);
    return { key, date, count: countFor(key) };
  });
}

export default function DateRail({
  days,
  selected,
  onSelect,
  /** Colour of the load dots. Amber reads as "available", violet as "booked". */
  tone = 'secondary',
}: {
  days: RailDay[];
  selected: string | null;
  onSelect: (key: string | null) => void;
  tone?: 'secondary' | 'primary';
}) {
  const dot = tone === 'secondary' ? 'var(--color-secondary)' : 'var(--color-primary)';

  return (
    <div className="-mx-1">
      <div className="flex gap-1.5 overflow-x-auto px-1 pb-1 scrollbar-hide">
        {days.map(({ key, date, count }, i) => {
          const isToday = i === 0;
          const isSelected = selected === key;
          const has = count > 0;
          const month = date.getDate() === 1 || i === 0;

          return (
            <motion.button
              key={key}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.02, 0.2) }}
              onClick={() => onSelect(isSelected ? null : key)}
              aria-pressed={isSelected}
              aria-label={date.toLocaleDateString('en-US', {
                weekday: 'long', month: 'long', day: 'numeric',
              })}
              className="flex-shrink-0 w-12 py-2 rounded-2xl flex flex-col items-center gap-1 active:scale-95 transition-transform"
              style={{
                background: isSelected
                  ? 'var(--color-primary)'
                  : has
                    ? 'var(--color-surface-high)'
                    : 'var(--color-bg)',
                border: `1px solid ${
                  isSelected
                    ? 'var(--color-primary)'
                    : isToday
                      ? 'var(--color-secondary)'
                      : 'var(--color-border)'
                }`,
                opacity: has || isToday || isSelected ? 1 : 0.5,
              }}
            >
              <span
                className="text-xs font-semibold leading-none"
                style={{
                  color: isSelected ? '#fff' : isToday ? 'var(--color-secondary)' : 'var(--color-text-muted)',
                }}
              >
                {DAY_LETTERS[date.getDay()]}
              </span>
              <span
                className="text-sm font-bold leading-none"
                style={{ color: isSelected || has ? '#fff' : 'var(--color-text-muted)' }}
              >
                {date.getDate()}
              </span>
              {/* The month only where it changes, so a strip crossing into
                  September doesn't silently restart at 1. */}
              {month ? (
                <span
                  className="text-xs leading-none"
                  style={{ color: isSelected ? 'rgba(255,255,255,0.75)' : 'var(--color-text-muted)' }}
                >
                  {date.toLocaleDateString('en-US', { month: 'short' })}
                </span>
              ) : (
                <span className="h-1.5 flex items-center gap-0.5">
                  {count === 0 ? null : count <= 3 ? (
                    Array.from({ length: count }, (_, n) => (
                      <span
                        key={n}
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ background: isSelected ? '#fff' : dot }}
                      />
                    ))
                  ) : (
                    <span
                      className="text-xs font-bold leading-none"
                      style={{ color: isSelected ? '#fff' : dot }}
                    >
                      {count}
                    </span>
                  )}
                </span>
              )}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
