import { hasOwnWords, moduleOn, word, type FeatureKey, type GymApp, type GymVocabulary } from '../../lib/gymApp';
import type { Icon } from '@phosphor-icons/react';
import { ArrowsClockwise, Barbell, Bell, BookOpen, CalendarCheck, CalendarDots, ChartLineUp, ChatCircleText, ClipboardText, GearSix, Gift, House, Medal, Megaphone, Receipt, Scales, Target, Trophy, User, UserCircle, Users } from '@phosphor-icons/react';

/**
 * The member app's navigation, in one place.
 *
 * The bar, the header rail under each tab and the Everything sheet all read
 * from here. They used to be three hand-kept lists — `navRoutes`, `tabSubPaths`
 * and a quick-actions grid — and the documented failure was that they drifted:
 * a route added to one and forgotten in another either lit the wrong tab or
 * shipped a screen nothing linked to (three did).
 *
 * **Every destination here is an existing route.** Nothing in this file creates a
 * screen. `audit-routes.py` is what proves the reverse — that no route is left
 * out of all of them.
 */

export type TabId = 'today' | 'train' | 'you';

/**
 * Filters a rail or a group to what this gym actually runs (0110), and puts the
 * gym's own nouns into the labels that contain one (0114).
 *
 * The rename is skipped entirely when the gym chose no words of its own, which
 * is almost every gym: the plain `label` is then the object that ships, and
 * `t()` finds its translation exactly as before. A gym that *did* rename
 * something gets its word untranslated, which is correct — "PTs" is a proper
 * noun for that gym, not a string with a Filipino equivalent.
 */
export function visibleDestinations(items: Destination[], app: GymApp | null): Destination[] {
  const rename = hasOwnWords(app);
  return items
    .filter((d) => moduleOn(app, d.module))
    .map((d) => (rename && d.words
      ? { ...d, label: d.words((k, title) => word(app, k, title)) }
      : d));
}

/** Reads one of this gym's words. Passed to a Destination's `words` builder. */
export type WordReader = (key: keyof GymVocabulary, title?: boolean) => string;

export interface Tab {
  id: TabId;
  label: string;
  path: string;
  icon: Icon;
  /** Small caps line under the title. */
  eyebrow: string;
}

export const TABS: Tab[] = [
  { id: 'today', label: 'Today', path: '/member/home', icon: House, eyebrow: 'Your day' },
  { id: 'train', label: 'Train', path: '/member/book-class', icon: Barbell, eyebrow: 'Classes and 1-on-1' },
  { id: 'you', label: 'You', path: '/member/membership', icon: User, eyebrow: 'Membership and points' },
];

/**
 * Every path that lights each tab, **one row per tab, in `TABS` order.**
 *
 * The order is load-bearing and the failure is silent: this list once had five
 * rows against four tabs, which lights the wrong tab rather than throwing.
 * `tabForPath` checks the lengths agree in development.
 *
 * Longest prefix wins, so `/member/profile/edit` is You and not something that
 * happens to share a stem.
 */
const TAB_PATHS: string[][] = [
  // Today is only "right now": the day, what arrived, what the gym announced,
  // and the assistant you ask about it.
  ['/member/home', '/member/notifications', '/member/chatbot'],
  // Train: the tab that offers a session, and everything that follows from
  // having taken one — including the aliases old notification rows still point
  // at (/member/book, /member/bookings).
  ['/member/book-class', '/member/training', '/member/book', '/member/bookings',
   '/member/booking-history', '/member/progress', '/member/achievements',
   '/member/track', '/member/plan', '/member/gym-plan', '/member/workouts',
   '/member/trainers', '/member/trainer/', '/member/events', '/member/challenges',
   '/member/workout-history'],
  // You: the money-and-access half, and the account itself. Profile lost its
  // tab in this redesign; its screens live here now.
  ['/member/membership', '/member/renew', '/member/renew-membership',
   '/member/payments', '/member/attendance-history', '/member/rewards',
   '/member/profile', '/member/settings', '/member/change-password',
   '/member/change-email', '/member/activity', '/member/visits'],
];

/** The tab a path belongs to, or null for a path that belongs to none. */
export function tabForPath(pathname: string): TabId | null {
  if (import.meta.env.DEV && TAB_PATHS.length !== TABS.length) {
    console.error(`memberNav: ${TAB_PATHS.length} path rows for ${TABS.length} tabs`);
  }
  let bestTab: TabId | null = null;
  let bestLen = -1;
  for (let i = 0; i < TAB_PATHS.length; i++) {
    for (const p of TAB_PATHS[i]) {
      // `${p}/` so /member/book does not claim /member/book-class.
      const hit = pathname === p || pathname.startsWith(p.endsWith('/') ? p : `${p}/`);
      if (hit && p.length > bestLen) {
        bestTab = TABS[i].id;
        bestLen = p.length;
      }
    }
  }
  return bestTab;
}

/** A tab root is a screen that shows the big header and the rail. */
export function tabRootFor(pathname: string): Tab | null {
  return TABS.find((t) => t.path === pathname) ?? null;
}

