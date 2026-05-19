import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import { Bell, X, Calendar, CreditCard, Award, Info } from 'lucide-react';

interface Notification {
  id: string;
  type: 'payment' | 'event' | 'achievement' | 'info';
  title: string;
  message: string;
  time: string;
  read: boolean;
}

export default function Notifications() {
  const [isOpen, setIsOpen] = useState(false);
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
      message: 'Congratulations! You\'ve maintained a 7-day check-in streak.',
      time: '1 day ago',
      read: true,
    },
    {
      id: '4',
      type: 'info',
      title: 'Gym Schedule Update',
      message: 'Core Fitness will open 1 hour early on weekends starting next month.',
      time: '2 days ago',
      read: true,
    },
  ]);

  const unreadCount = notifications.filter(n => !n.read).length;

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

  const getColor = (type: string) => {
    switch (type) {
      case 'payment':
        return 'from-red-500 to-pink-500';
      case 'event':
        return 'from-blue-500 to-cyan-500';
      case 'achievement':
        return 'from-yellow-500 to-orange-500';
      default:
        return 'from-purple-500 to-pink-500';
    }
  };

  const markAsRead = (id: string) => {
    setNotifications(notifications.map(n => 
      n.id === id ? { ...n, read: true } : n
    ));
  };

  const markAllAsRead = () => {
    setNotifications(notifications.map(n => ({ ...n, read: true })));
  };

  const deleteNotification = (id: string) => {
    setNotifications(notifications.filter(n => n.id !== id));
  };

  return (
    <div className="relative">
      {/* Bell Icon Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative w-12 h-12 rounded-xl bg-dark-lighter border border-dark-border flex items-center justify-center text-gray-400 hover:text-white hover:border-primary-start transition-all duration-200"
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -top-1 -right-1 w-5 h-5 bg-gradient-to-br from-red-500 to-pink-500 rounded-full flex items-center justify-center text-white text-xs font-bold"
          >
            {unreadCount}
          </motion.div>
        )}
      </button>

      {/* Notifications Dropdown */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
            />

            {/* Dropdown Panel */}
            <motion.div
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.95 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="absolute right-0 top-14 w-80 bg-dark-lighter border border-dark-border rounded-2xl shadow-2xl z-50 overflow-hidden"
            >
              {/* Header */}
              <div className="p-4 border-b border-dark-border flex items-center justify-between">
                <div>
                  <h3 className="text-white font-semibold text-lg">Notifications</h3>
                  <p className="text-gray-400 text-xs">{unreadCount} unread</p>
                </div>
                {unreadCount > 0 && (
                  <button
                    onClick={markAllAsRead}
                    className="text-primary-start text-sm hover:text-primary-end transition-colors"
                  >
                    Mark all read
                  </button>
                )}
              </div>

              {/* Notifications List */}
              <div className="max-h-96 overflow-y-auto scrollbar-hide">
                {notifications.length === 0 ? (
                  <div className="p-8 text-center">
                    <Bell size={48} className="text-gray-600 mx-auto mb-3" />
                    <p className="text-gray-400">No notifications</p>
                  </div>
                ) : (
                  <div className="divide-y divide-dark-border">
                    {notifications.map((notification) => {
                      const Icon = getIcon(notification.type);
                      const color = getColor(notification.type);

                      return (
                        <motion.div
                          key={notification.id}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 20 }}
                          onClick={() => markAsRead(notification.id)}
                          className={`p-4 hover:bg-dark transition-all duration-200 cursor-pointer relative ${
                            !notification.read ? 'bg-dark/50' : ''
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center flex-shrink-0`}>
                              <Icon size={20} className="text-white" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <h4 className="text-white font-semibold text-sm">
                                  {notification.title}
                                </h4>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    deleteNotification(notification.id);
                                  }}
                                  className="text-gray-400 hover:text-red-400 transition-colors"
                                >
                                  <X size={16} />
                                </button>
                              </div>
                              <p className="text-gray-400 text-xs mt-1 line-clamp-2">
                                {notification.message}
                              </p>
                              <p className="text-gray-500 text-xs mt-2">{notification.time}</p>
                            </div>
                          </div>
                          {!notification.read && (
                            <div className="absolute left-2 top-1/2 -translate-y-1/2 w-2 h-2 bg-primary-start rounded-full"></div>
                          )}
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Footer */}
              {notifications.length > 0 && (
                <div className="p-3 border-t border-dark-border">
                  <button className="w-full text-center text-primary-start text-sm hover:text-primary-end transition-colors">
                    View All Notifications
                  </button>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
