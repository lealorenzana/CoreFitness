import {
  Award, CalendarCheck, CalendarHeart, ClipboardList, Crown, Dumbbell, Flame, Footprints,
  Gem, Gift, GraduationCap, Handshake, Heart, HeartHandshake, Medal, Moon, Mountain,
  PartyPopper, Repeat, Rocket, Ruler, Shapes, Shield, Smile, Sparkles, Star, Sunrise,
  Swords, Target, ThumbsUp, Timer, Trophy, UserCheck, Users, Zap,
  type LucideIcon,
} from 'lucide-react';

/**
 * The achievement catalogue — the *drawing* half only.
 *
 * **The catalogue itself now lives in the database** (`achievements`, migration
 * 0038), because the gym has to be able to add its own without a developer and
 * a deploy. What stays here is the part a database row cannot hold: the actual
 * React icon components.
 *
 * Before 0038 this file held all 33 definitions and had to be kept in lockstep
 * with an `if` ladder in SQL by hand. That is gone. A row names its icon as a
 * string and `iconByName` resolves it, falling back to a trophy rather than
 * rendering a hole — so an achievement created by an admin on a newer build
 * still draws correctly on an older one.
 *
 * Grading is still entirely server-side: `achievement_unlocks` has no INSERT
 * policy, and nothing in this file can grant anything.
 */

export type AchievementTier = 'bronze' | 'silver' | 'gold' | 'platinum';
export type AchievementRole = 'member' | 'trainer';

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

/**
 * Every icon an achievement may use, by name.
 *
 * The admin app offers exactly these names in its picker. The two lists are
 * duplicated rather than shared — there is no shared package here — so
 * **`npm run check:achievements` verifies that every icon actually stored in
 * the database resolves in this registry.** That check is the thing standing
 * between "admin picked an icon" and "members see a blank badge".
 *
 * Additions are cheap and safe: a name this build does not know falls back to
 * `Award` instead of breaking the screen.
 */
export const ACHIEVEMENT_ICONS: Record<string, LucideIcon> = {
  Award, CalendarCheck, CalendarHeart, ClipboardList, Crown, Dumbbell, Flame, Footprints,
  Gem, Gift, GraduationCap, Handshake, Heart, HeartHandshake, Medal, Moon, Mountain,
  PartyPopper, Repeat, Rocket, Ruler, Shapes, Shield, Smile, Sparkles, Star, Sunrise,
  Swords, Target, ThumbsUp, Timer, Trophy, UserCheck, Users, Zap,
};

/** Sorted for a stable picker order. */
export const ACHIEVEMENT_ICON_NAMES: string[] = Object.keys(ACHIEVEMENT_ICONS).sort();

/** Never returns undefined — an unknown name draws a trophy, not nothing. */
export function iconByName(name: string | null | undefined): LucideIcon {
  return (name && ACHIEVEMENT_ICONS[name]) || Award;
}
