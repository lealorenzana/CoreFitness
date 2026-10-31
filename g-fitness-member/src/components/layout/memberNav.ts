import { hasOwnWords, moduleOn, word, type FeatureKey, type GymApp, type GymVocabulary } from '../../lib/gymApp';
import type { Icon } from '@phosphor-icons/react';
import {
  Barbell, Bell, Buildings, GearSix, Gift, House, Question, Sparkle, Storefront, User, UserCircle, UserPlus, Wrench,
} from '@phosphor-icons/react';

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
  { id: 'train', label: 'Train', path: '/member/book-class', icon: Barbell, eyebrow: 'Train' },
  { id: 'you', label: 'You', path: '/member/membership', icon: User, eyebrow: 'Your level, progress and membership' },
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
  // Train: Workout, Coach (and Classes when on), and every screen they open —
  // including the aliases old notification rows still point at.
  ['/member/book-class', '/member/training', '/member/book', '/member/bookings',
   '/member/booking-history', '/member/sessions', '/member/book-session', '/member/chat', '/member/coach',
   '/member/track', '/member/plan', '/member/gym-plan', '/member/workouts', '/member/programs', '/member/program/',
   '/member/trainers', '/member/trainer/', '/member/events', '/member/rooms', '/member/messages', '/member/coach-notes'],
  // You: the earned level, progress, badges and records, the membership and the
  // account (simplify, 2026-10-28) — and Rewards, which More opens.
  ['/member/membership', '/member/renew', '/member/renew-membership',
   '/member/progress', '/member/body', '/member/targets', '/member/progress-photos', '/member/workout-history',
   '/member/achievements', '/member/challenges', '/member/season', '/member/squad',
   '/member/payments', '/member/attendance-history', '/member/rewards', '/member/shop',
   '/member/profile', '/member/settings', '/member/change-password',
   '/member/change-email', '/member/activity', '/member/visits', '/member/help'],
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
 * Where a tab opens for this gym. Train always opens on Workout, which every
 * gym has (simplify, 2026-10-28) — it used to open the class booking, and the
 * free library for a gym without classes.
 */
export function tabPath(tab: Tab, _app: GymApp | null): string {
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
  /** Drawn before the label — More's rows and tiles, Train's and You's rows. */
  icon?: Icon;
  /** One line on what the screen is for (More, 2026-10-26). */
  blurb?: string;
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


export type HubId = 'inbox';

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
  // Workouts, Coaching, Progress and Challenges were sections here. Since the
  // simplify (2026-10-28) they are Train's Workout and Coach tabs, You's
  // Progress and Badges tabs, and Rewards' Challenges tab.
  // Updates and Announcements were two screens for "what's new" (2026-10-10).
  { id: 'inbox', label: 'Inbox', tabs: [
    { label: 'For you', path: '/member/notifications' },
    { label: 'From the gym', path: '/member/events', module: 'events' },
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
 * More: ten entries (simplify, 2026-10-28; it was about thirty-five, grouped).
 * Everything else lives on a tab now — workouts and coaching on Train,
 * progress, badges and the membership on You — and Change password and email
 * are inside Settings. Rewards is points, challenges and spending them.
 */
export const EVERYTHING: { group: string; items: Destination[] }[] = [
  {
    group: 'More',
    items: [
      { label: 'Inbox', path: '/member/notifications', icon: Bell, blurb: 'Everything sent to you' },
      { label: 'Rewards', path: '/member/rewards', module: 'engagement', icon: Gift, blurb: 'Points, challenges, what you can get' },
      { label: 'Assistant', path: '/member/chatbot', module: 'assistant', icon: Sparkle, blurb: 'Questions about training and the gym' },
      { label: 'Shop', path: '/member/shop', module: 'shop', icon: Storefront, blurb: 'What the gym sells' },
      { label: 'Equipment', path: '/member/equipment', module: 'equipment', icon: Wrench, blurb: 'What the gym has, how to use it' },
      { label: 'Invite a friend', path: '/member/refer', module: 'referrals', icon: UserPlus, blurb: 'Share your gym' },
      // Which gym this app is showing. One gym: the screen is where you join
      // another. Several: it is how you switch (docs/TENANCY.md).
      { label: 'Gyms', path: '/choose-gym', icon: Buildings, blurb: 'Switch gym, or join another' },
      { label: 'Profile', path: '/member/profile', icon: UserCircle, blurb: 'Your name, photo and details' },
      { label: 'Settings', path: '/member/settings', icon: GearSix, blurb: 'Alerts, privacy, sign-in, password, email' },
      { label: 'Help', path: '/member/help', icon: Question, blurb: 'Tours of each screen, your gym, terms and privacy' },
    ],
  },
];

/** More has no tiles since the simplify: its ten rows are the whole list. */
export const MORE_TILES: Destination[] = [];
