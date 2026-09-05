import { supabase } from '../supabaseClient';
import type { NotificationRow } from '../../types/db';

/** Everything the user has, archived included. The full-list screen filters. */
export async function listNotifications(userId: string): Promise<NotificationRow[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/**
 * What the bell shows: not cleared, not archived (0029).
 *
 * The bell is a worktray, not the archive — swiping something out of it must
 * not destroy the record, which is what the old X button did.
 */
export async function listBellNotifications(userId: string): Promise<NotificationRow[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .is('archived_at', null)
    .is('cleared_at', null)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/**
 * Scoped to the bell on purpose: the badge counts what tapping the bell will
 * actually show. Counting rows the member has already swiped away would leave
 * a badge with nothing behind it.
 */
export async function getUnreadCount(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('read', false)
    .is('archived_at', null)
    .is('cleared_at', null);
  if (error) throw error;
  return count ?? 0;
}

/** Admin/trainer only per RLS (notifications_insert_staff). */
/**
 * Write a notification for someone else. Admin, staff and trainer only (RLS).
 *
 * Deliberately does **not** `.select()` the row back.
 *
 * `.insert().select()` becomes `INSERT ... RETURNING`, and PostgreSQL evaluates
 * the *SELECT* policy on the returned row as well as the INSERT policy on the
 * write. The SELECT policies here are `user_id = auth.uid()`, admin, and front
 * desk — so a trainer writing a recommendation *for a member* is allowed to
 * insert it and then forbidden to read it back. The write succeeds and the
 * statement still fails with
 *   new row violates row-level security policy for table "notifications" (42501)
 * which points at the insert and hides the real cause.
 *
 * Nothing consumed the returned row, so there is nothing to give up by dropping
 * it. If a caller ever needs the id, the fix is a SELECT policy for the sender —
 * not putting RETURNING back.
 */
/**
 * What a sender supplies. Inbox state (`read`, `archived_at`, `cleared_at`) is
 * the *recipient's* to set, and the tamper guard in 0029 enforces that — so it
 * is excluded here rather than defaulted, which would let a caller pre-archive
 * a notification nobody ever saw.
 */
export type NewNotification = Omit<
  NotificationRow,
  'id' | 'created_at' | 'read' | 'archived_at' | 'cleared_at'
>;

export async function addNotification(input: NewNotification): Promise<void> {
  const { error } = await supabase.from('notifications').insert({ ...input, read: false });
  if (error) throw error;
}

export type BroadcastAudience = 'all_members' | 'all_trainers' | 'everyone' | 'specific';

export interface BroadcastResult {
  recipients: number;
  /**
   * Who the rows were written for. The admin broadcast composer needs these to
   * fire the push alerts on top of the records it just wrote — the rows are the
   * broadcast, the pushes are best-effort on top.
   */
  recipientIds: string[];
}

/**
 * Admin broadcast. `notifications` is one row per recipient, so this resolves the
 * audience to real profile ids and inserts a row for each. Archived and suspended
 * accounts are skipped — messaging someone who can no longer log in is noise.
 */
export async function broadcastNotification(input: {
  audience: BroadcastAudience;
  userIds?: string[];
  type: string;
  title: string;
  message: string;
  actionUrl?: string | null;
  /** Optional picture (0065). A notification row *is* one recipient, so the
   *  URL is copied onto each of them rather than stored once — the same shape
   *  title and message already have. */
  imageUrl?: string | null;
}): Promise<BroadcastResult> {
  let recipientIds: string[] = [];

  if (input.audience === 'specific') {
    recipientIds = input.userIds ?? [];
  } else {
    let query = supabase.from('profiles').select('id').eq('status', 'active');
    if (input.audience === 'all_members') query = query.eq('role', 'member');
    else if (input.audience === 'all_trainers') query = query.eq('role', 'trainer');
    else query = query.in('role', ['member', 'trainer']);

    const { data, error } = await query;
    if (error) throw error;
    recipientIds = (data ?? []).map((p) => p.id);
  }

  if (recipientIds.length === 0) {
    throw new Error('No active recipients matched that audience');
  }

  const rows = recipientIds.map((user_id) => ({
    user_id,
    type: input.type,
    title: input.title,
    message: input.message,
    action_url: input.actionUrl ?? null,
    image_url: input.imageUrl ?? null,
    read: false,
  }));

  const { error } = await supabase.from('notifications').insert(rows);
  if (error) throw error;
  return { recipients: rows.length, recipientIds };
}

export interface BroadcastSummary {
  key: string;
  title: string;
  message: string;
  type: string;
  sentAt: string;
  recipients: number;
  /** How many of those recipients have opened it. */
  readCount: number;
  /** The underlying notification ids, so a mis-sent broadcast can be recalled. */
  ids: string[];
  /** The picture, if the send had one (0065). Read off the first row of the
   *  group — every recipient's row carries the same URL. */
  imageUrl: string | null;
}

/**
 * Admin: recently broadcast messages, collapsed back into one entry per send.
 * Requires the notifications_select_admin policy (0007_notifications_admin_read.sql);
 * without it an admin only sees their own rows and this returns nothing.
 *
 * `readCount` is what makes the history worth looking at — "sent to 40" says
 * nothing about whether anybody saw it. `ids` is carried so the composer can
 * recall a send; both are per-broadcast, unlike the system-wide totals this
 * page used to show.
 */
export async function listRecentBroadcasts(limit = 20): Promise<BroadcastSummary[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('id, title, message, type, created_at, read, image_url')
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) throw error;

  type Group = Omit<BroadcastSummary, 'key' | 'imageUrl'> & { image_url: string | null };
  const groups = new Map<string, Group>();
  for (const n of data ?? []) {
    // Same title+message sent within the same minute = one broadcast.
    const minute = n.created_at.slice(0, 16);
    const key = `${n.title}|${n.message}|${minute}`;
    const existing = groups.get(key);
    if (existing) {
      existing.recipients += 1;
      if (n.read) existing.readCount += 1;
      existing.ids.push(n.id);
    } else {
      groups.set(key, {
        title: n.title, message: n.message, type: n.type, sentAt: n.created_at,
        recipients: 1, readCount: n.read ? 1 : 0, ids: [n.id],
        image_url: n.image_url ?? null,
      });
    }
  }

  return [...groups.entries()]
    .map(([key, { image_url, ...v }]) => ({ key, ...v, imageUrl: image_url }))
    .sort((a, b) => b.sentAt.localeCompare(a.sentAt))
    .slice(0, limit);
}

/**
 * How many active people an audience actually resolves to.
 *
 * The composer had no idea until after it sent — you picked "Everyone" and
 * found out it meant 200 people from the success toast. Counted with the same
 * filters `broadcastNotification` uses, so the preview cannot disagree with the
 * send.
 */
export async function countAudience(audience: BroadcastAudience): Promise<number> {
  if (audience === 'specific') return 0;
  let query = supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('status', 'active');
  if (audience === 'all_members') query = query.eq('role', 'member');
  else if (audience === 'all_trainers') query = query.eq('role', 'trainer');
  else query = query.in('role', ['member', 'trainer']);
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

// ─── State changes (0029) ────────────────────────────────────────────────────
//
// None of these `.select()` the row back. The updater is the row's owner so it
// would be permitted, but nothing reads the result and `INSERT/UPDATE …
// RETURNING` is the trap documented on `addNotification` above.
//
// A recipient may only ever change `read`, `archived_at` and `cleared_at` —
// `prevent_notification_tamper` (0029) rejects anything else, so a bug here
// fails loudly instead of quietly rewriting the gym's own message.

export async function markAsRead(id: string): Promise<void> {
  await setRead([id], true);
}

/** Both directions. "Mark as unread" is the same write with `false`. */
export async function setRead(ids: string[], read: boolean): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await supabase.from('notifications').update({ read }).in('id', ids);
  if (error) throw error;
}

/** Bell only — leaves the row in the inbox list. Swipe left. */
export async function setCleared(ids: string[], cleared: boolean): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await supabase
    .from('notifications')
    .update({ cleared_at: cleared ? new Date().toISOString() : null })
    .in('id', ids);
  if (error) throw error;
}

