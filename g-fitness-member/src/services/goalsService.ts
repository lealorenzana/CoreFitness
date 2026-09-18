import { supabase } from '../lib/supabaseClient';
import {
  listGoals, listMeasurements, createGoal, updateGoal, deleteGoal,
  type FitnessGoalRow, type BodyMeasurementRow,
} from '../lib/api/progress';
import { listGoalTemplates, goalProgress, type GoalTemplate } from '../lib/api/goalTemplates';
import { getExerciseHistory, listExercises, type Exercise } from '../lib/api/workoutSets';
import { todayKey } from '../utils/dates';

/**
 * Goals, assembled for the Goals screen (reworked 2026-09-18, with 0087).
 *
 * Four kinds, each with an honest source for "where is it now":
 *
 *   body      weight, body fat or waist — the latest reading that *has* that
 *             number (a later chest-only reading must not blank a weight goal)
 *   strength  a lift — the heaviest finished set for the exercise (0086 sets)
 *   habit     a preset (0055) — counted in SQL over its own window
 *   custom    words only — nothing measures it, so it has no bar
 *
 * The first three are marked reached by `settle_my_goals()` (0087) when the
 * numbers get there, never by hand, because reaching one pays CORE Points. The
 * screen calls it on open, so a goal reached since last time is caught at once.
 */

export type GoalKind = 'body' | 'strength' | 'habit' | 'custom';
export type BodyMetric = 'weight_kg' | 'body_fat_pct' | 'waist_cm';

export const BODY_METRICS: { id: BodyMetric; label: string; unit: string }[] = [
  { id: 'weight_kg', label: 'Body weight', unit: 'kg' },
  { id: 'body_fat_pct', label: 'Body fat', unit: '%' },
  { id: 'waist_cm', label: 'Waist', unit: 'cm' },
];

/** How the goal is doing against its own deadline. Null when no honest claim can be made. */
export type Pace = 'ahead' | 'on_track' | 'behind' | null;

export interface GoalView {
  id: string;
  kind: GoalKind;
  title: string;
  metric: string;
  unit: string;
  /** "Body weight", "Squat", "Build consistency" — what the number is. */
  subject: string;
  startValue: number | null;
  targetValue: number | null;
  currentValue: number | null;
  /** 0–100, or null when there is no real denominator. */
  pct: number | null;
  deadline: string | null;
  createdAt: string;
  achievedOn: string | null;
  overdue: boolean;
  pace: Pace;
  /** "Oct 30" — when the current rate would reach the target, or null. */
  projected: string | null;
  /** For a habit goal, the rule in words. */
  measuredAs: string | null;
  exerciseId: string | null;
}

export interface GoalsSnapshot {
  goals: GoalView[];
  /** How many were marked reached just now, by opening the screen. */
  justReached: number;
  templates: GoalTemplate[];
  exercises: Exercise[];
  /** Latest value per body metric, to prefill a new goal's start. */
  latestBody: Record<BodyMetric, number | null>;
}

const DAY = 86_400_000;
const at = (key: string) => new Date(`${key}T00:00:00`).getTime();
const short = (t: number) => new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

function bodyValue(m: BodyMeasurementRow, metric: BodyMetric): number | null {
  const v = metric === 'weight_kg' ? m.weight_kg : metric === 'body_fat_pct' ? m.body_fat_pct : m.waist_cm;
  return v == null ? null : Number(v);
}

/**
 * Pace and projection from a series of (day, value) readings.
 *
 * Pace compares the share of the way already covered with the share of the
 * time already used — so "40% there, 60% of the time gone" is behind. It needs
 * a start, a target and a deadline; without them it says nothing.
 *
 * The projection draws a straight line through the readings since the goal was
 * set (the start value counts as the first), and only when that line is moving
 * towards the target. A flat or backwards trend gives no date, never a
 * far-future one that reads as a promise.
 */
