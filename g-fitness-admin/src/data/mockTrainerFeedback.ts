// Mirrors the member-app schema:
//   trainer_feedback (trainer_id, member_id, date, type, content, workout_plan_id)
//   workout_plans    (id, trainer_id, name, schedule_json)

export type FeedbackType = 'recommendation' | 'comment' | 'improvement' | 'plan';

export interface TrainerFeedback {
  id: string;
  trainerId: string;
  trainerName: string;
  memberId: string;
  memberName: string;
  date: string;            // YYYY-MM-DD
  type: FeedbackType;
  content: string;
  workoutPlanId?: string;
}

export interface WorkoutPlanDay {
  day: string;
  exercises: { name: string; sets?: number; reps?: number; durationMin?: number }[];
}

export interface WorkoutPlan {
  id: string;
  trainerId: string;
  trainerName: string;
  memberId?: string;
  name: string;
  description?: string;
  schedule: WorkoutPlanDay[];
}

const today = new Date();
const past = (n: number) =>
  new Date(today.getTime() - n * 86400000).toISOString().split('T')[0];

export const MOCK_WORKOUT_PLANS: WorkoutPlan[] = [
  {
    id: 'plan-001',
    trainerId: 'trainer-001',
    trainerName: 'Coach Eman',
    memberId: 'mem-001',
    name: 'Strength + Cardio Split',
    description: '4-day split focused on strength with cardio finishers.',
    schedule: [
      { day: 'Monday',    exercises: [{ name: 'Squats', sets: 4, reps: 8 }, { name: 'Bench Press', sets: 4, reps: 8 }] },
      { day: 'Wednesday', exercises: [{ name: 'Deadlifts', sets: 4, reps: 6 }, { name: 'Pull-ups', sets: 4, reps: 8 }] },
      { day: 'Friday',    exercises: [{ name: 'Overhead Press', sets: 4, reps: 8 }, { name: 'Rows', sets: 4, reps: 10 }] },
    ],
  },
];

export const MOCK_TRAINER_FEEDBACK: TrainerFeedback[] = [
  { id: 'tf-001', trainerId: 'trainer-001', trainerName: 'Coach Eman',  memberId: 'mem-001', memberName: 'Juan dela Cruz', date: past(2),  type: 'recommendation', content: 'Add 2 more cardio sessions per week.' },
  { id: 'tf-002', trainerId: 'trainer-001', trainerName: 'Coach Eman',  memberId: 'mem-001', memberName: 'Juan dela Cruz', date: past(5),  type: 'comment',        content: 'Great form on squats today!' },
  { id: 'tf-003', trainerId: 'trainer-002', trainerName: 'Coach Trish', memberId: 'mem-002', memberName: 'Maria Santos',   date: past(3),  type: 'improvement',    content: 'Focus on full ROM during deadlifts.' },
  { id: 'tf-004', trainerId: 'trainer-001', trainerName: 'Coach Eman',  memberId: 'mem-001', memberName: 'Juan dela Cruz', date: past(14), type: 'plan',           content: 'Assigned 4-day split.', workoutPlanId: 'plan-001' },
];
