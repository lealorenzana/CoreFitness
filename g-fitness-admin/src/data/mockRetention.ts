// Mock retention data — replace with API calls when backend is ready.

export type RiskLevel = 'high' | 'medium' | 'low';

export interface AtRiskMember {
  id: string;
  name: string;
  lastVisit: string;          // YYYY-MM-DD
  daysInactive: number;
  attendanceRate: number;     // 0-100
  riskLevel: RiskLevel;
  membershipType: 'Basic' | 'Standard' | 'Premium';
  joinDate: string;
}

export interface RetentionTrendPoint {
  month: string;              // 'Jan', 'Feb', ...
  rate: number;               // 0-100
}

export interface StaffTask {
  id: string;
  task: string;
  priority: 'high' | 'medium' | 'low';
  due: string;
  done: boolean;
}

export interface MemberPersonalRetention {
  attendanceThisMonth: number;
  attendanceGoal: number;
  streakDays: number;
  memberSince: string;
  membershipStatus: 'Active' | 'Expired' | 'Expiring';
  nextRenewal: string;
  recentActivity: string[];
}

export const MOCK_AT_RISK_MEMBERS: AtRiskMember[] = [
  { id: 'r-001', name: 'Maria Santos',     lastVisit: '2024-05-20', daysInactive: 15, attendanceRate: 25, riskLevel: 'high',   membershipType: 'Premium',  joinDate: '2024-01-15' },
  { id: 'r-002', name: 'Juan Dela Cruz',   lastVisit: '2024-05-28', daysInactive: 7,  attendanceRate: 45, riskLevel: 'medium', membershipType: 'Standard', joinDate: '2024-02-10' },
  { id: 'r-003', name: 'Pedro Reyes',      lastVisit: '2024-05-15', daysInactive: 20, attendanceRate: 15, riskLevel: 'high',   membershipType: 'Basic',    joinDate: '2024-03-05' },
  { id: 'r-004', name: 'Ana Garcia',       lastVisit: '2024-05-30', daysInactive: 5,  attendanceRate: 55, riskLevel: 'low',    membershipType: 'Premium',  joinDate: '2023-12-01' },
  { id: 'r-005', name: 'Carlos Mendoza',   lastVisit: '2024-05-25', daysInactive: 10, attendanceRate: 35, riskLevel: 'medium', membershipType: 'Standard', joinDate: '2024-01-20' },
  { id: 'r-006', name: 'Elena Rivera',     lastVisit: '2024-05-18', daysInactive: 17, attendanceRate: 20, riskLevel: 'high',   membershipType: 'Basic',    joinDate: '2024-02-25' },
  { id: 'r-007', name: 'Jose Reyes',       lastVisit: '2024-05-22', daysInactive: 13, attendanceRate: 30, riskLevel: 'medium', membershipType: 'Standard', joinDate: '2024-04-01' },
];

export const MOCK_RETENTION_TREND: RetentionTrendPoint[] = [
  { month: 'Jan', rate: 85 },
  { month: 'Feb', rate: 88 },
  { month: 'Mar', rate: 90 },
  { month: 'Apr', rate: 89 },
  { month: 'May', rate: 87 },
  { month: 'Jun', rate: 87 },
];

export const MOCK_STAFF_TASKS: StaffTask[] = [
  { id: 's-001', task: 'Follow up with 3 high-risk members',          priority: 'high',   due: 'Today',    done: false },
  { id: 's-002', task: 'Send renewal reminders to 8 expiring members',priority: 'medium', due: 'Tomorrow', done: false },
  { id: 's-003', task: 'Schedule re-engagement calls',                priority: 'medium', due: 'This week', done: false },
  { id: 's-004', task: 'Update attendance records (manual check-ins)',priority: 'low',    due: 'This week', done: false },
];

export const MOCK_MEMBER_RETENTION: MemberPersonalRetention = {
  attendanceThisMonth: 12,
  attendanceGoal: 20,
  streakDays: 4,
  memberSince: 'January 2024',
  membershipStatus: 'Active',
  nextRenewal: 'December 2024',
  recentActivity: [
    'Yoga Flow — Monday',
    'HIIT — Wednesday',
    'Strength Training — Friday',
  ],
};
