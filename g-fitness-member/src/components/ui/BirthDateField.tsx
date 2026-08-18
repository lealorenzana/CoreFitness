import { useEffect, useId, useRef, useState } from 'react';
import { Cake } from 'lucide-react';

/**
 * Day / month / year selects for a birth date.
 *
 * `<input type="date">` hands Android its Material calendar: a full-screen
 * modal, styled by the OS rather than by this app, that opens on the *current*
 * month. Entering 1998 means paging back three hundred times or discovering the
 * year header. `color-scheme: dark` (index.css) keeps it dark but cannot make
 * it ours, and the design system has no say in it at all.
 *
 * A calendar grid is the wrong control here regardless of styling. Nobody
 * navigates to their own birthday — they know the three numbers. Three selects
 * ask for exactly those, open a short system list instead of a modal, and their
 * resting state is fully ours.
 *
 * ## Value contract
 *
 * Emits `YYYY-MM-DD`, or `''` until all three parts are chosen. Never a partial
 * date: `1998--` would reach `date_of_birth` as a cast error, and `1998-01-01`
 * inferred from a year alone would be a birthday nobody entered.
 */
interface Props {
  value: string;
  onChange: (next: string) => void;
  label?: string;
  /** Youngest allowed birth year. Defaults to this year. */
  maxYear?: number;
  /** How far back the year list runs. */
  yearsBack?: number;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Days in a month, leap years included. Day 0 of the next month *is* the last
 *  day of this one, which is the only version of this that never needs a leap
 *  rule written out. */
function daysIn(year: number, month1: number): number {
  if (!year || !month1) return 31;
  return new Date(year, month1, 0).getDate();
}

const selectStyle: React.CSSProperties = {
  background: 'var(--color-surface-raised)',
  border: '1px solid var(--color-border)',
  color: 'var(--color-text-primary)',
  borderRadius: 'var(--radius-card)',
  // Native list, ours everywhere else. Never `filter: invert(1)` — see the note
  // in index.css; with color-scheme declared, invert fights it.
  colorScheme: 'dark',
};

export default function BirthDateField({
  value, onChange, label = 'Date of birth', maxYear, yearsBack = 100,
}: Props) {
  const id = useId();
  const thisYear = new Date().getFullYear();
  const newest = maxYear ?? thisYear;

  /**
   * The three parts are held locally, not derived from `value`.
   *
   * `value` only ever holds a *complete* date — that is the contract. Deriving
   * the selects from it therefore threw away every partial choice: pick a
   * month, and since the date is still incomplete the parent emits `''`, which
   * flows straight back down and resets the select that was just used. The
   * first draft did exactly that and could never assemble a date at all,
   * emitting `''` four times in a row while looking perfectly correct on
   * screen.
   */
  const parse = (v: string): [number, number, number] => {
    const [yy, mm, dd] = (v || '').split('-');
    return [Number(yy) || 0, Number(mm) || 0, Number(dd) || 0];
  };
  const [[year, month, day], setParts] = useState<[number, number, number]>(() => parse(value));

  // Accept genuine changes pushed from outside (loading a saved profile, or the
  // form being reset) without fighting our own emissions.
  const lastEmitted = useRef<string>(value);
  useEffect(() => {
    if (value === lastEmitted.current) return;
    lastEmitted.current = value;
    setParts(parse(value));
  }, [value]);

  const commit = (ny: number, nm: number, nd: number) => {
    // Clamp the day when the month shrinks under it: picking 31 January then
    // switching to February must not emit the 31st of a month without one.
    const maxDay = daysIn(ny, nm);
    const safeDay = nd > maxDay ? maxDay : nd;
    setParts([ny, nm, safeDay]);

    const next = ny && nm && safeDay
      ? `${ny}-${String(nm).padStart(2, '0')}-${String(safeDay).padStart(2, '0')}`
      : '';
    lastEmitted.current = next;
    onChange(next);
  };

  const years = Array.from({ length: yearsBack + 1 }, (_, i) => newest - i);
  const days = Array.from({ length: daysIn(year, month) }, (_, i) => i + 1);

  return (
    <div>
      <label htmlFor={`${id}-m`} className="text-xs font-semibold block mb-1.5"
        style={{ color: 'var(--color-text-secondary)' }}>
        {label}
      </label>
      <div className="flex items-center gap-2">
        <Cake size={15} className="flex-shrink-0" style={{ color: 'var(--color-text-muted)' }} />

        <select id={`${id}-m`} aria-label="Month" value={month || ''}
          onChange={(e) => commit(year, Number(e.target.value), day)}
          className="flex-1 min-w-0 px-3 py-3 text-xs font-semibold" style={selectStyle}>
          <option value="">Month</option>
          {MONTHS.map((name, i) => <option key={name} value={i + 1}>{name}</option>)}
        </select>

        <select aria-label="Day" value={day || ''}
          onChange={(e) => commit(year, month, Number(e.target.value))}
          className="px-3 py-3 text-xs font-semibold" style={{ ...selectStyle, width: 78 }}>
          <option value="">Day</option>
          {days.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>

        <select aria-label="Year" value={year || ''}
          onChange={(e) => commit(Number(e.target.value), month, day)}
          className="px-3 py-3 text-xs font-semibold" style={{ ...selectStyle, width: 92 }}>
          <option value="">Year</option>
          {years.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>
    </div>
  );
}
