import { useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * A month of check-ins at a glance.
 *
 * The desk could only ask "was there attendance on this exact day?", one day at
 * a time, by picking a date and looking at what came back. Answering "which
 * days did anyone come in?" meant stepping through the month. A month grid
 * answers it in one look, and answers the follow-up — *how many* — without a
 * second query.
 *
 * ## Presentation only, on purpose
 *
 * It takes a `counts` map that the page has already built, rather than deriving
 * dates itself. The two attendance screens key their days differently and both
 * are right for their own case: the desk screen uses `utils/dates.ts` (the
 * front-desk machine's calendar *is* Manila), while the history screen shifts
 * by +8h so a range still reads correctly from a browser somewhere else. A
 * component that re-derived the key would silently disagree with the table
 * underneath it for one of them, and the disagreement would be a day wide.
 *
 * ## Colour
 *
 * Violet carries the density (structure), amber marks the day you picked
 * (action) — the app's rule, and the reason the selected day stays legible at
 * every heat level instead of disappearing into the ramp.
 */

export interface AttendanceCalendarProps {
  /** Month to render, `YYYY-MM`. */
  month: string;
  /** `YYYY-MM-DD` → number of check-ins. Days absent from the map are empty. */
  counts: Record<string, number>;
  /** Currently picked day, or null. */
  selected?: string | null;
  onSelect?: (day: string) => void;
  onMonthChange?: (month: string) => void;
  /** Today, `YYYY-MM-DD`, so the grid can ring it and refuse the future. */
  today: string;
  /** Hide the arrows when the parent drives the month itself. */
  navigable?: boolean;
  /** Tighter cells, for the narrow log column. */
  compact?: boolean;
}

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/** Violet ramp. Index 0 is "nobody came", which must not read as a low count. */
const HEAT = [
  'var(--color-surface-raised)',
  'rgba(124, 58, 237, 0.28)',
  'rgba(124, 58, 237, 0.50)',
  'rgba(124, 58, 237, 0.74)',
  'var(--color-primary)',
];

function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + by, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });
}

