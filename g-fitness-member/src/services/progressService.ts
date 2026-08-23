import {
  listMeasurements, saveMeasurement,
  listGoals, createGoal, updateGoal, deleteGoal as apiDeleteGoal,
  listWorkoutLogs, createWorkoutLog,
  bmi as calcBmiValue, bmiBand, todayDate,
  type BodyMeasurementRow, type FitnessGoalRow, type WorkoutLogRow,
} from '../lib/api/progress';
import { listMemberAttendance } from '../lib/api/attendance';
import { listNotifications } from '../lib/api/notifications';

/**
 * The Progress Hub, backed by real tables (migration 0020).
 *
 * Previously every method merged a `src/data/mock*.ts` fixture with a
 * localStorage blob, so the numbers were half invented and half trapped on one
 * device. The tables now exist; this is the seam between them and the tabs.
 *
 * Fields deliberately **not** carried over from the mock shapes, because
 * nothing measures them:
 *
 *   - `calories` on a workout log — needs body mass, heart rate and effort. The
 *     old fixture simply had numbers typed into it.
 *   - `isPr` (personal-record flag) — needs per-exercise weights, which this
 *     schema doesn't model.
 *   - `muscleMassKg` — needs a body-composition scale the gym doesn't have.
 *
 * Badges are gone entirely: no table, no earning rules, nothing to derive them
 * from honestly.
 */

export interface BodyProgressEntry {
  id: string;
  memberId: string;
  /** YYYY-MM-DD, the day it was measured. */
  date: string;
  weight: number | null;
  height: number | null;
  bmi: number | null;
  arms: number | null;
  waist: number | null;
  chest: number | null;
  legs: number | null;
  bodyFatPct: number | null;
  /** The four sites added in 0043, plus `hips`, which existed in the table from
   *  0020 and was hardcoded to null on every write until now. */
  neck: number | null;
  shoulders: number | null;
  forearms: number | null;
  hips: number | null;
  calves: number | null;
}

export interface WorkoutLog {
  id: string;
  memberId: string;
  date: string;
  type: string;
  duration: number | null;
  notes?: string;
}

export type GoalStatus = 'active' | 'achieved' | 'overdue';

export interface Goal {
  id: string;
  memberId: string;
  title: string;
  metric: string;
  targetValue: number | null;
  startValue: number | null;
  currentValue: number | null;
  deadline: string | null;
  status: GoalStatus;
  createdAt: string;
  achievedAt?: string | null;
}

export interface AttendanceRecord {
  id: string;
  memberId: string;
  date: string;
  time: string;
  method: 'QR' | 'Manual';
  activity: string | null;
}

export interface TrainerFeedback {
  id: string;
  memberId: string;
  date: string;
  /** Full timestamp, for showing the time as well as the day. */
  sentAt: string;
  title: string;
  content: string;
  /** Both undefined on notes sent before the sender was recorded. */
  trainerId?: string;
  trainerName?: string;
  read: boolean;
}

// ─── Row → view-model ────────────────────────────────────────────────────────

function toEntry(r: BodyMeasurementRow): BodyProgressEntry {
  return {
    id: r.id,
    memberId: r.member_id,
    date: r.measured_on,
    weight: r.weight_kg,
    height: r.height_cm,
    bmi: calcBmiValue(r.weight_kg, r.height_cm),
    arms: r.arms_cm,
    waist: r.waist_cm,
    chest: r.chest_cm,
    legs: r.thighs_cm,
    bodyFatPct: r.body_fat_pct,
    neck: r.neck_cm,
    shoulders: r.shoulders_cm,
    forearms: r.forearm_cm,
    hips: r.hips_cm,
    calves: r.calf_cm,
  };
}

function toLog(r: WorkoutLogRow): WorkoutLog {
  return {
    id: r.id,
    memberId: r.member_id,
    date: r.performed_on,
    type: r.activity ?? 'Workout',
    duration: r.duration_minutes,
    notes: r.notes ?? undefined,
  };
}

/**
 * A goal's live reading comes from the latest measurement, not a stored copy —
 * a `currentValue` column would drift the moment a member logged a new weight
 * and forgot to update the goal.
 */
function toGoal(r: FitnessGoalRow, latest: BodyMeasurementRow | null): Goal {
  const current =
    r.metric === 'weight_kg' ? latest?.weight_kg ?? null
    : r.metric === 'body_fat_pct' ? latest?.body_fat_pct ?? null
    : r.metric === 'waist_cm' ? latest?.waist_cm ?? null
    : null;

  const overdue =
    r.achieved_on == null && r.target_date != null && r.target_date < todayDate();

  return {
    id: r.id,
    memberId: r.member_id,
    title: r.title,
    metric: r.metric,
    targetValue: r.target_value,
    startValue: r.start_value,
    currentValue: current,
    deadline: r.target_date,
    status: r.achieved_on ? 'achieved' : overdue ? 'overdue' : 'active',
    createdAt: r.created_at,
    achievedAt: r.achieved_on,
  };
}

