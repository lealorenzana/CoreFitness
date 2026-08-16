/**
 * Calendar dates, in the gym's timezone rather than the server's.
 *
 * **Never `toISOString().slice(0, 10)`.** It converts to UTC first, and Manila
 * is UTC+8 — so for the first eight hours of every local day it returns
 * *yesterday's* date. The admin Attendance page used it for both "today" and the
 * log's date filter, which meant a 6am check-in was filed under the previous day
 * and the duplicate-check-in guard compared against the wrong one: a member who
 * came at 7am and again at 9am was two different days apart as far as the page
 * was concerned, so the second visit was never caught.
 *
 * These use the browser's local calendar, which on the gym's front-desk machine
 * is Manila — the same day the staff and the members are living in.
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
 * reading the date back out of the ISO text instead of off the local Date.
 */
export function localDateKey(iso: string): string {
  return dateKey(new Date(iso));
}

/** YYYY-MM-DD shifted by whole days, staying on the local calendar. */
export function addDays(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number);
  return dateKey(new Date(y, m - 1, d + days));
}

/** Whole days between two local calendar dates (b − a). */
export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((new Date(by, bm - 1, bd).getTime() - new Date(ay, am - 1, ad).getTime()) / 86_400_000);
}
