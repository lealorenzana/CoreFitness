import {
  Award, CalendarCheck, CalendarHeart, ClipboardList, Dumbbell, Flame, Footprints,
  Gem, GraduationCap, HeartHandshake, Medal, Moon, Repeat, Ruler, Shapes, Sparkles,
  Star, Sunrise, Target, Trophy, UserCheck, Users, Zap,
  type LucideIcon,
} from 'lucide-react';

/**
 * The achievement catalogue — the *presentation* half.
 *
 * The other half lives in `supabase/migrations/0028_progression_and_achievements.sql`,
 * which decides who has earned what. That split is deliberate: if this file
 * could grant a badge, so could anyone with the anon key and a REST client.
 * Here we only know how to draw one.
 *
 * The two halves are joined by `key`. **Adding an achievement means editing
 * both files** — a key here with no rule in `sync_my_achievements()` is a badge
 * nobody can ever earn, and a rule there with no entry here renders as a blank
 * tile. `npm run check:achievements` diffs the two.
 *
 * `requirement` is the earning rule written out in words. It is not decorative:
 * a locked badge that won't say what it wants is just a tease, and the numbers
 * here are transcribed from the SQL thresholds.
 */

export type AchievementTier = 'bronze' | 'silver' | 'gold' | 'platinum';

export interface AchievementDef {
  key: string;
  title: string;
  /** Past tense, addressed to the person who earned it. */
  description: string;
  /** What it takes — shown while still locked. */
  requirement: string;
  icon: LucideIcon;
  tier: AchievementTier;
  category: string;
}

export const TIER_STYLE: Record<AchievementTier, { ring: string; glow: string; label: string }> = {
  bronze:   { ring: '#C77B3E', glow: 'rgba(199,123,62,0.35)',  label: 'Bronze' },
  silver:   { ring: '#A8B0BE', glow: 'rgba(168,176,190,0.35)', label: 'Silver' },
  gold:     { ring: '#F59E0B', glow: 'rgba(245,158,11,0.40)',  label: 'Gold' },
  platinum: { ring: '#A78BFA', glow: 'rgba(167,139,250,0.40)', label: 'Platinum' },
};

// ─── Member ──────────────────────────────────────────────────────────────────

export const MEMBER_ACHIEVEMENTS: AchievementDef[] = [
  {
    key: 'first_checkin', title: 'First Step', category: 'Getting started', tier: 'bronze', icon: Footprints,
    description: 'You checked in at the gym for the first time.',
    requirement: 'Check in at the front desk once.',
  },
  {
    key: 'days_10', title: 'Getting Into It', category: 'Milestones', tier: 'bronze', icon: Dumbbell,
    description: '10 training days behind you.',
    requirement: 'Train on 10 separate days.',
  },
  {
    key: 'days_25', title: 'Regular', category: 'Milestones', tier: 'silver', icon: CalendarCheck,
    description: '25 training days. This is a habit now.',
    requirement: 'Train on 25 separate days.',
  },
  {
    key: 'days_50', title: 'Half Century', category: 'Milestones', tier: 'gold', icon: Medal,
    description: '50 training days logged.',
    requirement: 'Train on 50 separate days.',
  },
  {
    key: 'days_100', title: 'Centurion', category: 'Milestones', tier: 'platinum', icon: Trophy,
    description: '100 training days. Very few people get here.',
    requirement: 'Train on 100 separate days.',
  },
  {
    key: 'streak_4', title: 'Month of Momentum', category: 'Consistency', tier: 'silver', icon: Flame,
    description: 'Four weeks in a row, twice a week or better.',
    requirement: 'Train at least twice a week, 4 weeks running.',
  },
  {
    key: 'streak_12', title: 'Quarter Strong', category: 'Consistency', tier: 'platinum', icon: Zap,
    description: 'Twelve straight weeks of showing up.',
    requirement: 'Train at least twice a week, 12 weeks running.',
  },
  {
    key: 'early_bird', title: 'Early Bird', category: 'Habits', tier: 'silver', icon: Sunrise,
    description: 'Five sessions done before 7am.',
    requirement: 'Check in before 7:00am on 5 occasions.',
  },
  {
    key: 'night_owl', title: 'Night Owl', category: 'Habits', tier: 'silver', icon: Moon,
    description: 'Five late sessions, after 8pm.',
    requirement: 'Check in at 8:00pm or later on 5 occasions.',
  },
  {
    key: 'weekend_warrior', title: 'Weekend Warrior', category: 'Habits', tier: 'silver', icon: CalendarHeart,
    description: 'Eight weekend training days.',
    requirement: 'Train on 8 Saturdays or Sundays.',
  },
  {
    key: 'all_rounder', title: 'All-Rounder', category: 'Habits', tier: 'bronze', icon: Shapes,
    description: 'You have trained three different ways.',
    requirement: 'Record 3 different activities.',
  },
  {
    key: 'goal_first', title: 'Goal Getter', category: 'Progress', tier: 'bronze', icon: Target,
    description: 'You set a goal and reached it.',
    requirement: 'Reach one of your fitness goals.',
  },
  {
    key: 'goal_three', title: 'Triple Threat', category: 'Progress', tier: 'gold', icon: Star,
    description: 'Three goals set and reached.',
    requirement: 'Reach 3 fitness goals.',
  },
  {
    key: 'measure_first', title: 'Baseline', category: 'Progress', tier: 'bronze', icon: Ruler,
    description: 'You recorded your first measurement.',
    requirement: 'Log a body measurement.',
  },
  {
    key: 'measure_ten', title: 'Tracked', category: 'Progress', tier: 'silver', icon: ClipboardList,
    description: 'Ten measurements — enough to see a real trend.',
    requirement: 'Log 10 body measurements.',
  },
  {
    key: 'class_first', title: 'Joined In', category: 'Training', tier: 'bronze', icon: Users,
    description: 'You attended your first group class.',
    requirement: 'Attend a group class.',
  },
  {
    key: 'class_ten', title: 'Class Regular', category: 'Training', tier: 'gold', icon: HeartHandshake,
    description: 'Ten group classes attended.',
    requirement: 'Attend 10 group classes.',
  },
  {
    key: 'pt_first', title: 'Coached', category: 'Training', tier: 'silver', icon: GraduationCap,
    description: 'You completed a session with a personal trainer.',
    requirement: 'Complete a personal training session.',
  },
  {
    key: 'loyal_six_months', title: 'Half a Year', category: 'Loyalty', tier: 'silver', icon: Repeat,
    description: 'Six months a member of Core Fitness.',
    requirement: 'Stay a member for 6 months.',
  },
  {
    key: 'loyal_one_year', title: 'One of the Family', category: 'Loyalty', tier: 'platinum', icon: Gem,
    description: 'A full year with us.',
    requirement: 'Stay a member for 1 year.',
  },
  {
    key: 'level_intermediate', title: 'Intermediate', category: 'Level', tier: 'gold', icon: Award,
    description: 'You trained your way up to Intermediate.',
    requirement: '20 training days and 6 consistent weeks.',
  },
  {
    key: 'level_advanced', title: 'Advanced', category: 'Level', tier: 'platinum', icon: Sparkles,
    description: 'You reached Advanced. That is a year of real work.',
    requirement: '60 training days and 16 consistent weeks.',
  },
];

