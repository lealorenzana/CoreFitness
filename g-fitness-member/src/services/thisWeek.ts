import { supabase } from '../lib/supabaseClient';
import { addDays, dateKey, localDateKey } from '../utils/dates';
import { getCurrentMemberId, listMyBookings, type MyBooking } from './bookingService';

/**
 * This week (gym styles phase 1, 2026-11-14 — the owner: "members' clear This week schedule"): Monday to Sunday,
 * each day with the member's own classes and coach sessions (pending and confirmed; never cancelled or declined)
 * and whether the gym is closed that day. Read from the bookings and `gym_settings` — nothing invented: a day with
 * nothing booked says so, and hours the gym never set are not shown.
 */
export interface WeekDay {
  ymd: string;
  /** 0 = Sunday, the way the gym's closed days are kept (0153). */
  weekday: number;
  isToday: boolean;
  isPast: boolean;
  closed: boolean;
  items: MyBooking[];
}

export interface ThisWeek {
  days: WeekDay[];
  /** "6:00 AM – 10:00 PM", or null when the gym has not set its hours. */
  hours: string | null;
  /** The next thing still ahead this week, or null. */
  next: MyBooking | null;
}

const clock = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
};

/** Monday of the week `ymd` is in, local calendar. */
export function mondayOf(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const wd = new Date(y, m - 1, d).getDay();          // 0 = Sunday
  return addDays(ymd, wd === 0 ? -6 : 1 - wd);
}

export async function loadThisWeek(now = new Date()): Promise<ThisWeek> {
  const today = dateKey(now);
  const monday = mondayOf(today);
  const [memberId, settings] = await Promise.all([
    getCurrentMemberId(),
    supabase.from('gym_settings').select('opening_time, closing_time, closed_days').maybeSingle(),
  ]);
  const rows = memberId ? await listMyBookings(memberId) : [];
  const s = (settings.data ?? null) as { opening_time: string | null; closing_time: string | null; closed_days: number[] | null } | null;
  const closed = Array.isArray(s?.closed_days) ? s!.closed_days : [];

  const live = rows.filter((r) => r.startsAt && r.status !== 'cancelled' && r.status !== 'rejected');
  const days: WeekDay[] = Array.from({ length: 7 }, (_, i) => {
    const ymd = addDays(monday, i);
    const [y, m, d] = ymd.split('-').map(Number);
    const weekday = new Date(y, m - 1, d).getDay();
    return {
      ymd, weekday, isToday: ymd === today, isPast: ymd < today, closed: closed.includes(weekday),
      items: live.filter((r) => localDateKey(r.startsAt!) === ymd).sort((a, b) => a.startsAt!.localeCompare(b.startsAt!)),
    };
  });
  const nowMs = now.getTime();
  const next = days.flatMap((d) => d.items).find((r) => new Date(r.startsAt!).getTime() + r.durationMinutes * 60_000 > nowMs) ?? null;
  return {
    days,
    hours: s?.opening_time && s?.closing_time ? `${clock(s.opening_time)} – ${clock(s.closing_time)}` : null,
    next,
  };
}

