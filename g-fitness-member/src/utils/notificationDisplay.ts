/**
 * How a notification is grouped, in one place.
 *
 * The bell and the full-list screen both draw the same rows. When the
 * day-bucketing lived inside the bell component, the only way to build a second
 * screen was to copy it — and a copied lookup is how this codebase once ended
 * up with four different membership plan lists.
 *
 * The per-type icon map that lived here went with the Nocturne redesign
 * (2026-09-16): rows mark unread with a dot and read by their title, and a
 * notification type no longer needs an entry here before it can be written.
 */

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
