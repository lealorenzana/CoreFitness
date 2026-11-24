import { listMemberAttendance } from '../lib/api/attendance';
import { getCurrentMemberId, listMyBookings } from './bookingService';
import { listSlots } from '../lib/api/slots';
import { dateKey, localDateKey } from '../utils/dates';

export interface CalendarEntry { title: string; time: string; path: string }
export interface TodayCalendarData { visits: Record<string, number>; bookings: Record<string, CalendarEntry[]>; slotsUnavailable: boolean }

/** Attendance, classes, coaching and booked floor times on one local calendar. */
export async function loadTodayCalendar(month: Date, includeSlots: boolean): Promise<TodayCalendarData> {
  const id = await getCurrentMemberId();
  if (!id) throw new Error('Please sign in again.');
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const total = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const [attendance, rows, slots] = await Promise.all([
    listMemberAttendance(id), listMyBookings(id),
    includeSlots ? listSlots(dateKey(first), total) : Promise.resolve([]),
  ]);
  const visits: Record<string, number> = {};
  const bookings: Record<string, CalendarEntry[]> = {};
  for (const row of attendance) {
    const key = localDateKey(row.check_in_time);
    visits[key] = (visits[key] ?? 0) + 1;
  }
  for (const row of rows) {
    if (!row.startsAt || row.status === 'cancelled' || row.status === 'rejected') continue;
    const key = localDateKey(row.startsAt);
    (bookings[key] ??= []).push({ title: row.title, time: new Date(row.startsAt).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' }), path: '/member/sessions' });
  }
  for (const slot of slots ?? []) {
    if (!slot.myBooking) continue;
    (bookings[slot.date] ??= []).push({ title: 'Gym time', time: slot.starts.slice(0, 5), path: '/member/slots' });
  }
  return { visits, bookings, slotsUnavailable: includeSlots && slots === null };
}
