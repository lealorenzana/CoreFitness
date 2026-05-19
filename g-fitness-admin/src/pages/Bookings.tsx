import { motion } from 'framer-motion';
import { useState } from 'react';
import Card from '../components/ui/Card';
import { Calendar, CreditCard, CheckCircle, Clock, XCircle, Package, User } from 'lucide-react';

interface Booking {
  id: string;
  memberName: string;
  memberId: string;
  plan: 'Basic' | 'Standard' | 'Premium';
  amount: number;
  paymentMethod: 'Cash' | 'GCash' | 'Bank Transfer' | 'Credit Card';
  bookingDate: string;
  startDate: string;
  expiryDate: string;
  status: 'active' | 'expired' | 'cancelled';
  invoiceNumber: string;
}

export default function Bookings() {
  const [bookings] = useState<Booking[]>([
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
      case 'active':
        return 'text-green-400 bg-green-500/20 border-green-500/30';
      case 'expired':
        return 'text-yellow-400 bg-yellow-500/20 border-yellow-500/30';
      case 'cancelled':
        return 'text-red-400 bg-red-500/20 border-red-500/30';
      default:
        return 'text-gray-400 bg-gray-500/20 border-gray-500/30';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <CheckCircle size={16} className="text-green-400" />;
      case 'expired':
        return <Clock size={16} className="text-yellow-400" />;
      case 'cancelled':
        return <XCircle size={16} className="text-red-400" />;
      default:
        return null;
    }
  };

  const getPlanColor = (plan: string) => {
    switch (plan) {
      case 'Premium':
        return 'from-purple-500 to-pink-500';
      case 'Standard':
        return 'from-blue-500 to-cyan-500';
      case 'Basic':
        return 'from-gray-500 to-gray-600';
      default:
        return 'from-gray-500 to-gray-600';
    }
  };

  const activeBookings = bookings.filter(b => b.status === 'active').length;
  const expiredBookings = bookings.filter(b => b.status === 'expired').length;
  const totalRevenue = bookings.filter(b => b.status === 'active').reduce((sum, b) => sum + b.amount, 0);

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
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center">
                <CheckCircle size={24} className="text-white" />
              </div>
            </div>
            <p className="text-gray-400 text-sm mb-1">Active Bookings</p>
            <p className="text-3xl font-bold text-white font-orbitron">{activeBookings}</p>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card className="relative overflow-hidden">
            <div className="flex items-start justify-between mb-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-yellow-500 to-orange-500 flex items-center justify-center">
                <Clock size={24} className="text-white" />
              </div>
            </div>
            <p className="text-gray-400 text-sm mb-1">Expired Bookings</p>
            <p className="text-3xl font-bold text-white font-orbitron">{expiredBookings}</p>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card className="relative overflow-hidden">
            <div className="flex items-start justify-between mb-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
                <Package size={24} className="text-white" />
              </div>
            </div>
            <p className="text-gray-400 text-sm mb-1">Total Value</p>
            <p className="text-3xl font-bold text-white font-orbitron">₱{totalRevenue.toLocaleString()}</p>
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
            <h2 className="text-xl font-bold text-white">All Bookings</h2>
            <p className="text-gray-400 text-sm">Complete history of membership bookings</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-dark-border">
                  <th className="text-left py-3 px-4 text-gray-400 font-medium text-sm">Invoice</th>
                  <th className="text-left py-3 px-4 text-gray-400 font-medium text-sm">Member</th>
                  <th className="text-left py-3 px-4 text-gray-400 font-medium text-sm">Plan</th>
                  <th className="text-left py-3 px-4 text-gray-400 font-medium text-sm">Amount</th>
                  <th className="text-left py-3 px-4 text-gray-400 font-medium text-sm">Payment Method</th>
                  <th className="text-left py-3 px-4 text-gray-400 font-medium text-sm">Booking Date</th>
                  <th className="text-left py-3 px-4 text-gray-400 font-medium text-sm">Membership Period</th>
                  <th className="text-left py-3 px-4 text-gray-400 font-medium text-sm">Status</th>
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
                      <p className="text-white font-mono text-sm font-semibold">{booking.invoiceNumber}</p>
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-2">
                        <User size={16} className="text-gray-400" />
                        <div>
                          <p className="text-white font-medium">{booking.memberName}</p>
                          <p className="text-gray-400 text-xs">{booking.memberId}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-gradient-to-r ${getPlanColor(booking.plan)}`}>
                        <Package size={14} className="text-white" />
                        <span className="text-white font-semibold text-sm">{booking.plan}</span>
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <p className="text-white font-bold text-lg">₱{booking.amount.toLocaleString()}</p>
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-2 text-gray-300">
                        <CreditCard size={14} className="text-gray-400" />
                        <span className="text-sm">{booking.paymentMethod}</span>
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-2 text-gray-300 text-sm">
                        <Calendar size={14} className="text-gray-400" />
                        {new Date(booking.bookingDate).toLocaleDateString()}
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <div className="text-gray-300 text-sm">
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-gray-500">Start:</span>
                          <span>{new Date(booking.startDate).toLocaleDateString()}</span>
                        </div>
                        <div className="flex items-center gap-1 mt-1">
                          <span className="text-xs text-gray-500">Expires:</span>
                          <span>{new Date(booking.expiryDate).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold uppercase border ${getStatusColor(booking.status)}`}>
                        {getStatusIcon(booking.status)}
                        {booking.status}
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </motion.div>
    </div>
  );
}
