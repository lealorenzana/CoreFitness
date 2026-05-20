import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import { Calendar, CheckCircle, Clock, XCircle, User, Check, X } from 'lucide-react';
import { SharedStorage } from '../utils/sharedStorage';
import { showToast } from '../utils/toast';
import { useGymContext } from '../hooks/useGymContext';

interface Booking {
  id: string;
  memberName: string;
  memberId: string;
  memberEmail: string;
  trainerName: string;
  sessionType: string;
  date: string;
  time: string;
  status: 'Pending' | 'Confirmed' | 'Rejected' | 'Completed' | 'Cancelled';
  notes?: string;
}

export default function Bookings() {
  // Load bookings from SharedStorage
  const [bookings, setBookings] = useState<Booking[]>(() => {
    return SharedStorage.getBookings();
  });

  // Auto-refresh bookings every 2 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      const updatedBookings = SharedStorage.getBookings();
      setBookings(updatedBookings);
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  const handleApproveBooking = (booking: Booking) => {
    // Update booking status to Confirmed
    SharedStorage.updateBookingStatus(booking.id, 'Confirmed');
    
    // Update local state
    setBookings(bookings.map(b => 
      b.id === booking.id ? { ...b, status: 'Confirmed' as const } : b
    ));
    
    showToast(`✅ Booking for ${booking.memberName} approved!`, 'success');
  };

  const handleRejectBooking = (booking: Booking) => {
    // Update booking status to Rejected
    SharedStorage.updateBookingStatus(booking.id, 'Rejected');
    
    // Update local state
    setBookings(bookings.map(b => 
      b.id === booking.id ? { ...b, status: 'Rejected' as const } : b
    ));
    
    showToast(`❌ Booking for ${booking.memberName} rejected`, 'error');
  };

  // Legacy bookings for display if no real bookings exist
  const [legacyBookings] = useState<any[]>([
    {
      id: '1',
      memberName: 'Juan dela Cruz',
      memberId: 'GF-2024-001',
      plan: 'Premium',
      amount: 2500,
      paymentMethod: 'GCash',
      bookingDate: '2024-01-15',
      startDate: '2024-01-15',
      expiryDate: '2025-01-15',
      status: 'active',
      invoiceNumber: 'BK-2024-001',
    },
    {
      id: '2',
      memberName: 'Maria Santos',
      memberId: 'GF-2024-002',
      plan: 'Standard',
      amount: 1500,
      paymentMethod: 'Cash',
      bookingDate: '2023-11-20',
      startDate: '2023-11-20',
      expiryDate: '2024-11-20',
      status: 'active',
      invoiceNumber: 'BK-2023-045',
    },
    {
      id: '3',
      memberName: 'Pedro Reyes',
      memberId: 'GF-2024-003',
      plan: 'Basic',
      amount: 800,
      paymentMethod: 'Bank Transfer',
      bookingDate: '2024-02-10',
      startDate: '2024-02-10',
      expiryDate: '2025-02-10',
      status: 'active',
      invoiceNumber: 'BK-2024-012',
    },
    {
      id: '4',
      memberName: 'Ana Garcia',
      memberId: 'GF-2024-004',
      plan: 'Premium',
      amount: 2500,
      paymentMethod: 'Credit Card',
      bookingDate: '2023-09-05',
      startDate: '2023-09-05',
      expiryDate: '2024-09-05',
      status: 'expired',
      invoiceNumber: 'BK-2023-078',
    },
    {
      id: '5',
      memberName: 'Carlos Mendoza',
      memberId: 'GF-2024-005',
      plan: 'Standard',
      amount: 1500,
      paymentMethod: 'GCash',
      bookingDate: '2024-03-12',
      startDate: '2024-03-12',
      expiryDate: '2025-03-12',
      status: 'active',
      invoiceNumber: 'BK-2024-023',
    },
    {
      id: '6',
      memberName: 'Elena Rivera',
      memberId: 'GF-2024-006',
      plan: 'Basic',
      amount: 800,
      paymentMethod: 'Cash',
      bookingDate: '2023-12-01',
      startDate: '2023-12-01',
      expiryDate: '2024-12-01',
      status: 'cancelled',
      invoiceNumber: 'BK-2023-089',
    },
  ]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Pending':
        return 'text-yellow-400 bg-yellow-500/20 border-yellow-500/30';
      case 'Confirmed':
        return 'text-green-400 bg-green-500/20 border-green-500/30';
      case 'Rejected':
        return 'text-red-400 bg-red-500/20 border-red-500/30';
      case 'Completed':
        return 'text-blue-400 bg-blue-500/20 border-blue-500/30';
      case 'Cancelled':
        return 'text-gray-400 bg-gray-500/20 border-gray-500/30';
      default:
        return 'text-gray-400 bg-gray-500/20 border-gray-500/30';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'Pending':
        return <Clock size={16} className="text-yellow-400" />;
      case 'Confirmed':
        return <CheckCircle size={16} className="text-green-400" />;
      case 'Rejected':
        return <XCircle size={16} className="text-red-400" />;
      case 'Completed':
        return <CheckCircle size={16} className="text-blue-400" />;
      case 'Cancelled':
        return <XCircle size={16} className="text-gray-400" />;
      default:
        return null;
    }
  };

  // Use real bookings if available, otherwise show legacy data
  const displayBookings = bookings.length > 0 ? bookings : legacyBookings;
  
  const pendingBookings = bookings.filter(b => b.status === 'Pending').length;
  const confirmedBookings = bookings.filter(b => b.status === 'Confirmed').length;
  const rejectedBookings = bookings.filter(b => b.status === 'Rejected').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-3xl font-orbitron font-bold text-gradient">Booking History</h1>
          <p className="text-gray-400 mt-1">View all membership bookings and subscriptions</p>
        </div>
      </motion.div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card className="relative overflow-hidden">
            <div className="flex items-start justify-between mb-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-yellow-500 to-orange-500 flex items-center justify-center">
                <Clock size={24} className="text-white" />
              </div>
            </div>
            <p className="text-gray-400 text-sm mb-1">Pending Bookings</p>
            <p className="text-3xl font-bold text-white font-orbitron">{pendingBookings}</p>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card className="relative overflow-hidden">
            <div className="flex items-start justify-between mb-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center">
                <CheckCircle size={24} className="text-white" />
              </div>
            </div>
            <p className="text-gray-400 text-sm mb-1">Confirmed Bookings</p>
            <p className="text-3xl font-bold text-white font-orbitron">{confirmedBookings}</p>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card className="relative overflow-hidden">
            <div className="flex items-start justify-between mb-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-red-500 to-pink-500 flex items-center justify-center">
                <XCircle size={24} className="text-white" />
              </div>
            </div>
            <p className="text-gray-400 text-sm mb-1">Rejected Bookings</p>
            <p className="text-3xl font-bold text-white font-orbitron">{rejectedBookings}</p>
          </Card>
        </motion.div>
      </div>

      {/* Bookings Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
      >
        <Card>
          <div className="mb-6">
            <h2 className="text-xl font-bold text-white">Trainer Booking Requests</h2>
            <p className="text-gray-400 text-sm">Manage member trainer session bookings</p>
          </div>

          {bookings.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-dark-border">
                    <th className="text-left py-3 px-4 text-gray-400 font-medium text-sm">Member</th>
                    <th className="text-left py-3 px-4 text-gray-400 font-medium text-sm">Trainer</th>
                    <th className="text-left py-3 px-4 text-gray-400 font-medium text-sm">Session Type</th>
                    <th className="text-left py-3 px-4 text-gray-400 font-medium text-sm">Date & Time</th>
                    <th className="text-left py-3 px-4 text-gray-400 font-medium text-sm">Status</th>
                    <th className="text-left py-3 px-4 text-gray-400 font-medium text-sm">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {bookings.map((booking, index) => (
                    <motion.tr
                      key={booking.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.5 + index * 0.05 }}
                      className="border-b border-dark-border/50 hover:bg-dark-border/30 transition-colors"
                    >
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-2">
                          <User size={16} className="text-gray-400" />
                          <div>
                            <p className="text-white font-medium">{booking.memberName}</p>
                            <p className="text-gray-400 text-xs">{booking.memberEmail}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <p className="text-white font-medium">{booking.trainerName}</p>
                      </td>
                      <td className="py-4 px-4">
                        <span className="px-3 py-1 bg-blue-500/20 text-blue-400 rounded-lg text-xs font-semibold">
                          {booking.sessionType}
                        </span>
                      </td>
                      <td className="py-4 px-4">
                        <div className="text-gray-300 text-sm">
                          <div className="flex items-center gap-2 mb-1">
                            <Calendar size={14} className="text-gray-400" />
                            <span>{new Date(booking.date).toLocaleDateString()}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Clock size={14} className="text-gray-400" />
                            <span>{booking.time}</span>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold uppercase border ${getStatusColor(booking.status)}`}>
                          {getStatusIcon(booking.status)}
                          {booking.status}
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        {booking.status === 'Pending' && (
                          <div className="flex items-center gap-2">
                            <Button
                              onClick={() => handleApproveBooking(booking)}
                              variant="primary"
                              className="px-3 py-1 text-xs flex items-center gap-1"
                            >
                              <Check size={14} />
                              Approve
                            </Button>
                            <Button
                              onClick={() => handleRejectBooking(booking)}
                              variant="ghost"
                              className="px-3 py-1 text-xs flex items-center gap-1 text-red-400 hover:text-red-300"
                            >
                              <X size={14} />
                              Reject
                            </Button>
                          </div>
                        )}
                        {booking.status === 'Confirmed' && (
                          <span className="text-green-400 text-xs">✓ Approved</span>
                        )}
                        {booking.status === 'Rejected' && (
                          <span className="text-red-400 text-xs">✗ Rejected</span>
                        )}
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-12">
              <Calendar size={64} className="text-gray-600 mx-auto mb-4" />
              <p className="text-gray-400 text-lg mb-2">No booking requests yet</p>
              <p className="text-gray-500 text-sm">Trainer booking requests from members will appear here</p>
            </div>
          )}
        </Card>
      </motion.div>
    </div>
  );
}