export const progressService = {
  // ── Body ───────────────────────────────────────────────────────────────────
  async getBodyProgress(memberId: string): Promise<BodyProgressEntry[]> {
    if (!memberId) return [];
    return (await listMeasurements(memberId)).map(toEntry);
  },

  async addBodyProgress(
    memberId: string,
    entry: Partial<Omit<BodyProgressEntry, 'id' | 'memberId'>>
  ): Promise<BodyProgressEntry> {
    const saved = await saveMeasurement({
      member_id: memberId,
      measured_on: entry.date ?? todayDate(),
      weight_kg: entry.weight ?? null,
      height_cm: entry.height ?? null,
      body_fat_pct: entry.bodyFatPct ?? null,
      chest_cm: entry.chest ?? null,
      waist_cm: entry.waist ?? null,
      // Was `hips_cm: null` — a column written as a literal null on every save
      // since 0020, so the field existed and could never hold anything.
      hips_cm: entry.hips ?? null,
      arms_cm: entry.arms ?? null,
      thighs_cm: entry.legs ?? null,
      neck_cm: entry.neck ?? null,
      shoulders_cm: entry.shoulders ?? null,
      forearm_cm: entry.forearms ?? null,
      calf_cm: entry.calves ?? null,
      notes: null,
    });
    return toEntry(saved);
  },

  // ── Workouts ───────────────────────────────────────────────────────────────
  async getWorkoutLogs(memberId: string): Promise<WorkoutLog[]> {
    if (!memberId) return [];
    return (await listWorkoutLogs(memberId)).map(toLog);
  },

  async addWorkoutLog(
    memberId: string,
    log: Partial<Omit<WorkoutLog, 'id' | 'memberId'>>
  ): Promise<WorkoutLog> {
    const saved = await createWorkoutLog({
      member_id: memberId,
      performed_on: log.date ?? todayDate(),
      activity: log.type ?? null,
      duration_minutes: log.duration ?? null,
      notes: log.notes ?? null,
    });
    return toLog(saved);
  },

  // ── Goals ──────────────────────────────────────────────────────────────────
  async getGoals(memberId: string): Promise<Goal[]> {
    if (!memberId) return [];
    const [goals, measurements] = await Promise.all([
      listGoals(memberId),
      listMeasurements(memberId).catch(() => [] as BodyMeasurementRow[]),
    ]);
    const latest = measurements.length ? measurements[measurements.length - 1] : null;
    return goals.map((g) => toGoal(g, latest));
  },

  async addGoal(
    memberId: string,
    goal: { title: string; metric?: string; startValue?: number | null; targetValue?: number | null; deadline?: string | null }
  ): Promise<Goal> {
    const created = await createGoal({
      member_id: memberId,
      title: goal.title,
      metric: goal.metric ?? 'custom',
      start_value: goal.startValue ?? null,
      target_value: goal.targetValue ?? null,
      target_date: goal.deadline ?? null,
    });
    return toGoal(created, null);
  },

  /** Marking a goal achieved is a one-way door — see the column comment in 0020. */
  async markGoalAchieved(goalId: string): Promise<void> {
    await updateGoal(goalId, { achieved_on: todayDate() });
  },

  async deleteGoal(goalId: string): Promise<void> {
    await apiDeleteGoal(goalId);
  },

  // ── Attendance ─────────────────────────────────────────────────────────────
  // Real check-ins from the `attendance` table — the same rows the front desk
  // creates by scanning a QR code. Previously this read MOCK_ATTENDANCE, so a
  // member's Progress tab disagreed with their own Attendance History page.
  async getAttendance(memberId: string): Promise<AttendanceRecord[]> {
    if (!memberId) return [];
    const rows = await listMemberAttendance(memberId);
    return rows.map((r) => {
      const at = new Date(r.check_in_time);
      return {
        id: r.id,
        memberId: r.member_id,
        date: `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`,
        time: `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`,
        method: r.method === 'qr' ? 'QR' : 'Manual',
        activity: r.activity,
      };
    });
  },

  // ── Trainer feedback ───────────────────────────────────────────────────────
  // No dedicated table, and none is needed: a trainer's recommendation already
  // inserts a real `notifications` row. This reads those back rather than
  // duplicating the same message into a second table that could disagree.
  async getTrainerFeedback(memberId: string): Promise<TrainerFeedback[]> {
    if (!memberId) return [];
    const rows = await listNotifications(memberId).catch(() => []);
    return rows
      // Three spellings for one idea: the trainer app writes 'recommendation',
      // while this filter only knew 'trainer_recommendation' and
      // 'trainer_feedback'. A note therefore reached the member's bell and never
      // the Coach tab. All three are matched so existing rows keep working —
      // don't narrow this without migrating the rows already in the table.
      .filter((n) => ['recommendation', 'trainer_recommendation', 'trainer_feedback'].includes(n.type))
      .map((n) => {
        const meta = (n.metadata ?? {}) as { from_trainer_id?: string; from_trainer_name?: string };
        return {
          id: n.id,
          memberId,
          date: n.created_at.slice(0, 10),
          sentAt: n.created_at,
          title: n.title,
          content: n.message,
          // Present only on notes sent after the sender was recorded. Older
          // rows have no metadata, so these stay undefined rather than being
          // filled with a guess about who wrote them.
          trainerId: meta.from_trainer_id,
          trainerName: meta.from_trainer_name,
          read: n.read,
        };
      });
  },
};

// ─── Helpers re-exported for the tabs ────────────────────────────────────────

export const calcBmi = calcBmiValue;

export function bmiLabel(value: number): string {
  return bmiBand(value).label;
}

export function bmiColor(value: number): string {
  return bmiBand(value).color;
}

/**
 * Percentage complete, or null when it can't be known.
 *
 * A goal needs a start, a target and a current reading. Missing any of them,
 * the honest answer is "no idea" — a bar that invents a position is worse than
 * no bar, because it looks like a measurement.
 */
export function goalProgressPct(goal: Goal): number | null {
  if (goal.status === 'achieved') return 100;
  if (goal.startValue == null || goal.targetValue == null || goal.currentValue == null) return null;
  const span = goal.targetValue - goal.startValue;
  if (span === 0) return goal.currentValue === goal.targetValue ? 100 : 0;
  const pct = ((goal.currentValue - goal.startValue) / span) * 100;
  return Math.max(0, Math.min(100, Math.round(pct)));
}
