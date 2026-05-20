import { motion } from 'framer-motion';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CreditCard, Smartphone, Building2, Wallet, CheckCircle, ArrowLeft } from 'lucide-react';
import { showErrorToast, showSuccessToast } from '../utils/errorHandler';
import { SharedStorage } from '../utils/sharedStorage';
import { getCurrentUser } from '../utils/auth';

export default function RenewMembership() {
  const navigate = useNavigate();
  const [selectedPlan, setSelectedPlan] = useState('premium');
  const [selectedMethod, setSelectedMethod] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);

  const plans = [
    { id: 'basic', name: 'Basic', price: 800, color: 'from-blue-500 to-cyan-500' },
    { id: 'standard', name: 'Standard', price: 1500, color: 'from-green-500 to-emerald-500' },
    { id: 'premium', name: 'Premium', price: 2500, color: 'from-orange-500 to-orange-400' },
  ];

  const paymentMethods = [
    { id: 'gcash', name: 'GCash', icon: Smartphone, description: 'Pay via GCash app' },
    { id: 'card', name: 'Credit/Debit Card', icon: CreditCard, description: 'Visa, Mastercard, etc.' },
    { id: 'bank', name: 'Bank Transfer', icon: Building2, description: 'Online banking' },
    { id: 'cash', name: 'Cash', icon: Wallet, description: 'Pay at reception' },
  ];

  const handlePayment = () => {
    if (!selectedMethod) {
      showErrorToast({ type: 'validation', message: 'Please select a payment method' });
      return;
    }

    const currentUser = getCurrentUser();
    const selectedPlanData = plans.find((p) => p.id === selectedPlan);
    
    // Create payment record
    const payment = {
      id: `payment-${Date.now()}`,
      memberId: currentUser?.email || 'eya.lorenzana@email.com',
      memberName: currentUser?.name || 'Eya Lorenzana',
      memberEmail: currentUser?.email || 'eya.lorenzana@email.com',
      amount: selectedPlanData?.price || 0,
      method: selectedMethod === 'gcash' ? 'GCash' : 
              selectedMethod === 'card' ? 'Credit Card' :
              selectedMethod === 'bank' ? 'Bank Transfer' : 'Cash',
      date: new Date().toISOString().split('T')[0],
      notes: `Membership renewal - ${selectedPlanData?.name} plan`,
      status: selectedMethod === 'cash' ? 'Pending' : 'Completed',
      createdAt: new Date().toISOString(),
    };
    
    // Save to shared storage (visible to admin)
    SharedStorage.addPayment(payment);

    if (selectedMethod === 'cash') {
      showSuccessToast('Payment confirmed! Please proceed to reception to complete payment.');
      setTimeout(() => navigate('/member/home'), 2000);
    } else {
      // Simulate payment processing
      setTimeout(() => {
        setShowSuccess(true);
        setTimeout(() => {
          navigate('/member/payments');
        }, 2000);
      }, 1500);
    }
  };

  const selectedPlanData = plans.find((p) => p.id === selectedPlan);

  if (showSuccess) {
    return (
      <div className="flex items-center justify-center h-full">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="text-center"
        >
          <div className="w-24 h-24 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-6">
            <CheckCircle size={48} className="text-green-400" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Payment Successful!</h2>
          <p className="text-gray-400">Your membership has been renewed</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-gray-400 hover:text-orange-400 transition-colors mb-4"
        >
          <ArrowLeft size={20} />
          Back
        </button>
        <h1 className="text-3xl font-orbitron font-bold bg-gradient-to-r from-orange-400 to-orange-300 bg-clip-text text-transparent">Renew Membership</h1>
        <p className="text-gray-400 mt-1">Select your plan and payment method</p>
      </motion.div>

      {/* Plan Selection */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <h3 className="text-white font-semibold mb-3">Select Plan</h3>
        <div className="space-y-3">
          {plans.map((plan) => (
            <button
              key={plan.id}
              onClick={() => setSelectedPlan(plan.id)}
              className={`w-full p-4 rounded-2xl border-2 transition-all ${
                selectedPlan === plan.id
                  ? 'border-orange-500 bg-orange-500/10'
                  : 'border-dark-border bg-dark-lighter hover:border-orange-500/50'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="text-left">
                  <p className="text-white font-semibold">{plan.name}</p>
                  <p className="text-gray-400 text-sm">Monthly membership</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold bg-gradient-to-r from-orange-400 to-orange-300 bg-clip-text text-transparent">₱{plan.price.toLocaleString()}</p>
                  <p className="text-gray-400 text-xs">/month</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </motion.div>

      {/* Payment Method Selection */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <h3 className="text-white font-semibold mb-3">Payment Method</h3>
        <div className="grid grid-cols-2 gap-3">
          {paymentMethods.map((method) => {
            const Icon = method.icon;
            return (
              <button
                key={method.id}
                onClick={() => setSelectedMethod(method.id)}
                className={`p-4 rounded-2xl border-2 transition-all ${
                  selectedMethod === method.id
                    ? 'border-orange-500 bg-orange-500/10'
                    : 'border-dark-border bg-dark-lighter hover:border-orange-500/50'
                }`}
              >
                <Icon size={24} className={selectedMethod === method.id ? 'text-orange-400' : 'text-gray-400'} />
                <p className={`text-sm font-semibold mt-2 ${selectedMethod === method.id ? 'text-white' : 'text-gray-300'}`}>
                  {method.name}
                </p>
                <p className="text-xs text-gray-400 mt-1">{method.description}</p>
              </button>
            );
          })}
        </div>
      </motion.div>

      {/* Summary */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="bg-dark-lighter border border-dark-border rounded-2xl p-6"
      >
        <h3 className="text-white font-semibold mb-4">Payment Summary</h3>
        <div className="space-y-3">
          <div className="flex justify-between">
            <span className="text-gray-400">Plan</span>
            <span className="text-white font-semibold">{selectedPlanData?.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Duration</span>
            <span className="text-white font-semibold">1 Month</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Payment Method</span>
            <span className="text-white font-semibold capitalize">
              {selectedMethod ? paymentMethods.find((m) => m.id === selectedMethod)?.name : 'Not selected'}
            </span>
          </div>
          <div className="border-t border-dark-border pt-3 mt-3">
            <div className="flex justify-between">
              <span className="text-white font-bold">Total</span>
              <span className="text-2xl font-bold bg-gradient-to-r from-orange-400 to-orange-300 bg-clip-text text-transparent">₱{selectedPlanData?.price.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Pay Button */}
      <motion.button
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        onClick={handlePayment}
        disabled={!selectedMethod}
        className="w-full py-4 bg-gradient-to-r from-orange-500 to-orange-400 text-white rounded-xl font-semibold hover:shadow-lg hover:shadow-orange-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {selectedMethod === 'cash' ? 'Confirm & Pay at Reception' : 'Pay Now'}
      </motion.button>
    </div>
  );
}
