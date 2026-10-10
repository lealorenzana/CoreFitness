import { hasOwnWords, moduleOn, word, type FeatureKey, type GymApp, type GymVocabulary } from '../../lib/gymApp';
import type { Icon } from '@phosphor-icons/react';
import { ArrowsClockwise, Barbell, Bell, CalendarDots, ChalkboardTeacher, ChartLineUp, ClipboardText, GearSix, Gift, House, Receipt, Scales, Storefront, Trophy, User, UserCircle, Users } from '@phosphor-icons/react';

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
    .filter((d) => !d.hub || hubTabs(d.hub, app).length > 0)
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
   '/member/track', '/member/plan', '/member/gym-plan', '/member/workouts', '/member/programs', '/member/program/',
   '/member/trainers', '/member/trainer/', '/member/events', '/member/challenges', '/member/season', '/member/squad', '/member/rooms', '/member/messages', '/member/progress-photos',
   '/member/workout-history', '/member/coach-notes'],
  // You: the money-and-access half, and the account itself. Profile lost its
  // tab in this redesign; its screens live here now.
  ['/member/membership', '/member/renew', '/member/renew-membership',
   '/member/payments', '/member/attendance-history', '/member/rewards', '/member/shop',
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

/**
 * Where a tab opens for this gym. Train opens Book a session — unless the gym
 * does not run classes (0110), when it opens the free workout library, which
 * is never switched off; landing on "not at this gym" from a tab would be a dead end.
 */
export function tabPath(tab: Tab, app: GymApp | null): string {
  if (tab.id === 'train' && !moduleOn(app, 'classes')) return '/member/workouts';
  return tab.path;
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
  /**
   * A rail pill that opens a whole section (HUBS) rather than one screen: it
   * lands on the tab the member last had open there, else the first one this
   * gym runs (`hubEntry`).
   */
  hub?: HubId;
}

/**
 * The rail under each tab's header: that tab's own screens, one tap away.
 *
 * Progress's five tabs are addressed by `?tab=`, which ProgressHub already
 * reads — so "Goals" lands on Goals rather than on whichever tab was open last.
 */
export const RAILS: Record<TabId, Destination[]> = {
  today: [
    // One Inbox (2026-10-10): notifications for you, and what the gym posts for everyone.
    { label: 'Inbox', path: '/member/notifications', icon: Bell, hub: 'inbox' },
    { label: 'Log a reading', path: '/member/progress?tab=body', icon: Scales , module: 'progress' },
  ],
  // Four sections instead of fifteen pills (2026-10-05): each opens a HUBS
  // section whose own tabs hold the screens that used to be pills of their own.
  train: [
    { label: 'Workouts', path: '/member/workouts/today', icon: ClipboardText, hub: 'plan' },
    { label: 'Progress', path: '/member/progress', icon: ChartLineUp, hub: 'progress' },
    { label: 'Coaching', path: '/member/booking-history', icon: ChalkboardTeacher, hub: 'coaching' },
    { label: 'Challenges', path: '/member/challenges', icon: Trophy, hub: 'compete' },
  ],
  you: [
    { label: 'Renew', path: '/member/renew', icon: ArrowsClockwise },
    { label: 'Payments', path: '/member/payments', icon: Receipt },
    { label: 'Attendance', path: '/member/attendance-history', icon: CalendarDots },
    { label: 'Spend points', path: '/member/rewards', icon: Gift , module: 'engagement' },
    { label: 'Shop', path: '/member/shop', icon: Storefront, module: 'shop' },
    { label: 'Invite a friend', path: '/member/refer', icon: Users , module: 'referrals' },
    { label: 'Edit profile', path: '/member/profile/edit', icon: UserCircle },
    { label: 'Settings', path: '/member/settings', icon: GearSix },
  ],
};

export type HubId = 'plan' | 'progress' | 'coaching' | 'compete' | 'inbox';

/**
 * Sections: screens that belong together, behind one tab strip.
 *
 * Train's rail had fifteen pills, and Progress had its own five tabs on top —
 * Goals and Coach notes were each reachable three ways, and the coach, the
 * coach's notes, bookings and rooms were four places for one relationship.
 * Each screen is still its own route (every notification link, deep link and
 * old bookmark lands exactly where it did); the section only adds the strip
 * under the title (HubStrip), and a tab switch *replaces* the entry so Back
 * leaves the section rather than walking back through its tabs.
 */
export const HUBS: { id: HubId; label: string; tabs: Destination[] }[] = [
  // One Workouts section (2026-10-10): today's workout, the routines you
  // repeat, the programs that build week on week, and the free library. The
  // week planner (/member/gym-plan) opens from Today.
  { id: 'plan', label: 'Workouts', tabs: [
    { label: 'Today', path: '/member/workouts/today' },
    { label: 'Routines', path: '/member/track', module: 'progress' },
    { label: 'Programs', path: '/member/programs', module: 'programs' },
    { label: 'Browse', path: '/member/workouts' },
  ] },
  { id: 'progress', label: 'Progress', tabs: [
    { label: 'Overview', path: '/member/progress', module: 'progress' },
    { label: 'Body', path: '/member/progress?tab=body', module: 'progress' },
    { label: 'Goals', path: '/member/progress?tab=goals', module: 'progress' },
    { label: 'Photos', path: '/member/progress-photos', module: 'photos' },
    { label: 'Achievements', path: '/member/achievements', module: 'engagement' },
  ] },
  { id: 'coaching', label: 'Coaching', tabs: [
    { label: 'Bookings', path: '/member/booking-history', module: 'classes' },
    { label: 'Coaches', path: '/member/trainers', module: 'coaching', words: (w) => w('trainers', true) },
    { label: 'Rooms', path: '/member/rooms', module: 'rooms' },
  ] },
  // Updates and Announcements were two screens for "what's new" (2026-10-10).
  { id: 'inbox', label: 'Inbox', tabs: [
    { label: 'For you', path: '/member/notifications' },
    { label: 'From the gym', path: '/member/events', module: 'push' },
  ] },
  { id: 'compete', label: 'Challenges', tabs: [
    { label: 'Challenges', path: '/member/challenges', module: 'engagement' },
    { label: 'Season', path: '/member/season', module: 'seasons' },
    { label: 'Team', path: '/member/squad', module: 'squads' },
  ] },
];

/** A section's tabs this gym runs, with its own words. */
export function hubTabs(id: HubId, app: GymApp | null): Destination[] {
  const hub = HUBS.find((h) => h.id === id);
  return hub ? visibleDestinations(hub.tabs, app) : [];
}

const tabParam = (path: string) => new URLSearchParams(path.split('?')[1] ?? '').get('tab');

/**
 * The section and tab a screen is, or null. A tab whose path carries `?tab=`
 * matches only that value; the one without matches any other value (so an old
 * `?tab=workouts` link to Progress still lights Overview).
 */
export function hubAt(pathname: string, search: string): { hub: HubId; tab: Destination } | null {
  const q = new URLSearchParams(search).get('tab');
  for (const hub of HUBS) {
    for (const tab of hub.tabs) {
      const [p] = tab.path.split('?');
      if (p !== pathname) continue;
      const want = tabParam(tab.path);
      if (want) { if (q === want) return { hub: hub.id, tab }; continue; }
      const siblings = hub.tabs.filter((o) => o.path.startsWith(p + '?')).map((o) => tabParam(o.path));
      if (!q || !siblings.includes(q)) return { hub: hub.id, tab };
    }
  }
  return null;
}

/** The tab each section was last left on, for this session only (memory, never storage). */
const lastTab = new Map<HubId, string>();
export function rememberHubTab(id: HubId, path: string): void { lastTab.set(id, path); }
/** Forget the remembered tabs. Called from `logout()` with the other per-member memory. */
export function clearHubMemory(): void { lastTab.clear(); }

/** Where a section's pill lands: the tab last open there, else the first one this gym runs. */
export function hubEntry(id: HubId, app: GymApp | null): string {
  const tabs = hubTabs(id, app);
  const last = lastTab.get(id);
  if (last && tabs.some((t) => t.path.split('?')[0] === last.split('?')[0])) return last;
  return tabs[0]?.path ?? '/member/book-class';
}


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
      { label: 'Inbox — for you', path: '/member/notifications' },
      { label: 'Inbox — from the gym', path: '/member/events' , module: 'push' },
      { label: 'Ask the assistant', path: '/member/chatbot' , module: 'assistant' },
    ],
  },
  {
    group: 'Workouts',
    items: [
      { label: 'Book a session', path: '/member/book-class' , module: 'classes' },
      { label: "Today's workout", path: '/member/workouts/today' },
      { label: 'Plan your week', path: '/member/gym-plan' , module: 'progress' },
      { label: 'Routines', path: '/member/track' , module: 'progress' },
      { label: 'Programs', path: '/member/programs' , module: 'programs' },
      { label: 'Browse free workouts', path: '/member/workouts' },
    ],
  },
  {
    group: 'Progress',
    items: [
      { label: 'Overview', path: '/member/progress' , module: 'progress' },
      { label: 'Body', path: '/member/progress?tab=body' , module: 'progress' },
      { label: 'Goals', path: '/member/progress?tab=goals' , module: 'progress' },
      { label: 'Progress photos', path: '/member/progress-photos' , module: 'photos' },
      { label: 'Achievements and level', path: '/member/achievements' , module: 'engagement' },
    ],
  },
  {
    group: 'Coaching',
    items: [
      { label: 'My bookings', path: '/member/booking-history' , module: 'classes' },
      { label: 'Coaches', path: '/member/trainers' , module: 'coaching',
        words: (w) => w('trainers', true) },
      { label: 'Rooms', path: '/member/rooms' , module: 'rooms' },
    ],
  },
  {
    group: 'Challenges',
    items: [
      { label: 'Challenges', path: '/member/challenges' , module: 'engagement' },
      { label: 'Season', path: '/member/season' , module: 'seasons' },
      { label: 'Team', path: '/member/squad' , module: 'squads' },
    ],
  },
  {
    group: 'Account',
    items: [
      { label: 'Membership', path: '/member/membership' },
      { label: 'Renew', path: '/member/renew' },
      { label: 'Pause or cancel', path: '/member/pause-or-cancel', module: 'requests' },
      { label: 'Waiver', path: '/member/waiver' },
      { label: 'Payments', path: '/member/payments' },
      { label: 'Attendance', path: '/member/attendance-history' },
      { label: 'Spend points', path: '/member/rewards' , module: 'engagement' },
      { label: 'Shop', path: '/member/shop', module: 'shop' },
      { label: 'Invite a friend', path: '/member/refer' , module: 'referrals' },
      { label: 'Profile', path: '/member/profile' },
      { label: 'Settings', path: '/member/settings' },
      // Which gym this app is showing. One gym: the screen is where you join
      // another. Several: it is how you switch (docs/TENANCY.md).
      { label: 'Gyms', path: '/choose-gym' },
      { label: 'Change password', path: '/member/change-password' },
      { label: 'Change email', path: '/member/change-email' },
    ],
  },
];
