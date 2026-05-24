import { motion } from 'framer-motion';
import { useState } from 'react';
import { Bell, Calendar, DollarSign, Award, Info, Trash2 } from 'lucide-react';

interface Notification {
  id: string;
  type: 'info' | 'event' | 'payment' | 'achievement' | 'system';
  title: string;
  message: string;
  actionUrl?: string;
  isRead: boolean;
  createdAt: string;
}

const MOCK_NOTIFICATIONS: Notification[] = [
  {
    id: 'notif-001',
    type: 'event',
    title: 'New Event: Yoga Class',
    message: 'Join our special yoga session this Saturday at 9 AM. Limited slots available!',
    actionUrl: '/member/events',
    isRead: false,
    createdAt: '2026-05-24T08:00:00',
  },
  {
    id: 'notif-002',
    type: 'info',
    title: 'Gym Schedule Update',
    message: 'G-Fitness will open 1 hour early on weekends starting next month.',
    isRead: false,
    createdAt: '2026-05-23T14:30:00',
  },
  {
    id: 'notif-003',
    type: 'payment',
    title: 'Payment Successful',
    message: 'Your membership payment of ₱1,500 has been processed successfully.',
    actionUrl: '/member/payment-history',
    isRead: true,
    createdAt: '2026-05-22T10:15:00',
  },
  {
    id: 'notif-004',
    type: 'achievement',
    title: 'Milestone Reached! 🎉',
    message: 'Congratulations! You\'ve completed 20 workouts this month.',
    isRead: true,
    createdAt: '2026-05-21T18:45:00',
  },
  {
    id: 'notif-005',
    type: 'system',
    title: 'Membership Expiring Soon',
    message: 'Your membership will expire in 7 days. Renew now to continue enjoying our services.',
    actionUrl: '/member/renew-membership',
    isRead: false,
    createdAt: '2026-05-20T09:00:00',
  },
  {
    id: 'notif-006',
    type: 'info',
    title: 'New Trainer Available',
    message: 'Coach Ana is now available for personal training sessions. Book your slot today!',
    actionUrl: '/member/trainers',
    isRead: true,
    createdAt: '2026-05-19T11:20:00',
  },
];

export default function Notifications() {
  const [notifications, setNotifications] = useState<Notification[]>(() => {
    try {
      const s = localStorage.getItem('member_notifications');
      if (s) return JSON.parse(s);
    } catch {}
    localStorage.setItem('member_notifications', JSON.stringify(MOCK_NOTIFICATIONS));
    return MOCK_NOTIFICATIONS;
  });

  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const saveNotifications = (updated: Notification[]) => {
    setNotifications(updated);
    localStorage.setItem('member_notifications', JSON.stringify(updated));
  };

  const markAsRead = (id: string) => {
    const updated = notifications.map(n => n.id === id ? { ...n, isRead: true } : n);
    saveNotifications(updated);
  };

  const markAllAsRead = () => {
    const updated = notifications.map(n => ({ ...n, isRead: true }));
    saveNotifications(updated);
  };

  const deleteNotification = (id: string) => {
    saveNotifications(notifications.filter(n => n.id !== id));
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'event': return Calendar;
      case 'payment': return DollarSign;
      case 'achievement': return Award;
      case 'system': return Bell;
      default: return Info;
    }
  };

  const getIconColor = (type: string) => {
    switch (type) {
      case 'event': return 'var(--color-secondary)';
      case 'payment': return '#10b981';
      case 'achievement': return '#f59e0b';
      case 'system': return '#ef4444';
      default: return 'var(--color-primary)';
    }
  };

  const filteredNotifications = filter === 'unread'
    ? notifications.filter(n => !n.isRead)
    : notifications;

  const unreadCount = notifications.filter(n => !n.isRead).length;

  return (
    <div className="space-y-4 pb-4">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-bold text-white">Notifications</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
          Stay updated with announcements and alerts
        </p>
      </motion.div>

      {/* Stats & Actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button onClick={() => setFilter('all')}
            className="px-4 py-2 rounded-xl text-sm font-semibold transition-all"
            style={{
              background: filter === 'all' ? 'var(--color-secondary)' : 'var(--color-surface-raised)',
              color: filter === 'all' ? '#000' : 'var(--color-text-muted)',
              border: `1px solid ${filter === 'all' ? 'var(--color-secondary)' : 'var(--color-border)'}`,
            }}>
            All ({notifications.length})
          </button>
          <button onClick={() => setFilter('unread')}
            className="px-4 py-2 rounded-xl text-sm font-semibold transition-all"
            style={{
              background: filter === 'unread' ? 'var(--color-secondary)' : 'var(--color-surface-raised)',
              color: filter === 'unread' ? '#000' : 'var(--color-text-muted)',
              border: `1px solid ${filter === 'unread' ? 'var(--color-secondary)' : 'var(--color-border)'}`,
            }}>
            Unread ({unreadCount})
          </button>
        </div>
        {unreadCount > 0 && (
          <button onClick={markAllAsRead}
            className="text-sm font-semibold"
            style={{ color: 'var(--color-secondary)' }}>
            Mark all as read
          </button>
        )}
      </div>

      {/* Notifications List */}
      {filteredNotifications.length === 0 ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="rounded-2xl p-8 text-center"
          style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
          <Bell size={48} className="mx-auto mb-3" style={{ color: 'var(--color-text-muted)' }} />
          <p className="text-white font-semibold mb-1">No notifications</p>
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            {filter === 'unread' ? 'You\'re all caught up!' : 'You don\'t have any notifications yet'}
          </p>
        </motion.div>
      ) : (
        <div className="space-y-3">
          {filteredNotifications.map((notif, i) => {
            const Icon = getIcon(notif.type);
            const iconColor = getIconColor(notif.type);
            return (
              <motion.div key={notif.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                onClick={() => !notif.isRead && markAsRead(notif.id)}
                className="rounded-2xl p-4 cursor-pointer transition-colors"
                style={{
                  background: notif.isRead ? 'var(--color-surface-raised)' : 'rgba(124,58,237,0.1)',
                  border: `1px solid ${notif.isRead ? 'var(--color-border)' : 'var(--color-primary)'}`,
                }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--color-secondary)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = notif.isRead ? 'var(--color-border)' : 'var(--color-primary)')}>
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ background: `${iconColor}20` }}>
                    <Icon size={18} style={{ color: iconColor }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <h3 className="text-sm font-bold text-white">{notif.title}</h3>
                      {!notif.isRead && (
                        <div className="w-2 h-2 rounded-full flex-shrink-0 mt-1"
                          style={{ background: 'var(--color-secondary)' }} />
                      )}
                    </div>
                    <p className="text-xs mb-2" style={{ color: 'var(--color-text-secondary)' }}>
                      {notif.message}
                    </p>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                        {new Date(notif.createdAt).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </span>
                      <div className="flex items-center gap-2">
                        {notif.actionUrl && (
                          <button onClick={(e) => {
                            e.stopPropagation();
                            window.location.href = notif.actionUrl!;
                          }}
                            className="text-[10px] px-3 py-1 rounded-full font-semibold"
                            style={{ background: 'var(--color-secondary)', color: '#000' }}>
                            View
                          </button>
                        )}
                        <button onClick={(e) => {
                          e.stopPropagation();
                          deleteNotification(notif.id);
                        }}
                          className="p-1.5 rounded-lg"
                          style={{ color: 'var(--color-text-muted)' }}>
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
