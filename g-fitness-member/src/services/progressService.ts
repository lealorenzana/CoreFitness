/**
 * Progress service — single point of truth for progress-related data.
 *
 * Currently reads from:
 *   - mock data files (./data/mock*)
 *   - localStorage     (for any user-created entries during the prototype)
 *
 * When the backend is ready, only this file needs to be replaced with real
 * fetch/axios calls. Component code stays untouched.
 */

import { MOCK_BODY_PROGRESS, type BodyProgressEntry } from '../data/mockBodyProgress';
import { MOCK_WORKOUT_LOGS,  type WorkoutLog }        from '../data/mockWorkoutLogs';
import { MOCK_GOALS,         type Goal }              from '../data/mockGoals';
import { ALL_BADGES, MOCK_MEMBER_BADGES, type Badge, type MemberBadge } from '../data/mockBadges';
import { MOCK_PROGRESS_PHOTOS, type ProgressPhoto } from '../data/mockProgressPhotos';
import { MOCK_TRAINER_FEEDBACK, MOCK_WORKOUT_PLANS, type TrainerFeedback, type WorkoutPlan } from '../data/mockTrainerFeedback';
import { MOCK_ATTENDANCE,    type AttendanceRecord } from '../data/mockAttendance';

const STORAGE = {
  body:       (m: string) => `progress_body_${m}`,
  workouts:   (m: string) => `progress_workouts_${m}`,
  goals:      (m: string) => `progress_goals_${m}`,
  photos:     (m: string) => `progress_photos_${m}`,
  badges:     (m: string) => `progress_badges_${m}`,
  attendance: (m: string) => `progress_attendance_${m}`,
};

// Tiny network simulation for skeleton-loader UX
const delay = <T>(value: T, ms = 250): Promise<T> =>
  new Promise(resolve => setTimeout(() => resolve(value), ms));

const readJson = <T>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
};
const writeJson = (key: string, value: unknown) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
};

