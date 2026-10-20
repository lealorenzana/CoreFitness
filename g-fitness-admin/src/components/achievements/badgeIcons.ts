import {
  Award, CalendarCheck, CalendarHeart, ClipboardList, Crown, Dumbbell, Flame, Footprints,
  Gem, Gift, GraduationCap, Handshake, Heart, HeartHandshake, Medal, Moon, Mountain,
  PartyPopper, Repeat, Rocket, Ruler, Shapes, Shield, Smile, Sparkles, Star, Sunrise,
  Swords, Target, ThumbsUp, Timer, Trophy, UserCheck, Users, Zap,
  type LucideIcon,
} from 'lucide-react';

/**
 * The badge icons, by the name stored on `achievements.icon`.
 *
 * Duplicated from `g-fitness-member/src/data/achievements.ts` on purpose —
 * there is no shared package here. **Keep the two in step**; the member app's
 * `npm run check:achievements` fails the build if a stored icon name has no
 * component on that side, which is what catches drift.
 */
export const BADGE_ICONS: Record<string, LucideIcon> = {
  Award, CalendarCheck, CalendarHeart, ClipboardList, Crown, Dumbbell, Flame, Footprints,
  Gem, Gift, GraduationCap, Handshake, Heart, HeartHandshake, Medal, Moon, Mountain,
  PartyPopper, Repeat, Rocket, Ruler, Shapes, Shield, Smile, Sparkles, Star, Sunrise,
  Swords, Target, ThumbsUp, Timer, Trophy, UserCheck, Users, Zap,
};
export const BADGE_ICON_NAMES = Object.keys(BADGE_ICONS).sort();
export const badgeIcon = (n: string): LucideIcon => BADGE_ICONS[n] ?? Award;
