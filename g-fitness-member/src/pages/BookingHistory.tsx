import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, Clock, MapPin, User, CheckCircle, XCircle, AlertCircle, ArrowLeft, Trash2 } from 'lucide-react';
import { SharedStorage } from '../utils/sharedStorage';
import { getCurrentUser } from '../utils/auth';

interface Booking {
  id: string;
  className: string;
  classType: string;
  trainer: string;
  date: string;
  time: string;
  location: string;
  status: 'upcoming' | 'completed' | 'cancelled';
  duration: string;
}

export default function BookingHistory() {
  const navigate = useNavigate();
  const currentUser = getCurrentUser();
  const [activeTab, setActiveTab] = useState<'upcoming' | 'past'>('upcoming');
  const [bookings, setBookings] = useState<any[]>([]);

  // Load bookings from shared storage
  useEffect(() => {
    const userEmail = currentUser?.email || 'eya.lorenzana@email.com';
    const allBookings = SharedStorage.getMemberBookings(userEmail);
    setBookings(allBookings);
  }, [currentUser]);

  // Refresh bookings periodically to see admin updates
  useEffect(() => {
    const interval = setInterval(() => {
      const userEmail = currentUser?.email || 'eya.lorenzana@email.com';
      const allBookings = SharedStorage.getMemberBookings(userEmail);
      setBookings(allBookings);
    }, 2000); // Refresh every 2 seconds

    return () => clearInterval(interval);
  }, [currentUser]);

  const upcomingBookings = bookings.filter(b => 
    b.status === 'Pending' || b.status === 'Confirmed'
  );
  const pastBookings = bookings.filter(b => 
    b.status === 'Cancelled' || b.status === 'Completed' || b.status === 'Rejected'
  );

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'Pending':
        return <AlertCircle size={20} className="text-yellow-400" />;
      case 'Confirmed':
        return <CheckCircle size={20} className="text-green-400" />;
      case 'Cancelled':
        return <XCircle size={20} className="text-gray-400" />;
      case 'Rejected':
        return <XCircle size={20} className="text-red-400" />;
      case 'Completed':
        return <CheckCircle size={20} className="text-blue-400" />;
      default:
        return <AlertCircle size={20} className="text-gray-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Pending':
        return 'text-yellow-400 bg-yellow-500/20 border-yellow-500/30';
      case 'Confirmed':
        return 'text-green-400 bg-green-500/20 border-green-500/30';
      case 'Cancelled':
        return 'text-gray-400 bg-gray-500/20 border-gray-500/30';
      case 'Rejected':
        return 'text-red-400 bg-red-500/20 border-red-500/30';
      case 'Completed':
        return 'text-blue-400 bg-blue-500/20 border-blue-500/30';
      default:
        return 'text-gray-400 bg-gray-500/20 border-gray-500/30';
    }
  };

  const getClassIcon = (classType: string) => {
    switch (classType) {
      case 'Strength Training':
        return '💪';
      case 'HIIT':
        return '🔥';
      case 'Yoga':
        return '🧘';
      case 'Personal Training':
        return '👤';
      default:
        return '⚡';
    }
  };

  const handleCancelBooking = (bookingId: string) => {
    if (window.confirm('Are you sure you want to cancel this booking?')) {
      // Actually update the booking in SharedStorage
      SharedStorage.updateBooking(bookingId, {
        status: 'Cancelled',
        cancelledAt: new Date().toISOString(),
      });
      // Update local state so UI reflects immediately
      setBookings(prev =>
        prev.map(b => b.id === bookingId ? { ...b, status: 'Cancelled' } : b)
      );
    }
  };

  const displayBookings = activeTab === 'upcoming' ? upcomingBookings : pastBookings;

  return (
    <div className="space-y-6">
      {/* Header with Back Button */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-4"
      >
        <button
          onClick={() => navigate('/member/home')}
          className="w-10 h-10 rounded-xl bg-gray-800 border-2 border-gray-600 flex items-center justify-center text-gray-400 hover:text-white hover:border-orange-500 transition-all"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-orbitron font-bold bg-gradient-to-r from-orange-400 to-orange-300 bg-clip-text text-transparent">
            My Bookings
          </h1>
          <p className="text-gray-400 text-sm mt-1">View and manage your class bookings</p>
        </div>
      </motion.div>

      {/* Tabs */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="flex gap-2 bg-gray-900 border-2 border-gray-800 rounded-xl p-1"
      >
        <button
          onClick={() => setActiveTab('upcoming')}
          className={`flex-1 py-2.5 rounded-lg font-semibold text-sm transition-all ${
            activeTab === 'upcoming'
              ? 'bg-gradient-to-r from-orange-500 to-orange-400 text-white'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          Upcoming ({upcomingBookings.length})
        </button>
        <button
          onClick={() => setActiveTab('past')}
          className={`flex-1 py-2.5 rounded-lg font-semibold text-sm transition-all ${
            activeTab === 'past'
              ? 'bg-gradient-to-r from-orange-500 to-orange-400 text-white'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          Past ({pastBookings.length})
        </button>
      </motion.div>

      {/* Bookings List */}
      <div className="space-y-4">
        {displayBookings.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-gray-900 border-2 border-gray-800 rounded-2xl p-8 text-center"
          >
            <Calendar size={48} className="mx-auto text-gray-600 mb-4" />
            <p className="text-gray-400">No {activeTab} bookings</p>
            <button
              onClick={() => navigate('/member/book-class')}
              className="mt-4 px-6 py-2 bg-gradient-to-r from-orange-500 to-orange-400 text-white rounded-xl font-semibold hover:shadow-lg transition-all"
            >
              Book a Class
            </button>
          </motion.div>
        ) : (
          displayBookings.map((booking, index) => (
            <motion.div
              key={booking.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 + index * 0.1 }}
              className="bg-gray-900 border-2 border-gray-800 rounded-2xl p-4 hover:border-orange-500/50 transition-all"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="text-4xl">{getClassIcon(booking.classType)}</div>
                  <div>
                    <h3 className="text-white font-semibold">{booking.className}</h3>
                    <p className="text-gray-400 text-xs">{booking.classType}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {getStatusIcon(booking.status)}
                  <span className={`px-2 py-1 rounded-full text-xs font-semibold uppercase border ${getStatusColor(booking.status)}`}>
                    {booking.status}
                  </span>
                </div>
              </div>

              <div className="space-y-2 text-sm mb-4">
                <div className="flex items-center gap-2 text-gray-300">
                  <User size={16} className="text-orange-400" />
                  <span>{booking.trainerName || booking.trainer}</span>
                </div>
                <div className="flex items-center gap-2 text-gray-300">
                  <Calendar size={16} className="text-orange-400" />
                  <span>{booking.day}, {booking.time}</span>
                </div>
                <div className="flex items-center gap-2 text-gray-300">
                  <Clock size={16} className="text-orange-400" />
                  <span>{booking.time} • {booking.duration || '60 min'}</span>
                </div>
                <div className="flex items-center gap-2 text-gray-300">
                  <MapPin size={16} className="text-orange-400" />
                  <span>Core Fitness Main Studio</span>
                </div>
              </div>

              {/* Admin Note or Rejection Reason */}
              {booking.status === 'Confirmed' && booking.adminNote && (
                <div className="mt-3 p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
                  <p className="text-green-400 text-xs font-semibold mb-1">Admin Note:</p>
                  <p className="text-gray-300 text-sm">{booking.adminNote}</p>
                </div>
              )}
              {booking.status === 'Rejected' && booking.rejectionReason && (
                <div className="mt-3 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                  <p className="text-red-400 text-xs font-semibold mb-1">Rejection Reason:</p>
                  <p className="text-gray-300 text-sm">{booking.rejectionReason}</p>
                </div>
              )}

              {/* Actions */}
              {(booking.status === 'Pending' || booking.status === 'Confirmed') && (
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      // Use trainerId if available, otherwise navigate to trainers list
                      if (booking.trainerId) {
                        navigate(`/member/trainer/${booking.trainerId}`);
                      } else {
                        navigate('/member/trainers');
                      }
                    }}
                    className="flex-1 py-2 bg-gray-800 border border-gray-700 text-white rounded-lg text-sm font-semibold hover:border-orange-500 transition-all"
                  >
                    View Trainer
                  </button>
                  <button
                    onClick={() => handleCancelBooking(booking.id)}
                    className="px-4 py-2 bg-red-500/20 border border-red-500/30 text-red-400 rounded-lg text-sm font-semibold hover:bg-red-500/30 transition-all flex items-center gap-2"
                  >
                    <Trash2 size={16} />
                    Cancel
                  </button>
                </div>
              )}

              {booking.status === 'Rejected' && (
                <button
                  onClick={() => navigate('/member/book-class')}
                  className="w-full py-2 bg-gradient-to-r from-orange-500 to-orange-400 text-white rounded-lg text-sm font-semibold hover:shadow-lg transition-all"
                >
                  Book Another Class
                </button>
              )}

              {booking.status === 'Completed' && (
                <button
                  onClick={() => navigate('/member/book-class')}
                  className="w-full py-2 bg-gradient-to-r from-orange-500 to-orange-400 text-white rounded-lg text-sm font-semibold hover:shadow-lg transition-all"
                >
                  Book Again
                </button>
              )}
            </motion.div>
          ))
        )}
      </div>

      {/* Quick Book Button */}
      <motion.button
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        onClick={() => navigate('/member/book-class')}
        className="w-full py-4 bg-gradient-to-r from-orange-500 to-orange-400 text-white rounded-xl font-semibold hover:shadow-lg hover:shadow-orange-500/30 transition-all"
      >
        + Book New Class
      </motion.button>
    </div>
  );
}
