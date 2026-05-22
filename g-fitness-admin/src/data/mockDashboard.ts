// Admin Dashboard mock data — replace with API call when backend is ready.

export interface RevenuePoint  { month: string; revenue: number; }
export interface MembersPoint  { month: string; members: number; newMembers: number; }
export interface AttendancePt  { day: string; count: number; }
export interface HeatmapCell   { day: string; hour: string; visits: number; }
export interface TopTrainer    { id: string; name: string; sessions: number; avgRating: number; }
export interface ProgressKpis  {
  avgBmi: number;
  avgWeightChangeKg: number;   // negative = lost
  totalWorkouts: number;
  activeGoals: number;
  totalClasses: number;
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const HOURS = ['6 AM', '9 AM', '12 PM', '3 PM', '6 PM', '9 PM'];

export const REVENUE_BY_YEAR: Record<string, RevenuePoint[]> = {
  '2024': [
    { month: 'Jan', revenue: 45000 }, { month: 'Feb', revenue: 52000 }, { month: 'Mar', revenue: 48000 },
    { month: 'Apr', revenue: 61000 }, { month: 'May', revenue: 55000 }, { month: 'Jun', revenue: 67000 },
    { month: 'Jul', revenue: 72000 }, { month: 'Aug', revenue: 69000 }, { month: 'Sep', revenue: 74000 },
    { month: 'Oct', revenue: 78000 }, { month: 'Nov', revenue: 82000 }, { month: 'Dec', revenue: 91000 },
  ],
  '2025': [
    { month: 'Jan', revenue: 55000 }, { month: 'Feb', revenue: 62000 }, { month: 'Mar', revenue: 58000 },
    { month: 'Apr', revenue: 71000 }, { month: 'May', revenue: 65000 }, { month: 'Jun', revenue: 77000 },
    { month: 'Jul', revenue: 80000 }, { month: 'Aug', revenue: 78000 }, { month: 'Sep', revenue: 84000 },
    { month: 'Oct', revenue: 88000 }, { month: 'Nov', revenue: 92000 }, { month: 'Dec', revenue: 99000 },
  ],
  '2026': [
    { month: 'Jan', revenue: 65000 }, { month: 'Feb', revenue: 72000 }, { month: 'Mar', revenue: 68000 },
    { month: 'Apr', revenue: 81000 }, { month: 'May', revenue: 75000 },
  ],
};

export const NEW_MEMBERS_BY_YEAR: Record<string, MembersPoint[]> = {
  '2024': [
    { month: 'Jan', members: 45,  newMembers: 8 }, { month: 'Feb', members: 52,  newMembers: 7 },
    { month: 'Mar', members: 58,  newMembers: 6 }, { month: 'Apr', members: 65,  newMembers: 7 },
    { month: 'May', members: 71,  newMembers: 6 }, { month: 'Jun', members: 76,  newMembers: 5 },
  ],
  '2025': [
    { month: 'Jan', members: 80,  newMembers: 10 }, { month: 'Feb', members: 88,  newMembers: 8 },
    { month: 'Mar', members: 95,  newMembers: 7 },  { month: 'Apr', members: 102, newMembers: 7 },
    { month: 'May', members: 108, newMembers: 6 },  { month: 'Jun', members: 115, newMembers: 7 },
  ],
  '2026': [
    { month: 'Jan', members: 120, newMembers: 12 }, { month: 'Feb', members: 130, newMembers: 10 },
    { month: 'Mar', members: 138, newMembers: 8 },  { month: 'Apr', members: 145, newMembers: 7 },
    { month: 'May', members: 152, newMembers: 7 },
  ],
};

export const WEEKLY_ATTENDANCE: AttendancePt[] = [
  { day: 'Mon', count: 45 }, { day: 'Tue', count: 52 }, { day: 'Wed', count: 48 },
  { day: 'Thu', count: 61 }, { day: 'Fri', count: 55 }, { day: 'Sat', count: 70 }, { day: 'Sun', count: 38 },
];

export const MONTHLY_ATTENDANCE: AttendancePt[] = [
  { day: 'W1', count: 230 }, { day: 'W2', count: 268 }, { day: 'W3', count: 245 }, { day: 'W4', count: 290 },
];

/** Heatmap: visits per (day-of-week × hour-bucket). */
export const ATTENDANCE_HEATMAP: HeatmapCell[] = (() => {
  const cells: HeatmapCell[] = [];
  // Deterministic but realistic-looking pattern
  const profile = [3, 8, 5, 4, 9, 6]; // hour weights
  const dayMul = [1.0, 1.0, 0.9, 1.1, 1.2, 1.4, 0.6];
  DAYS.forEach((day, dIdx) => {
    HOURS.forEach((hour, hIdx) => {
      const visits = Math.round(profile[hIdx] * dayMul[dIdx] * 4);
      cells.push({ day, hour, visits });
    });
  });
  return cells;
})();

export const TOP_TRAINERS: TopTrainer[] = [
  { id: 'trainer-001', name: 'Coach Eman',  sessions: 342, avgRating: 4.8 },
  { id: 'trainer-002', name: 'Coach Trish', sessions: 428, avgRating: 4.9 },
  { id: 'trainer-004', name: 'Coach Liza',  sessions: 502, avgRating: 4.9 },
  { id: 'trainer-003', name: 'Coach Bong',  sessions: 315, avgRating: 4.7 },
  { id: 'trainer-005', name: 'Coach Mark',  sessions: 287, avgRating: 4.6 },
];

export const PROGRESS_KPIS: ProgressKpis = {
  avgBmi: 23.7,
  avgWeightChangeKg: -1.6,
  totalWorkouts: 1284,
  activeGoals: 87,
  totalClasses: 14,
};
