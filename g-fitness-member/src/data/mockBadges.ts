// Mock badges + earned member badges — replace with API call when backend is ready
// Schemas:
//   badges          (id, name, icon, trigger_condition)
//   member_badges   (member_id, badge_id, earned_at)

export interface Badge {
  id: string;
  name: string;
  icon: string;            // emoji
  description: string;
  triggerCondition: string;
}

export interface MemberBadge {
  memberId: string;
  badgeId: string;
  earnedAt: string;        // ISO date
}

export const ALL_BADGES: Badge[] = [
  { id: 'b-001', name: '7-Day Streak',         icon: '🔥', description: 'Visited the gym 7 days in a row',           triggerCondition: 'streak >= 7' },
  { id: 'b-002', name: '30-Day Streak',        icon: '⚡', description: 'Visited the gym 30 days in a row',          triggerCondition: 'streak >= 30' },
  { id: 'b-003', name: 'First Workout Logged', icon: '🎯', description: 'Logged your first workout',                 triggerCondition: 'workouts_logged >= 1' },
  { id: 'b-004', name: 'Goal Achieved',        icon: '🏆', description: 'Achieved a fitness goal',                   triggerCondition: 'goal_achieved' },
  { id: 'b-005', name: 'Cardio King',          icon: '👑', description: 'Logged 10 cardio sessions',                 triggerCondition: 'cardio_sessions >= 10' },
  { id: 'b-006', name: 'Heavy Lifter',         icon: '💪', description: 'Set a personal record',                     triggerCondition: 'pr_logged' },
  { id: 'b-007', name: 'Consistent Member',    icon: '⭐', description: '20 visits in a single month',               triggerCondition: 'monthly_visits >= 20' },
  { id: 'b-008', name: 'Transformation',       icon: '📸', description: 'Achieved significant body transformation',  triggerCondition: 'body_transformation' },
];

const today = new Date();
const past = (n: number) => new Date(today.getTime() - n * 86400000).toISOString();

export const MOCK_MEMBER_BADGES: MemberBadge[] = [
  { memberId: 'eya.lorenzana@email.com', badgeId: 'b-001', earnedAt: past(20) },
  { memberId: 'eya.lorenzana@email.com', badgeId: 'b-003', earnedAt: past(60) },
  { memberId: 'eya.lorenzana@email.com', badgeId: 'b-004', earnedAt: past(7) },
  { memberId: 'eya.lorenzana@email.com', badgeId: 'b-006', earnedAt: past(2) },
];
