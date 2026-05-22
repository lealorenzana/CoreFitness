// Mock body progress entries — replace with API call when backend is ready
// Schema: body_progress (member_id, date, weight, height, bmi, arms, waist, chest, legs, body_fat_pct)

export interface BodyProgressEntry {
  id: string;
  memberId: string;
  date: string;          // YYYY-MM-DD
  weight: number;        // kg
  height: number;        // cm
  bmi: number;
  arms: number;          // cm
  waist: number;         // cm
  chest: number;         // cm
  legs: number;          // cm
  bodyFatPct: number;    // %
  muscleMassKg?: number;
}

const today = new Date();
const dayOffset = (n: number) =>
  new Date(today.getTime() - n * 86400000).toISOString().split('T')[0];

export const MOCK_BODY_PROGRESS: BodyProgressEntry[] = [
  { id: 'bp-001', memberId: 'eya.lorenzana@email.com', date: dayOffset(60), weight: 78, height: 165, bmi: 28.7, arms: 30, waist: 86, chest: 96, legs: 56, bodyFatPct: 28, muscleMassKg: 28 },
  { id: 'bp-002', memberId: 'eya.lorenzana@email.com', date: dayOffset(45), weight: 76.5, height: 165, bmi: 28.1, arms: 30.5, waist: 84, chest: 96, legs: 57, bodyFatPct: 26.5, muscleMassKg: 28.6 },
  { id: 'bp-003', memberId: 'eya.lorenzana@email.com', date: dayOffset(30), weight: 75, height: 165, bmi: 27.5, arms: 31, waist: 82, chest: 97, legs: 58, bodyFatPct: 25, muscleMassKg: 29.2 },
  { id: 'bp-004', memberId: 'eya.lorenzana@email.com', date: dayOffset(15), weight: 73.5, height: 165, bmi: 27.0, arms: 31.5, waist: 80, chest: 97, legs: 58.5, bodyFatPct: 23.5, muscleMassKg: 29.8 },
  { id: 'bp-005', memberId: 'eya.lorenzana@email.com', date: dayOffset(7),  weight: 72.5, height: 165, bmi: 26.6, arms: 32, waist: 79, chest: 98, legs: 59, bodyFatPct: 22.5, muscleMassKg: 30.4 },
  { id: 'bp-006', memberId: 'eya.lorenzana@email.com', date: dayOffset(0),  weight: 72,   height: 165, bmi: 26.4, arms: 32.5, waist: 78, chest: 98, legs: 59.5, bodyFatPct: 22, muscleMassKg: 30.8 },
];
