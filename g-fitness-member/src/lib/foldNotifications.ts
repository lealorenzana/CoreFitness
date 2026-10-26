import type { Notification, NotificationType } from '../services/notificationService';

/**
 * The Inbox's folding (redesign, 2026-10-26): two or more automatic notices of
 * the same kind and title in one group ("Checked in", "Badge unlocked", a plan
 * reminder) become one row — "Checked in ×4" — that opens to show each.
 *
 * Only these automatic kinds fold. Anything a person wrote (an announcement, a
 * coach's note, a booking decision, a payment receipt) always stands alone,
 * because each one says something different.
 */
const FOLDS: ReadonlySet<NotificationType> = new Set(['attendance', 'achievement', 'gym_plan', 'goal_milestone']);

export type InboxEntry =
  | { kind: 'single'; item: Notification }
  | { kind: 'fold'; key: string; type: NotificationType; title: string; items: Notification[] };

/** Folds one group's items (already newest first); keeps the position of each fold's newest item. */
export function foldNotifications(items: Notification[]): InboxEntry[] {
  const groups = new Map<string, Notification[]>();
  for (const n of items) {
    if (!FOLDS.has(n.type)) continue;
    const key = `${n.type}:${n.title}`;
    const list = groups.get(key);
    if (list) list.push(n); else groups.set(key, [n]);
  }
  const out: InboxEntry[] = [];
  const placed = new Set<string>();
  for (const n of items) {
    const key = `${n.type}:${n.title}`;
    const group = FOLDS.has(n.type) ? groups.get(key) : undefined;
    if (!group || group.length < 2) { out.push({ kind: 'single', item: n }); continue; }
    if (placed.has(key)) continue;
    placed.add(key);
    out.push({ kind: 'fold', key, type: n.type, title: n.title, items: group });
  }
  return out;
}
