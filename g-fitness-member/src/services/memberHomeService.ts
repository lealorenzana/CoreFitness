import { getMemberProfile } from '../lib/api/members';
import { getCurrentMembership } from '../lib/api/memberships';
import { listMemberAttendance } from '../lib/api/attendance';
import { listMyBookings, isUpcoming, type MyBooking } from './bookingService';
import { listEvents, eventStatus, type EventRow } from '../lib/api/events';

/**
 * The member's home screen, assembled from real rows.
 *
 * Everything on that screen used to be invented when SharedStorage had no entry
 * — which, for a Supabase-backed member, is always. It greeted whoever logged
 * in as "Eya Lorenzana", showed a Premium membership valid until Dec 31 2026
 * with 591 days left, three progress rings from `MOCK_HOME_QUICK_STATS`, and a
 * fixed "upcoming class" from `MOCK_UPCOMING_CLASS`.
 *
 * The same rule as everywhere else: a number with no source doesn't appear.
 * That is why there are no goal rings here — a "workout goal" needs a target
 * the member sets, and there is no column for one.
 */

export interface MemberHome {
  firstName: string;
  fullName: string;
  /** Uploaded avatar, or null — <Avatar> falls back to initials. */
  photoUrl: string | null;
  /** The value encoded into the check-in QR. Always the member's auth id. */
  memberId: string;
  planName: string | null;
  /** 'YYYY-MM-DD', null on a lifetime plan, and null before activation. */
  expiryDate: string | null;
  /** Lifetime plan (0024) — `expiryDate` and `daysLeft` are null by design. */
  neverExpires: boolean;
  daysLeft: number | null;
  expired: boolean;
  /** Membership runs out within a week — drives the renew nudge. */
  expiringSoon: boolean;
  checkInsThisMonth: number;
  checkedInToday: boolean;
  /** Sun→Sat of the current week; true where an attendance row exists. */
  weekCheckIns: boolean[];
  /** The calendar day-of-month for each of those seven days, same order. */
  weekDayNumbers: number[];
  /** Today's index in `weekCheckIns` (0 = Sunday). */
  todayIndex: number;
  upcomingCount: number;
  nextBooking: MyBooking | null;
  /**
   * The gym's next announced event, or null. Surfaced high on Home rather than
   * buried in the shortcut list — an event nobody scrolls far enough to see is
   * an event nobody attends. Renders nothing at all when there isn't one, so
   * the space is never spent on an empty promise.
   */
  nextEvent: { id: string; title: string; startsAt: string; location: string | null } | null;
}

/** Local calendar date as YYYY-MM-DD. Never toISOString() — that shifts to UTC. */
function toDateString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function getMemberHome(memberId: string): Promise<MemberHome> {
  const [member, membership, attendance, bookings, events] = await Promise.all([
    getMemberProfile(memberId).catch(() => null),
    getCurrentMembership(memberId).catch(() => null),
    listMemberAttendance(memberId).catch(() => []),
    listMyBookings(memberId).catch(() => []),
    listEvents().catch(() => [] as EventRow[]),
  ]);

  const firstName = member?.profile.first_name ?? '';
  const lastName = member?.profile.last_name ?? '';

  const expiryDate = membership?.expiry_date ?? null;
  // A lifetime plan (0024) has no expiry date on purpose. That is a different
  // thing from a membership that was never activated, which also has none.
  const neverExpires = membership?.never_expires ?? false;
  const today = toDateString(new Date());

  // Whole days between two calendar dates, compared as dates rather than
  // timestamps — otherwise "expires today" reads as -1 day after midday.
  const daysLeft =
    expiryDate == null
      ? null
      : Math.round(
          (new Date(`${expiryDate}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()) / 86_400_000
        );

  // A membership is expired when the gym says so, not when the phone's clock
  // does: `status` is what the front desk and RLS both act on.
  //
  // The missing-expiry case used to fall through as *not* expired, so a pending
  // registration showed a blank card with no explanation and no renew button.
  // It is only a lifetime membership that legitimately has no date.
  const expired =
    membership == null ||
    membership.status === 'expired' ||
    (!neverExpires && (expiryDate == null || (daysLeft != null && daysLeft < 0)));

  const thisMonth = today.slice(0, 7);
  const checkInDates = attendance.map((a) => toDateString(new Date(a.check_in_time)));
  const checkInSet = new Set(checkInDates);

  // The current week, Sunday-first — built from real calendar dates rather than
  // by counting backwards, so it stays correct across a month or year boundary.
  const now = new Date();
  const todayIndex = now.getDay();
  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now);
    d.setDate(now.getDate() - todayIndex + i);
    return d;
  });
  const weekCheckIns = weekDates.map((d) => checkInSet.has(toDateString(d)));
  const weekDayNumbers = weekDates.map((d) => d.getDate());

  const upcoming = bookings.filter((b) => isUpcoming(b));

  return {
    firstName: firstName || 'there',
    fullName: `${firstName} ${lastName}`.trim() || 'Member',
    photoUrl: member?.profile.photo_url ?? null,
    memberId,
    planName: membership?.membership_plans?.name ?? null,
    expiryDate,
    neverExpires,
    daysLeft,
    expired,
    expiringSoon: !expired && !neverExpires && daysLeft != null && daysLeft <= 7,
    checkInsThisMonth: checkInDates.filter((d) => d.startsWith(thisMonth)).length,
    checkedInToday: checkInSet.has(today),
    weekCheckIns,
    weekDayNumbers,
    todayIndex,
    upcomingCount: upcoming.length,
    // Soonest first — listMyBookings sorts newest-first for the history screen.
    nextBooking:
      upcoming
        .filter((b) => b.startsAt != null)
        .sort((a, b) => (a.startsAt as string).localeCompare(b.startsAt as string))[0] ?? null,
    // Soonest upcoming only. `eventStatus` is derived at read time, so a
    // cancelled or finished event can never resurface here.
    nextEvent:
      events
        .filter((e) => eventStatus(e) === 'Upcoming')
        .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
        .map((e) => ({ id: e.id, title: e.title, startsAt: e.starts_at, location: e.location }))[0] ?? null,
  };
}
