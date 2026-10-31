import type { Icon } from '@phosphor-icons/react';
import {
  Barbell,
  Bell, CalendarBlank, ClockCountdown, House, Trophy, User, UsersThree,
} from '@phosphor-icons/react';
import { visibleDestinations, type Destination, type WordReader } from './memberNav';
import { hasOwnWords, moduleOn, word, type FeatureKey, type GymApp } from '../../lib/gymApp';

/**
 * The trainer app's navigation, in one place — the trainer counterpart of
 * `memberNav.ts`, so the bar, the header rail and the tab lighting cannot drift
 * apart (the failure `memberNav.ts` documents).
 *
 * **Every destination here is an existing `/trainer` route.** Nothing in this
 * file creates a screen.
 */

export type TrainerTabId = 'home' | 'schedule' | 'profile';

export interface TrainerTab {
  id: TrainerTabId;
  label: string;
  path: string;
  icon: Icon;
  /** Small caps line under the title. */
  eyebrow: string;
  /**
   * Rebuilds `label` and `eyebrow` from this gym's own nouns when it renamed
   * any of them (0114) — the same shape as a member Destination's `words`.
   * The plain strings stay the default and are what ship for every gym that
   * renamed nothing.
   */
  words?: (w: WordReader) => { label?: string; eyebrow?: string };
  /** The switch this tab belongs to (0110/0141). A gym that does not run it gets no tab. */
  module?: FeatureKey;
}

export const TRAINER_TABS: TrainerTab[] = [
  { id: 'home', label: 'Home', path: '/trainer/home', icon: House, eyebrow: 'Your coaching day' },
  // Personal training, packages and each trainee's place live under the hub (simplify, 2026-10-28).
  // Schedule holds sessions and hours, so no switch hides it.
  { id: 'schedule', label: 'Schedule', path: '/trainer/schedule', icon: CalendarBlank, eyebrow: 'Sessions and hours' },
  { id: 'profile', label: 'Profile', path: '/trainer/profile', icon: User, eyebrow: 'Account and ratings' },
];

/**
 * Every path that lights each tab, **one row per tab, in `TRAINER_TABS` order**
 * — the same load-bearing order as `memberNav.ts`. Longest prefix wins.
 */
const TRAINER_TAB_PATHS: string[][] = [
  ['/trainer/home', '/trainer/notifications', '/trainer/messages', '/trainer/pt', '/trainer/packages',
   '/trainer/rooms', '/trainer/members'],
  ['/trainer/schedule', '/trainer/availability'],
  ['/trainer/profile', '/trainer/settings', '/trainer/achievements',
   '/trainer/change-password', '/trainer/change-email'],
];

/** The tab a path belongs to, or null. */
export function trainerTabForPath(pathname: string): TrainerTabId | null {
  if (import.meta.env.DEV && TRAINER_TAB_PATHS.length !== TRAINER_TABS.length) {
    console.error(`trainerNav: ${TRAINER_TAB_PATHS.length} path rows for ${TRAINER_TABS.length} tabs`);
  }
  let best: TrainerTabId | null = null;
  let bestLen = -1;
  for (let i = 0; i < TRAINER_TAB_PATHS.length; i++) {
    for (const p of TRAINER_TAB_PATHS[i]) {
      if ((pathname === p || pathname.startsWith(`${p}/`)) && p.length > bestLen) {
        best = TRAINER_TABS[i].id;
        bestLen = p.length;
      }
    }
  }
  return best;
}

/** The tab whose root this exact path is, or null on a pushed screen. */
export function trainerTabRootFor(pathname: string): TrainerTab | null {
  return TRAINER_TABS.find((t) => t.path === pathname) ?? null;
}

/** A tab's rail, filtered to what the gym runs. */
export function trainerRail(id: TrainerTabId, app: GymApp | null): Destination[] {
  return visibleDestinations(TRAINER_RAILS[id], app);
}

/** Each tab's rail: the screens under it the bar does not carry. Empty draws none. */
export const TRAINER_RAILS: Record<TrainerTabId, Destination[]> = {
  home: [
    { label: 'Updates', path: '/trainer/notifications', icon: Bell },
    // Coaching terms (0181): requests, Received, trainees and until when.
    { label: 'Packages', path: '/trainer/packages', icon: UsersThree, module: 'coaching' },
    { label: 'Equipment', path: '/trainer/equipment', icon: Barbell, module: 'equipment' },
    { label: 'Bookable hours', path: '/trainer/schedule?tab=hours', icon: ClockCountdown },
    // The gym's exercise guides (0121) — a coach writes them between sessions.
    { label: 'Exercises', path: '/trainer/exercises', icon: Barbell },
    { label: 'Achievements', path: '/trainer/achievements', icon: Trophy, module: 'engagement' },
  ],
  // Schedule leads with its own Bookable hours panel, so a pill would repeat it.
  schedule: [],
  // Schedule · Hours · Coaching · Library · Settings ride on the profile's toolbar (TrainerToolbar).
  // The profile's screens moved to the You sheet (redesign, 2026-10-27).
  profile: [],
};

/**
 * The five tabs, in this gym's words (0114).
 *
 * Skipped entirely when the gym renamed nothing, so the exported constant is
 * the object that ships for almost every gym and nothing re-renders for a
 * substitution that would change no characters.
 */
export function trainerTabs(app: GymApp | null): TrainerTab[] {
  // A tab for something the gym does not run is not drawn (0110/0141).
  const running = TRAINER_TABS.filter((tab) => moduleOn(app, tab.module));
  if (!hasOwnWords(app)) return running;
  return running.map((tab) => {
    if (!tab.words) return tab;
    const next = tab.words((k, title) => word(app, k, title));
    return { ...tab, ...(next.label ? { label: next.label } : {}),
             ...(next.eyebrow ? { eyebrow: next.eyebrow } : {}) };
  });
}
