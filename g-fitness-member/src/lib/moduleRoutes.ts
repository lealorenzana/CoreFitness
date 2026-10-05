import type { FeatureKey } from './gymApp';

/**
 * Which switch (0110/0141) each screen belongs to — for the member app and the
 * trainer app alike. The menus hide a switched-off destination; this map is
 * what stops a notification link, a bookmark or a typed address opening it
 * anyway (ModuleGate, in both layouts).
 *
 * Longest prefix wins. A path in no row is always open: the free workout
 * library above all, which CLAUDE.md forbids gating.
 */
const ROUTES: [string, FeatureKey][] = [
  // member
  ['/member/chatbot', 'assistant'],
  ['/member/events', 'push'],
  ['/member/trainers', 'coaching'],
  ['/member/trainer/', 'coaching'],
  ['/member/book-class', 'classes'],
  ['/member/booking-history', 'classes'],
  ['/member/program/', 'programs'],
  ['/member/programs', 'programs'],
  ['/member/progress-photos', 'photos'],
  ['/member/shop', 'shop'],
  ['/member/rooms', 'rooms'],
  ['/member/messages', 'chat'],
  ['/member/plan', 'progress'],
  ['/member/gym-plan', 'progress'],
  ['/member/track', 'progress'],
  ['/member/workout-history', 'progress'],
  ['/member/progress', 'progress'],
  ['/member/coach-notes', 'progress'],
  ['/member/rewards', 'engagement'],
  ['/member/challenges', 'engagement'],
  ['/member/achievements', 'engagement'],
  ['/member/season', 'seasons'],
  ['/member/squad', 'squads'],
  ['/member/refer', 'referrals'],
  ['/member/pause-or-cancel', 'requests'],
  // trainer
  ['/trainer/rooms', 'rooms'],
  ['/trainer/messages', 'chat'],
  ['/trainer/schedule', 'classes'],
  ['/trainer/achievements', 'engagement'],
];

/** The switch a path belongs to, or null when it is always open. */
export function moduleForPath(pathname: string): FeatureKey | null {
  let best: [string, FeatureKey] | null = null;
  for (const row of ROUTES) {
    const p = row[0];
    const hit = p.endsWith('/') ? pathname.startsWith(p) : pathname === p || pathname.startsWith(`${p}/`);
    if (hit && (!best || p.length > best[0].length)) best = row;
  }
  return best ? best[1] : null;
}

/** How a switched-off part is named to a member — the owner's own label is not known here. */
export const MODULE_NAMES: Record<FeatureKey, string> = {
  front_desk: 'the front desk', checkin: 'check-in', classes: 'classes and bookings', coaching: 'coaches',
  engagement: 'points, rewards and challenges', progress: 'progress tracking', assistant: 'the assistant',
  push: 'announcements', analytics: 'analytics', shop: 'the shop', requests: 'freeze and cancel requests in the app',
  chat: 'coach chat', rooms: 'coaching rooms', programs: 'programs', photos: 'progress photos',
  squads: 'squads', seasons: 'seasons', quests: 'weekly quests', referrals: 'inviting friends',
};
