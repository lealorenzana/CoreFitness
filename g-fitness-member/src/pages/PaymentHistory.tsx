import { motion } from 'framer-motion';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CreditCard, Download, Calendar, CheckCircle, Clock, XCircle, DollarSign, ArrowLeft } from 'lucide-react';

interface Payment {
  id: string;
  invoiceNumber: string;
  amount: number;
  plan: string;
  method: string;
  status: 'completed' | 'pending' | 'failed';
  date: string;
  dueDate: string;
}

export default function PaymentHistory() {
  const navigate = useNavigate();
  const [payments] = useState<Payment[]>([
    {
      id: '1',
      invoiceNumber: 'INV-2024-001',
      amount: 2500,
      plan: 'Premium',
      method: 'GCash',
      status: 'completed',
      date: '2024-05-01',
      dueDate: '2024-06-01',
    },
    {
      id: '2',
      invoiceNumber: 'INV-2024-002',
      amount: 2500,
      plan: 'Premium',
      method: 'Cash',
      status: 'completed',
      date: '2024-04-01',
      dueDate: '2024-05-01',
    },
    {
      id: '3',
      invoiceNumber: 'INV-2024-003',
      amount: 2500,
      plan: 'Premium',
      method: 'Bank Transfer',
      status: 'completed',
      date: '2024-03-01',
      dueDate: '2024-04-01',
    },
  ]);

  const totalPaid = payments
    .filter((p) => p.status === 'completed')
    .reduce((sum, p) => sum + p.amount, 0);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle size={20} className="text-green-400" />;
      case 'pending':
        return <Clock size={20} className="text-yellow-400" />;
      case 'failed':
        return <XCircle size={20} className="text-red-400" />;
      default:
        return null;
    }
  };

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

  const handleDownloadInvoice = (invoiceNumber: string) => {
    alert(`Downloading invoice ${invoiceNumber}...`);
  };

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
          className="w-10 h-10 rounded-xl bg-dark-lighter border border-dark-border flex items-center justify-center text-gray-400 hover:text-white hover:border-primary-start transition-all"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <h1 className="text-3xl font-orbitron font-bold text-gradient">Payment History</h1>
          <p className="text-gray-400 mt-1">View all your transactions</p>
        </div>
      </motion.div>

      {/* Summary Card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.1 }}
        className="bg-gradient-to-br from-primary-start via-primary-end to-secondary p-6 rounded-3xl shadow-2xl relative overflow-hidden"
      >
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <DollarSign size={24} className="text-white" />
            </div>
            <div>
              <p className="text-white/80 text-sm">Total Paid</p>
              <p className="text-3xl font-bold text-white font-orbitron">₱{totalPaid.toLocaleString()}</p>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white/70 text-xs">Completed Payments</p>
              <p className="text-white font-bold">{payments.filter((p) => p.status === 'completed').length}</p>
            </div>
            <div>
              <p className="text-white/70 text-xs">Current Plan</p>
              <p className="text-white font-bold">Premium</p>
            </div>
          </div>
        </div>
        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/10 rounded-full blur-3xl"></div>
      </motion.div>

      {/* Payment List */}
      <div className="space-y-4">
        {payments.map((payment, index) => (
          <motion.div
            key={payment.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 + index * 0.1 }}
            className="bg-dark-lighter border border-dark-border rounded-2xl p-4 hover:border-primary-start transition-all"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-start to-primary-end flex items-center justify-center">
                  <CreditCard size={20} className="text-white" />
                </div>
                <div>
                  <p className="text-white font-semibold">{payment.plan} Membership</p>
                  <p className="text-gray-400 text-xs font-mono">{payment.invoiceNumber}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-white font-bold text-lg">₱{payment.amount.toLocaleString()}</p>
                <p className="text-gray-400 text-xs">{payment.method}</p>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4 text-sm">
                <div className="flex items-center gap-2 text-gray-300">
                  <Calendar size={14} className="text-gray-400" />
                  {new Date(payment.date).toLocaleDateString()}
                </div>
                <div className="flex items-center gap-2">
                  {getStatusIcon(payment.status)}
                  <span className={`px-2 py-1 rounded-full text-xs font-semibold uppercase border ${getStatusColor(payment.status)}`}>
                    {payment.status}
                  </span>
                </div>
              </div>
              <button
                onClick={() => handleDownloadInvoice(payment.invoiceNumber)}
                className="flex items-center gap-2 px-3 py-1 bg-primary-start/20 text-primary-start rounded-lg text-xs font-semibold hover:bg-primary-start/30 transition-all"
              >
                <Download size={14} />
                Invoice
              </button>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Next Payment Due */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        className="bg-dark-lighter border-2 border-yellow-500/30 rounded-2xl p-6"
      >
        <div className="flex items-center gap-3 mb-4">
          <Clock size={24} className="text-yellow-400" />
          <div>
            <p className="text-white font-semibold">Next Payment Due</p>
            <p className="text-gray-400 text-sm">Your membership expires soon</p>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-gray-400 text-sm">Due Date</p>
            <p className="text-white font-bold">June 30, 2024</p>
          </div>
          <div>
            <p className="text-gray-400 text-sm">Amount</p>
            <p className="text-white font-bold">₱2,500</p>
          </div>
        </div>
        <button 
          onClick={() => navigate('/member/renew')}
          className="w-full mt-4 py-3 bg-gradient-to-r from-orange-500 to-orange-400 text-white rounded-xl font-semibold hover:shadow-lg hover:shadow-orange-500/30 transition-all"
        >
          Renew Now
        </button>
      </motion.div>
    </div>
  );
}