export default function AttendanceCalendar({
  month, counts, selected, onSelect, onMonthChange, today,
  navigable = true, compact = false,
}: AttendanceCalendarProps) {
  const grid = useMemo(() => {
    const [y, m] = month.split('-').map(Number);
    const first = new Date(y, m - 1, 1);
    const daysInMonth = new Date(y, m, 0).getDate();
    const lead = first.getDay(); // 0 = Sunday, matching the header row

    const cells: ({ key: string; day: number } | null)[] = [];
    for (let i = 0; i < lead; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({
        key: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
        day: d,
      });
    }
    // Pad to whole weeks so the grid does not change height month to month —
    // a calendar that reflows by a row as you page through it is hard to aim at.
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [month]);

  const { peak, monthTotal, activeDays } = useMemo(() => {
    let peak = 0, monthTotal = 0, activeDays = 0;
    for (const c of grid) {
      if (!c) continue;
      const n = counts[c.key] ?? 0;
      if (n > 0) { activeDays += 1; monthTotal += n; }
      if (n > peak) peak = n;
    }
    return { peak, monthTotal, activeDays };
  }, [grid, counts]);

  /** 0 for an empty day, then four bands of the month's own busiest day. */
  const level = (n: number) => {
    if (n <= 0) return 0;
    if (peak <= 1) return 4;
    const share = n / peak;
    if (share <= 0.25) return 1;
    if (share <= 0.5) return 2;
    if (share <= 0.75) return 3;
    return 4;
  };

  const cell = compact ? 'h-7 text-[11px]' : 'h-10 text-xs';

  return (
    <div>
      {/* ── Month header ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-2">
        {navigable ? (
          <button
            onClick={() => onMonthChange?.(shiftMonth(month, -1))}
            aria-label="Previous month"
            className="w-6 h-6 rounded-md flex items-center justify-center"
            style={{ background: 'var(--color-surface-high)', color: 'var(--color-text-secondary)' }}
          >
            <ChevronLeft size={13} />
          </button>
        ) : <span />}

        <div className="text-center leading-tight">
          <p className="text-xs font-bold text-white">{monthLabel(month)}</p>
          <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
            {monthTotal === 0
              ? 'No check-ins'
              : `${monthTotal} check-in${monthTotal === 1 ? '' : 's'} over ${activeDays} day${activeDays === 1 ? '' : 's'}`}
          </p>
        </div>

        {navigable ? (
          <button
            onClick={() => onMonthChange?.(shiftMonth(month, 1))}
            aria-label="Next month"
            className="w-6 h-6 rounded-md flex items-center justify-center"
            style={{ background: 'var(--color-surface-high)', color: 'var(--color-text-secondary)' }}
          >
            <ChevronRight size={13} />
          </button>
        ) : <span />}
      </div>

      {/* ── Weekday header ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {WEEKDAYS.map((d, i) => (
          <div key={i} className="text-center text-[10px] font-semibold"
            style={{ color: 'var(--color-text-muted)' }}>
            {d}
          </div>
        ))}
      </div>

      {/* ── The month ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-7 gap-1">
        {grid.map((c, i) => {
          if (!c) return <div key={`pad-${i}`} className={cell} />;

          const n = counts[c.key] ?? 0;
          const lv = level(n);
          const isFuture = c.key > today;
          const isToday = c.key === today;
          const isSelected = c.key === selected;

          // A day nobody came to is still worth clicking — "show me that day"
          // is a fair question, and the empty log answers it. A day that has
          // not happened is not.
          return (
            <button
              key={c.key}
              disabled={isFuture}
              onClick={() => !isFuture && onSelect?.(c.key)}
              title={isFuture ? undefined
                : `${new Date(c.key + 'T00:00:00').toLocaleDateString('en-PH', { weekday: 'long', day: 'numeric', month: 'long' })} — ${n} check-in${n === 1 ? '' : 's'}`}
              aria-label={`${c.day} ${monthLabel(month)}, ${n} check-in${n === 1 ? '' : 's'}`}
              aria-pressed={isSelected}
              className={`${cell} rounded-md flex flex-col items-center justify-center leading-none transition-colors ${isFuture ? 'cursor-default' : 'cursor-pointer'}`}
              style={{
                background: isFuture ? 'transparent' : HEAT[lv],
                border: `1px solid ${
                  isSelected ? 'var(--color-secondary)'
                  : isToday ? 'var(--color-text-secondary)'
                  : lv === 0 ? 'var(--color-border)' : 'transparent'
                }`,
                // The second ring is what keeps a selected day visible on top of
                // the darkest heat, where a 1px border is swallowed.
                boxShadow: isSelected ? '0 0 0 1px var(--color-secondary)' : undefined,
                color: isFuture ? 'var(--color-border)'
                  : lv >= 2 ? '#fff'
                  : 'var(--color-text-secondary)',
                opacity: isFuture ? 0.45 : 1,
              }}
            >
              <span className={`font-semibold tabular-nums ${isToday ? 'underline underline-offset-2' : ''}`}>
                {c.day}
              </span>
              {!compact && n > 0 && (
                <span className="text-[9px] tabular-nums" style={{ opacity: 0.85 }}>{n}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Legend ───────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mt-2">
        <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
          {peak > 0 ? `Busiest day: ${peak}` : 'Nothing recorded'}
        </span>
        <div className="flex items-center gap-1">
          <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>Less</span>
          {HEAT.map((bg, i) => (
            <span key={i} className="w-3 h-3 rounded-sm" aria-hidden
              style={{ background: bg, border: i === 0 ? '1px solid var(--color-border)' : 'none' }} />
          ))}
          <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>More</span>
        </div>
      </div>
    </div>
  );
}
