// Mock home-dashboard data — replace with API calls when backend is ready.

export interface HomeQuickStat {
  id: string;
  label: string;
  value: number;
  goal: number;
  unit?: string;
}

export interface UpcomingClass {
  id: string;
  className: string;
  trainer: string;
  time: string;       // 'Mon, 10:30 AM' style display string
  day: string;        // 'Monday'
  location: string;
}

export const MOCK_HOME_QUICK_STATS: HomeQuickStat[] = [
  { id: 'workouts', label: 'Weekly Workouts', value: 3, goal: 5 },
  { id: 'calories', label: 'Calories',         value: 1850, goal: 2400, unit: 'kcal' },
  { id: 'streak',   label: 'Streak',           value: 4, goal: 7, unit: 'days' },
];

export const MOCK_UPCOMING_CLASS: UpcomingClass = {
  id: 'upcoming-1',
  className: 'Morning HIIT',
  trainer: 'Coach Maria',
  time: '6:00 AM',
  day: 'Tomorrow',
  location: 'Studio A',
};
