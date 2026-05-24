import { motion } from 'framer-motion';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Wallet, CheckCircle, ArrowLeft, Zap, Crown, CreditCard, AlertCircle } from 'lucide-react';
import { SharedStorage } from '../utils/sharedStorage';
import { getCurrentUser } from '../utils/auth';
import { toast } from '../components/ui/Toast';

const PLANS = [
  { id: 'basic',    name: 'G-Silver', label: 'Monthly', price: 800,  icon: CreditCard, accent: 'var(--color-text-muted)', description: 'All equipment except Treadmill and Boxing' },
  { id: 'standard', name: 'G-Gold',   label: 'Monthly', price: 1000, icon: Zap,        accent: 'var(--color-primary)', description: 'All equipment except Treadmill' },
  { id: 'premium',  name: 'G-Ruby',   label: 'Monthly', price: 1500, icon: Crown,      accent: 'var(--color-secondary)', description: 'All equipment with Personal Coach' },
];

export default function RenewMembership() {
  const navigate = useNavigate();
  const [selectedPlan, setSelectedPlan] = useState('premium');
  const [showSuccess, setShowSuccess] = useState(false);
  const [agreed, setAgreed] = useState(false);

  const handleSubmitRequest = () => {
    if (!agreed) {
      toast.error('Please agree to the Terms and Privacy Policy');
      return;
    }

    const currentUser = getCurrentUser();
    const selectedPlanData = PLANS.find(p => p.id === selectedPlan);

    // Create a pending payment/renewal request
    const payment = {
      id: `payment-${Date.now()}`,
      memberId: currentUser?.email || 'eya.lorenzana@email.com',
      memberName: currentUser?.name || 'Eya Lorenzana',
      memberEmail: currentUser?.email || 'eya.lorenzana@email.com',
      amount: selectedPlanData?.price || 0,
      method: 'Cash',
      date: new Date().toISOString().split('T')[0],
      notes: `Membership renewal request — ${selectedPlanData?.name} plan`,
      status: 'Pending', // Admin needs to approve
      createdAt: new Date().toISOString(),
    };

    SharedStorage.addPayment(payment);

    setShowSuccess(true);
    setTimeout(() => navigate('/member/payments'), 2500);
  };

  const selectedPlanData = PLANS.find(p => p.id === selectedPlan);

  if (showSuccess) {
    return (
      <div className="flex items-center justify-center h-full px-6">
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="text-center">
          <div className="w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6"
            style={{ background: 'var(--color-secondary-light)', border: '2px solid var(--color-secondary)' }}>
            <CheckCircle size={44} style={{ color: 'var(--color-secondary)' }} />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Request Submitted!</h2>
          <p className="text-sm mb-4" style={{ color: 'var(--color-text-muted)' }}>
            Please proceed to the gym reception to complete your payment.
          </p>
          <div className="rounded-xl p-4 mb-4" style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
            <div className="flex items-start gap-3 text-left">
              <AlertCircle size={20} style={{ color: 'var(--color-secondary)' }} className="flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-white font-semibold text-sm mb-1">Next Steps:</p>
                <ul className="text-xs space-y-1" style={{ color: 'var(--color-text-muted)' }}>
                  <li>1. Visit the gym reception</li>
                  <li>2. Pay ₱{selectedPlanData?.price.toLocaleString()} in cash</li>
                  <li>3. Admin will approve your renewal</li>
                  <li>4. Your membership will be activated</li>
                </ul>
              </div>
            </div>
          </div>
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            Redirecting to payment history...
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-4">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3">
        <button onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/member/home'))}
          className="w-10 h-10 rounded-full flex items-center justify-center"
          style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-white">Request Renewal</h1>
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Select your plan and submit request</p>
        </div>
      </motion.div>

      {/* Info Banner */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl p-4"
        style={{ background: 'var(--color-secondary-light)', border: '1px solid var(--color-secondary)' }}
      >
        <div className="flex items-start gap-3">
          <Wallet size={20} style={{ color: 'var(--color-secondary)' }} className="flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold mb-1" style={{ color: 'var(--color-secondary)' }}>
              Cash Payment Only
            </p>
            <p className="text-xs" style={{ color: 'rgba(245,158,11,0.8)' }}>
              Submit your renewal request, then visit the gym to pay in cash. Admin will approve after payment.
            </p>
          </div>
        </div>
      </motion.div>

      {/* Plans */}
      <div className="space-y-2">
        <h3 className="text-white font-semibold text-sm">Select Plan</h3>
        {PLANS.map((plan, i) => {
          const isActive = selectedPlan === plan.id;
          const Icon = plan.icon;
          return (
            <motion.button
              key={plan.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              onClick={() => setSelectedPlan(plan.id)}
              className="w-full p-4 rounded-2xl text-left transition-all active:scale-[0.98]"
              style={{
                background: 'var(--color-surface-raised)',
                border: `1.5px solid ${isActive ? plan.accent : 'var(--color-border)'}`,
              }}
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: 'var(--color-primary-light)' }}>
                  <Icon size={18} style={{ color: 'var(--color-primary)' }} />
                </div>
                <div className="flex-1">
                  <p className="text-white font-bold text-sm">{plan.name}</p>
                  <p className="text-[11px] mb-1" style={{ color: 'var(--color-text-muted)' }}>{plan.label}</p>
                  <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>{plan.description}</p>
                </div>
                <p className="text-lg font-bold" style={{ color: isActive ? plan.accent : 'var(--color-text-secondary)' }}>
                  ₱{plan.price.toLocaleString()}
                </p>
              </div>
            </motion.button>
          );
        })}
      </div>

      {/* Terms checkbox */}
      <label className="flex items-center gap-3 cursor-pointer">
        <div
          className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0 transition-colors"
          style={{
            background: agreed ? 'var(--color-primary)' : 'transparent',
            border: `1.5px solid ${agreed ? 'var(--color-primary)' : 'var(--color-border)'}`,
          }}
          onClick={() => setAgreed(!agreed)}
        >
          {agreed && <CheckCircle size={12} className="text-white" />}
        </div>
        <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
          I agree to the{' '}
          <span style={{ color: 'var(--color-primary)' }} className="font-semibold">Terms</span>
          {' '}and{' '}
          <span style={{ color: 'var(--color-primary)' }} className="font-semibold">Privacy Policy</span>
        </span>
      </label>

      {/* Summary */}
      <div className="rounded-2xl p-4 space-y-2"
        style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
        <h3 className="text-white font-semibold text-sm">Request Summary</h3>
        {[
          { label: 'Plan',           value: selectedPlanData?.name },
          { label: 'Duration',       value: '1 Month' },
          { label: 'Payment Method', value: 'Cash at Reception' },
          { label: 'Status',         value: 'Pending Approval' },
        ].map(row => (
          <div key={row.label} className="flex justify-between text-sm py-1">
            <span style={{ color: 'var(--color-text-muted)' }}>{row.label}</span>
            <span className="text-white font-semibold">{row.value}</span>
          </div>
        ))}
        <div className="pt-3 mt-1 flex justify-between" style={{ borderTop: '1px solid var(--color-border)' }}>
          <span className="text-white font-bold">Amount to Pay</span>
          <span className="text-xl font-bold" style={{ color: 'var(--color-secondary)' }}>
            ₱{selectedPlanData?.price.toLocaleString()}
          </span>
        </div>
      </div>

      {/* CTA */}
      <button
        onClick={handleSubmitRequest}
        disabled={!agreed}
        className="w-full h-12 rounded-full font-bold text-black flex items-center justify-center gap-2 disabled:opacity-40 transition-all active:scale-[0.97]"
        style={{ background: 'var(--color-secondary)' }}
      >
        SUBMIT RENEWAL REQUEST
      </button>
    </div>
  );
}
