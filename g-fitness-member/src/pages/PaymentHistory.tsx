import { SkeletonList } from '../components/ui/Skeleton';
import { panelStyle } from '../components/ui/Card';
import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CreditCard, Calendar, CheckCircle, Clock, XCircle, Banknote, ArrowLeft } from 'lucide-react';
import EmptyState from '../components/ui/EmptyState';
import { toast } from '../components/ui/Toast';
import { errorMessage } from '../utils/errorMessage';
import { getCurrentMemberId } from '../services/bookingService';
import { listMemberPayments } from '../lib/api/payments';
import { getCurrentMembership, type MembershipWithPlan } from '../lib/api/memberships';
import type { PaymentRow, PaymentStatus } from '../types/db';

/**
 * The member's real payment history.
 *
 * This screen used to `setPayments(FALLBACK)` unconditionally — six invented
 * invoices totalling ₱11,500, two of them paid by GCash and bank transfer even
 * though the gym is cash-only, plus a hardcoded "Next Payment Due: June 30,
 * 2024 · ₱2,500" that never moved.
 *
 * Amounts shown are dated by `paid_on` (when the cash was handed over), not
 * `created_at` (when the front desk keyed it in). Those diverge whenever a
 * payment is recorded late, and the member's receipt should match the day they
 * actually paid.
 */

const STATUS_ICON: Record<PaymentStatus, React.ReactNode> = {
  completed: <CheckCircle size={14} style={{ color: 'var(--color-primary)' }} />,
  pending: <Clock size={14} style={{ color: 'var(--color-secondary)' }} />,
  failed: <XCircle size={14} style={{ color: '#ef4444' }} />,
};

const STATUS_STYLE: Record<PaymentStatus, { background: string; color: string }> = {
  completed: { background: 'var(--color-primary-light)', color: 'var(--color-primary)' },
  pending: { background: 'var(--color-secondary-light)', color: 'var(--color-secondary)' },
  failed: { background: 'rgba(239,68,68,0.15)', color: '#ef4444' },
};

export default function PaymentHistory() {
  const navigate = useNavigate();
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [membership, setMembership] = useState<MembershipWithPlan | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const id = await getCurrentMemberId();
        if (!id) {
          toast.error('Your session could not be verified. Please sign in again.');
          return;
        }
        const [rows, current] = await Promise.all([
          listMemberPayments(id),
          getCurrentMembership(id).catch(() => null),
        ]);
        if (cancelled) return;
        setPayments(rows);
        setMembership(current);
      } catch (err) {
        if (!cancelled) toast.error(errorMessage(err, 'Could not load your payments'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const completed = payments.filter((p) => p.status === 'completed');
  const totalPaid = completed.reduce((sum, p) => sum + Number(p.amount), 0);

  const expiry = membership?.expiry_date ?? null;

  return (
    <div className="space-y-5 pb-4">
      <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3">
        <button onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/member/home'))}
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ ...panelStyle, color: 'var(--color-text-secondary)' }}>
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-white">Payment History</h1>
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>All your transactions</p>
        </div>
      </motion.div>

      {loading ? (
        <SkeletonList />
      ) : (
        <>
          <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.05 }}
            className="rounded-2xl p-5" style={{ background: 'var(--color-primary)', border: '1px solid var(--color-primary-hover)' }}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-11 h-11 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.15)' }}>
                <Banknote size={20} className="text-white" />
              </div>
              <div>
                <p className="text-white/70 text-xs uppercase tracking-wide">Total Paid</p>
                <p className="text-2xl font-bold text-white">₱{totalPaid.toLocaleString()}</p>
              </div>
            </div>
            <div className="flex items-center justify-between text-sm">
              <div>
                <p className="text-white/60 text-xs">Payments</p>
                <p className="text-white font-bold">{completed.length}</p>
              </div>
              <div className="text-right">
                <p className="text-white/60 text-xs">Current Plan</p>
                <p className="text-white font-bold">{membership?.membership_plans?.name ?? 'None'}</p>
              </div>
            </div>
          </motion.div>

          {payments.length === 0 ? (
            <EmptyState icon={CreditCard} title="No payments yet"
              message="Payments recorded at the front desk will appear here." />
          ) : (
            <div className="space-y-2">
              {payments.map((p, idx) => {
                const style = STATUS_STYLE[p.status];
                return (
                  <motion.div key={p.id}
                    initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(0.1 + idx * 0.05, 0.4) }}
                    className="rounded-2xl p-4" style={panelStyle}>
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                          style={{ background: 'var(--color-secondary)' }}>
                          <Banknote size={18} className="text-black" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-white font-semibold text-sm truncate">Membership payment</p>
                          {p.invoice_number && (
                            <p className="text-xs font-mono truncate" style={{ color: 'var(--color-text-muted)' }}>
                              {p.invoice_number}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-white font-bold">₱{Number(p.amount).toLocaleString()}</p>
                        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{p.method}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 text-xs">
                      <div className="flex items-center gap-1" style={{ color: 'var(--color-text-secondary)' }}>
                        <Calendar size={12} style={{ color: 'var(--color-text-muted)' }} />
                        {new Date(`${p.paid_on}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </div>
                      <div className="flex items-center gap-1 px-2 py-0.5 rounded-full font-semibold uppercase text-xs" style={style}>
                        {STATUS_ICON[p.status]} {p.status}
                      </div>
                    </div>

                    {p.notes && (
                      <p className="text-xs mt-2 px-2 py-1 rounded-lg"
                        style={{ background: 'var(--color-bg)', color: 'var(--color-text-muted)' }}>
                        {p.notes}
                      </p>
                    )}
                  </motion.div>
                );
              })}
            </div>
          )}

          {/* Renewal prompt — only when there is a real expiry to show. */}
          {expiry && (
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
              className="rounded-2xl p-4"
              style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-secondary)' }}>
              <div className="flex items-center gap-3 mb-3">
                <Clock size={20} style={{ color: 'var(--color-secondary)' }} />
                <div>
                  <p className="text-white font-semibold text-sm">Membership valid until</p>
                  <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    {new Date(`${expiry}T00:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                  </p>
                </div>
              </div>
              <button onClick={() => navigate('/member/renew-membership')}
                className="w-full py-2.5 rounded-full font-semibold text-sm text-black flex items-center justify-center gap-2"
                style={{ background: 'var(--color-secondary)' }}>
                <CreditCard size={14} /> Renew
              </button>
            </motion.div>
          )}
        </>
      )}
    </div>
  );
}