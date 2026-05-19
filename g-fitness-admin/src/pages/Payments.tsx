import { motion } from 'framer-motion';
import { useState } from 'react';
import Card from '../components/ui/Card';
import RecordPaymentModal from '../components/ui/RecordPaymentModal';
import { exportPaymentsToCSV } from '../utils/exportUtils';
import { DollarSign, CreditCard, Calendar, CheckCircle, XCircle, Clock, TrendingUp, Download, Filter, Plus } from 'lucide-react';
import type { PaymentData } from '../types/member';
import { showToast } from '../utils/toast';

interface Payment {
  id: string;
  memberName: string;
  memberId: string;
  amount: number;
  plan: string;
  method: 'cash' | 'card' | 'gcash' | 'bank';
  status: 'completed' | 'pending' | 'failed';
  date: string;
  dueDate: string;
  invoiceNumber: string;
}

export default function Payments() {
  const [filterStatus, setFilterStatus] = useState<'all' | 'completed' | 'pending' | 'failed'>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [payments, setPayments] = useState<Payment[]>([
    {
      id: '1',
      memberName: 'Maria Santos',
      memberId: 'GF-2024-001',
      amount: 2500,
      plan: 'Premium',
      method: 'gcash',
      status: 'completed',
      date: '2024-06-01',
      dueDate: '2024-07-01',
      invoiceNumber: 'INV-2024-001',
    },
    {
      id: '2',
      memberName: 'Juan Dela Cruz',
      memberId: 'GF-2024-002',
      amount: 1500,
      plan: 'Standard',
      method: 'cash',
      status: 'completed',
      date: '2024-06-02',
      dueDate: '2024-07-02',
      invoiceNumber: 'INV-2024-002',
    },
    {
      id: '3',
      memberName: 'Pedro Reyes',
      memberId: 'GF-2024-003',
      amount: 800,
      plan: 'Basic',
      method: 'card',
      status: 'pending',
      date: '2024-06-03',
      dueDate: '2024-06-05',
      invoiceNumber: 'INV-2024-003',
    },
    {
      id: '4',
      memberName: 'Ana Garcia',
      memberId: 'GF-2024-004',
      amount: 2500,
      plan: 'Premium',
      method: 'bank',
      status: 'completed',
      date: '2024-06-03',
      dueDate: '2024-07-03',
      invoiceNumber: 'INV-2024-004',
    },
    {
      id: '5',
      memberName: 'Carlos Mendoza',
      memberId: 'GF-2024-005',
      amount: 1500,
      plan: 'Standard',
      method: 'gcash',
      status: 'failed',
      date: '2024-06-04',
      dueDate: '2024-06-04',
      invoiceNumber: 'INV-2024-005',
    },
  ]);

  const handleRecordPayment = (paymentData: any) => {
    const newPayment: Payment = {
      id: `${payments.length + 1}`,
      memberName: paymentData.memberName,
      memberId: paymentData.memberId,
      amount: paymentData.amount,
      plan: 'Standard', // You can enhance this based on member data
      method: paymentData.method.toLowerCase() as 'cash' | 'card' | 'gcash' | 'bank',
      status: 'completed',
      date: paymentData.date,
      dueDate: new Date(new Date(paymentData.date).setMonth(new Date(paymentData.date).getMonth() + 1)).toISOString().split('T')[0],
      invoiceNumber: `INV-2024-${String(payments.length + 1).padStart(3, '0')}`,
    };

    setPayments([newPayment, ...payments]);
  };

  const paymentStats = [
    {
      label: 'Total Revenue',
      value: '₱125,500',
      change: '+12%',
      icon: DollarSign,
      color: 'from-green-500 to-emerald-500',
    },
    {
      label: 'Completed',
      value: '45',
      change: '+8',
      icon: CheckCircle,
      color: 'from-blue-500 to-cyan-500',
    },
    {
      label: 'Pending',
      value: '5',
      change: '+2',
      icon: Clock,
      color: 'from-yellow-500 to-orange-500',
    },
    {
      label: 'Failed',
      value: '2',
      change: '-1',
      icon: XCircle,
      color: 'from-red-500 to-pink-500',
    },
  ];

  const filteredPayments = filterStatus === 'all' ? payments : payments.filter((p) => p.status === filterStatus);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'text-green-400 bg-green-500/20 border-green-500/30';
      case 'pending':
        return 'text-yellow-400 bg-yellow-500/20 border-yellow-500/30';
      case 'failed':
        return 'text-red-400 bg-red-500/20 border-red-500/30';
      default:
        return 'text-gray-400 bg-gray-500/20 border-gray-500/30';
    }
  };

  const getMethodIcon = (method: string) => {
    switch (method) {
      case 'cash':
        return '💵';
      case 'card':
        return '💳';
      case 'gcash':
        return '📱';
      case 'bank':
        return '🏦';
      default:
        return '💰';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-3xl font-orbitron font-bold text-gradient">Booking & Payment History</h1>
          <p className="text-gray-400 mt-1">Track membership bookings, payments and revenue</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsModalOpen(true)}
            className="px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-xl font-semibold hover:shadow-lg hover:shadow-green-500/30 transition-all flex items-center gap-2"
          >
            <Plus size={20} />
            Record Payment
          </button>
          <button 
            onClick={() => exportPaymentsToCSV(filteredPayments)}
            className="px-6 py-3 bg-gradient-to-r from-primary-start to-primary-end text-white rounded-xl font-semibold hover:shadow-lg hover:shadow-primary-start/30 transition-all flex items-center gap-2"
          >
            <Download size={20} />
            Export CSV
          </button>
        </div>
      </motion.div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {paymentStats.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              <Card className="relative overflow-hidden">
                <div className="flex items-start justify-between mb-4">
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${stat.color} flex items-center justify-center`}>
                    <Icon size={24} className="text-white" />
                  </div>
                  <div className="flex items-center gap-1 text-sm text-green-400">
                    <TrendingUp size={16} />
                    <span>{stat.change}</span>
                  </div>
                </div>
                <p className="text-gray-400 text-sm mb-1">{stat.label}</p>
                <p className="text-3xl font-bold text-white font-orbitron">{stat.value}</p>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* Filters */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="flex items-center gap-4"
      >
        <div className="flex items-center gap-2 text-gray-400">
          <Filter size={20} />
          <span className="text-sm font-medium">Filter by status:</span>
        </div>
        <div className="flex gap-2">
          {(['all', 'completed', 'pending', 'failed'] as const).map((status) => (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                filterStatus === status
                  ? 'bg-gradient-to-r from-primary-start to-primary-end text-white'
                  : 'bg-dark-lighter border border-dark-border text-gray-400 hover:border-primary-start'
              }`}
            >
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </button>
          ))}
        </div>
      </motion.div>

      {/* Payments Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
      >
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-dark-border">
                  <th className="text-left py-3 px-4 text-gray-400 font-medium text-sm">Invoice</th>
                  <th className="text-left py-3 px-4 text-gray-400 font-medium text-sm">Member</th>
                  <th className="text-left py-3 px-4 text-gray-400 font-medium text-sm">Plan</th>
                  <th className="text-left py-3 px-4 text-gray-400 font-medium text-sm">Amount</th>
                  <th className="text-left py-3 px-4 text-gray-400 font-medium text-sm">Method</th>
                  <th className="text-left py-3 px-4 text-gray-400 font-medium text-sm">Booking Date</th>
                  <th className="text-left py-3 px-4 text-gray-400 font-medium text-sm">Membership Period</th>
                  <th className="text-left py-3 px-4 text-gray-400 font-medium text-sm">Status</th>
                  <th className="text-left py-3 px-4 text-gray-400 font-medium text-sm">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredPayments.map((payment, index) => (
                  <motion.tr
                    key={payment.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.6 + index * 0.1 }}
                    className="border-b border-dark-border/50 hover:bg-dark-border/30 transition-colors"
                  >
                    <td className="py-4 px-4">
                      <p className="text-white font-mono text-sm">{payment.invoiceNumber}</p>
                    </td>
                    <td className="py-4 px-4">
                      <div>
                        <p className="text-white font-medium">{payment.memberName}</p>
                        <p className="text-gray-400 text-xs">{payment.memberId}</p>
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <span className="px-3 py-1 bg-primary-start/20 text-primary-start rounded-lg text-xs font-semibold">
                        {payment.plan}
                      </span>
                    </td>
                    <td className="py-4 px-4">
                      <p className="text-white font-bold text-lg">₱{payment.amount.toLocaleString()}</p>
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{getMethodIcon(payment.method)}</span>
                        <span className="text-gray-300 capitalize">{payment.method}</span>
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-2 text-gray-300 text-sm">
                        <Calendar size={14} className="text-gray-400" />
                        {new Date(payment.date).toLocaleDateString()}
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <div className="text-gray-300 text-sm">
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-gray-500">Start:</span>
                          <span>{new Date(payment.date).toLocaleDateString()}</span>
                        </div>
                        <div className="flex items-center gap-1 mt-1">
                          <span className="text-xs text-gray-500">Expires:</span>
                          <span>{new Date(payment.dueDate).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold uppercase border ${getStatusColor(payment.status)}`}>
                        {payment.status}
                      </span>
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-2">
                        <button className="px-3 py-1 bg-blue-500/20 text-blue-400 rounded-lg text-xs font-semibold hover:bg-blue-500/30 transition-all">
                          View
                        </button>
                        {payment.status === 'pending' && (
                          <button className="px-3 py-1 bg-green-500/20 text-green-400 rounded-lg text-xs font-semibold hover:bg-green-500/30 transition-all">
                            Confirm
                          </button>
                        )}
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </motion.div>

      {/* Record Payment Modal */}
      <RecordPaymentModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleRecordPayment}
      />
    </div>
  );
}
