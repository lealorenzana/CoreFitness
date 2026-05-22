// Mock goals — replace with API call when backend is ready
// Schema: goals (member_id, type, target_value, current_value, deadline, status)

export type GoalType = 'weight_loss' | 'muscle_gain' | 'attendance' | 'calories';
export type GoalStatus = 'in_progress' | 'achieved' | 'missed';

export interface Goal {
  id: string;
  memberId: string;
  type: GoalType;
  title: string;
  targetValue: number;
  currentValue: number;
  unit: string;
  deadline: string;       // YYYY-MM-DD
  status: GoalStatus;
  createdAt: string;
  achievedAt?: string;
}

const today = new Date();
const future = (n: number) =>
  new Date(today.getTime() + n * 86400000).toISOString().split('T')[0];
const past = (n: number) =>
  new Date(today.getTime() - n * 86400000).toISOString().split('T')[0];

export const MOCK_GOALS: Goal[] = [
  {
    id: 'g-001',
    memberId: 'eya.lorenzana@email.com',
    type: 'weight_loss',
    title: 'Lose 5 kg by next quarter',
    targetValue: 5,
    currentValue: 3,
    unit: 'kg',
    deadline: future(45),
    status: 'in_progress',
    createdAt: past(30),
  },
  {
    id: 'g-002',
    memberId: 'eya.lorenzana@email.com',
    type: 'attendance',
    title: 'Hit gym 20 times this month',
    targetValue: 20,
    currentValue: 12,
    unit: 'visits',
    deadline: future(15),
    status: 'in_progress',
    createdAt: past(15),
  },
  {
    id: 'g-003',
    memberId: 'eya.lorenzana@email.com',
    type: 'calories',
    title: 'Burn 8,000 calories this week',
    targetValue: 8000,
    currentValue: 6420,
    unit: 'kcal',
    deadline: future(3),
    status: 'in_progress',
    createdAt: past(4),
  },
  {
    id: 'g-004',
    memberId: 'eya.lorenzana@email.com',
    type: 'muscle_gain',
    title: 'Gain 2 kg muscle mass',
    targetValue: 2,
    currentValue: 2,
    unit: 'kg',
    deadline: past(5),
    status: 'achieved',
    createdAt: past(60),
    achievedAt: past(7),
  },
];
