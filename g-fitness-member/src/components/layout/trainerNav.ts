import type { Icon } from '@phosphor-icons/react';
import {
  Bell, CalendarBlank, ClockCountdown, GearSix, House, Trophy, User, UserCircle, UsersThree, Tray,
} from '@phosphor-icons/react';
import type { Destination } from './memberNav';

/**
 * The trainer app's navigation, in one place — the trainer counterpart of
 * `memberNav.ts`, so the bar, the header rail and the tab lighting cannot drift
 * apart (the failure `memberNav.ts` documents).
 *
 * **Every destination here is an existing `/trainer` route.** Nothing in this
 * file creates a screen.
 */

export type TrainerTabId = 'home' | 'members' | 'schedule' | 'bookings' | 'profile';

export interface TrainerTab {
  id: TrainerTabId;
  label: string;
  path: string;
  icon: Icon;
  /** Small caps line under the title. */
  eyebrow: string;
}

export const TRAINER_TABS: TrainerTab[] = [
  { id: 'home', label: 'Home', path: '/trainer/home', icon: House, eyebrow: 'Your coaching day' },
  { id: 'members', label: 'Members', path: '/trainer/members', icon: UsersThree, eyebrow: 'Progress and notes' },
  { id: 'schedule', label: 'Schedule', path: '/trainer/schedule', icon: CalendarBlank, eyebrow: 'Classes and hours' },
  { id: 'bookings', label: 'Bookings', path: '/trainer/bookings', icon: Tray, eyebrow: 'Classes and 1-on-1' },
  { id: 'profile', label: 'Profile', path: '/trainer/profile', icon: User, eyebrow: 'Account and ratings' },
];

/**
 * Every path that lights each tab, **one row per tab, in `TRAINER_TABS` order**
 * — the same load-bearing order as `memberNav.ts`. Longest prefix wins.
 */
const TRAINER_TAB_PATHS: string[][] = [
  ['/trainer/home', '/trainer/notifications'],
  ['/trainer/members'],
  ['/trainer/schedule', '/trainer/availability'],
  ['/trainer/bookings'],
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

/** Each tab's rail: the screens under it the bar does not carry. Empty draws none. */
export const TRAINER_RAILS: Record<TrainerTabId, Destination[]> = {
  home: [
    { label: 'Updates', path: '/trainer/notifications', icon: Bell },
    { label: 'Bookable hours', path: '/trainer/availability', icon: ClockCountdown },
    { label: 'Achievements', path: '/trainer/achievements', icon: Trophy },
  ],
  members: [],
  // Schedule leads with its own Bookable hours panel, so a pill would repeat it.
  schedule: [],
  bookings: [],
  profile: [
    { label: 'Edit profile', path: '/trainer/profile/edit', icon: UserCircle },
    { label: 'Bookable hours', path: '/trainer/availability', icon: ClockCountdown },
    { label: 'Achievements', path: '/trainer/achievements', icon: Trophy },
    { label: 'Settings', path: '/trainer/settings', icon: GearSix },
  ],
};
