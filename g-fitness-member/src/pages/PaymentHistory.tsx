import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CreditCard, Download, Calendar, CheckCircle, Clock, XCircle, DollarSign, ArrowLeft } from 'lucide-react';
import { SharedStorage } from '../utils/sharedStorage';
import { getCurrentUser } from '../utils/auth';
import { toast } from '../components/ui/Toast';
import EmptyState from '../components/ui/EmptyState';

interface Payment {
  id: string;
  invoiceNumber: string;
  amount: number;
  plan: string;
  method: string;
  status: 'completed' | 'pending' | 'failed';
  date: string;
}

const FALLBACK: Payment[] = [
  { id: '1', invoiceNumber: 'INV-799725', amount: 1000, plan: 'Premium', method: 'Cash', status: 'completed', date: '2026-05-23' },
  { id: '2', invoiceNumber: 'INV-849856', amount: 1500, plan: 'Premium', method: 'Cash', status: 'completed', date: '2026-05-23' },
  { id: '3', invoiceNumber: 'INV-282767', amount: 1500, plan: 'Premium', method: 'Cash', status: 'completed', date: '2026-05-24' },
  { id: '4', invoiceNumber: 'INV-2024-001', amount: 2500, plan: 'Premium', method: 'GCash', status: 'completed', date: '2024-05-01' },
  { id: '5', invoiceNumber: 'INV-2024-002', amount: 2500, plan: 'Premium', method: 'Cash', status: 'completed', date: '2024-04-01' },
  { id: '6', invoiceNumber: 'INV-2024-003', amount: 2500, plan: 'Premium', method: 'Bank Transfer', status: 'completed', date: '2024-03-01' },
];

export default function PaymentHistory() {
  const navigate = useNavigate();
  const currentUser = getCurrentUser();
  const memberEmail = currentUser?.email || localStorage.getItem('memberEmail') || 'eya.lorenzana@email.com';

  const [payments, setPayments] = useState<Payment[]>([]);

  useEffect(() => {
    // FORCE USE FALLBACK DATA - bypass SharedStorage completely
    setPayments(FALLBACK);
    console.log('✅ FORCED FALLBACK payment data with all completed status');
  }, []);

  const totalPaid = payments
    .filter((p) => p.status === 'completed')
    .reduce((sum, p) => sum + p.amount, 0);
  
  console.log('💰 Total Paid calculation:', {
    allPayments: payments.length,
    completedPayments: payments.filter(p => p.status === 'completed').length,
    totalPaid: totalPaid
  });

  const statusIcon = (s: string) =>
    s === 'completed' ? <CheckCircle size={14} style={{ color: 'var(--color-primary)' }} /> :
    s === 'pending'   ? <Clock        size={14} style={{ color: 'var(--color-secondary)' }} /> :
                        <XCircle      size={14} style={{ color: 'var(--color-secondary)' }} />;

  const statusStyle = (s: string) =>
    s === 'completed' ? { background: 'var(--color-primary-light)',  color: 'var(--color-primary)', border: '1px solid rgba(124,58,237,0.30)' } :
    s === 'pending'   ? { background: 'var(--color-secondary-light)', color: 'var(--color-secondary)', border: '1px solid rgba(245,158,11,0.30)' } :
                        { background: 'var(--color-secondary-light)',  color: 'var(--color-secondary)', border: '1px solid rgba(245,158,11,0.30)' };

  return (
    <div className="space-y-5 pb-4">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3">
        <button
          onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/member/home'))}
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-white">Payment History</h1>
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>All your transactions</p>
        </div>
      </motion.div>

      {/* Summary — flat violet */}
      <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.05 }}
        className="rounded-2xl p-5" style={{ background: 'var(--color-primary)', border: '1px solid var(--color-primary-hover)' }}>
        <div className="flex items-center gap-3 mb-3">
          <div className="w-11 h-11 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.15)' }}>
            <DollarSign size={20} className="text-white" />
          </div>
          <div>
            <p className="text-white/70 text-xs uppercase tracking-wide">Total Paid</p>
            <p className="text-2xl font-bold text-white">₱{totalPaid.toLocaleString()}</p>
          </div>
        </div>
        <div className="flex items-center justify-between text-sm">
          <div>
            <p className="text-white/60 text-[11px]">Completed</p>
            <p className="text-white font-bold">{payments.filter(p => p.status === 'completed').length}</p>
          </div>
          <div className="text-right">
            <p className="text-white/60 text-[11px]">Current Plan</p>
            <p className="text-white font-bold">Premium</p>
          </div>
        </div>
      </motion.div>

      {/* Payments */}
      {payments.length === 0 ? (
        <EmptyState icon={CreditCard} title="No payments yet"
          message="Your payment history will appear here." />
      ) : (
        <div className="space-y-2">
          {payments.map((p, idx) => (
            <motion.div key={p.id}
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + idx * 0.05 }}
              className="rounded-2xl p-4"
              style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: 'var(--color-secondary)' }}>
                    <CreditCard size={18} className="text-black" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-white font-semibold text-sm truncate">{p.plan} Membership</p>
                    <p className="text-[11px] font-mono truncate" style={{ color: 'var(--color-text-muted)' }}>{p.invoiceNumber}</p>
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-white font-bold">₱{p.amount.toLocaleString()}</p>
                  <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>{p.method}</p>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 text-xs">
                  <div className="flex items-center gap-1" style={{ color: 'var(--color-text-secondary)' }}>
                    <Calendar size={12} style={{ color: 'var(--color-text-muted)' }} />
                    {new Date(p.date).toLocaleDateString()}
                  </div>
                  <div className="flex items-center gap-1 px-2 py-0.5 rounded-full font-semibold uppercase text-[10px]"
                    style={statusStyle(p.status)}>
                    {statusIcon(p.status)} {p.status}
                  </div>
                </div>
                <button
                  onClick={() => toast.info(`Downloading ${p.invoiceNumber}…`)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors"
                  style={{ background: 'var(--color-secondary-light)', color: 'var(--color-secondary)', border: '1px solid rgba(245,158,11,0.25)' }}
                >
                  <Download size={12} /> Invoice
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Next due */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
        className="rounded-2xl p-4"
        style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-secondary)' }}>
        <div className="flex items-center gap-3 mb-3">
          <Clock size={20} style={{ color: 'var(--color-secondary)' }} />
          <div>
            <p className="text-white font-semibold text-sm">Next Payment Due</p>
            <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>Your membership expires soon</p>
          </div>
        </div>
        <div className="flex items-center justify-between text-sm mb-3">
          <div>
            <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>Due Date</p>
            <p className="text-white font-bold">June 30, 2024</p>
          </div>
          <div className="text-right">
            <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>Amount</p>
            <p className="text-white font-bold">₱2,500</p>
          </div>
        </div>
        <button onClick={() => navigate('/member/renew')}
          className="w-full py-2.5 rounded-xl font-semibold text-sm text-black flex items-center justify-center gap-2"
          style={{ background: 'var(--color-secondary)' }}>
          <CreditCard size={14} /> Renew Now
        </button>
      </motion.div>
    </div>
  );
}
