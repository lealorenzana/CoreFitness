import { getMemberProfile, type MemberWithProfile } from '../lib/api/members';
import { listMemberMemberships, type MembershipWithPlan } from '../lib/api/memberships';
import { listMemberPayments } from '../lib/api/payments';
import { listMemberAttendance } from '../lib/api/attendance';
import { listMemberBookings, type BookingWithDetails } from '../lib/api/bookings';
import { listMemberPtSessions, type PtSessionRow } from '../lib/api/ptSessions';
import {
  listMeasurements,
  listGoals,
  listWorkoutLogs,
  type BodyMeasurementRow,
  type FitnessGoalRow,
  type WorkoutLogRow,
} from '../lib/api/progress';
import { listNotifications } from '../lib/api/notifications';
import { getMemberProgression, type MemberProgression } from '../lib/api/progression';
import type { AttendanceRow, PaymentRow } from '../types/db';
import {
  getMemberPlan, listMemberRoutines, listCoachNotes, getGoalValues,
  type MemberPlan, type MemberRoutine, type CoachNoteRecord,
} from '../lib/api/memberTraining';
import { getOpenRenewalRequest, type OpenRenewalRequest } from '../lib/api/renewalRequests';

/**
 * Everything the front desk can see about one member, assembled from the ten
 * tables it lives in.
 *
 * This is a service rather than a hook inside the drawer because it is a screen
 * built from many API calls, and because the honesty rules below are the whole
 * point of it — a component that fetched its own rows would be free to invent a
 * fallback when one of them came back empty. Nothing here does.
 */

/** A trainer's note, read back from the notification it was delivered as. */
export interface TrainerNote {
  id: string;
  date: string;
  title: string;
  message: string;
}

export interface MemberDetail {
  identity: MemberWithProfile;
  /** Newest first. `[0]` is the current membership; the rest are renewals past. */
  memberships: MembershipWithPlan[];
  payments: PaymentRow[];
  attendance: AttendanceRow[];
  bookings: BookingWithDetails[];
  ptSessions: PtSessionRow[];
  measurements: BodyMeasurementRow[];
  goals: FitnessGoalRow[];
  workouts: WorkoutLogRow[];
  notes: TrainerNote[];
  /** Coach notes as records (0072) — null for staff, whom 0072 does not let
   *  read them; the Notes tab then falls back to `notes`. */
  coachNotes: CoachNoteRecord[] | null;
  /** Their training plan and routines from the phone app (0030/0086/0089). */
  plan: MemberPlan | null;
  routines: MemberRoutine[] | null;
  /** goal id → current value (0087), as the member's Goals tab shows it. */
  goalValues: Record<string, number | null>;
  /** null when migration 0028 isn't live — the drawer hides the section. */
  progression: MemberProgression | null;
  stats: MemberStats;
  /** The current term, used — null with no started membership. */
  termUse: TermUse | null;
  /** "I'm coming to renew" from the phone app (0091), if open. */
  renewalRequest: OpenRenewalRequest | null;
}

/**
 * What the current term has been used for, from `start_date` to today.
 * **The member app's You tab ("This term so far") counts the same four things
 * the same way** (membershipHubService.ts), so the desk and the member quote
 * one set of numbers: distinct check-in days; approved classes and approved
 * 1-on-1s that have already started; finished workouts logged in the app.
 */
export interface TermUse {
  elapsedDays: number;
  visitDays: number;
  classes: number;
  sessions: number;
  workouts: number;
}

function computeTermUse(
  start: string | null, attendance: AttendanceRow[], bookings: BookingWithDetails[],
  ptSessions: PtSessionRow[], workouts: WorkoutLogRow[],
): TermUse | null {
  if (!start) return null;
  const today = dateKey(new Date());
  const [y, m, d] = start.split('-').map(Number);
  const elapsedDays = Math.max(1, Math.round((new Date().setHours(0, 0, 0, 0) - new Date(y, m - 1, d).getTime()) / 86_400_000) + 1);
  const inTerm = (key: string) => key >= start && key <= today;
  const now = Date.now();
  const started = (at: string | null | undefined) => !!at && new Date(at).getTime() <= now && inTerm(dateKey(at));
  return {
    elapsedDays,
    visitDays: new Set(attendance.map((a) => dateKey(a.check_in_time)).filter(inTerm)).size,
    classes: bookings.filter((b) => b.status === 'approved' && started(b.classes?.scheduled_at)).length,
    sessions: ptSessions.filter((s) => s.status === 'approved' && started(s.starts_at)).length,
    // An open session (0050: completed_at null) is not a workout yet.
    workouts: workouts.filter((w) => (w as { completed_at?: string | null }).completed_at !== null && inTerm(w.performed_on)).length,
  };
}

export interface MemberStats {
  /**
   * Completed payments only. Summing pending and failed rows into "total paid"
   * would report money the gym never took.
   */
  totalPaid: number;
  paymentsCounted: number;
  /** Rows deliberately left out of totalPaid, so the omission is visible. */
  paymentsUnsettled: number;
  lastPaymentOn: string | null;
  visits: number;
  /** Distinct calendar days, not rows — two check-ins in a day is one visit day. */
  visitDays: number;
  visitDaysLast30: number;
  lastVisitOn: string | null;
  /** Days since the last check-in, or null if they have never checked in. */
  daysSinceLastVisit: number | null;
  bookingsApproved: number;
  bookingsPending: number;
  ptApproved: number;
  ptPending: number;
  /** Derived from date_of_birth on read — an age column would go stale (0031). */
  age: number | null;
}

