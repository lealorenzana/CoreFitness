import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Check, Crown, Zap, CreditCard, Calendar, ArrowLeft } from 'lucide-react';

export default function Membership() {
  const navigate = useNavigate();
  
  const plans = [
    {
      name: 'Basic',
      price: '₱800',
      period: '/month',
      features: ['Gym Access', 'Locker Room', 'Basic Equipment'],
      color: 'from-blue-500 to-cyan-500',
      icon: Zap,
    },
    {
      name: 'Standard',
      price: '₱1,500',
      period: '/month',
      features: ['All Basic Features', 'Group Classes', 'Shower Facilities', 'Free Towel'],
      color: 'from-green-500 to-emerald-500',
      icon: Check,
      popular: true,
    },
    {
      name: 'Premium',
      price: '₱2,500',
      period: '/month',
      features: ['All Standard Features', 'Personal Trainer', 'Nutrition Plan', 'Priority Booking', 'Free Supplements'],
      color: 'from-primary-start to-primary-end',
      icon: Crown,
    },
  ];

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
          <h1 className="text-3xl font-orbitron font-bold text-gradient">Membership</h1>
          <p className="text-gray-400 mt-1">Choose your perfect plan</p>
        </div>
      </motion.div>

      {/* Current Plan */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.1 }}
        className="bg-dark-lighter border-2 border-primary-start rounded-2xl p-6"
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-gray-400 text-sm">Current Plan</p>
            <h3 className="text-2xl font-bold text-gradient font-orbitron">Premium</h3>
          </div>
          <Crown size={32} className="text-primary-start" />
        </div>
        <div className="space-y-2 mb-4">
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Status</span>
            <span className="text-green-400 font-semibold">Active</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Renewal Date</span>
            <span className="text-white font-semibold">Dec 31, 2024</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Days Remaining</span>
            <span className="text-yellow-400 font-semibold">15 days</span>
          </div>
        </div>
        <div className="space-y-2">
          <button
            onClick={() => navigate('/member/renew')}
            className="w-full py-3 bg-gradient-to-r from-primary-start to-primary-end text-white rounded-lg font-semibold hover:shadow-lg hover:shadow-primary-start/30 transition-all flex items-center justify-center gap-2"
          >
            <Calendar size={16} />
            Renew Now
          </button>
          <button
            onClick={() => navigate('/member/payments')}
            className="w-full py-2 bg-dark border-2 border-dark-border text-white rounded-lg font-semibold hover:border-primary-start transition-all flex items-center justify-center gap-2"
          >
            <CreditCard size={16} />
            Payment History
          </button>
        </div>
      </motion.div>

      {/* Plans */}
      <div className="space-y-4">
        {plans.map((plan, index) => {
          const Icon = plan.icon;
          return (
            <motion.div
              key={plan.name}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 + index * 0.1 }}
              className={`relative overflow-hidden rounded-2xl bg-dark-lighter border-2 ${
                plan.popular ? 'border-primary-start' : 'border-dark-border'
              } p-6`}
            >
              {plan.popular && (
                <div className="absolute top-4 right-4 bg-gradient-to-r from-primary-start to-primary-end px-3 py-1 rounded-full">
                  <p className="text-white text-xs font-bold">POPULAR</p>
                </div>
              )}

              <div className="flex items-start gap-4">
                <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${plan.color} flex items-center justify-center flex-shrink-0`}>
                  <Icon size={28} className="text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-white font-orbitron">{plan.name}</h3>
                  <div className="flex items-baseline gap-1 mt-2">
                    <span className="text-3xl font-bold text-gradient">{plan.price}</span>
                    <span className="text-gray-400 text-sm">{plan.period}</span>
                  </div>
                </div>
              </div>

              <div className="mt-4 space-y-2">
                {plan.features.map((feature) => (
                  <div key={feature} className="flex items-center gap-2">
                    <Check size={16} className="text-green-400" />
                    <span className="text-gray-300 text-sm">{feature}</span>
                  </div>
                ))}
              </div>

              <button className="w-full mt-6 py-3 bg-gradient-to-r from-primary-start to-primary-end text-white rounded-xl font-semibold hover:shadow-lg hover:shadow-primary-start/30 transition-all duration-200">
                Select Plan
              </button>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
