import { listMyPlan, planRoutinesSupported, DEFAULT_REMIND_AT, toTimeInput } from '../lib/api/gymPlans';
import { listMemberAttendance } from '../lib/api/attendance';
import { listRoutines, type Routine } from '../lib/api/routines';
import { dateKey, localDateKey } from '../utils/dates';

/**
 * The Training plan screen, assembled (reworked 2026-09-19, with 0089).
 *
 * The plan is still 0030's rows — days and one reminder time — plus, when the
 * database has 0089, a routine per day. Around it, three things read from real
 * check-ins rather than stored anywhere:
 *
 *   this week      which planned days you came in on, as Today draws them
 *   weeks in a row weeks with at least as many visits as the plan has days.
 *                  Any day counts — going Tuesday instead of Monday keeps the
 *                  habit — and it is measured against the plan you have *now*,
 *                  because the plan keeps no history; the screen says so.
 *   usual time     the median time you check in, over the last 60 days, when
 *                  there are at least four visits to take it from.
 */

export interface TrainingPlanView {
  days: number[];
  remindAt: string;
  routineByDay: Record<number, string | null>;
  /** Null when they could not be read — not the same as having none. */
  routines: Routine[] | null;
  routinesSupported: boolean;
  /** Sun→Sat of this week: a check-in on that day. Null if attendance failed. */
  weekCheckIns: boolean[] | null;
  weekDayNumbers: number[];
  /** Consecutive weeks meeting the plan's day count; null without a plan or data. */
  streakWeeks: number | null;
  /** 'HH:MM', or null with too few visits to say. */
  usualCheckIn: string | null;
}

const USUAL_MIN_VISITS = 4;
const STREAK_LOOKBACK_WEEKS = 26;

function sundayOf(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay());
}

export async function loadTrainingPlan(memberId: string): Promise<TrainingPlanView> {
  const [rows, supported, routines, attendance] = await Promise.all([
    listMyPlan(memberId),
    planRoutinesSupported().catch(() => false),
    listRoutines(memberId).catch(() => null),
    listMemberAttendance(memberId).catch(() => null),
  ]);

  const active = rows.filter((r) => r.active);
  const days = active.map((r) => r.day_of_week).sort((a, b) => a - b);
  const routineByDay: Record<number, string | null> = {};
  for (const r of active) routineByDay[r.day_of_week] = r.routine_id ?? null;

  const now = new Date();
  const sunday = sundayOf(now);
  const weekDates = Array.from({ length: 7 }, (_, i) =>
    new Date(sunday.getFullYear(), sunday.getMonth(), sunday.getDate() + i));

  let weekCheckIns: boolean[] | null = null;
  let streakWeeks: number | null = null;
  let usualCheckIn: string | null = null;

  if (attendance) {
    const visited = new Set(attendance.map((a) => localDateKey(a.check_in_time)));
    weekCheckIns = weekDates.map((d) => visited.has(dateKey(d)));

    if (days.length > 0) {
      const visitsIn = (start: Date) => Array.from({ length: 7 }, (_, i) =>
        dateKey(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)))
        .filter((k) => visited.has(k)).length;
      // This week counts once it is already met; otherwise the streak is
      // still alive and is counted from last week back.
      let streak = visitsIn(sunday) >= days.length ? 1 : 0;
      for (let w = 1; w <= STREAK_LOOKBACK_WEEKS; w++) {
        const start = new Date(sunday.getFullYear(), sunday.getMonth(), sunday.getDate() - 7 * w);
        if (visitsIn(start) >= days.length) streak++;
        else break;
      }
      streakWeeks = streak;
    }

    const since = now.getTime() - 60 * 86_400_000;
    const minutes = attendance
      .map((a) => new Date(a.check_in_time))
      .filter((d) => d.getTime() >= since)
      .map((d) => d.getHours() * 60 + d.getMinutes())
      .sort((a, b) => a - b);
    if (minutes.length >= USUAL_MIN_VISITS) {
      const mid = minutes[Math.floor(minutes.length / 2)];
      usualCheckIn = `${String(Math.floor(mid / 60)).padStart(2, '0')}:${String(mid % 60).padStart(2, '0')}`;
    }
  }

  return {
    days,
    remindAt: active[0] ? toTimeInput(active[0].remind_at) : rows[0] ? toTimeInput(rows[0].remind_at) : DEFAULT_REMIND_AT,
    routineByDay,
    routines,
    routinesSupported: supported,
    weekCheckIns,
    weekDayNumbers: weekDates.map((d) => d.getDate()),
    streakWeeks,
    usualCheckIn,
  };
}

/** 'HH:MM' rounded up to the next quarter hour — a nudge set at your usual
 *  time arrives just as you would normally be walking in. */
export function suggestReminder(usual: string): string {
  const [h, m] = usual.split(':').map(Number);
  const total = Math.min(23 * 60 + 45, Math.ceil((h * 60 + m) / 15) * 15);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export const DAY_PRESETS: { label: string; days: number[] }[] = [
  { label: 'Mon · Wed · Fri', days: [1, 3, 5] },
  { label: 'Tue · Thu · Sat', days: [2, 4, 6] },
  { label: 'Weekdays', days: [1, 2, 3, 4, 5] },
  { label: 'Every day', days: [0, 1, 2, 3, 4, 5, 6] },
];

export const TIME_PRESETS: { label: string; value: string }[] = [
  { label: 'Early · 6 AM', value: '06:00' },
  { label: 'Noon', value: '12:00' },
  { label: 'After work · 5 PM', value: '17:00' },
  { label: 'Evening · 7 PM', value: '19:00' },
];
