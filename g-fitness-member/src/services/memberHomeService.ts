import { getMemberProfile } from '../lib/api/members';
import { getCurrentMembership } from '../lib/api/memberships';
import { listMemberAttendance } from '../lib/api/attendance';
import { listMyBookings, isUpcoming, type MyBooking } from './bookingService';
import { listEvents, eventStatus, type EventRow } from '../lib/api/events';
import { planAccess, type PlanAccess } from '../utils/planAccess';
import { getMyFeatures, isEnabled } from '../lib/api/planFeatures';
import { progressService } from './progressService';
import { listMyPlan } from '../lib/api/gymPlans';
import { getGymSettings } from '../lib/api/settings';
import { listRules } from '../lib/api/points';
import { getUnreadCount } from '../lib/api/notifications';
import { listChallenges } from '../lib/api/challenges';

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
  /** When the account was created ('Member since'). ISO, or null if the profile could not be read. */
  memberSince: string | null;
  /** The current membership's first day, 'YYYY-MM-DD' — with `expiryDate`, the length of the term. */
  startDate: string | null;
  /**
   * What the plan includes and, more to the point, what it does not (0017).
   *
   * The card used to show the plan's *name* and its *term* and nothing else,
   * which on the free tier meant its only statement was "this membership does
   * not expire" — the one true fact that reads as generous while the tier
   * cannot book a class or a trainer. Null when there is no membership.
   */
  access: PlanAccess | null;
  /** 'YYYY-MM-DD', null on a lifetime plan, and null before activation. */
  expiryDate: string | null;
  /** Lifetime plan (0024) — `expiryDate` and `daysLeft` are null by design. */
  neverExpires: boolean;
  daysLeft: number | null;
  expired: boolean;
  /**
   * Frozen (0057): the member keeps their days but has **no access at all** —
   * `membership_is_usable()` accepts 'active' and 'cancelled' and not this.
   *
   * Home had no idea. A frozen member saw a healthy card counting down days
   * remaining, and found out only by walking to Book a Session, tapping, and
   * reading the refusal — or by turning up at the desk. The rule was enforced
   * in SQL and readable nowhere, which is the trap CLAUDE.md names.
   */
  frozen: boolean;
  /**
   * Cancelled, and still usable until the expiry date — that is deliberate
   * (TEST_MATRIX, 7 September). Worth saying out loud on the card, because
   * everything else about it looks like a live membership right up to the day
   * it stops.
   */
  cancelled: boolean;
  /** Membership runs out within a week — drives the renew nudge. */
  expiringSoon: boolean;
  checkInsThisMonth: number;
  checkedInToday: boolean;
  /** When today's first check-in was recorded (ISO), or null. For "Checked in at 9:41". */
  checkInAtToday: string | null;
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
  /**
   * An unread note from a trainer, if there is one.
   *
   * Trainer recommendations have always worked — the trainer app writes a
   * `notifications` row and the member can read it in the bell or under
   * Progress → Coach. The problem was that Coach is the *fifth* tab of a screen
   * one level down, so unless the member happened to open the bell in time, a
   * coach's note could sit unread indefinitely and read as "the feature does
   * not work". Surfacing the newest unread one here is the fix; it links
   * straight to the tab rather than reproducing the note.
   */
  unreadCoachNote: { count: number; title: string; from: string | null } | null;
}

