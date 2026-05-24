/**
 * Notification Service
 * Manages notifications for members and trainers
 */

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
  | 'system';

export interface Notification {
  id: string;
  userId: string; // member or trainer email
  type: NotificationType;
  title: string;
  message: string;
  timestamp: string; // ISO date
  read: boolean;
  actionUrl?: string; // Optional link to navigate to
  metadata?: Record<string, any>; // Additional data
}

const STORAGE_KEY = (userId: string) => `notifications_${userId}`;

// Simulate network delay
const delay = <T>(value: T, ms = 100): Promise<T> =>
  new Promise(resolve => setTimeout(() => resolve(value), ms));

export const notificationService = {
  /**
   * Get all notifications for a user
   */
  async getNotifications(userId: string): Promise<Notification[]> {
    try {
      const stored = localStorage.getItem(STORAGE_KEY(userId));
      const notifications = stored ? JSON.parse(stored) : [];
      // Sort by timestamp (newest first)
      return delay(notifications.sort((a: Notification, b: Notification) => 
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      ));
    } catch {
      return delay([]);
    }
  },

  /**
   * Get unread notification count
   */
  async getUnreadCount(userId: string): Promise<number> {
    const notifications = await this.getNotifications(userId);
    return notifications.filter(n => !n.read).length;
  },

  /**
   * Add a new notification
   */
  async addNotification(notification: Omit<Notification, 'id' | 'timestamp' | 'read'>): Promise<Notification> {
    const notifications = await this.getNotifications(notification.userId);
    const newNotification: Notification = {
      ...notification,
      id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      read: false,
    };
    
    notifications.unshift(newNotification);
    localStorage.setItem(STORAGE_KEY(notification.userId), JSON.stringify(notifications));
    
    return delay(newNotification, 50);
  },

  /**
   * Mark notification as read
   */
  async markAsRead(userId: string, notificationId: string): Promise<void> {
    const notifications = await this.getNotifications(userId);
    const updated = notifications.map(n => 
      n.id === notificationId ? { ...n, read: true } : n
    );
    localStorage.setItem(STORAGE_KEY(userId), JSON.stringify(updated));
    await delay(undefined, 50);
  },

  /**
   * Mark all notifications as read
   */
  async markAllAsRead(userId: string): Promise<void> {
    const notifications = await this.getNotifications(userId);
    const updated = notifications.map(n => ({ ...n, read: true }));
    localStorage.setItem(STORAGE_KEY(userId), JSON.stringify(updated));
    await delay(undefined, 50);
  },

  /**
   * Delete a notification
   */
  async deleteNotification(userId: string, notificationId: string): Promise<void> {
    const notifications = await this.getNotifications(userId);
    const filtered = notifications.filter(n => n.id !== notificationId);
    localStorage.setItem(STORAGE_KEY(userId), JSON.stringify(filtered));
    await delay(undefined, 50);
  },

  /**
   * Delete all notifications
   */
  async deleteAllNotifications(userId: string): Promise<void> {
    localStorage.removeItem(STORAGE_KEY(userId));
    await delay(undefined, 50);
  },

  /**
   * Send notification to user (simulated)
   */
  async sendNotification(
    userId: string,
    type: NotificationType,
    title: string,
    message: string,
    actionUrl?: string,
    metadata?: Record<string, any>
  ): Promise<Notification> {
    return this.addNotification({
      userId,
      type,
      title,
      message,
      actionUrl,
      metadata,
    });
  },

  /**
   * Send bulk notifications (e.g., to all members)
   */
  async sendBulkNotifications(
    userIds: string[],
    type: NotificationType,
    title: string,
    message: string,
    actionUrl?: string
  ): Promise<void> {
    const promises = userIds.map(userId =>
      this.addNotification({ userId, type, title, message, actionUrl })
    );
    await Promise.all(promises);
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
