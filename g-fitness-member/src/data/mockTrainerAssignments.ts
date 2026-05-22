// Mock list of members assigned to each trainer.
// Replace with real API call when backend is ready.

export interface AssignedMember {
  id: string;
  name: string;
  email: string;
  membershipType: 'Basic' | 'Standard' | 'Premium';
  goalSummary: string;        // short headline goal
  attendanceThisMonth: number;
  workoutsThisMonth: number;
  weightChangeKg: number;     // negative = lost, positive = gained
}

export interface TrainerAssignment {
  trainerId: string;
  trainerName: string;
  members: AssignedMember[];
}

// Keyed by trainer ID — matches /data/trainers.ts
export const MOCK_TRAINER_ASSIGNMENTS: TrainerAssignment[] = [
  {
    trainerId: 'T001',
    trainerName: 'Coach Mike Santos',
    members: [
      { id: 'mem-001', name: 'Eya Lorenzana',  email: 'eya.lorenzana@email.com', membershipType: 'Premium',  goalSummary: 'Lose 5 kg, build strength', attendanceThisMonth: 12, workoutsThisMonth: 14, weightChangeKg: -3.2 },
      { id: 'mem-002', name: 'Juan Dela Cruz', email: 'juan@email.com',          membershipType: 'Standard', goalSummary: 'Increase deadlift PR',     attendanceThisMonth: 10, workoutsThisMonth: 11, weightChangeKg: -1.4 },
      { id: 'mem-003', name: 'Maria Santos',   email: 'maria@email.com',         membershipType: 'Premium',  goalSummary: 'Marathon prep',           attendanceThisMonth: 18, workoutsThisMonth: 20, weightChangeKg: -2.0 },
    ],
  },
  {
    trainerId: 'T002',
    trainerName: 'Coach Sarah Reyes',
    members: [
      { id: 'mem-004', name: 'Ana Garcia',  email: 'ana@email.com',  membershipType: 'Premium',  goalSummary: 'Yoga & flexibility', attendanceThisMonth: 8, workoutsThisMonth: 9,  weightChangeKg: 0.5 },
      { id: 'mem-005', name: 'Pedro Reyes', email: 'pedro@email.com', membershipType: 'Basic',    goalSummary: 'Stress relief',     attendanceThisMonth: 6, workoutsThisMonth: 7,  weightChangeKg: -0.3 },
    ],
  },
  {
    trainerId: 'T003',
    trainerName: 'Coach John Cruz',
    members: [
      { id: 'mem-006', name: 'Carlos Mendoza', email: 'carlos@email.com', membershipType: 'Standard', goalSummary: 'Fat loss',          attendanceThisMonth: 14, workoutsThisMonth: 16, weightChangeKg: -4.1 },
      { id: 'mem-007', name: 'Elena Rivera',   email: 'elena@email.com',  membershipType: 'Standard', goalSummary: 'Cardio endurance', attendanceThisMonth: 11, workoutsThisMonth: 13, weightChangeKg: -1.8 },
    ],
  },
  {
    trainerId: 'T004',
    trainerName: 'Coach Maria Lopez',
    members: [
      { id: 'mem-008', name: 'Rosa Torres',     email: 'rosa@email.com',     membershipType: 'Premium', goalSummary: 'Body recomposition', attendanceThisMonth: 16, workoutsThisMonth: 18, weightChangeKg: -2.7 },
      { id: 'mem-009', name: 'Miguel Ramos',    email: 'miguel@email.com',   membershipType: 'Premium', goalSummary: 'Muscle gain',       attendanceThisMonth: 20, workoutsThisMonth: 22, weightChangeKg: 1.5 },
      { id: 'mem-010', name: 'Carmen Flores',   email: 'carmen@email.com',   membershipType: 'Standard', goalSummary: 'Functional fitness', attendanceThisMonth: 9, workoutsThisMonth: 10, weightChangeKg: -0.7 },
    ],
  },
];

export const getMembersForTrainer = (trainerId: string): AssignedMember[] =>
  MOCK_TRAINER_ASSIGNMENTS.find((a) => a.trainerId === trainerId)?.members ?? [];