// ── Body Progress ────────────────────────────────────────────────────────────
export const progressService = {
  async getBodyProgress(memberId: string): Promise<BodyProgressEntry[]> {
    const seed = MOCK_BODY_PROGRESS.filter(b => b.memberId === memberId);
    const local = readJson<BodyProgressEntry[]>(STORAGE.body(memberId), []);
    const merged = [...seed, ...local].sort((a, b) => a.date.localeCompare(b.date));
    return delay(merged);
  },

  async addBodyProgress(memberId: string, entry: Omit<BodyProgressEntry, 'id' | 'memberId'>): Promise<BodyProgressEntry> {
    const local = readJson<BodyProgressEntry[]>(STORAGE.body(memberId), []);
    const created: BodyProgressEntry = { id: `bp-${Date.now()}`, memberId, ...entry };
    writeJson(STORAGE.body(memberId), [...local, created]);
    return delay(created, 100);
  },

  // ── Workout Logs ─────────────────────────────────────────────────────────
  async getWorkoutLogs(memberId: string): Promise<WorkoutLog[]> {
    const seed  = MOCK_WORKOUT_LOGS.filter(w => w.memberId === memberId);
    const local = readJson<WorkoutLog[]>(STORAGE.workouts(memberId), []);
    return delay([...local, ...seed].sort((a, b) => b.date.localeCompare(a.date)));
  },

  async addWorkoutLog(memberId: string, log: Omit<WorkoutLog, 'id' | 'memberId'>): Promise<WorkoutLog> {
    const local = readJson<WorkoutLog[]>(STORAGE.workouts(memberId), []);
    const created: WorkoutLog = { id: `w-${Date.now()}`, memberId, ...log };
    writeJson(STORAGE.workouts(memberId), [created, ...local]);
    return delay(created, 100);
  },

  // ── Goals ────────────────────────────────────────────────────────────────
  async getGoals(memberId: string): Promise<Goal[]> {
    const seed  = MOCK_GOALS.filter(g => g.memberId === memberId);
    const local = readJson<Goal[]>(STORAGE.goals(memberId), []);
    return delay([...local, ...seed]);
  },

  async addGoal(memberId: string, goal: Omit<Goal, 'id' | 'memberId' | 'createdAt' | 'status' | 'currentValue'>): Promise<Goal> {
    const local = readJson<Goal[]>(STORAGE.goals(memberId), []);
    const created: Goal = {
      id: `g-${Date.now()}`,
      memberId,
      currentValue: 0,
      status: 'in_progress',
      createdAt: new Date().toISOString().split('T')[0],
      ...goal,
    };
    writeJson(STORAGE.goals(memberId), [created, ...local]);
    return delay(created, 100);
  },

  async updateGoalProgress(memberId: string, goalId: string, currentValue: number): Promise<void> {
    const local = readJson<Goal[]>(STORAGE.goals(memberId), []);
    const updated = local.map(g => {
      if (g.id !== goalId) return g;
      const status: Goal['status'] = currentValue >= g.targetValue ? 'achieved' : 'in_progress';
      return {
        ...g,
        currentValue,
        status,
        achievedAt: status === 'achieved' ? new Date().toISOString().split('T')[0] : g.achievedAt,
      };
    });
    writeJson(STORAGE.goals(memberId), updated);
    await delay(undefined, 80);
  },

  async deleteGoal(memberId: string, goalId: string): Promise<void> {
    const local = readJson<Goal[]>(STORAGE.goals(memberId), []);
    writeJson(STORAGE.goals(memberId), local.filter(g => g.id !== goalId));
    await delay(undefined, 80);
  },

  // ── Progress Photos ──────────────────────────────────────────────────────
  async getProgressPhotos(memberId: string): Promise<ProgressPhoto[]> {
    const seed  = MOCK_PROGRESS_PHOTOS.filter(p => p.memberId === memberId);
    const local = readJson<ProgressPhoto[]>(STORAGE.photos(memberId), []);
    return delay([...seed, ...local].sort((a, b) => a.date.localeCompare(b.date)));
  },

  async addProgressPhoto(memberId: string, url: string, label = 'Front'): Promise<ProgressPhoto> {
    const local = readJson<ProgressPhoto[]>(STORAGE.photos(memberId), []);
    const created: ProgressPhoto = {
      id: `p-${Date.now()}`,
      memberId,
      url,
      label,
      date: new Date().toISOString().split('T')[0],
    };
    writeJson(STORAGE.photos(memberId), [...local, created]);
    return delay(created, 100);
  },

  async deleteProgressPhoto(memberId: string, photoId: string): Promise<void> {
    const local = readJson<ProgressPhoto[]>(STORAGE.photos(memberId), []);
    writeJson(STORAGE.photos(memberId), local.filter(p => p.id !== photoId));
    await delay(undefined, 80);
  },

  // ── Badges ───────────────────────────────────────────────────────────────
  async getAllBadges(): Promise<Badge[]> {
    return delay(ALL_BADGES);
  },

  async getMemberBadges(memberId: string): Promise<MemberBadge[]> {
    const seed  = MOCK_MEMBER_BADGES.filter(b => b.memberId === memberId);
    const local = readJson<MemberBadge[]>(STORAGE.badges(memberId), []);
    const dedup = new Map<string, MemberBadge>();
    [...seed, ...local].forEach(b => dedup.set(b.badgeId, b));
    return delay([...dedup.values()]);
  },

  async awardBadge(memberId: string, badgeId: string): Promise<MemberBadge | null> {
    const local = readJson<MemberBadge[]>(STORAGE.badges(memberId), []);
    if ([...local, ...MOCK_MEMBER_BADGES].some(b => b.memberId === memberId && b.badgeId === badgeId)) {
      return null;
    }
    const created: MemberBadge = { memberId, badgeId, earnedAt: new Date().toISOString() };
    writeJson(STORAGE.badges(memberId), [...local, created]);
    return delay(created, 80);
  },

  // ── Trainer Feedback / Workout Plans ─────────────────────────────────────
  async getTrainerFeedback(memberId: string): Promise<TrainerFeedback[]> {
    const local = readJson<TrainerFeedback[]>(`trainer_feedback_${memberId}`, []);
    return delay([...local, ...MOCK_TRAINER_FEEDBACK.filter(f => f.memberId === memberId)]
      .sort((a, b) => b.date.localeCompare(a.date)));
  },

  async addTrainerFeedback(feedback: Omit<TrainerFeedback, 'id'>): Promise<TrainerFeedback> {
    const key = `trainer_feedback_${feedback.memberId}`;
    const local = readJson<TrainerFeedback[]>(key, []);
    const created: TrainerFeedback = { id: `tf-${Date.now()}`, ...feedback };
    writeJson(key, [created, ...local]);
    return delay(created, 100);
  },

  async getWorkoutPlan(planId: string): Promise<WorkoutPlan | undefined> {
    return delay(MOCK_WORKOUT_PLANS.find(p => p.id === planId));
  },

  // ── Attendance ───────────────────────────────────────────────────────────
  async getAttendance(memberId: string): Promise<AttendanceRecord[]> {
    const seed  = MOCK_ATTENDANCE.filter(a => a.memberId === memberId);
    const local = readJson<AttendanceRecord[]>(STORAGE.attendance(memberId), []);
    return delay([...local, ...seed].sort((a, b) => b.date.localeCompare(a.date)));
  },
};

// ── Helpers ──────────────────────────────────────────────────────────────────
export const calcBmi = (heightCm: number, weightKg: number): number => {
  if (!heightCm || !weightKg) return 0;
  const m = heightCm / 100;
  return +(weightKg / (m * m)).toFixed(1);
};

export const bmiLabel = (bmi: number): { label: string; color: string } => {
  if (bmi <= 0)        return { label: '—',           color: 'var(--color-text-muted)' };
  if (bmi < 18.5)      return { label: 'Underweight', color: 'var(--color-primary)' };
  if (bmi < 25)        return { label: 'Normal',      color: 'var(--color-primary)' };
  if (bmi < 30)        return { label: 'Overweight',  color: 'var(--color-secondary)' };
  return                       { label: 'Obese',      color: 'var(--color-secondary)' };
};

export const goalProgressPct = (g: { currentValue: number; targetValue: number }): number => {
  if (g.targetValue <= 0) return 0;
  return Math.min(100, Math.round((g.currentValue / g.targetValue) * 100));
};

// Re-export types so components can import everything from one place.
export type { BodyProgressEntry, WorkoutLog, Goal, Badge, MemberBadge, ProgressPhoto, TrainerFeedback, WorkoutPlan, AttendanceRecord };
