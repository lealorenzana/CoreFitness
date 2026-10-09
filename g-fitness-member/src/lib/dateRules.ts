/**
 * One rule for every date picker in the system (2026-10-10).
 *
 * An evaluator set a gym-wide goal in 2002: every picker accepted any year.
 * A picker now names its MODE, and the mode decides what can be chosen:
 *
 *   future  — today … two years ahead. The default: bookings, events, goals,
 *             challenges, deadlines, renewals, expiry.
 *   record  — something that already happened: a window back, never ahead
 *             (cash received this month, yesterday's workout).
 *   history — looking back: the gym's first day … today (report ranges).
 *   birth   — 120 years back … today minus the gym's minimum age.
 *
 * Migration 0171 refuses the same windows in SQL, so a crafted request cannot
 * set 2002 either. Pure and dependency-free, and byte-identical in the admin,
 * member and platform apps (`scripts/date-rules-check.mjs` compares them).
 * Values are 'YYYY-MM-DD' built from local parts — never toISOString().
 */
export type DateMode = 'future' | 'record' | 'history' | 'birth';
export interface DateBounds { min: string; max: string }
export interface BoundOpts {
  /** 'YYYY-MM-DD'; defaults to the device's local today. */
  today?: string;
  /** record: how many days back (default 30). */
  backDays?: number;
  /** record/history: never earlier than this day (e.g. the member's join date). */
  earliest?: string;
  /** birth: the gym's minimum age (default 16). */
  minAge?: number;
  /** future: a shorter reach than two years. */
  aheadDays?: number;
}

const pad = (n: number) => String(n).padStart(2, '0');
const fmt = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const parts = (k: string) => k.split('-').map(Number) as [number, number, number];

function localToday(): string {
  const d = new Date();
  return fmt(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

function addDays(k: string, n: number): string {
  const [y, m, d] = parts(k);
  const x = new Date(y, m - 1, d + n);
  return fmt(x.getFullYear(), x.getMonth() + 1, x.getDate());
}

/** The same month and day N years away; 29 Feb becomes 28 Feb in a non-leap year. */
function addYears(k: string, n: number): string {
  const [y, m, d] = parts(k);
  const ty = y + n;
  const last = new Date(ty, m, 0).getDate();
  return fmt(ty, m, Math.min(d, last));
}

const later = (a: string, b: string) => (a > b ? a : b);

export function dateBounds(mode: DateMode, o: BoundOpts = {}): DateBounds {
  const today = o.today ?? localToday();
  switch (mode) {
    case 'future':
      return { min: today, max: o.aheadDays ? addDays(today, o.aheadDays) : addYears(today, 2) };
    case 'record': {
      const back = addDays(today, -(o.backDays ?? 30));
      return { min: o.earliest ? later(back, o.earliest) : back, max: today };
    }
    case 'history':
      return { min: o.earliest ?? addYears(today, -5), max: today };
    case 'birth':
      return { min: addYears(today, -120), max: addYears(today, -(o.minAge ?? 16)) };
  }
}

export const withinBounds = (value: string, b: DateBounds) => value >= b.min && value <= b.max;

/** Narrows bounds by an extra min/max (e.g. an end date never before its start). */
export function narrow(b: DateBounds, min?: string, max?: string): DateBounds {
  return { min: min && min > b.min ? min : b.min, max: max && max < b.max ? max : b.max };
}

/** One short line under a calendar, so a greyed-out day never looks broken. */
export function boundsHint(mode: DateMode, b: DateBounds): string {
  const show = (k: string) => {
    const [y, m, d] = parts(k);
    return new Date(y, m - 1, d).toLocaleDateString('en-PH', { day: 'numeric', month: 'short', year: 'numeric' });
  };
  if (mode === 'future') return `From today to ${show(b.max)}`;
  if (mode === 'birth') return `Born ${show(b.min)} – ${show(b.max)}`;
  return `${show(b.min)} – ${show(b.max)}`;
}