function paceOf(
  g: { startValue: number | null; targetValue: number | null; deadline: string | null; createdAt: string; pct: number | null },
  series: { t: number; v: number }[],
  now: number,
): { pace: Pace; projected: string | null } {
  let pace: Pace = null;
  if (g.pct != null && g.deadline && g.startValue != null && g.targetValue != null) {
    const start = at(g.createdAt.slice(0, 10));
    const end = at(g.deadline);
    if (end > start) {
      const timeUsed = Math.min(1, Math.max(0, (now - start) / (end - start)));
      const diff = g.pct / 100 - timeUsed;
      pace = diff > 0.1 ? 'ahead' : diff < -0.1 ? 'behind' : 'on_track';
    }
  }

  let projected: string | null = null;
  if (g.targetValue != null && series.length >= 2) {
    const first = series[0];
    const last = series[series.length - 1];
    const days = (last.t - first.t) / DAY;
    if (days >= 1) {
      const rate = (last.v - first.v) / days;
      const remaining = g.targetValue - last.v;
      if (rate !== 0 && Math.sign(rate) === Math.sign(remaining)) {
        const eta = last.t + (remaining / rate) * DAY;
        if (eta - now < 3 * 365 * DAY) projected = short(Math.max(eta, now));
      }
    }
  }
  return { pace, projected };
}

function pctOf(start: number | null, target: number | null, current: number | null): number | null {
  if (start == null || target == null || current == null) return null;
  const span = target - start;
  if (span === 0) return current === target ? 100 : 0;
  return Math.max(0, Math.min(100, Math.round(((current - start) / span) * 100)));
}

export async function loadGoals(memberId: string): Promise<GoalsSnapshot> {
  // Settle first, so the list below already shows anything just reached.
  const settled = await supabase.rpc('settle_my_goals');
  const justReached = settled.error ? 0 : Number(settled.data ?? 0);

  const [rows, measurements, templates, exercises] = await Promise.all([
    listGoals(memberId),
    listMeasurements(memberId).catch(() => [] as BodyMeasurementRow[]),
    listGoalTemplates().catch(() => [] as GoalTemplate[]),
    listExercises().catch(() => [] as Exercise[]),
  ]);

  const latestBody = {} as Record<BodyMetric, number | null>;
  for (const m of BODY_METRICS) {
    let v: number | null = null;
    for (let i = measurements.length - 1; i >= 0 && v == null; i--) v = bodyValue(measurements[i], m.id);
    latestBody[m.id] = v;
  }

  // One history read per exercise a strength goal points at.
  const liftIds = [...new Set(rows.filter((r) => r.metric === 'lift_kg' && r.exercise_id).map((r) => r.exercise_id as string))];
  const liftHistory = new Map<string, { t: number; v: number }[]>();
  await Promise.all(liftIds.map(async (id) => {
    const h = await getExerciseHistory(memberId, id).catch(() => []);
    liftHistory.set(id, h.map((p) => ({ t: at(p.performedOn), v: p.topWeightKg })));
  }));

  const now = Date.now();
  const today = todayKey();

  const goals = await Promise.all(rows.map(async (r: FitnessGoalRow): Promise<GoalView> => {
    const start = r.start_value == null ? null : Number(r.start_value);
    const target = r.target_value == null ? null : Number(r.target_value);
    const base = {
      id: r.id, title: r.title, metric: r.metric, startValue: start, targetValue: target,
      deadline: r.target_date, createdAt: r.created_at, achievedOn: r.achieved_on,
      overdue: r.achieved_on == null && r.target_date != null && r.target_date < today,
      exerciseId: r.exercise_id ?? null,
    };
    const createdAt = at(r.created_at.slice(0, 10));

    if (r.template_key) {
      const t = templates.find((x) => x.key === r.template_key) ?? null;
      const count = await goalProgress(r.id);
      const pct = count == null || target == null || target <= 0
        ? null : Math.min(100, Math.round((count / target) * 100));
      return {
        ...base, kind: 'habit', unit: '', subject: t?.label ?? 'Habit',
        currentValue: count, pct: r.achieved_on ? 100 : pct,
        pace: null, projected: null, measuredAs: t?.measuredAs ?? null,
      };
    }

    if (r.metric === 'lift_kg') {
      const series = r.exercise_id ? liftHistory.get(r.exercise_id) ?? [] : [];
      const best = series.length ? Math.max(...series.map((p) => p.v)) : null;
      const pct = r.achieved_on ? 100 : pctOf(start, target, best);
      // Running best since the goal was set — a lift's progress is its record.
      let run = start ?? -Infinity;
      const since = series.filter((p) => p.t >= createdAt).map((p) => { run = Math.max(run, p.v); return { t: p.t, v: run }; });
      const withStart = start != null ? [{ t: createdAt, v: start }, ...since] : since;
      const ex = exercises.find((e) => e.id === r.exercise_id);
      return {
        ...base, kind: 'strength', unit: 'kg', subject: ex?.name ?? 'Lift', currentValue: best, pct,
        ...(r.achieved_on ? { pace: null, projected: null } : paceOf({ ...base, pct }, withStart, now)),
        measuredAs: null,
      };
    }

    const bodyMetric = BODY_METRICS.find((m) => m.id === r.metric);
    if (bodyMetric) {
      const current = latestBody[bodyMetric.id];
      const pct = r.achieved_on ? 100 : pctOf(start, target, current);
      const since = measurements
        .map((m) => ({ t: at(m.measured_on), v: bodyValue(m, bodyMetric.id) }))
        .filter((p): p is { t: number; v: number } => p.v != null && p.t >= createdAt);
      const withStart = start != null ? [{ t: createdAt, v: start }, ...since] : since;
      return {
        ...base, kind: 'body', unit: bodyMetric.unit, subject: bodyMetric.label, currentValue: current, pct,
        ...(r.achieved_on ? { pace: null, projected: null } : paceOf({ ...base, pct }, withStart, now)),
        measuredAs: null,
      };
    }

    return {
      ...base, kind: 'custom', unit: '', subject: 'Personal goal', currentValue: null,
      pct: r.achieved_on ? 100 : null, pace: null, projected: null, measuredAs: null,
    };
  }));

  return { goals, justReached, templates, exercises, latestBody };
}

