// Mock trainer feedback + workout plans — replace with API call when backend is ready
// Schemas:
//   trainer_feedback (trainer_id, member_id, date, type, content, workout_plan_id)
//   workout_plans    (id, trainer_id, name, schedule_json)

export type FeedbackType = 'recommendation' | 'comment' | 'improvement' | 'plan';

export interface TrainerFeedback {
  id: string;
  trainerId: string;
  trainerName: string;
  memberId: string;
  date: string;            // YYYY-MM-DD
  type: FeedbackType;
  content: string;
  workoutPlanId?: string;
}

export interface WorkoutPlanDay {
  day: string;             // Monday, Tuesday, ...
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
    memberId: 'eya.lorenzana@email.com',
    name: 'Strength + Cardio Split',
    description: '4-day split focused on strength with cardio finishers.',
    schedule: [
      { day: 'Monday',    exercises: [{ name: 'Squats', sets: 4, reps: 8 }, { name: 'Bench Press', sets: 4, reps: 8 }, { name: 'Treadmill', durationMin: 15 }] },
      { day: 'Tuesday',   exercises: [{ name: 'HIIT', durationMin: 30 }] },
      { day: 'Wednesday', exercises: [{ name: 'Deadlifts', sets: 4, reps: 6 }, { name: 'Pull-ups', sets: 4, reps: 8 }] },
      { day: 'Thursday',  exercises: [{ name: 'Active Recovery', durationMin: 30 }] },
      { day: 'Friday',    exercises: [{ name: 'Overhead Press', sets: 4, reps: 8 }, { name: 'Rows', sets: 4, reps: 10 }, { name: 'Bike', durationMin: 20 }] },
    ],
  },
];

export const MOCK_TRAINER_FEEDBACK: TrainerFeedback[] = [
  {
    id: 'tf-001',
    trainerId: 'trainer-001',
    trainerName: 'Coach Eman',
    memberId: 'eya.lorenzana@email.com',
    date: past(2),
    type: 'recommendation',
    content: 'Add 2 more cardio sessions per week to accelerate fat loss. Try cycling or rowing.',
  },
  {
    id: 'tf-002',
    trainerId: 'trainer-001',
    trainerName: 'Coach Eman',
    memberId: 'eya.lorenzana@email.com',
    date: past(5),
    type: 'comment',
    content: 'Great form on squats today! Keep your core tight at the bottom.',
  },
  {
    id: 'tf-003',
    trainerId: 'trainer-001',
    trainerName: 'Coach Eman',
    memberId: 'eya.lorenzana@email.com',
    date: past(10),
    type: 'improvement',
    content: 'Focus on full range of motion during deadlifts — don’t cut them short.',
  },
  {
    id: 'tf-004',
    trainerId: 'trainer-001',
    trainerName: 'Coach Eman',
    memberId: 'eya.lorenzana@email.com',
    date: past(14),
    type: 'plan',
    content: 'Assigned a 4-day split tailored to your goals.',
    workoutPlanId: 'plan-001',
  },
];
