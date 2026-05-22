// Mock workout logs — replace with API call when backend is ready
// Schema: workout_logs (member_id, date, type, duration, calories, completed, is_pr)

export type WorkoutType =
  | 'Strength Training' | 'HIIT' | 'Yoga' | 'Boxing'
  | 'CrossFit' | 'Cardio' | 'Stretching';

export interface WorkoutLog {
  id: string;
  memberId: string;
  date: string;            // YYYY-MM-DD
  type: WorkoutType;
  duration: number;        // minutes
  calories: number;
  completed: boolean;
  isPr: boolean;           // personal record flag
  notes?: string;
  weightKg?: number;       // heaviest lift this session
  cardioMinutes?: number;
}

const today = new Date();
const dayOffset = (n: number) =>
  new Date(today.getTime() - n * 86400000).toISOString().split('T')[0];

export const MOCK_WORKOUT_LOGS: WorkoutLog[] = [
  { id: 'w-001', memberId: 'eya.lorenzana@email.com', date: dayOffset(0),  type: 'Strength Training', duration: 60, calories: 420, completed: true, isPr: true,  weightKg: 70 },
  { id: 'w-002', memberId: 'eya.lorenzana@email.com', date: dayOffset(1),  type: 'HIIT',              duration: 45, calories: 480, completed: true, isPr: false },
  { id: 'w-003', memberId: 'eya.lorenzana@email.com', date: dayOffset(2),  type: 'Cardio',            duration: 50, calories: 380, completed: true, isPr: false, cardioMinutes: 50 },
  { id: 'w-004', memberId: 'eya.lorenzana@email.com', date: dayOffset(3),  type: 'Yoga',              duration: 45, calories: 200, completed: true, isPr: false },
  { id: 'w-005', memberId: 'eya.lorenzana@email.com', date: dayOffset(4),  type: 'Strength Training', duration: 55, calories: 410, completed: true, isPr: false, weightKg: 65 },
  { id: 'w-006', memberId: 'eya.lorenzana@email.com', date: dayOffset(6),  type: 'Boxing',            duration: 50, calories: 510, completed: true, isPr: false },
  { id: 'w-007', memberId: 'eya.lorenzana@email.com', date: dayOffset(8),  type: 'HIIT',              duration: 40, calories: 440, completed: true, isPr: false },
  { id: 'w-008', memberId: 'eya.lorenzana@email.com', date: dayOffset(10), type: 'CrossFit',          duration: 60, calories: 530, completed: true, isPr: false },
  { id: 'w-009', memberId: 'eya.lorenzana@email.com', date: dayOffset(12), type: 'Cardio',            duration: 60, calories: 450, completed: true, isPr: true,  cardioMinutes: 60 },
  { id: 'w-010', memberId: 'eya.lorenzana@email.com', date: dayOffset(14), type: 'Strength Training', duration: 65, calories: 460, completed: true, isPr: false, weightKg: 68 },
  { id: 'w-011', memberId: 'eya.lorenzana@email.com', date: dayOffset(16), type: 'Yoga',              duration: 60, calories: 240, completed: true, isPr: false },
  { id: 'w-012', memberId: 'eya.lorenzana@email.com', date: dayOffset(18), type: 'HIIT',              duration: 45, calories: 470, completed: true, isPr: false },
  { id: 'w-013', memberId: 'eya.lorenzana@email.com', date: dayOffset(21), type: 'Strength Training', duration: 60, calories: 430, completed: true, isPr: false, weightKg: 65 },
  { id: 'w-014', memberId: 'eya.lorenzana@email.com', date: dayOffset(24), type: 'Boxing',            duration: 50, calories: 500, completed: true, isPr: false },
  { id: 'w-015', memberId: 'eya.lorenzana@email.com', date: dayOffset(28), type: 'Cardio',            duration: 45, calories: 360, completed: true, isPr: false, cardioMinutes: 45 },
];