// ─── Trainer ─────────────────────────────────────────────────────────────────

export const TRAINER_ACHIEVEMENTS: AchievementDef[] = [
  {
    key: 'coach_open_for_business', title: 'Open for Business', category: 'Setup', tier: 'bronze', icon: CalendarCheck,
    description: 'You published your bookable hours.',
    requirement: 'Add at least one availability window.',
  },
  {
    key: 'coach_full_profile', title: 'Full Profile', category: 'Setup', tier: 'bronze', icon: UserCheck,
    description: 'Specialisation, bio and photo — members know who they are booking.',
    requirement: 'Fill in your specialisation, bio and photo.',
  },
  {
    key: 'coach_first_session', title: 'First Client', category: 'Coaching', tier: 'bronze', icon: GraduationCap,
    description: 'You delivered your first personal training session.',
    requirement: 'Deliver 1 personal training session.',
  },
  {
    key: 'coach_sessions_25', title: 'Twenty-Five Down', category: 'Coaching', tier: 'silver', icon: Dumbbell,
    description: '25 personal training sessions delivered.',
    requirement: 'Deliver 25 personal training sessions.',
  },
  {
    key: 'coach_sessions_100', title: 'Centurion Coach', category: 'Coaching', tier: 'platinum', icon: Trophy,
    description: '100 sessions delivered. A real practice.',
    requirement: 'Deliver 100 personal training sessions.',
  },
  {
    key: 'coach_members_10', title: 'Ten Trained', category: 'Reach', tier: 'silver', icon: Users,
    description: 'Ten different members have trained with you.',
    requirement: 'Train 10 different members.',
  },
  {
    key: 'coach_members_25', title: 'Well Known', category: 'Reach', tier: 'gold', icon: HeartHandshake,
    description: 'Twenty-five different members have trained with you.',
    requirement: 'Train 25 different members.',
  },
  {
    key: 'coach_first_class', title: 'Class Act', category: 'Classes', tier: 'bronze', icon: CalendarHeart,
    description: 'You led your first group class with members in it.',
    requirement: 'Lead 1 attended group class.',
  },
  {
    key: 'coach_classes_50', title: 'Fifty Classes', category: 'Classes', tier: 'gold', icon: Medal,
    description: 'Fifty attended group classes led.',
    requirement: 'Lead 50 attended group classes.',
  },
  {
    key: 'coach_notes_10', title: 'In Their Corner', category: 'Coaching', tier: 'silver', icon: Target,
    description: 'Ten recommendations sent to the members you coach.',
    requirement: 'Send 10 recommendations to members.',
  },
  {
    key: 'coach_one_year', title: 'A Year In', category: 'Loyalty', tier: 'gold', icon: Gem,
    description: 'One year on the Core Fitness team.',
    requirement: 'Be a trainer here for 1 year.',
  },
];

// ─── Lookup ──────────────────────────────────────────────────────────────────

export type AchievementRole = 'member' | 'trainer';

export function catalogFor(role: AchievementRole): AchievementDef[] {
  return role === 'trainer' ? TRAINER_ACHIEVEMENTS : MEMBER_ACHIEVEMENTS;
}

const BY_KEY: Record<string, AchievementDef> = Object.fromEntries(
  [...MEMBER_ACHIEVEMENTS, ...TRAINER_ACHIEVEMENTS].map((a) => [a.key, a])
);

/**
 * Undefined for a key this build doesn't know about — which happens if the
 * database is a migration ahead of the app. Callers skip those rather than
 * rendering an empty tile.
 */
export function achievementByKey(key: string): AchievementDef | undefined {
  return BY_KEY[key];
}

/** Catalogue order, so the gallery groups don't jump around between loads. */
export function categoriesFor(role: AchievementRole): string[] {
  const seen: string[] = [];
  for (const a of catalogFor(role)) if (!seen.includes(a.category)) seen.push(a.category);
  return seen;
}
