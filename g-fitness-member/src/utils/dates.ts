/**
 * Calendar dates, in the gym's timezone rather than UTC.
 *
 * The admin app has had this since 0045. The phone app never got one, so every
 * screen that needed a calendar date solved it locally — some correctly with
 * `getFullYear()/getMonth()/getDate()`, some with `toISOString().slice(0, 10)`,
 * and at least one page with both at once.
 *
 * ## Why `toISOString().slice(0, 10)` is wrong here
 *
 * It converts to UTC first. Manila is UTC+8, so for the **first eight hours of
 * every local day** it returns *yesterday's* date. A 7am check-in is 23:00 UTC
 * the day before.
 *
 * ## What that actually broke
 *
 * `AttendanceHistory` computed its streak from `check_in_time.slice(0, 10)` —
 * the raw UTC text off the row — while the calendar heatmap directly below it
 * plotted the same rows with `new Date(...)`, which is local. So a member who
 * trains before 8am saw the same visit marked on Tuesday in the calendar and
 * counted toward Monday in the streak. Both were drawn from the same array.
 *
 * `listChallenges` filtered `ends_on >= today`, so for those eight hours a
 * challenge that finished yesterday was still offered. `createMember` stamped
 * `start_date` a day early, which shifts every expiry derived from it.
 *
 * ## The rule
 *
 * A **timestamp** (`created_at`, `approved_at`, `check_in_time`) is an instant
 * and `toISOString()` is correct for it — that is what `timestamptz` wants.
 * A **calendar date** (`start_date`, `ends_on`, a day key for grouping) is a
 * day in Manila and must come from here.
 */

const pad = (n: number) => String(n).padStart(2, '0');

/** Local calendar date of a Date, as YYYY-MM-DD. */
export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Today, locally. */
export function todayKey(): string {
  return dateKey(new Date());
}

/**
 * Local calendar date of a timestamp string.
 *
 * The instant is parsed correctly by `new Date()` — the bug was only ever in
 * reading the date back out of the ISO *text* instead of off the local Date.
 */
export function localDateKey(iso: string): string {
  return dateKey(new Date(iso));
}

/** Local calendar month of a Date, as YYYY-MM — for "this month" totals. */
export function monthKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

/** YYYY-MM-DD shifted by whole days, staying on the local calendar. */
export function addDays(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number);
  return dateKey(new Date(y, m - 1, d + days));
}
