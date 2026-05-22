// Mock services / membership service catalog — replace with API call later.

export type PlanTier = 'Basic' | 'Standard' | 'Premium';

export interface GymService {
  id: string;
  name: string;
  description: string;
  price: number;
  tier: PlanTier;
  active: boolean;
}

export const MOCK_SERVICES: GymService[] = [
  { id: 'svc-001', name: 'Gym Floor Access', description: 'Open access to all gym equipment.', price: 800,  tier: 'Basic',    active: true },
  { id: 'svc-002', name: 'Group Classes',    description: 'Yoga, HIIT, Zumba, Boxing.',         price: 700,  tier: 'Standard', active: true },
  { id: 'svc-003', name: 'Personal Trainer', description: '4 sessions / month with a coach.',   price: 1500, tier: 'Premium',  active: true },
  { id: 'svc-004', name: 'Sauna & Steam',    description: 'Full access to sauna facilities.',   price: 400,  tier: 'Premium',  active: true },
  { id: 'svc-005', name: 'Locker Rental',    description: 'Permanent locker.',                  price: 150,  tier: 'Standard', active: false },
];
