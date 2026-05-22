import { motion } from 'framer-motion';
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, Clock, MapPin, User, CheckCircle, XCircle, AlertCircle, ArrowLeft, Trash2 } from 'lucide-react';
import { SharedStorage } from '../utils/sharedStorage';
import { getCurrentUser } from '../utils/auth';

export default function BookingHistory() {
  const navigate = useNavigate();
  const currentUser = getCurrentUser();
  const [activeTab, setActiveTab] = useState<'upcoming' | 'past'>('upcoming');
  const [bookings, setBookings] = useState<any[]>([]);

  const userEmail = currentUser?.email || localStorage.getItem('memberEmail') || 'eya.lorenzana@email.com';

  const loadBookings = useCallback(() => {
    try {
      const all = SharedStorage.getMemberBookings(userEmail);
      setBookings(Array.isArray(all) ? all : []);
    } catch {
      setBookings([]);
    }
  }, [userEmail]);

  useEffect(() => {
    loadBookings();
  }, [loadBookings]);

  // Refresh every 2 seconds to see admin updates
  useEffect(() => {
    const interval = setInterval(loadBookings, 2000);
    return () => clearInterval(interval);
  }, [loadBookings]);

  const upcomingBookings = bookings.filter(b =>
    b.status === 'Pending' || b.status === 'Confirmed'
  );
  const pastBookings = bookings.filter(b =>
    b.status === 'Cancelled' || b.status === 'Completed' || b.status === 'Rejected'
  );

  const displayBookings = activeTab === 'upcoming' ? upcomingBookings : pastBookings;

  const handleCancelBooking = (bookingId: string) => {
    if (window.confirm('Cancel this booking?')) {
      try {
        SharedStorage.updateBooking(bookingId, {
          status: 'Cancelled',
          cancelledAt: new Date().toISOString(),
        });
        setBookings(prev =>
          prev.map(b => b.id === bookingId ? { ...b, status: 'Cancelled' } : b)
        );
      } catch {
        // silently handle
      }
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'Pending': return <AlertCircle size={18} style={{ color: 'var(--color-secondary)' }} />;
      case 'Confirmed': return <CheckCircle size={18} style={{ color: 'var(--color-primary)' }} />;
      case 'Rejected': return <XCircle size={18} style={{ color: 'var(--color-secondary)' }} />;
      case 'Completed': return <CheckCircle size={18} style={{ color: 'var(--color-primary)' }} />;
      default: return <XCircle size={18} style={{ color: 'var(--color-text-muted)' }} />;
    }
  };

  const getStatusStyle = (status: string) => {
    if (status === 'Pending') return { color: 'var(--color-secondary)', background: 'var(--color-secondary-light)', border: '1px solid rgba(245,158,11,0.30)' };
    if (status === 'Confirmed') return { color: 'var(--color-primary)', background: 'var(--color-primary-light)', border: '1px solid rgba(124,58,237,0.30)' };
    if (status === 'Rejected') return { color: 'var(--color-secondary)', background: 'var(--color-secondary-light)', border: '1px solid rgba(245,158,11,0.30)' };
    if (status === 'Completed') return { color: 'var(--color-primary)', background: 'var(--color-primary-light)', border: '1px solid rgba(124,58,237,0.30)' };
    return { color: 'var(--color-text-muted)', background: 'rgba(107,96,128,0.1)', border: '1px solid rgba(107,96,128,0.3)' };
  };

  const classIcon: Record<string, string> = {
    'Strength Training': '💪', 'HIIT': '🔥', 'Yoga': '🧘',
    'Boxing': '🥊', 'CrossFit': '⚡', 'Personal Training': '👤',
  };

  return (
    <div className="space-y-5 pb-4">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3">
        <button
          onClick={() => {
            // Guard against empty history (e.g. opened from a deep link / refresh)
            if (window.history.length > 1) navigate(-1);
            else navigate('/member/home');
          }}
          className="w-10 h-10 rounded-xl flex items-center justify-center transition-colors"
          style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}
          onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--color-secondary)')}
          onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--color-border)')}
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-white">My Bookings</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--color-text-muted)' }}>View and manage your class bookings</p>
        </div>
      </motion.div>

      {/* Tabs */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        className="flex gap-2 p-1 rounded-xl" style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
        {[
          { id: 'upcoming', label: `Upcoming (${upcomingBookings.length})` },
          { id: 'past', label: `Past (${pastBookings.length})` },
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id as any)}
            className="flex-1 py-2.5 rounded-lg font-semibold text-sm transition-colors"
            style={{
              background: activeTab === tab.id ? 'var(--color-secondary)' : 'transparent',
              color: activeTab === tab.id ? '#000' : 'var(--color-text-muted)',
            }}>
            {tab.label}
          </button>
        ))}
      </motion.div>

      {/* Booking Cards */}
      <div className="space-y-3">
        {displayBookings.length === 0 ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="rounded-2xl p-8 text-center" style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
            <Calendar size={44} className="mx-auto mb-3" style={{ color: 'var(--color-border)' }} />
            <p className="font-medium" style={{ color: 'var(--color-text-secondary)' }}>No {activeTab} bookings</p>
            <button onClick={() => navigate('/member/book-class')}
              className="mt-4 px-6 py-2 rounded-xl font-semibold text-sm text-black"
              style={{ background: 'var(--color-secondary)' }}>
              Book a Class
            </button>
          </motion.div>
        ) : (
          displayBookings.map((booking, index) => (
            <motion.div key={booking.id}
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.07 }}
              className="rounded-2xl p-4" style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>

              {/* Top row */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">{classIcon[booking.classType] || classIcon[booking.className] || '⚡'}</span>
                  <div>
                    <h3 className="text-white font-semibold">{booking.className}</h3>
                    <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{booking.classType}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold uppercase" style={getStatusStyle(booking.status)}>
                  {getStatusIcon(booking.status)}
                  {booking.status}
                </div>
              </div>

              {/* Details */}
              <div className="space-y-1.5 text-sm mb-3">
                <div className="flex items-center gap-2" style={{ color: 'var(--color-text-secondary)' }}>
                  <User size={14} style={{ color: 'var(--color-secondary)' }} />
                  <span>{booking.trainerName || booking.trainer || 'TBA'}</span>
                </div>
                <div className="flex items-center gap-2" style={{ color: 'var(--color-text-secondary)' }}>
                  <Calendar size={14} style={{ color: 'var(--color-secondary)' }} />
                  <span>{booking.day || new Date(booking.date).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</span>
                </div>
                <div className="flex items-center gap-2" style={{ color: 'var(--color-text-secondary)' }}>
                  <Clock size={14} style={{ color: 'var(--color-secondary)' }} />
                  <span>{booking.time}</span>
                </div>
                <div className="flex items-center gap-2" style={{ color: 'var(--color-text-secondary)' }}>
                  <MapPin size={14} style={{ color: 'var(--color-secondary)' }} />
                  <span>Core Fitness Main Studio</span>
                </div>
              </div>

              {/* Admin note / rejection reason */}
              {booking.status === 'Confirmed' && booking.adminNote && (
                <div className="mb-3 p-2.5 rounded-xl text-xs" style={{ background: 'var(--color-primary-light)', border: '1px solid rgba(34,197,94,0.25)', color: 'var(--color-primary)' }}>
                  <span className="font-semibold">Admin note: </span>{booking.adminNote}
                </div>
              )}
              {booking.status === 'Rejected' && booking.rejectionReason && (
                <div className="mb-3 p-2.5 rounded-xl text-xs" style={{ background: 'var(--color-secondary-light)', border: '1px solid rgba(245,158,11,0.25)', color: 'var(--color-secondary)' }}>
                  <span className="font-semibold">Reason: </span>{booking.rejectionReason}
                </div>
              )}

              {/* Actions */}
              {(booking.status === 'Pending' || booking.status === 'Confirmed') && (
                <div className="flex gap-2">
                  <button
                    onClick={() => booking.trainerId ? navigate(`/member/trainer/${booking.trainerId}`) : navigate('/member/trainers')}
                    className="flex-1 py-2 rounded-xl text-sm font-semibold transition-colors"
                    style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--color-secondary)')}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--color-border)')}>
                    View Trainer
                  </button>
                  <button onClick={() => handleCancelBooking(booking.id)}
                    className="px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-1.5 transition-colors"
                    style={{ background: 'var(--color-secondary-light)', border: '1px solid rgba(245,158,11,0.30)', color: 'var(--color-secondary)' }}>
                    <Trash2 size={14} /> Cancel
                  </button>
                </div>
              )}
              {(booking.status === 'Rejected' || booking.status === 'Completed') && (
                <button onClick={() => navigate('/member/book-class')}
                  className="w-full py-2 rounded-xl text-sm font-semibold text-black"
                  style={{ background: 'var(--color-secondary)' }}>
                  Book Again
                </button>
              )}
            </motion.div>
          ))
        )}
      </div>

      {/* Quick Book */}
      <motion.button initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
        onClick={() => navigate('/member/book-class')}
        className="w-full py-3.5 rounded-xl font-semibold text-black"
        style={{ background: 'var(--color-secondary)' }}>
        + Book New Class
      </motion.button>
    </div>
  );
}
