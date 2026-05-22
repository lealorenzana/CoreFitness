import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Bell, X, Calendar, CreditCard, Award, Info } from 'lucide-react';

interface Notification {
  id: string;
  type: 'payment' | 'event' | 'achievement' | 'info';
  title: string;
  message: string;
  time: string;
  read: boolean;
}

function getOverlayRoot(): HTMLElement | null {
  return document.getElementById('phone-overlay-root') ?? document.getElementById('phone-screen');
}

export default function Notifications() {
  const [isOpen, setIsOpen] = useState(false);
  const [overlayRoot, setOverlayRoot] = useState<HTMLElement | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([
    {
      id: '1',
      type: 'payment',
      title: 'Payment Due Soon',
      message: 'Your membership expires in 7 days. Renew now to avoid interruption.',
      time: '2 hours ago',
      read: false,
    },
    {
      id: '2',
      type: 'event',
      title: 'New Event: Yoga Class',
      message: 'Join our special yoga session this Saturday at 9 AM.',
      time: '5 hours ago',
      read: false,
    },
    {
      id: '3',
      type: 'achievement',
      title: 'Streak Achievement!',
      message: "Congratulations! You've maintained a 7-day check-in streak.",
      time: '1 day ago',
      read: true,
    },
    {
      id: '4',
      type: 'info',
      title: 'Gym Schedule Update',
      message: 'G-Fitness will open 1 hour early on weekends starting next month.',
      time: '2 days ago',
      read: true,
    },
  ]);

  useEffect(() => {
    setOverlayRoot(getOverlayRoot());
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const getIcon = (type: string) => {
    switch (type) {
      case 'payment':
        return CreditCard;
      case 'event':
        return Calendar;
      case 'achievement':
        return Award;
      default:
        return Info;
    }
  };

  const markAsRead = (id: string) => {
    setNotifications(notifications.map((n) => (n.id === id ? { ...n, read: true } : n)));
  };

  const markAllAsRead = () => {
    setNotifications(notifications.map((n) => ({ ...n, read: true })));
  };

  const deleteNotification = (id: string) => {
    setNotifications(notifications.filter((n) => n.id !== id));
  };

  const panel = (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsOpen(false)}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm z-[10] pointer-events-auto"
          />
          <motion.div
            initial={{ opacity: 0, y: -16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -16, scale: 0.96 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="absolute top-14 left-3 right-3 z-[20] bg-[rgba(10,8,0,0.65)] border border-[var(--color-secondary-light)] rounded-2xl shadow-2xl overflow-hidden pointer-events-auto max-h-[70%] flex flex-col"
          >
            <div className="p-4 border-b border-[var(--color-secondary-light)] flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-white font-semibold text-lg">Notifications</h3>
                <p className="text-white/40 text-xs">{unreadCount} unread</p>
              </div>
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="text-yellow-400 text-sm hover:text-orange-300 transition-colors"
                >
                  Mark all read
                </button>
              )}
            </div>

            <div className="overflow-y-auto scrollbar-hide flex-1">
              {notifications.length === 0 ? (
                <div className="p-8 text-center">
                  <Bell size={40} className="text-gray-600 mx-auto mb-3" />
                  <p className="text-white/40 text-sm">No notifications</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-800">
                  {notifications.map((notification) => {
                    const Icon = getIcon(notification.type);

                    return (
                      <div
                        key={notification.id}
                        onClick={() => markAsRead(notification.id)}
                        className={`p-4 hover:bg-[rgba(10,8,0,0.85)]/50 transition-colors cursor-pointer relative ${
                          !notification.read ? 'bg-[rgba(10,8,0,0.85)]/30' : ''
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div
                            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                            style={{ background: 'var(--color-primary)' }}
                          >
                            <Icon size={18} className="text-white" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <h4 className="text-white font-semibold text-sm">{notification.title}</h4>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteNotification(notification.id);
                                }}
                                className="text-white/40 hover:text-yellow transition-colors shrink-0"
                              >
                                <X size={16} />
                              </button>
                            </div>
                            <p className="text-white/40 text-xs mt-1 line-clamp-2">{notification.message}</p>
                            <p className="text-gray-500 text-xs mt-1.5">{notification.time}</p>
                          </div>
                        </div>
                        {!notification.read && (
                          <div className="absolute left-1.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-orange-400 rounded-full" />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative w-11 h-11 rounded-xl bg-[rgba(10,8,0,0.65)] border border-[var(--color-secondary-light)] flex items-center justify-center text-white/40 hover:text-white hover:border-orange-500/50 transition-all"
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
            style={{ background: 'var(--color-secondary)' }}
          >
            {unreadCount}
          </motion.div>
        )}
      </button>

      {overlayRoot && isOpen ? createPortal(panel, overlayRoot) : null}
    </div>
  );
}