/** Local calendar date as YYYY-MM-DD. Never toISOString() — that shifts to UTC. */
function toDateString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function getMemberHome(memberId: string): Promise<MemberHome> {
  const [member, membership, attendance, bookings, events, coachNotes, features] = await Promise.all([
    getMemberProfile(memberId).catch(() => null),
    getCurrentMembership(memberId).catch(() => null),
    listMemberAttendance(memberId).catch(() => []),
    listMyBookings(memberId).catch(() => []),
    listEvents().catch(() => [] as EventRow[]),
    // Reused rather than re-filtered here: `getTrainerFeedback` owns the list of
    // three type spellings a recommendation has been written under, and a second
    // copy of that list would drift and start hiding notes again.
    progressService.getTrainerFeedback(memberId).catch(() => []),
    // What this member's plan unlocks (0049), so the membership card lists the
    // gated features alongside classes and PT rather than only half the story.
    // Empty on failure — the card then says exactly what it said before 0049.
    getMyFeatures().catch(() => []),
  ]);

  const unread = coachNotes.filter((n) => !n.read);

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
    memberSince: member?.profile.created_at ?? null,
    startDate: membership?.start_date ?? null,
    access: planAccess(membership?.membership_plans, features),
    expiryDate,
    neverExpires,
    daysLeft,
    expired,
    frozen: membership?.status === 'frozen',
    cancelled: membership?.status === 'cancelled',
    expiringSoon: !expired && !neverExpires && daysLeft != null && daysLeft <= 7,
    checkInsThisMonth: checkInDates.filter((d) => d.startsWith(thisMonth)).length,
    checkedInToday: checkInSet.has(today),
    // Earliest of today's rows — `listMemberAttendance` is newest-first.
    checkInAtToday:
      attendance
        .filter((a) => toDateString(new Date(a.check_in_time)) === today)
        .map((a) => a.check_in_time)
        .sort()[0] ?? null,
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
    // Newest first — getTrainerFeedback already sorts that way.
    unreadCoachNote:
      unread.length === 0
        ? null
        : { count: unread.length, title: unread[0].title, from: unread[0].trainerName ?? null },
  };
}

/**
 * What Today needs beyond the membership card (Nocturne redesign, 2026-09-16).
 *
 * Separate from `getMemberHome` on purpose: the check-in sheet polls that every
 * four seconds while it is open, and this runs a progress RPC per challenge.
 * Only Today asks for it.
 *
 * **Every field is null when its read fails, and Today renders nothing for a
 * null** — never a default. "The floor is open until 9 PM" with no closing
 * time on record would be a sentence the gym never said; "20 points added" was
 * exactly that in the prototype, where the real rule is 10 and admin-editable.
 */
export interface TodayExtras {
  /** Active planned weekdays, 0 = Sunday (0030). */
  plannedDays: number[] | null;
  remindAt: string | null;
  /** `gym_settings.closing_time`, 'HH:MM[:SS]'. */
  closingTime: string | null;
  /** The `checkin` rule's points — only when this plan actually earns points. */
  checkinPoints: number | null;
  unreadCount: number | null;
  /**
   * The joined, unfinished challenge ending soonest, with its progress as the
   * server computed it inside the challenge's own window. Null when none, or
   * when its progress could not be read — a bar with an unknown numerator is
   * not drawn.
   */
  challenge: { id: string; title: string; progress: number; target: number; endsOn: string } | null;
}

export async function getTodayExtras(memberId: string): Promise<TodayExtras> {
  const [plan, settings, rules, unread, challenges, features] = await Promise.all([
    listMyPlan(memberId).catch(() => null),
    getGymSettings().catch(() => null),
    listRules().catch(() => null),
    getUnreadCount(memberId).catch(() => null),
    listChallenges(memberId).catch(() => null),
    getMyFeatures().catch(() => null),
  ]);

  // `award_points` checks the plan (0051): a member whose plan does not earn
  // points gets nothing for checking in, so the sentence must not promise any.
  const earns = features != null && isEnabled(features, 'points_earn');
  const rule = rules?.find((r) => r.key === 'checkin') ?? null;

  const current = (challenges ?? [])
    .filter((c) => c.joined && !c.completedOn && c.progress != null && c.target > 0)
    .sort((a, b) => a.endsOn.localeCompare(b.endsOn))[0];

  return {
    plannedDays: plan == null ? null : plan.filter((r) => r.active).map((r) => r.day_of_week),
    remindAt: plan?.[0]?.remind_at ?? null,
    closingTime: settings?.closing_time ?? null,
    checkinPoints: earns && rule ? rule.points : null,
    unreadCount: unread,
    challenge: current
      ? { id: current.id, title: current.title, progress: current.progress as number,
          target: current.target, endsOn: current.endsOn }
      : null,
  };
}
