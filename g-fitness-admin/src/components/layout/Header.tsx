import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect } from 'react';
import { useGymContext } from '../../hooks/useGymContext';
import { MapPin, Bell, User, X, Calendar, UserPlus, DollarSign, AlertCircle, Clock } from 'lucide-react';
import { SharedStorage } from '../../utils/sharedStorage';

interface Notification {
  id: string;
  type: 'expiring' | 'expired' | 'new_member' | 'payment' | 'booking' | 'suspended';
  title: string;
  message: string;
  time: string;
  icon: any;
  color: string;
  bgColor: string;
  unread: boolean;
  priority: 'high' | 'medium' | 'low';
  actionUrl?: string;
}

export default function Header() {
  const { selectedGym } = useGymContext();
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  // Generate real notifications based on actual data
  useEffect(() => {
    const generateNotifications = () => {
      const newNotifications: Notification[] = [];
      
      // Get members from SharedStorage
      const members = SharedStorage.getMembers().filter((m: any) => m.gymId === selectedGym.id);
      
      // Check for expiring memberships (within 7 days)
      const today = new Date();
      const sevenDaysFromNow = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
      
      members.forEach((member: any) => {
        const expiryDate = new Date(member.expiryDate);
        const daysUntilExpiry = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        
        // Expired memberships
        if (expiryDate < today && member.membershipStatus !== 'Expired') {
          newNotifications.push({
            id: `expired-${member.id}`,
            type: 'expired',
            title: '🚨 Membership Expired',
            message: `${member.fullName}'s membership expired ${Math.abs(daysUntilExpiry)} days ago`,
            time: 'Now',
            icon: AlertCircle,
            color: 'text-red-400',
            bgColor: 'bg-red-500/20',
            unread: true,
            priority: 'high',
            actionUrl: `/members/${member.id}`,
          });
        }
        // Expiring soon (within 7 days)
        else if (daysUntilExpiry > 0 && daysUntilExpiry <= 7) {
          newNotifications.push({
            id: `expiring-${member.id}`,
            type: 'expiring',
            title: '⚠️ Membership Expiring Soon',
            message: `${member.fullName}'s membership expires in ${daysUntilExpiry} day${daysUntilExpiry > 1 ? 's' : ''}`,
            time: `${daysUntilExpiry} days`,
            icon: Clock,
            color: 'text-yellow-400',
            bgColor: 'bg-yellow-500/20',
            unread: true,
            priority: 'high',
            actionUrl: `/members/${member.id}`,
          });
        }
        
        // Suspended members
        if (member.membershipStatus === 'Suspended') {
          newNotifications.push({
            id: `suspended-${member.id}`,
            type: 'suspended',
            title: '🔒 Suspended Member',
            message: `${member.fullName} is currently suspended`,
            time: 'Active',
            icon: AlertCircle,
            color: 'text-orange-400',
            bgColor: 'bg-orange-500/20',
            unread: false,
            priority: 'medium',
            actionUrl: `/members/${member.id}`,
          });
        }
      });
      
      // Check for pending bookings
      const bookings = SharedStorage.getBookings();
      const pendingBookings = bookings.filter((b: any) => b.status === 'Pending');
      
      if (pendingBookings.length > 0) {
        newNotifications.push({
          id: 'pending-bookings',
          type: 'booking',
          title: '📅 Pending Booking Requests',
          message: `${pendingBookings.length} trainer booking${pendingBookings.length > 1 ? 's' : ''} waiting for approval`,
          time: 'Now',
          icon: Calendar,
          color: 'text-purple-400',
          bgColor: 'bg-purple-500/20',
          unread: true,
          priority: 'high',
          actionUrl: '/schedule',
        });
      }
      
      // Check for recent payments (last 24 hours)
      const payments = SharedStorage.getPayments();
      const oneDayAgo = new Date(today.getTime() - 24 * 60 * 60 * 1000);
      const recentPayments = payments.filter((p: any) => new Date(p.date) > oneDayAgo);
      
      if (recentPayments.length > 0) {
        const totalAmount = recentPayments.reduce((sum: number, p: any) => sum + p.amount, 0);
        newNotifications.push({
          id: 'recent-payments',
          type: 'payment',
          title: '💰 Recent Payments',
          message: `${recentPayments.length} payment${recentPayments.length > 1 ? 's' : ''} received (₱${totalAmount.toLocaleString()})`,
          time: 'Today',
          icon: DollarSign,
          color: 'text-green-400',
          bgColor: 'bg-green-500/20',
          unread: false,
          priority: 'low',
          actionUrl: '/payments',
        });
      }
      
      // Sort by priority and time
      newNotifications.sort((a, b) => {
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      });
      
      setNotifications(newNotifications);
    };

    generateNotifications();
    
    // Refresh notifications every 30 seconds
    const interval = setInterval(generateNotifications, 30000);
    
    return () => clearInterval(interval);
  }, [selectedGym.id]);

  const unreadCount = notifications.filter(n => n.unread).length;
  const highPriorityCount = notifications.filter(n => n.priority === 'high' && n.unread).length;

  return (
    <header className="h-20 bg-dark-lighter/80 backdrop-blur-md border-b border-dark-border px-8 flex items-center justify-between shadow-lg sticky top-0 z-40">
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        className="flex items-center gap-4"
      >
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-start to-primary-end flex items-center justify-center shadow-lg p-2">
          <img src="/logo.png" alt="Gym" className="w-full h-full object-contain" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-white font-orbitron">
            {selectedGym.name}
          </h2>
          <p className="text-sm text-gray-400 flex items-center gap-1">
            <MapPin size={14} />
            {selectedGym.location}
          </p>
        </div>
      </motion.div>
      
      <motion.div 
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        className="flex items-center gap-6"
      >
        {/* Notifications */}
        <div className="relative">
          <button 
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative p-3 rounded-xl bg-dark border border-dark-border hover:border-primary-start/50 hover:bg-dark-border transition-all duration-200 group"
          >
            <Bell size={20} className="text-gray-400 group-hover:text-primary-start transition-colors" />
            {unreadCount > 0 && (
              <span className={`absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full flex items-center justify-center text-white text-xs font-bold ${
                highPriorityCount > 0 ? 'bg-red-500 animate-pulse' : 'bg-primary-start'
              }`}>
                {unreadCount}
              </span>
            )}
          </button>

          {/* Notification Dropdown */}
          <AnimatePresence>
            {showNotifications && (
              <>
                {/* Backdrop */}
                <div 
                  className="fixed inset-0 z-40"
                  onClick={() => setShowNotifications(false)}
                />
                
                {/* Dropdown */}
                <motion.div
                  initial={{ opacity: 0, y: -10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -10, scale: 0.95 }}
                  transition={{ duration: 0.2 }}
                  className="absolute right-0 top-full mt-2 w-[450px] bg-dark border border-dark-border rounded-xl shadow-2xl overflow-hidden z-50"
                >
                  {/* Header */}
                  <div className="p-4 border-b border-dark-border flex items-center justify-between bg-dark-lighter">
                    <div>
                      <h3 className="text-white font-semibold flex items-center gap-2">
                        Notifications
                        {highPriorityCount > 0 && (
                          <span className="px-2 py-0.5 bg-red-500 text-white text-xs rounded-full font-bold">
                            {highPriorityCount} urgent
                          </span>
                        )}
                      </h3>
                      <p className="text-gray-400 text-xs">
                        {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up!'}
                      </p>
                    </div>
                    <button
                      onClick={() => setShowNotifications(false)}
                      className="text-gray-400 hover:text-white transition-colors"
                    >
                      <X size={20} />
                    </button>
                  </div>

                  {/* Notifications List */}
                  <div className="max-h-[500px] overflow-y-auto">
                    {notifications.length > 0 ? (
                      notifications.map((notification) => {
                        const Icon = notification.icon;
                        return (
                          <div
                            key={notification.id}
                            onClick={() => {
                              if (notification.actionUrl) {
                                window.location.href = notification.actionUrl;
                              }
                            }}
                            className={`p-4 border-b border-dark-border hover:bg-dark-border/50 transition-colors cursor-pointer ${
                              notification.unread ? 'bg-primary-start/5' : ''
                            } ${
                              notification.priority === 'high' ? 'border-l-4 border-l-red-500' : ''
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              <div className={`w-10 h-10 rounded-lg ${notification.bgColor} flex items-center justify-center flex-shrink-0`}>
                                <Icon size={20} className={notification.color} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between gap-2">
                                  <p className="text-white font-medium text-sm leading-tight">{notification.title}</p>
                                  {notification.unread && (
                                    <span className="w-2 h-2 bg-primary-start rounded-full flex-shrink-0 mt-1"></span>
                                  )}
                                </div>
                                <p className="text-gray-400 text-sm mt-1 leading-snug">{notification.message}</p>
                                <div className="flex items-center gap-2 mt-2">
                                  <p className="text-gray-500 text-xs">{notification.time}</p>
                                  {notification.priority === 'high' && (
                                    <span className="px-2 py-0.5 bg-red-500/20 text-red-400 text-xs rounded-full font-semibold">
                                      URGENT
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="p-12 text-center">
                        <Bell size={48} className="text-gray-600 mx-auto mb-3" />
                        <p className="text-gray-400 font-medium">No notifications</p>
                        <p className="text-gray-500 text-sm mt-1">You're all caught up!</p>
                      </div>
                    )}
                  </div>

                  {/* Footer */}
                  {notifications.length > 0 && (
                    <div className="p-3 border-t border-dark-border bg-dark-lighter flex items-center gap-2">
                      <button 
                        onClick={() => {
                          // Mark all as read
                          setNotifications(notifications.map(n => ({ ...n, unread: false })));
                        }}
                        className="flex-1 text-center text-gray-400 text-sm font-medium hover:text-white transition-colors"
                      >
                        Mark All as Read
                      </button>
                      <button 
                        onClick={() => {
                          setShowNotifications(false);
                          // In a real app, this would navigate to a full notifications page
                          // For now, we'll show all notifications are already visible
                          setTimeout(() => {
                            setShowNotifications(true);
                          }, 100);
                        }}
                        className="flex-1 text-center text-primary-start text-sm font-medium hover:text-primary-end transition-colors"
                      >
                        Refresh Notifications
                      </button>
                    </div>
                  )}
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>

        {/* User Profile */}
        <div className="flex items-center gap-3 px-4 py-2 rounded-xl bg-dark border border-dark-border hover:border-primary-start/50 transition-all duration-200 cursor-pointer group">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-secondary to-primary-end flex items-center justify-center text-white shadow-lg">
            <User size={20} />
          </div>
          <div className="text-left">
            <p className="text-white font-medium text-sm group-hover:text-primary-start transition-colors">Admin</p>
            <p className="text-gray-400 text-xs">Super Admin</p>
          </div>
        </div>
      </motion.div>
    </header>
  );
}
