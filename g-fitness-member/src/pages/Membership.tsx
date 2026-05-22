import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Check, Crown, Zap, CreditCard, Calendar, ArrowLeft } from 'lucide-react';

const plans = [
  { name: 'Basic', price: '₱800', period: '/month', features: ['Gym Access', 'Locker Room', 'Basic Equipment'], color: 'var(--color-primary)', icon: Zap },
  { name: 'Standard', price: '₱1,500', period: '/month', features: ['All Basic Features', 'Group Classes', 'Shower Facilities', 'Free Towel'], color: 'var(--color-primary)', icon: Check, popular: true },
  { name: 'Premium', price: '₱2,500', period: '/month', features: ['All Standard Features', 'Personal Trainer', 'Nutrition Plan', 'Priority Booking', 'Free Supplements'], color: 'var(--color-secondary)', icon: Crown },
];

export default function Membership() {
  const navigate = useNavigate();

  return (
    <div className="space-y-5 pb-4">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3">
        <button onClick={() => navigate('/member/home')}
          className="w-10 h-10 rounded-xl flex items-center justify-center transition-colors"
          style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}
          onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--color-secondary)')}
          onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--color-border)')}>
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-white">Membership</h1>
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Choose your perfect plan</p>
        </div>
      </motion.div>

      {/* Current Plan */}
      <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1 }}
        className="rounded-2xl p-5" style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-secondary)' }}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Current Plan</p>
            <h3 className="text-2xl font-bold" style={{ color: 'var(--color-secondary)' }}>Premium</h3>
          </div>
          <Crown size={28} style={{ color: 'var(--color-secondary)' }} />
        </div>
        <div className="space-y-2 mb-4">
          {[
            { label: 'Status', value: 'Active', color: 'var(--color-primary)' },
            { label: 'Renewal Date', value: 'Dec 31, 2024', color: '#fff' },
            { label: 'Days Remaining', value: '15 days', color: 'var(--color-secondary)' },
          ].map(row => (
            <div key={row.label} className="flex justify-between text-sm">
              <span style={{ color: 'var(--color-text-muted)' }}>{row.label}</span>
              <span className="font-semibold" style={{ color: row.color }}>{row.value}</span>
            </div>
          ))}
        </div>
        <div className="space-y-2">
          <button onClick={() => navigate('/member/renew-membership')}
            className="w-full py-2.5 rounded-xl font-semibold text-sm text-black flex items-center justify-center gap-2"
            style={{ background: 'var(--color-secondary)' }}>
            <Calendar size={15} /> Renew Now
          </button>
          <button onClick={() => navigate('/member/payments')}
            className="w-full py-2.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-colors"
            style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--color-secondary)')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--color-border)')}>
            <CreditCard size={15} /> Payment History
          </button>
        </div>
      </motion.div>

      {/* Plans */}
      <div className="space-y-3">
        {plans.map((plan, i) => {
          const Icon = plan.icon;
          return (
            <motion.div key={plan.name} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 + i * 0.1 }}
              className="relative rounded-2xl p-5"
              style={{ background: 'var(--color-surface-raised)', border: `1px solid ${plan.popular ? plan.color : 'var(--color-border)'}` }}>
              {plan.popular && (
                <div className="absolute top-4 right-4 px-2.5 py-0.5 rounded-full text-xs font-bold text-black" style={{ background: plan.color }}>
                  POPULAR
                </div>
              )}
              <div className="flex items-start gap-4 mb-4">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${plan.color}20` }}>
                  <Icon size={22} style={{ color: plan.color }} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">{plan.name}</h3>
                  <div className="flex items-baseline gap-1 mt-0.5">
                    <span className="text-2xl font-bold" style={{ color: plan.color }}>{plan.price}</span>
                    <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{plan.period}</span>
                  </div>
                </div>
              </div>
              <div className="space-y-1.5 mb-4">
                {plan.features.map(f => (
                  <div key={f} className="flex items-center gap-2">
                    <Check size={14} className="text-violet flex-shrink-0" />
                    <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>{f}</span>
                  </div>
                ))}
              </div>
              <button onClick={() => navigate('/member/renew-membership')}
                className="w-full py-2.5 rounded-xl font-semibold text-sm transition-colors"
                style={{ background: plan.color, color: plan.color === 'var(--color-secondary)' ? '#000' : '#fff' }}>
                Select Plan
              </button>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