export interface Destination {
  label: string;
  path: string;
  /**
   * The part of the system this belongs to (0110). When the gym does not run
   * it, the destination is not drawn at all — see `visibleDestinations`.
   * Absent means always shown: the free workout library has no module on
   * purpose, because CLAUDE.md forbids gating it.
   */
  module?: FeatureKey;
  /** Drawn in the rail pill before the label. */
  icon?: Icon;
  /**
   * Rebuilds `label` from this gym's own nouns when it renamed any of them
   * (0114). `label` stays the default and is what ships for every gym that did
   * not — so this is additive, and a gym that never opened the setting sees
   * byte-for-byte what it saw before.
   */
  words?: (w: WordReader) => string;
}

/**
 * The rail under each tab's header: that tab's own screens, one tap away.
 *
 * Progress's five tabs are addressed by `?tab=`, which ProgressHub already
 * reads — so "Goals" lands on Goals rather than on whichever tab was open last.
 */
export const RAILS: Record<TabId, Destination[]> = {
  today: [
    { label: 'Updates', path: '/member/notifications', icon: Bell },
    { label: 'Announcements', path: '/member/events', icon: Megaphone , module: 'push' },
    { label: 'Log a reading', path: '/member/progress?tab=body', icon: Scales , module: 'progress' },
    { label: 'My routines', path: '/member/track', icon: Barbell , module: 'progress' },
  ],
  train: [
    { label: 'Progress', path: '/member/progress', icon: ChartLineUp , module: 'progress' },
    { label: 'My bookings', path: '/member/booking-history', icon: CalendarCheck , module: 'classes' },
    { label: 'Training plan', path: '/member/gym-plan', icon: ClipboardText , module: 'progress' },
    { label: 'Free workouts', path: '/member/workouts', icon: BookOpen },
    { label: 'Coaches', path: '/member/trainers', icon: Users , module: 'coaching',
      words: (w) => w('trainers', true) },
    { label: 'Challenges', path: '/member/challenges', icon: Trophy , module: 'engagement' },
    { label: 'Achievements', path: '/member/achievements', icon: Medal , module: 'engagement' },
    { label: 'Goals', path: '/member/progress?tab=goals', icon: Target , module: 'progress' },
    { label: 'Coach notes', path: '/member/progress?tab=feedback', icon: ChatCircleText , module: 'progress',
      words: (w) => w('trainer', true) + ' notes' },
  ],
  you: [
    { label: 'Renew', path: '/member/renew', icon: ArrowsClockwise },
    { label: 'Payments', path: '/member/payments', icon: Receipt },
    { label: 'Attendance', path: '/member/attendance-history', icon: CalendarDots },
    { label: 'Spend points', path: '/member/rewards', icon: Gift , module: 'engagement' },
    { label: 'Edit profile', path: '/member/profile/edit', icon: UserCircle },
    { label: 'Settings', path: '/member/settings', icon: GearSix },
  ],
};

/**
 * Everything: the discoverability surface for the whole member app.
 *
 * Grouped the way a member thinks about it rather than by tab — Progress is its
 * own group although it lives under Train, because "where are my charts" is a
 * question about progress and not about booking.
 */
export const EVERYTHING: { group: string; items: Destination[] }[] = [
  {
    group: 'Today',
    items: [
      { label: 'Today', path: '/member/home' },
      { label: 'Updates', path: '/member/notifications' },
      { label: 'Events and announcements', path: '/member/events' , module: 'push' },
      { label: 'Ask the assistant', path: '/member/chatbot' , module: 'assistant' },
    ],
  },
  {
    group: 'Train',
    items: [
      { label: 'Book a session', path: '/member/book-class' , module: 'classes' },
      { label: 'My bookings', path: '/member/booking-history' , module: 'classes' },
      { label: 'Training plan', path: '/member/gym-plan' , module: 'progress' },
      { label: 'Rebuild my plan', path: '/member/plan' , module: 'progress' },
      { label: 'Free workouts', path: '/member/workouts' },
      { label: 'My routines', path: '/member/track' , module: 'progress' },
      { label: 'Coaches', path: '/member/trainers' , module: 'coaching',
        words: (w) => w('trainers', true) },
      { label: 'Challenges', path: '/member/challenges' , module: 'engagement' },
    ],
  },
  {
    group: 'Progress',
    items: [
      { label: 'Body', path: '/member/progress?tab=body' , module: 'progress' },
      { label: 'Goals', path: '/member/progress?tab=goals' , module: 'progress' },
      { label: 'Coach notes', path: '/member/progress?tab=feedback' , module: 'progress',
        words: (w) => w('trainer', true) + ' notes' },
      { label: 'Achievements and level', path: '/member/achievements' , module: 'engagement' },
    ],
  },
  {
    group: 'Account',
    items: [
      { label: 'Membership', path: '/member/membership' },
      { label: 'Renew', path: '/member/renew' },
      { label: 'Pause or cancel', path: '/member/pause-or-cancel' },
      { label: 'Payments', path: '/member/payments' },
      { label: 'Attendance', path: '/member/attendance-history' },
      { label: 'Spend points', path: '/member/rewards' , module: 'engagement' },
      { label: 'Profile', path: '/member/profile' },
      { label: 'Edit profile', path: '/member/profile/edit' },
      { label: 'Settings', path: '/member/settings' },
      // Which gym this app is showing. One gym: the screen is where you join
      // another. Several: it is how you switch (docs/TENANCY.md).
      { label: 'Gyms', path: '/choose-gym' },
      { label: 'Change password', path: '/member/change-password' },
      { label: 'Change email', path: '/member/change-email' },
    ],
  },
];
