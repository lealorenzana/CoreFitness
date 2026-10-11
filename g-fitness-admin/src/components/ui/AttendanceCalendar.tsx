import { useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * A month of check-ins at a glance (redesigned 2026-10-11 from the owner's
 * mock-up): the month with arrows and Today, weekday names, a cell per day with
 * a dot per check-in (up to three, then the number), the neighbouring months'
 * days dimmed around it, the picked day filled, today outlined, and a
 * Less → More legend under it.
 *
 * Presentation only, on purpose: it takes a `counts` map the page built,
 * because the two attendance screens key their days differently and both are
 * right for their own case (see the History page's Manila-date note).
 *
 * Violet carries the density; the picked day is filled violet and today is
 * outlined — the day you are looking at must stay legible at every level.
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
  /** Tighter cells. */
  compact?: boolean;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DOTS = ['rgba(139,92,246,0.35)', 'rgba(139,92,246,0.55)', 'rgba(139,92,246,0.75)', '#8B5CF6', '#A78BFA'];

function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + by, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });
}

const keyOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export default function AttendanceCalendar({
  month, counts, selected, onSelect, onMonthChange, today,
  navigable = true, compact = false,
}: AttendanceCalendarProps) {
  const grid = useMemo(() => {
    const [y, m] = month.split('-').map(Number);
    const first = new Date(y, m - 1, 1);
    const daysInMonth = new Date(y, m, 0).getDate();
    const lead = first.getDay();
    const cells: { key: string; day: number; inMonth: boolean }[] = [];
    for (let i = lead; i > 0; i--) { const d = new Date(y, m - 1, 1 - i); cells.push({ key: keyOf(d), day: d.getDate(), inMonth: false }); }
    for (let d = 1; d <= daysInMonth; d++) cells.push({ key: keyOf(new Date(y, m - 1, d)), day: d, inMonth: true });
    // Whole weeks, filled from the next month, so the grid keeps its shape.
    let n = 1;
    while (cells.length % 7 !== 0) { const d = new Date(y, m, n++); cells.push({ key: keyOf(d), day: d.getDate(), inMonth: false }); }
    return cells;
  }, [month]);

  const { peak, monthTotal, activeDays } = useMemo(() => {
    let peak = 0, monthTotal = 0, activeDays = 0;
    for (const c of grid) {
      if (!c.inMonth) continue;
      const n = counts[c.key] ?? 0;
      if (n > 0) { activeDays += 1; monthTotal += n; }
      if (n > peak) peak = n;
    }
    return { peak, monthTotal, activeDays };
  }, [grid, counts]);

  const level = (n: number) => {
    if (n <= 0) return -1;
    if (peak <= 1) return 4;
    return Math.min(4, Math.max(0, Math.ceil((n / peak) * 5) - 1));
  };
  const h = compact ? 40 : 56;
  const btn = 'w-11 h-11 rounded-xl grid place-items-center transition-colors hover:bg-white/5';
  const btnSt = { border: '1px solid rgba(255,255,255,0.1)', color: 'var(--color-text-primary)' };

  return (
    <div data-attendance-calendar>
      <div className="flex items-center gap-3 mb-4">
        {navigable && (
          <>
            <button type="button" onClick={() => onMonthChange?.(shiftMonth(month, -1))} aria-label="Previous month" className={btn} style={btnSt}><ChevronLeft size={18} /></button>
            <button type="button" onClick={() => onMonthChange?.(shiftMonth(month, 1))} aria-label="Next month" className={btn} style={btnSt}><ChevronRight size={18} /></button>
          </>
        )}
        <div className="min-w-0">
          <p className="text-[21px] font-semibold text-white leading-tight">{monthLabel(month)}</p>
          <p className="text-[13px]" style={{ color: 'var(--color-text-secondary)' }}>
            {monthTotal === 0 ? 'No check-ins' : `${monthTotal} check-in${monthTotal === 1 ? '' : 's'} over ${activeDays} day${activeDays === 1 ? '' : 's'}`}
          </p>
        </div>
        {navigable && today.slice(0, 7) !== month && (
          <button type="button" onClick={() => onMonthChange?.(today.slice(0, 7))} className="ml-auto h-11 px-4 rounded-xl text-[14.5px] font-semibold text-white hover:bg-white/5"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>Today</button>
        )}
      </div>

      <div className="grid grid-cols-7 gap-1.5 mb-1.5">
        {WEEKDAYS.map((d) => (
          <div key={d} className="text-center text-[13px] font-medium" style={{ color: 'var(--color-text-secondary)' }}>{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {grid.map((c) => {
          const n = c.inMonth ? counts[c.key] ?? 0 : 0;
          const lv = level(n);
          const isFuture = c.key > today;
          const isToday = c.key === today;
          const isSelected = c.key === selected;
          const usable = c.inMonth && !isFuture;
          return (
            <button key={c.key} type="button" disabled={!usable}
              onClick={() => usable && onSelect?.(c.key)}
              title={!usable ? undefined
                : `${new Date(c.key + 'T00:00:00').toLocaleDateString('en-PH', { weekday: 'long', day: 'numeric', month: 'long' })} — ${n} check-in${n === 1 ? '' : 's'}`}
              aria-label={`${c.day} ${monthLabel(month)}, ${n} check-in${n === 1 ? '' : 's'}`}
              aria-pressed={isSelected}
              className="rounded-xl flex flex-col items-center justify-center gap-1 transition-colors"
              style={{
                height: h,
                background: isToday ? 'rgba(124,58,237,0.16)' : 'rgba(255,255,255,0.015)',
                border: `1px solid ${isToday ? 'rgba(167,139,250,0.85)' : 'rgba(255,255,255,0.05)'}`,
                cursor: usable ? 'pointer' : 'default',
                opacity: c.inMonth ? (isFuture ? 0.4 : 1) : 0.3,
              }}>
              <span className="grid place-items-center tabular-nums text-[15px] font-medium rounded-full"
                style={{
                  width: 34, height: 34, color: '#fff',
                  background: isSelected ? 'linear-gradient(180deg,#8B5CF6,#6D28D9)' : 'transparent',
                  boxShadow: isSelected ? '0 6px 18px -6px rgba(124,58,237,0.9)' : undefined,
                }}>
                {c.day}
              </span>
              {n > 0 && (
                n <= 3
                  ? <span className="flex gap-1" aria-hidden>{Array.from({ length: n }, (_, i) => <span key={i} className="w-1.5 h-1.5 rounded-full" style={{ background: DOTS[Math.max(lv, 0)] }} />)}</span>
                  : <span className="text-[11px] font-semibold tabular-nums" style={{ color: '#C4B5FD' }}>{n}</span>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between mt-4 gap-3 flex-wrap">
        <span className="text-[14px]" style={{ color: 'var(--color-text-secondary)' }}>
          {selected ? `${counts[selected] ?? 0} check-in${(counts[selected] ?? 0) === 1 ? '' : 's'} on ${new Date(selected + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}`
            : peak > 0 ? `Busiest day: ${peak}` : 'Nothing recorded'}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-[13px]" style={{ color: 'var(--color-text-secondary)' }}>Less</span>
          {DOTS.map((bg) => <span key={bg} className="w-3 h-3 rounded-full" aria-hidden style={{ background: bg }} />)}
          <span className="text-[13px]" style={{ color: 'var(--color-text-secondary)' }}>More</span>
        </div>
      </div>
    </div>
  );
}