export interface NewGoal {
  kind: GoalKind;
  title: string;
  metric?: BodyMetric;
  exerciseId?: string;
  templateKey?: string;
  startValue?: number | null;
  targetValue?: number | null;
  deadline?: string | null;
}

export async function addGoal(memberId: string, g: NewGoal): Promise<void> {
  if (g.kind === 'habit') {
    const { error } = await supabase.from('fitness_goals').insert({
      member_id: memberId, title: g.title, metric: 'custom',
      template_key: g.templateKey, target_value: g.targetValue ?? null, target_date: g.deadline ?? null,
    });
    if (error) throw error;
    return;
  }
  // A lift goal with no start given starts at the member's best so far, so the
  // bar has a real denominator from day one. No history leaves it empty.
  let start = g.startValue ?? null;
  if (g.kind === 'strength' && start == null && g.exerciseId) {
    const h = await getExerciseHistory(memberId, g.exerciseId).catch(() => []);
    start = h.length ? Math.max(...h.map((p) => p.topWeightKg)) : null;
  }
  await createGoal({
    member_id: memberId,
    title: g.title,
    metric: g.kind === 'body' ? (g.metric as string) : g.kind === 'strength' ? 'lift_kg' : 'custom',
    exercise_id: g.kind === 'strength' ? g.exerciseId ?? null : null,
    start_value: start,
    target_value: g.targetValue ?? null,
    target_date: g.deadline ?? null,
  });
}

export async function editGoal(id: string, p: { title: string; targetValue: number | null; deadline: string | null }): Promise<void> {
  await updateGoal(id, { title: p.title, target_value: p.targetValue, target_date: p.deadline });
}

/** Only a custom goal is ticked by hand — the others settle themselves (0087). */
export async function markCustomDone(id: string): Promise<void> {
  await updateGoal(id, { achieved_on: todayKey() });
}

export async function removeGoal(id: string): Promise<void> {
  await deleteGoal(id);
}
