import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect } from 'react';
import { useGymContext } from '../../hooks/useGymContext';
import { Search, Mail, Bell, X, Calendar, DollarSign, AlertCircle, Clock, MapPin } from 'lucide-react';
import { SharedStorage } from '../../utils/sharedStorage';

const SURFACE        = 'var(--color-surface)';
const SURFACE_RAISED = 'var(--color-surface-raised)';
const BORDER         = 'var(--color-border)';
const PRIMARY        = 'var(--color-primary)';
const PRIMARY_LIGHT  = 'var(--color-primary-light)';
const SECONDARY      = 'var(--color-secondary)';
const SECONDARY_BG   = 'var(--color-secondary-light)';
const TEXT_SECOND    = 'var(--color-text-secondary)';
const TEXT_MUTED     = 'var(--color-text-muted)';

interface Notification {
  id: string;
  type: 'expiring' | 'expired' | 'new_member' | 'payment' | 'booking' | 'suspended';
  title: string;
  message: string;
  time: string;
  icon: any;
  unread: boolean;
  priority: 'high' | 'medium' | 'low';
  actionUrl?: string;
}

export default function Header() {
  const { selectedGym } = useGymContext();
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const generate = () => {
      const list: Notification[] = [];
      const members = SharedStorage.getMembers().filter((m: any) => m.gymId === selectedGym.id);
      const today = new Date();

      members.forEach((member: any) => {
        const expiry = new Date(member.expiryDate);
        const daysUntil = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

        if (expiry < today && member.membershipStatus !== 'Expired') {
          list.push({
            id: `expired-${member.id}`,
            type: 'expired',
            title: 'Membership Expired',
            message: `${member.fullName}'s membership expired ${Math.abs(daysUntil)} days ago`,
            time: 'Now',
            icon: AlertCircle,
            unread: true,
            priority: 'high',
            actionUrl: `/members/${member.id}`,
          });
        } else if (daysUntil > 0 && daysUntil <= 7) {
          list.push({
            id: `expiring-${member.id}`,
            type: 'expiring',
            title: 'Expiring Soon',
            message: `${member.fullName} expires in ${daysUntil} day${daysUntil > 1 ? 's' : ''}`,
            time: `${daysUntil}d`,
            icon: Clock,
            unread: true,
            priority: 'high',
            actionUrl: `/members/${member.id}`,
          });
        }

        if (member.membershipStatus === 'Suspended') {
          list.push({
            id: `suspended-${member.id}`,
            type: 'suspended',
            title: 'Suspended Member',
            message: `${member.fullName} is currently suspended`,
            time: 'Active',
            icon: AlertCircle,
            unread: false,
            priority: 'medium',
            actionUrl: `/members/${member.id}`,
          });
        }
      });

      const bookings = SharedStorage.getBookings();
      const pending = bookings.filter((b: any) => b.status === 'Pending');
      if (pending.length > 0) {
        list.push({
          id: 'pending-bookings',
          type: 'booking',
          title: 'Pending Booking Requests',
          message: `${pending.length} booking${pending.length > 1 ? 's' : ''} waiting for approval`,
          time: 'Now',
          icon: Calendar,
          unread: true,
          priority: 'high',
          actionUrl: '/bookings',
        });
      }

      const payments = SharedStorage.getPayments();
      const dayAgo = new Date(today.getTime() - 24 * 60 * 60 * 1000);
      const recent = payments.filter((p: any) => new Date(p.date) > dayAgo);
      if (recent.length > 0) {
        const total = recent.reduce((s: number, p: any) => s + p.amount, 0);
        list.push({
          id: 'recent-payments',
          type: 'payment',
          title: 'Recent Payments',
          message: `${recent.length} payment${recent.length > 1 ? 's' : ''} received (₱${total.toLocaleString()})`,
          time: 'Today',
          icon: DollarSign,
          unread: false,
          priority: 'low',
          actionUrl: '/payments',
        });
      }

      list.sort((a, b) => {
        const order = { high: 0, medium: 1, low: 2 };
        return order[a.priority] - order[b.priority];
      });
      setNotifications(list);
    };

    generate();
    const interval = setInterval(generate, 30000);
    return () => clearInterval(interval);
  }, [selectedGym.id]);

  const unreadCount = notifications.filter((n) => n.unread).length;

  return (
    <header
      className="h-16 px-6 flex items-center gap-4 sticky top-0 z-30"
      style={{ background: SURFACE, borderBottom: `1px solid ${BORDER}` }}
    >
      <motion.div initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-3 min-w-0">
        <div className="hidden lg:block">
          <p className="text-sm font-semibold text-white">Core Fitness</p>
          <p className="text-xs flex items-center gap-1" style={{ color: TEXT_MUTED }}>
            <MapPin size={11} /> {selectedGym.location}
          </p>
        </div>
      </motion.div>

      <div className="flex-1 relative">
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: TEXT_MUTED }} />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search members, bookings, payments…"
          className="w-full pl-11 pr-4 text-sm rounded-full transition-colors"
          style={{
            height: 40,
            background: SURFACE_RAISED,
            border: `1px solid ${BORDER}`,
            color: '#fff',
            outline: 'none',
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = PRIMARY;
            e.currentTarget.style.boxShadow = '0 0 0 3px rgba(124,58,237,0.18)';
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = BORDER;
            e.currentTarget.style.boxShadow = 'none';
          }}
        />
      </div>

      <motion.div initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-2 flex-shrink-0">
        <button
          className="w-10 h-10 rounded-full flex items-center justify-center transition-colors"
          style={{ background: SURFACE_RAISED, border: `1px solid ${BORDER}` }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = PRIMARY)}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = BORDER)}
          title="Inbox"
        >
          <Mail size={16} style={{ color: TEXT_SECOND }} />
        </button>

        <div className="relative">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative w-10 h-10 rounded-full flex items-center justify-center transition-colors"
            style={{ background: SURFACE_RAISED, border: `1px solid ${BORDER}` }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = PRIMARY)}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = BORDER)}
          >
            <Bell size={16} style={{ color: TEXT_SECOND }} />
            {unreadCount > 0 && (
              <span
                className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center text-[10px] font-bold text-black"
                style={{ background: SECONDARY }}
              >
                {unreadCount}
              </span>
            )}
          </button>

          <AnimatePresence>
            {showNotifications && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowNotifications(false)} />
                <motion.div
                  initial={{ opacity: 0, y: -8, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.96 }}
                  transition={{ duration: 0.18 }}
                  className="absolute right-0 top-full mt-2 w-[400px] rounded-2xl shadow-2xl overflow-hidden z-50"
                  style={{ background: SURFACE_RAISED, border: `1px solid ${BORDER}` }}
                >
                  <div className="p-4 flex items-center justify-between" style={{ borderBottom: `1px solid ${BORDER}`, background: SURFACE }}>
                    <div>
                      <h3 className="text-white font-semibold text-sm">Notifications</h3>
                      <p className="text-xs mt-0.5" style={{ color: TEXT_MUTED }}>
                        {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
                      </p>
                    </div>
                    <button onClick={() => setShowNotifications(false)} style={{ color: TEXT_MUTED }}>
                      <X size={18} />
                    </button>
                  </div>

                  <div className="max-h-[440px] overflow-y-auto">
                    {notifications.length > 0 ? notifications.map((n) => {
                      const Icon = n.icon;
                      return (
                        <button
                          key={n.id}
                          onClick={() => { if (n.actionUrl) window.location.href = n.actionUrl; }}
                          className="w-full text-left p-4 transition-colors flex items-start gap-3"
                          style={{
                            borderBottom: `1px solid ${BORDER}`,
                            background: n.unread ? 'rgba(124,58,237,0.06)' : 'transparent',
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = PRIMARY_LIGHT)}
                          onMouseLeave={(e) => (e.currentTarget.style.background = n.unread ? 'rgba(124,58,237,0.06)' : 'transparent')}
                        >
                          <div
                            className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                            style={{ background: n.priority === 'high' ? SECONDARY_BG : PRIMARY_LIGHT }}
                          >
                            <Icon size={16} style={{ color: n.priority === 'high' ? SECONDARY : PRIMARY }} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-sm font-medium text-white">{n.title}</p>
                              {n.unread && (
                                <span className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ background: SECONDARY }} />
                              )}
                            </div>
                            <p className="text-xs mt-1" style={{ color: TEXT_SECOND }}>{n.message}</p>
                            <p className="text-[10px] mt-1.5" style={{ color: TEXT_MUTED }}>{n.time}</p>
                          </div>
                        </button>
                      );
                    }) : (
                      <div className="p-10 text-center">
                        <Bell size={36} className="mx-auto mb-3" style={{ color: TEXT_MUTED }} />
                        <p className="text-sm" style={{ color: TEXT_SECOND }}>You're all caught up</p>
                      </div>
                    )}
                  </div>

                  {notifications.length > 0 && (
                    <div
                      className="p-3 flex items-center justify-center"
                      style={{ borderTop: `1px solid ${BORDER}`, background: SURFACE }}
                    >
                      <button
                        onClick={() => setNotifications((prev) => prev.map((n) => ({ ...n, unread: false })))}
                        className="text-xs font-medium"
                        style={{ color: PRIMARY }}
                      >
                        Mark all as read
                      </button>
                    </div>
                  )}
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>

        <div
          className="flex items-center gap-2.5 pl-2 pr-3 h-10 rounded-full cursor-pointer transition-colors"
          style={{ background: SURFACE_RAISED, border: `1px solid ${BORDER}` }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = PRIMARY)}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = BORDER)}
        >
          <div className="w-7 h-7 rounded-full overflow-hidden flex-shrink-0">
            <img src="/core-fitness-logo.png" alt="Admin" className="w-full h-full object-cover" />
          </div>
          <div className="hidden sm:block text-left">
            <p className="text-xs font-semibold text-white leading-tight">Admin</p>
            <p className="text-[10px] leading-tight" style={{ color: TEXT_MUTED }}>Super Admin</p>
          </div>
        </div>
      </motion.div>
    </header>
  );
}
