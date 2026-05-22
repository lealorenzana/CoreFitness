import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  Mail,
  Phone,
  Lock,
  MapPin,
  Calendar,
  ArrowLeft,
  CheckCircle,
  Eye,
  EyeOff,
  CreditCard,
  Zap,
  Crown,
  Sparkles,
} from 'lucide-react';
import MobileFrame from '../components/layout/MobileFrame';
import LoadingOverlay from '../components/ui/LoadingOverlay';
import { showErrorToast } from '../utils/errorHandler';
import { PROTOTYPE_REGISTER, PROTOTYPE_LOADING_MS, getSelectedGym, setSelectedGym } from '../utils/prototype';

function getOverlayRoot(): HTMLElement | null {
  return document.getElementById('phone-overlay-root') ?? document.getElementById('phone-screen');
}

export default function Register() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    address: '',
    birthdate: '',
    password: '',
    confirmPassword: '',
    selectedPlan: 'premium',
    termsAccepted: false,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [overlayRoot, setOverlayRoot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setOverlayRoot(getOverlayRoot());
  }, []);

  const plans = [
    {
      id: 'basic',
      name: 'G-Silver',
      price: 800,
      icon: CreditCard,
      color: 'from-blue-500 to-cyan-500',
    },
    {
      id: 'standard',
      name: 'G-Gold',
      price: 1000,
      icon: Zap,
      color: 'from-purple-500 to-pink-500',
    },
    {
      id: 'premium',
      name: 'G-Ruby',
      price: 1500,
      icon: Crown,
      color: 'from-amber-500 to-yellow-500',
    },
  ];

  const fillStepData = (currentStep: number) => {
    if (currentStep === 1) {
      setFormData((prev) => ({
        ...prev,
        firstName: PROTOTYPE_REGISTER.firstName,
        lastName: PROTOTYPE_REGISTER.lastName,
        email: PROTOTYPE_REGISTER.email,
        phone: PROTOTYPE_REGISTER.phone,
      }));
    } else if (currentStep === 2) {
      setFormData((prev) => ({
        ...prev,
        address: PROTOTYPE_REGISTER.address,
        birthdate: PROTOTYPE_REGISTER.birthdate,
        password: PROTOTYPE_REGISTER.password,
        confirmPassword: PROTOTYPE_REGISTER.confirmPassword,
      }));
    } else {
      setFormData((prev) => ({
        ...prev,
        selectedPlan: PROTOTYPE_REGISTER.selectedPlan,
      }));
    }
  };

  const handleContinue = () => {
    if (step < 3) {
      fillStepData(step);
      setStep(step + 1);
      return;
    }

    if (!formData.termsAccepted) {
      showErrorToast({
        type: 'validation',
        message: 'Please accept the Terms and Privacy Policy',
        details: 'You must agree before completing registration',
      });
      return;
    }

    setIsLoading(true);
    fillStepData(3);

    setTimeout(() => {
      if (!getSelectedGym()) {
        setSelectedGym('g-fitness', 'G-Fitness');
      }
      setIsLoading(false);
      setShowSuccess(true);
      setTimeout(() => navigate('/login', { replace: true }), 2000);
    }, PROTOTYPE_LOADING_MS);
  };

  if (showSuccess) {
    return (
      <MobileFrame>
        <div className="flex items-center justify-center h-full px-6" style={{ backgroundColor: '#050400' }}>
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center">
            <CheckCircle size={64} className="text-violet mx-auto mb-6" />
            <h2 className="text-4xl font-bebas font-bold text-white mb-4">Welcome Aboard!</h2>
            <p className="text-white/60 mb-4">Registration successful</p>
            <div className="flex items-center justify-center gap-2 text-white/35 text-sm">
              <div className="w-2 h-2 bg-orange-400 rounded-full animate-pulse" />
              <span>Redirecting to login...</span>
            </div>
          </motion.div>
        </div>
      </MobileFrame>
    );
  }

  return (
    <MobileFrame>
      {overlayRoot &&
        isLoading &&
        createPortal(<LoadingOverlay message="Completing registration..." />, overlayRoot)}

      <div className="h-full flex flex-col" style={{ backgroundColor: '#050400' }}>
        <div className="flex-1 flex flex-col px-6 py-6 overflow-hidden">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex-1 flex flex-col min-h-0 overflow-hidden"
          >
            <div className="flex items-center justify-between mb-4">
              <button
                onClick={() => {
                  if (step === 1) navigate('/');
                  else setStep(step - 1);
                }}
                className="p-2 rounded-xl bg-gray-900 border border-gray-800 text-white/40 hover:text-white"
              >
                <ArrowLeft size={16} />
              </button>
              <div className="flex items-center gap-2">
                <Sparkles size={18} className="text-yellow-400" />
                <p className="text-lg font-bebas text-yellow-400">{step}/3</p>
              </div>
            </div>

            <div className="mb-4">
              <h1 className="text-3xl font-bebas font-bold text-white mb-1">
                {step === 1 ? 'PERSONAL INFO' : step === 2 ? 'ACCOUNT SETUP' : 'CHOOSE PLAN'}
              </h1>
              <p className="text-white/40 text-sm">
                {step === 1
                  ? 'Tell us about yourself'
                  : step === 2
                    ? 'Secure your account'
                    : 'Select your membership'}
              </p>
            </div>

            <div className="flex gap-2 mb-5">
              {[1, 2, 3].map((s) => (
                <div key={s} className="flex-1 h-1 rounded-full bg-gray-900 overflow-hidden">
                  <motion.div
                    animate={{ width: s <= step ? '100%' : '0%' }}
                    className="h-full rounded-full"
                    style={{ background: 'var(--color-secondary)' }}
                  />
                </div>
              ))}
            </div>

            <AnimatePresence mode="wait">
              {step === 1 && (
                <motion.div
                  key="step1"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-4 flex-1 overflow-y-auto"
                >
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-white/40 mb-1 block">First Name</label>
                      <input
                        type="text"
                        value={formData.firstName}
                        readOnly
                        className="w-full px-4 py-3 bg-gray-900/50 border border-gray-800 rounded-xl text-white"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-white/40 mb-1 block">Last Name</label>
                      <input
                        type="text"
                        value={formData.lastName}
                        readOnly
                        className="w-full px-4 py-3 bg-gray-900/50 border border-gray-800 rounded-xl text-white"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-white/40 mb-1 block">Email</label>
                    <div className="relative">
                      <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25" />
                      <input
                        type="email"
                        value={formData.email}
                        readOnly
                        className="w-full pl-10 pr-4 py-3 bg-gray-900/50 border border-gray-800 rounded-xl text-white"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-white/40 mb-1 block">Phone</label>
                    <div className="relative">
                      <Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25" />
                      <input
                        type="tel"
                        value={formData.phone}
                        readOnly
                        className="w-full pl-10 pr-4 py-3 bg-gray-900/50 border border-gray-800 rounded-xl text-white"
                      />
                    </div>
                  </div>
                </motion.div>
              )}

              {step === 2 && (
                <motion.div
                  key="step2"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-4 flex-1 overflow-y-auto"
                >
                  <div>
                    <label className="text-xs text-white/40 mb-1 block">Address</label>
                    <div className="relative">
                      <MapPin size={16} className="absolute left-3 top-3 text-white/25" />
                      <textarea
                        value={formData.address}
                        readOnly
                        rows={2}
                        className="w-full pl-10 pr-4 py-3 bg-gray-900/50 border border-gray-800 rounded-xl text-white resize-none"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-white/40 mb-1 block">Birthdate</label>
                    <div className="relative">
                      <Calendar size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25" />
                      <input
                        type="date"
                        value={formData.birthdate}
                        readOnly
                        className="w-full pl-10 pr-4 py-3 bg-gray-900/50 border border-gray-800 rounded-xl text-white"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-white/40 mb-1 block">Password</label>
                    <div className="relative">
                      <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={formData.password}
                        readOnly
                        className="w-full pl-10 pr-10 py-3 bg-gray-900/50 border border-gray-800 rounded-xl text-white"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-white/25"
                      >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-white/40 mb-1 block">Confirm Password</label>
                    <div className="relative">
                      <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25" />
                      <input
                        type={showConfirmPassword ? 'text' : 'password'}
                        value={formData.confirmPassword}
                        readOnly
                        className="w-full pl-10 pr-10 py-3 bg-gray-900/50 border border-gray-800 rounded-xl text-white"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-white/25"
                      >
                        {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}

              {step === 3 && (
                <motion.div
                  key="step3"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="flex-1 overflow-y-auto space-y-3"
                >
                  {plans.map((plan) => {
                    const Icon = plan.icon;
                    const isSelected = formData.selectedPlan === plan.id;
                    return (
                      <button
                        key={plan.id}
                        type="button"
                        onClick={() => setFormData({ ...formData, selectedPlan: plan.id })}
                        className={`w-full p-4 rounded-xl border-2 text-left transition-all ${
                          isSelected ? 'border-yellow-500 bg-yellow-500/8' : 'border-gray-800 bg-gray-900/50'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="p-2 rounded-lg" style={{ background: 'var(--color-primary)' }}>
                              <Icon size={16} className="text-white" />
                            </div>
                            <div>
                              <p className="text-white font-bebas">{plan.name}</p>
                              <p className="text-white/35 text-xs">Monthly</p>
                            </div>
                          </div>
                          <p className="text-xl font-bebas text-white">₱{plan.price}</p>
                        </div>
                      </button>
                    );
                  })}
                  <label className="flex items-start gap-3 mt-4 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.termsAccepted}
                      onChange={(e) =>
                        setFormData({ ...formData, termsAccepted: e.target.checked })
                      }
                      className="w-5 h-5 mt-0.5 rounded accent-yellow-500 cursor-pointer"
                    />
                    <span className="text-xs text-white/40 leading-relaxed">
                      I agree to the{' '}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          navigate('/terms');
                        }}
                        className="text-yellow-400 font-semibold hover:underline"
                      >
                        Terms
                      </button>{' '}
                      and{' '}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          navigate('/privacy');
                        }}
                        className="text-yellow-400 font-semibold hover:underline"
                      >
                        Privacy Policy
                      </button>
                    </span>
                  </label>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="shrink-0 pt-4">
              <button
                onClick={handleContinue}
                disabled={isLoading}
                className="w-full py-3 rounded-xl text-lg tracking-wide disabled:opacity-50 font-bold text-black"
                style={{ background: 'var(--color-secondary)' }}
              >
                {step === 3 ? 'COMPLETE REGISTRATION' : 'CONTINUE'}
              </button>
            </div>

            {step === 1 && (
              <p className="text-center text-xs text-white/35 mt-3">
                Already have an account?{' '}
                <button onClick={() => navigate('/login')} className="text-yellow-400 font-semibold">
                  Sign In
                </button>
              </p>
            )}
          </motion.div>
        </div>
      </div>
    </MobileFrame>
  );
}