/** Local calendar date as YYYY-MM-DD. Never toISOString() — that shifts to UTC. */
function dateKey(value: string | Date): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Whole years since a birth date, or null. Recomputed every read, never stored. */
export function ageFromDob(dob: string | null): number | null {
  if (!dob) return null;
  const [y, m, d] = dob.split('-').map(Number);
  if (!y || !m || !d) return null;
  const today = new Date();
  let age = today.getFullYear() - y;
  const hadBirthday =
    today.getMonth() + 1 > m || (today.getMonth() + 1 === m && today.getDate() >= d);
  if (!hadBirthday) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}

function computeStats(
  identity: MemberWithProfile,
  payments: PaymentRow[],
  attendance: AttendanceRow[],
  bookings: BookingWithDetails[],
  ptSessions: PtSessionRow[]
): MemberStats {
  const settled = payments.filter((p) => p.status === 'completed');
  const days = new Set(attendance.map((a) => dateKey(a.check_in_time)));

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const daysLast30 = new Set(
    attendance.filter((a) => new Date(a.check_in_time) >= cutoff).map((a) => dateKey(a.check_in_time))
  );

  // listMemberAttendance orders by check_in_time descending, so the first row is
  // the latest visit. Recomputed with a max() rather than trusted, because a
  // caller reordering that query would silently make this the *oldest* visit.
  const lastVisit = attendance.reduce<string | null>(
    (latest, a) => (latest == null || a.check_in_time > latest ? a.check_in_time : latest),
    null
  );

  return {
    totalPaid: settled.reduce((sum, p) => sum + (Number(p.amount) || 0), 0),
    paymentsCounted: settled.length,
    paymentsUnsettled: payments.length - settled.length,
    lastPaymentOn: settled.reduce<string | null>(
      (latest, p) => (latest == null || p.paid_on > latest ? p.paid_on : latest),
      null
    ),
    visits: attendance.length,
    visitDays: days.size,
    visitDaysLast30: daysLast30.size,
    lastVisitOn: lastVisit,
    daysSinceLastVisit:
      lastVisit == null
        ? null
        : Math.max(
            0,
            Math.round(
              (new Date(`${dateKey(new Date())}T00:00:00`).getTime() -
                new Date(`${dateKey(lastVisit)}T00:00:00`).getTime()) /
                86_400_000
            )
          ),
    bookingsApproved: bookings.filter((b) => b.status === 'approved').length,
    bookingsPending: bookings.filter((b) => b.status === 'pending').length,
    ptApproved: ptSessions.filter((s) => s.status === 'approved').length,
    ptPending: ptSessions.filter((s) => s.status === 'pending').length,
    age: ageFromDob(identity.member.date_of_birth),
  };
}

/**
 * Loads one member's full record.
 *
 * Every optional section fails soft to an empty list: a member record must open
 * even when one table is unreachable, and an empty Progress tab reads as "this
 * member has logged nothing", which is the truthful reading either way. The
 * identity lookup is the one call allowed to throw — without it there is no
 * record to show and the drawer must say so rather than render a blank person.
 */
export async function loadMemberDetail(memberId: string): Promise<MemberDetail> {
  const identity = await getMemberProfile(memberId);
  if (!identity) {
    throw new Error('That member record could not be loaded.');
  }

  const [
    memberships,
    payments,
    attendance,
    bookings,
    ptSessions,
    measurements,
    goals,
    workouts,
    notifications,
    progression,
    plan,
    routines,
    coachNotes,
    renewalRequest,
  ] = await Promise.all([
    listMemberMemberships(memberId).catch(() => []),
    listMemberPayments(memberId).catch(() => []),
    listMemberAttendance(memberId).catch(() => []),
    listMemberBookings(memberId).catch(() => []),
    listMemberPtSessions(memberId).catch(() => []),
    listMeasurements(memberId).catch(() => []),
    listGoals(memberId).catch(() => []),
    listWorkoutLogs(memberId).catch(() => []),
    listNotifications(memberId).catch(() => []),
    getMemberProgression(memberId),
    getMemberPlan(memberId),
    listMemberRoutines(memberId),
    listCoachNotes(memberId),
    getOpenRenewalRequest(memberId).catch(() => null),
  ]);
  const goalValues = await getGoalValues(goals.filter((g) => !g.achieved_on).map((g) => g.id)).catch(() => ({}));

  const notes: TrainerNote[] = notifications
    .filter((n) => n.type === 'trainer_recommendation' || n.type === 'trainer_feedback')
    .map((n) => ({
      id: n.id,
      date: n.created_at,
      title: n.title,
      message: n.message,
    }));

  return {
    identity,
    memberships,
    payments,
    attendance,
    bookings,
    ptSessions,
    measurements,
    goals,
    workouts,
    notes,
    coachNotes,
    plan,
    routines,
    goalValues,
    progression,
    stats: computeStats(identity, payments, attendance, bookings, ptSessions),
    renewalRequest,
    termUse: computeTermUse(memberships[0]?.start_date ?? null, attendance, bookings, ptSessions, workouts),
  };
}
