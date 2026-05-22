/**
 * Dashboard service — single point of truth for analytics data.
 * Replace the mock-data imports below with real fetch/axios calls when
 * the backend is wired up. Components stay untouched.
 */
import {
  REVENUE_BY_YEAR,
  NEW_MEMBERS_BY_YEAR,
  WEEKLY_ATTENDANCE,
  MONTHLY_ATTENDANCE,
  ATTENDANCE_HEATMAP,
  TOP_TRAINERS,
  PROGRESS_KPIS,
  type RevenuePoint,
  type MembersPoint,
  type AttendancePt,
  type HeatmapCell,
  type TopTrainer,
  type ProgressKpis,
} from '../data/mockDashboard';

const delay = <T>(value: T, ms = 200): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(value), ms));

export const dashboardService = {
  async getRevenueByYear(year: string): Promise<RevenuePoint[]> {
    return delay(REVENUE_BY_YEAR[year] ?? []);
  },

  async getNewMembersByYear(year: string): Promise<MembersPoint[]> {
    return delay(NEW_MEMBERS_BY_YEAR[year] ?? []);
  },

  async getAttendance(scope: 'weekly' | 'monthly'): Promise<AttendancePt[]> {
    return delay(scope === 'weekly' ? WEEKLY_ATTENDANCE : MONTHLY_ATTENDANCE);
  },

  async getAttendanceHeatmap(): Promise<HeatmapCell[]> {
    return delay(ATTENDANCE_HEATMAP);
  },

  async getTopTrainers(): Promise<TopTrainer[]> {
    return delay(TOP_TRAINERS);
  },

  async getProgressKpis(): Promise<ProgressKpis> {
    return delay(PROGRESS_KPIS);
  },

  /** Available years for the year-filter dropdown. */
  getYears(): string[] {
    return Object.keys(REVENUE_BY_YEAR);
  },
};

export type { RevenuePoint, MembersPoint, AttendancePt, HeatmapCell, TopTrainer, ProgressKpis };