/**
 * Swipe right. Archiving also clears, so restoring from Archived puts the row
 * back in the inbox list without it reappearing in the bell days later —
 * a notification you archived last week returning to the tray would read as a
 * new arrival.
 */
export async function setArchived(ids: string[], archived: boolean): Promise<void> {
  if (ids.length === 0) return;
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('notifications')
    .update(
      archived
        ? { archived_at: now, cleared_at: now, read: true }
        : { archived_at: null }
    )
    .in('id', ids);
  if (error) throw error;
}

export async function markAllAsRead(userId: string): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('user_id', userId)
    .eq('read', false);
  if (error) throw error;
}

export async function deleteNotification(id: string): Promise<void> {
  await deleteNotifications([id]);
}

/** The only destructive path left, and it sits behind an explicit multi-select. */
export async function deleteNotifications(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await supabase.from('notifications').delete().in('id', ids);
  if (error) throw error;
}

/**
 * Recall a broadcast: deletes rows belonging to *other* people.
 *
 * Separate from `deleteNotifications` because it needs a permission the member
 * path does not, and because it must **prove** it worked. RLS silently filters
 * rows a DELETE isn't allowed to touch, and a DELETE that matches nothing is not
 * an error in PostgreSQL — so before migration 0034 this reported "removed from
 * 40 inboxes" while all 40 sat untouched. Same shape as the zero-row UPDATE that
 * threw away every onboarding experience level.
 *
 * `.select('id')` makes it `DELETE … RETURNING`, so the caller learns what
 * actually went. Admins can read every row (`notifications_select_admin`, 0007),
 * so reading back is permitted here.
 */
export async function recallBroadcast(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const { data, error } = await supabase.from('notifications').delete().in('id', ids).select('id');
  if (error) throw error;
  const removed = data?.length ?? 0;
  if (removed === 0) {
    throw new Error(
      'Nothing was removed — the database has not granted the front desk permission to recall a broadcast. Run migration 0034.'
    );
  }
  return removed;
}

export async function deleteAllNotifications(userId: string): Promise<void> {
  const { error } = await supabase.from('notifications').delete().eq('user_id', userId);
  if (error) throw error;
}
