import {
  Calendar, CreditCard, Award, Info, BookOpen, Target, Users,
  TrendingUp, AlertCircle, Dumbbell, type LucideIcon,
} from 'lucide-react';

/**
 * How a notification looks, in one place.
 *
 * The bell and the full-list screen both draw the same rows. When the icon map
 * and the day-bucketing lived inside the bell component, the only way to build
 * a second screen was to copy them — and a copied lookup table is how this
 * codebase ended up with four different membership plan lists.
 */

export const NOTIFICATION_ICONS: Record<string, LucideIcon> = {
  payment: CreditCard,
  membership: CreditCard,
  event: Calendar,
  achievement: Award,
  booking: BookOpen,
  goal_milestone: Target,
  trainer_feedback: Users,
  recommendation: Users,
  trainer_recommendation: Users,
  attendance: TrendingUp,
  /** Written by `send_due_gym_reminders()` (0030), not by any client. */
  gym_plan: Dumbbell,
  system: AlertCircle,

  // ── 0053's automated reminders ────────────────────────────────────────────
  // These types were already being written before they were listed here, so
  // they fell through to the generic `Info` icon: a "your membership ends
  // tomorrow" warning looked identical to a system notice. The map is the only
  // thing that decides, so a new server-side notification type has to be added
  // here in the same change that starts writing it.
  /** `send_membership_expiry_reminders()` — 7, 3 and 1 days out. */
  expiry: CreditCard,
  /** Goal reached, badge unlocked, reward now claimable. */
  success: Award,
};

export function iconFor(type: string): LucideIcon {
  return NOTIFICATION_ICONS[type] ?? Info;
}

/** Today / Yesterday / This week / Earlier — a flat list of 40 reads as noise. */
export function bucketOf(iso: string): string {
  const then = new Date(iso);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfThen = new Date(then.getFullYear(), then.getMonth(), then.getDate());
  const days = Math.floor((startOfToday.getTime() - startOfThen.getTime()) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return 'This week';
  return 'Earlier';
}

/**
 * Groups an already-sorted list into day buckets, preserving order.
 *
 * Takes the list as given rather than re-sorting: the caller's order is
 * newest-first from the database, and re-sorting here would silently override a
 * screen that deliberately ordered its rows some other way.
 */
export function bucketize<T extends { timestamp: string }>(items: T[]): [string, T[]][] {
  const buckets: [string, T[]][] = [];
  for (const n of items) {
    const key = bucketOf(n.timestamp);
    const last = buckets[buckets.length - 1];
    if (last && last[0] === key) last[1].push(n);
    else buckets.push([key, [n]]);
  }
  return buckets;
}

/** Full timestamp for the detail view, where "13 hours ago" isn't precise enough. */
export function fullTimestamp(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}
