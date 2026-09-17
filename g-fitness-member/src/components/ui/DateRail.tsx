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

/**
 * Drawn in the orb language of the member app's week marks and Train matrix
 * (Nocturne): frosted glass for an empty day, lavender glass for a day with
 * something on, the turning gradient ring for today, the violet orb for the
 * chosen day. Dots, not names — at this width a name truncates to nothing.
 */
export default function DateRail({
  days,
  selected,
  onSelect,
}: {
  days: RailDay[];
  selected: string | null;
  onSelect: (key: string | null) => void;
}) {
  return (
    <div className="flex overflow-x-auto scrollbar-hide" style={{ gap: 7, margin: '0 calc(var(--gutter) * -1)', padding: '2px var(--gutter) 4px' }}>
      {days.map(({ key, date, count }, i) => {
        const isToday = i === 0;
        const isSelected = selected === key;
        const has = count > 0;
        const month = date.getDate() === 1 || i === 0;
        const cls = [
          'orb-cell flex-none flex flex-col items-center noc-press',
          isSelected ? 'orb-cell--on' : isToday ? 'orb-cell--ring orb-spin' : has ? 'orb-cell--busy' : '',
        ].join(' ');

        return (
          <button
            key={key}
            onClick={() => onSelect(isSelected ? null : key)}
            aria-pressed={isSelected}
            aria-label={date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            className={cls}
            style={{ width: 46, padding: '8px 0 7px', gap: 4, borderRadius: 12 }}
          >
            <span style={{
              fontSize: 12, lineHeight: 1, fontWeight: 600,
              color: isSelected ? '#fff' : isToday ? 'var(--color-secondary)' : 'var(--color-text-muted)',
            }}>
              {DAY_LETTERS[date.getDay()]}
            </span>
            <span style={{
              fontSize: 15, lineHeight: 1, fontWeight: 700,
              color: isSelected ? '#fff' : has || isToday ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
            }}>
              {date.getDate()}
            </span>
            {/* The month only where it changes, so a strip crossing into a new
                month doesn't silently restart at 1. */}
            {month ? (
              <span style={{ fontSize: 12, lineHeight: 1, color: isSelected ? 'rgba(255,255,255,0.8)' : 'var(--color-text-muted)' }}>
                {date.toLocaleDateString('en-US', { month: 'short' })}
              </span>
            ) : (
              <span className="flex items-center" style={{ height: 12, gap: 3 }}>
                {count === 0 ? null : count <= 3 ? (
                  Array.from({ length: count }, (_, n) => (
                    <span key={n} className="orb-dot" style={{ width: 5, height: 5 }} />
                  ))
                ) : (
                  <span style={{ fontSize: 12, lineHeight: 1, fontWeight: 700, color: isSelected ? '#fff' : 'var(--color-primary-300)' }}>
                    {count}
                  </span>
                )}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
