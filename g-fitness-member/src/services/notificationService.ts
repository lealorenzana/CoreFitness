/**
 * Notification Service
 * Thin facade over src/lib/api/notifications.ts (Supabase-backed) — preserves
 * the original localStorage-era method signatures so existing callers
 * (Notifications.tsx, notificationHelpers.ts) didn't need to change.
 * `userId` must be a real profile UUID now, not an email address.
 */

import * as notificationsApi from '../lib/api/notifications';
import type { NotificationRow } from '../types/db';

export type NotificationType =
  | 'payment'
  | 'event'
  | 'achievement'
  | 'info'
  | 'booking'
  | 'membership'
  | 'trainer_feedback'
  | 'goal_milestone'
  | 'attendance'
  /** Server-generated training-plan nudge (0030). */
  | 'gym_plan'
  | 'system';

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: string; // ISO date
  read: boolean;
  actionUrl?: string;
  /** A picture the gym attached to an announcement (0065). Absent on every
   *  automated notice — bookings, payments and reminders never carry one. */
  imageUrl?: string;
  metadata?: Record<string, any>;
  /** Swiped right: dealt with, moved out of the inbox into Archived (0029). */
  archived: boolean;
  /** Swiped left: out of the bell, still in the inbox list. */
  cleared: boolean;
}

/**
 * What a sender supplies. Inbox state belongs to the recipient — the tamper
 * guard in 0029 rejects a sender trying to set it, so it is excluded rather
 * than defaulted.
 */
export type NewNotificationInput = Omit<
  Notification,
  'id' | 'timestamp' | 'read' | 'archived' | 'cleared'
>;

function toNotification(row: NotificationRow): Notification {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type as NotificationType,
    title: row.title,
    message: row.message,
    timestamp: row.created_at,
    read: row.read,
    actionUrl: row.action_url ?? undefined,
    imageUrl: row.image_url ?? undefined,
    metadata: row.metadata ?? undefined,
    archived: row.archived_at != null,
    cleared: row.cleared_at != null,
  };
}

export const notificationService = {
  /** Everything, archived included — the full-list screen does the filtering. */
  async getNotifications(userId: string): Promise<Notification[]> {
    const rows = await notificationsApi.listNotifications(userId);
    return rows.map(toNotification);
  },

  /** Just what belongs in the bell: neither cleared nor archived. */
  async getBellNotifications(userId: string): Promise<Notification[]> {
    const rows = await notificationsApi.listBellNotifications(userId);
    return rows.map(toNotification);
  },

  async setRead(ids: string[], read: boolean): Promise<void> {
    await notificationsApi.setRead(ids, read);
  },

  async setCleared(ids: string[], cleared: boolean): Promise<void> {
    await notificationsApi.setCleared(ids, cleared);
  },

  async setArchived(ids: string[], archived: boolean): Promise<void> {
    await notificationsApi.setArchived(ids, archived);
  },

  async deleteMany(ids: string[]): Promise<void> {
    await notificationsApi.deleteNotifications(ids);
  },

  async getUnreadCount(userId: string): Promise<number> {
    return notificationsApi.getUnreadCount(userId);
  },

  /**
   * Returns void, not the created row — see `addNotification` in
   * `lib/api/notifications.ts` for why reading it back breaks for trainers.
   * No caller ever used the return value.
   */
  async addNotification(notification: NewNotificationInput): Promise<void> {
    await notificationsApi.addNotification({
      user_id: notification.userId,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      action_url: notification.actionUrl ?? null,
      metadata: notification.metadata ?? null,
    });
  },

  async markAsRead(_userId: string, notificationId: string): Promise<void> {
    await notificationsApi.markAsRead(notificationId);
  },

  async markAllAsRead(userId: string): Promise<void> {
    await notificationsApi.markAllAsRead(userId);
  },

  async deleteNotification(_userId: string, notificationId: string): Promise<void> {
    await notificationsApi.deleteNotification(notificationId);
  },

  async deleteAllNotifications(userId: string): Promise<void> {
    await notificationsApi.deleteAllNotifications(userId);
  },

  async sendNotification(
    userId: string,
    type: NotificationType,
    title: string,
    message: string,
    actionUrl?: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    await this.addNotification({ userId, type, title, message, actionUrl, metadata });
  },

  async sendBulkNotifications(
    userIds: string[],
    type: NotificationType,
    title: string,
    message: string,
    actionUrl?: string
  ): Promise<void> {
    await Promise.all(userIds.map((userId) => this.addNotification({ userId, type, title, message, actionUrl })));
  },
};

// Helper function to format relative time
export function getRelativeTime(timestamp: string): string {
  const now = new Date();
  const then = new Date(timestamp);
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} week${Math.floor(diffDays / 7) > 1 ? 's' : ''} ago`;
  return `${Math.floor(diffDays / 30)} month${Math.floor(diffDays / 30) > 1 ? 's' : ''} ago`;
}
