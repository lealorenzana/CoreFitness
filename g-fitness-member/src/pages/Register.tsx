import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { User, Mail, Phone, Lock, MapPin, Calendar, ArrowLeft, CheckCircle, Eye, EyeOff, CreditCard, Zap, Crown, Sparkles } from 'lucide-react';
import MobileFrame from '../components/layout/MobileFrame';
import { register } from '../utils/auth';
import { validateRegistrationForm } from '../utils/validation';
import { showErrorToast, showSuccessToast } from '../utils/errorHandler';

export default function Register() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    firstName: 'Eya',
    lastName: 'Lorenzana',
    email: 'eya.lorenzana@email.com',
    phone: '09123456789',
    address: 'Mamburao, Occidental Mindoro',
    birthdate: '2000-01-01',
    password: '',
    confirmPassword: '',
    selectedPlan: 'premium',
    termsAccepted: false,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showSuccess, setShowSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const plans = [
    { id: 'basic', name: 'Basic', price: 800, icon: CreditCard, features: ['Limited gym equipment', 'Daily access'], color: 'from-blue-500 to-cyan-500' },
    { id: 'standard', name: 'Standard', price: 1500, icon: Zap, features: ['Full gym equipment', 'Group classes', 'Fitness assessment'], color: 'from-purple-500 to-pink-500' },
    { id: 'premium', name: 'Premium', price: 2500, icon: Crown, features: ['All Standard benefits', 'Personal trainer', 'Priority booking'], color: 'from-amber-500 to-orange-500' },
  ];

  const getPasswordStrength = (password: string) => {
    if (!password) return { strength: 0, label: '', color: '' };
    let strength = 0;
    if (password.length >= 6) strength++;
    if (password.length >= 10) strength++;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) strength++;
    if (/\d/.test(password)) strength++;
    if (/[^a-zA-Z0-9]/.test(password)) strength++;
    if (strength <= 2) return { strength: 33, label: 'Weak', color: 'bg-red-500' };
    if (strength <= 3) return { strength: 66, label: 'Medium', color: 'bg-yellow-500' };
    return { strength: 100, label: 'Strong', color: 'bg-green-500' };
  };

  const passwordStrength = getPasswordStrength(formData.password);

  const handleNext = () => {
    if (step === 1) {
      // Validate step 1 fields
      const step1Errors: Record<string, string> = {};
      if (!formData.firstName.trim()) step1Errors.firstName = 'First name is required';
      if (!formData.lastName.trim()) step1Errors.lastName = 'Last name is required';
      if (!formData.email.trim()) step1Errors.email = 'Email is required';
      if (!formData.phone.trim()) step1Errors.phone = 'Phone is required';
      
      if (Object.keys(step1Errors).length > 0) {
        setErrors(step1Errors);
        showErrorToast({ type: 'validation', message: 'Please fill in all required fields' });
        return;
      }
      setErrors({});
      setStep(2);
    } else if (step === 2) {
      // Validate step 2 fields
      const step2Errors: Record<string, string> = {};
      if (!formData.address.trim()) step2Errors.address = 'Address is required';
      if (!formData.birthdate) step2Errors.birthdate = 'Birthdate is required';
      if (!formData.password) step2Errors.password = 'Password is required';
      if (formData.password !== formData.confirmPassword) step2Errors.confirmPassword = 'Passwords do not match';
      
      if (Object.keys(step2Errors).length > 0) {
        setErrors(step2Errors);
        showErrorToast({ type: 'validation', message: 'Please complete all fields correctly' });
        return;
      }
      setErrors({});
      setStep(3);
    } else if (step === 3) {
      handleSubmit();
    }
  };

  const handleSubmit = () => {
    // Final validation
    const validation = validateRegistrationForm(formData);
    
    if (!validation.isValid) {
      setErrors(validation.errors);
      showErrorToast({ type: 'validation', message: 'Please fix the errors in the form' });
      return;
    }

    // Attempt registration
    const result = register(formData);
    
    if (result.success) {
      showSuccessToast('Registration successful! Please wait for admin approval.');
      setShowSuccess(true);
      setTimeout(() => navigate('/', { replace: true }), 10000);
    } else {
      showErrorToast({ type: 'validation', message: result.error || 'Registration failed' });
    }
  };

  if (showSuccess) {
    return (
      <MobileFrame>
        <div className="flex items-center justify-center h-full px-6" style={{ backgroundColor: '#0d0d0d' }}>
          <motion.div initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", duration: 0.6 }} className="text-center">
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.2, type: "spring", stiffness: 200 }} className="w-28 h-28 rounded-full bg-gradient-to-br from-green-500/20 to-emerald-500/20 flex items-center justify-center mx-auto mb-6 relative">
              <div className="absolute inset-0 rounded-full bg-gradient-to-br from-green-500 to-emerald-500 opacity-20 animate-pulse"></div>
              <CheckCircle size={56} className="text-green-400 relative z-10" />
            </motion.div>
            <motion.h2 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="text-4xl font-bebas font-bold text-white mb-6 tracking-wide">Welcome Aboard!</motion.h2>
            <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="text-gray-300 mb-2 text-lg">Registration Successful</motion.p>
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="bg-gray-900 border border-gray-800 rounded-2xl p-6 mt-6">
              <p className="text-sm text-gray-400 leading-relaxed">Your application has been submitted. Please wait for admin approval to activate your account.</p>
            </motion.div>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }} className="mt-6 flex items-center justify-center gap-2 text-gray-500 text-sm">
              <div className="w-2 h-2 bg-orange-400 rounded-full animate-pulse"></div>
              <span>Redirecting to login...</span>
            </motion.div>
          </motion.div>
        </div>
      </MobileFrame>
    );
  }

  return (
    <MobileFrame>
      <div className="h-full flex flex-col" style={{ backgroundColor: '#0d0d0d' }}>
        <div className="flex-1 flex flex-col px-6 py-6 overflow-hidden">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex-1 flex flex-col min-h-0 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <button onClick={() => { if (step === 1) navigate('/', { replace: true }); else setStep(step - 1); }} className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors group">
                <div className="p-2 rounded-xl bg-gray-900 border border-gray-800 group-hover:border-orange-500 transition-all">
                  <ArrowLeft size={16} />
                </div>
              </button>
              <div className="flex items-center gap-2">
                <Sparkles size={18} className="text-orange-400" />
                <p className="text-lg font-bebas tracking-wider text-orange-400">{step}/3</p>
              </div>
            </div>

            {/* Title */}
            <div className="mb-4">
              <h1 className="text-3xl font-bebas font-bold text-white mb-1 tracking-wide">
                {step === 1 ? 'PERSONAL INFO' : step === 2 ? 'ACCOUNT SETUP' : 'CHOOSE PLAN'}
              </h1>
              <p className="text-gray-400 text-base">
                {step === 1 ? 'Tell us about yourself' : step === 2 ? 'Secure your account' : 'Select your membership'}
              </p>
            </div>

            {/* Progress Bar */}
            <div className="flex gap-2 mb-5">
              {[1, 2, 3].map((s) => (
                <div key={s} className="flex-1 h-1 rounded-full bg-gray-900 overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }} 
                    animate={{ width: s <= step ? '100%' : '0%' }} 
                    transition={{ duration: 0.5 }}
                    className="h-full bg-gradient-to-r from-orange-500 to-orange-400 rounded-full" 
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
                  transition={{ duration: 0.3 }} 
                  className="space-y-5 flex-1 overflow-y-auto scrollbar-hide"
                >
                  {/* Name Fields - Side by Side */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-semibold text-gray-300 mb-2 uppercase tracking-wide">First Name <span className="text-orange-400">*</span></label>
                      <div className="relative group">
                        <div className="absolute inset-0 bg-gradient-to-r from-orange-500/10 to-transparent rounded-xl opacity-0 group-focus-within:opacity-100 transition-opacity"></div>
                        <input 
                          type="text" 
                          value={formData.firstName} 
                          onChange={(e) => { setFormData({ ...formData, firstName: e.target.value }); if (errors.firstName) setErrors({ ...errors, firstName: '' }); }} 
                          className={`relative w-full px-4 py-4 bg-gray-900/50 border ${errors.firstName ? 'border-red-500' : 'border-gray-800'} rounded-xl text-white placeholder-gray-600 focus:outline-none focus:border-orange-500 transition-all text-base`} 
                          placeholder="Eya" 
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-300 mb-2 uppercase tracking-wide">Last Name <span className="text-orange-400">*</span></label>
                      <div className="relative group">
                        <div className="absolute inset-0 bg-gradient-to-r from-orange-500/10 to-transparent rounded-xl opacity-0 group-focus-within:opacity-100 transition-opacity"></div>
                        <input 
                          type="text" 
                          value={formData.lastName} 
                          onChange={(e) => { setFormData({ ...formData, lastName: e.target.value }); if (errors.lastName) setErrors({ ...errors, lastName: '' }); }} 
                          className={`relative w-full px-4 py-4 bg-gray-900/50 border ${errors.lastName ? 'border-red-500' : 'border-gray-800'} rounded-xl text-white placeholder-gray-600 focus:outline-none focus:border-orange-500 transition-all text-base`} 
                          placeholder="Lorenzana" 
                        />
                      </div>
                    </div>
                  </div>

                  {/* Email */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-300 mb-2 uppercase tracking-wide">Email Address <span className="text-orange-400">*</span></label>
                    <div className="relative group">
                      <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600 group-focus-within:text-orange-400 transition-colors z-10" />
                      <div className="absolute inset-0 bg-gradient-to-r from-orange-500/10 to-transparent rounded-xl opacity-0 group-focus-within:opacity-100 transition-opacity"></div>
                      <input 
                        type="email" 
                        value={formData.email} 
                        onChange={(e) => { setFormData({ ...formData, email: e.target.value }); if (errors.email) setErrors({ ...errors, email: '' }); }} 
                        className={`relative w-full pl-12 pr-4 py-4 bg-gray-900/50 border ${errors.email ? 'border-red-500' : 'border-gray-800'} rounded-xl text-white placeholder-gray-600 focus:outline-none focus:border-orange-500 transition-all text-base`} 
                        placeholder="eya@email.com" 
                      />
                    </div>
                  </div>

                  {/* Phone */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-300 mb-2 uppercase tracking-wide">Phone Number <span className="text-orange-400">*</span></label>
                    <div className="relative group">
                      <Phone size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600 group-focus-within:text-orange-400 transition-colors z-10" />
                      <div className="absolute inset-0 bg-gradient-to-r from-orange-500/10 to-transparent rounded-xl opacity-0 group-focus-within:opacity-100 transition-opacity"></div>
                      <input 
                        type="tel" 
                        value={formData.phone} 
                        onChange={(e) => { setFormData({ ...formData, phone: e.target.value }); if (errors.phone) setErrors({ ...errors, phone: '' }); }} 
                        className={`relative w-full pl-12 pr-4 py-4 bg-gray-900/50 border ${errors.phone ? 'border-red-500' : 'border-gray-800'} rounded-xl text-white placeholder-gray-600 focus:outline-none focus:border-orange-500 transition-all text-base`} 
                        placeholder="09123456789" 
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
                  transition={{ duration: 0.3 }} 
                  className="space-y-3.5 flex-1 overflow-y-auto scrollbar-hide"
                >
                  {/* Address */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wide">Address <span className="text-orange-400">*</span></label>
                    <div className="relative group">
                      <MapPin size={16} className="absolute left-3.5 top-3 text-gray-600 group-focus-within:text-orange-400 transition-colors z-10" />
                      <div className="absolute inset-0 bg-gradient-to-r from-orange-500/10 to-transparent rounded-xl opacity-0 group-focus-within:opacity-100 transition-opacity"></div>
                      <textarea 
                        value={formData.address} 
                        onChange={(e) => { setFormData({ ...formData, address: e.target.value }); if (errors.address) setErrors({ ...errors, address: '' }); }} 
                        className={`relative w-full pl-10 pr-4 py-3 bg-gray-900/50 border ${errors.address ? 'border-red-500' : 'border-gray-800'} rounded-xl text-white placeholder-gray-600 focus:outline-none focus:border-orange-500 transition-all resize-none text-sm`} 
                        placeholder="Mamburao, Occidental Mindoro" 
                        rows={2} 
                      />
                    </div>
                  </div>

                  {/* Birthdate */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wide">Birthdate <span className="text-orange-400">*</span></label>
                    <div className="relative group">
                      <Calendar size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-600 group-focus-within:text-orange-400 transition-colors z-10" />
                      <div className="absolute inset-0 bg-gradient-to-r from-orange-500/10 to-transparent rounded-xl opacity-0 group-focus-within:opacity-100 transition-opacity"></div>
                      <input 
                        type="date" 
                        value={formData.birthdate} 
                        onChange={(e) => { setFormData({ ...formData, birthdate: e.target.value }); if (errors.birthdate) setErrors({ ...errors, birthdate: '' }); }} 
                        className={`relative w-full pl-10 pr-4 py-3 bg-gray-900/50 border ${errors.birthdate ? 'border-red-500' : 'border-gray-800'} rounded-xl text-white focus:outline-none focus:border-orange-500 transition-all text-sm`} 
                      />
                    </div>
                  </div>

                  {/* Password */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wide">Password <span className="text-orange-400">*</span></label>
                    <div className="relative group">
                      <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-600 group-focus-within:text-orange-400 transition-colors z-10" />
                      <div className="absolute inset-0 bg-gradient-to-r from-orange-500/10 to-transparent rounded-xl opacity-0 group-focus-within:opacity-100 transition-opacity"></div>
                      <input 
                        type={showPassword ? 'text' : 'password'} 
                        value={formData.password} 
                        onChange={(e) => { setFormData({ ...formData, password: e.target.value }); if (errors.password) setErrors({ ...errors, password: '' }); }} 
                        className={`relative w-full pl-10 pr-10 py-3 bg-gray-900/50 border ${errors.password ? 'border-red-500' : 'border-gray-800'} rounded-xl text-white placeholder-gray-600 focus:outline-none focus:border-orange-500 transition-all text-sm`} 
                        placeholder="Min. 6 characters" 
                      />
                      <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 hover:text-white transition-colors z-10">
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                    {formData.password && (
                      <div className="mt-1.5">
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-xs text-gray-500">Strength</span>
                          <span className={`text-xs font-semibold ${passwordStrength.label === 'Weak' ? 'text-red-400' : passwordStrength.label === 'Medium' ? 'text-yellow-400' : 'text-green-400'}`}>{passwordStrength.label}</span>
                        </div>
                        <div className="h-1 bg-gray-900 rounded-full overflow-hidden">
                          <motion.div initial={{ width: 0 }} animate={{ width: `${passwordStrength.strength}%` }} className={`h-full ${passwordStrength.color} rounded-full transition-all`} />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Confirm Password */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wide">Confirm Password <span className="text-orange-400">*</span></label>
                    <div className="relative group">
                      <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-600 group-focus-within:text-orange-400 transition-colors z-10" />
                      <div className="absolute inset-0 bg-gradient-to-r from-orange-500/10 to-transparent rounded-xl opacity-0 group-focus-within:opacity-100 transition-opacity"></div>
                      <input 
                        type={showConfirmPassword ? 'text' : 'password'} 
                        value={formData.confirmPassword} 
                        onChange={(e) => { setFormData({ ...formData, confirmPassword: e.target.value }); if (errors.confirmPassword) setErrors({ ...errors, confirmPassword: '' }); }} 
                        className={`relative w-full pl-10 pr-10 py-3 bg-gray-900/50 border ${errors.confirmPassword ? 'border-red-500' : 'border-gray-800'} rounded-xl text-white placeholder-gray-600 focus:outline-none focus:border-orange-500 transition-all text-sm`} 
                        placeholder="Re-enter password" 
                      />
                      <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 hover:text-white transition-colors z-10">
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
                  transition={{ duration: 0.3 }} 
                  className="flex-1 overflow-y-auto scrollbar-hide"
                >
                  <div className="space-y-3">
                    {plans.map((plan) => {
                      const Icon = plan.icon;
                      const isSelected = formData.selectedPlan === plan.id;
                      return (
                        <motion.button 
                          key={plan.id} 
                          onClick={() => setFormData({ ...formData, selectedPlan: plan.id })} 
                          className={`w-full p-4 rounded-xl border-2 transition-all duration-300 text-left relative overflow-hidden group ${isSelected ? 'border-white bg-white/5' : 'border-gray-800 bg-gray-900/50 hover:border-white'}`}
                        >
                          <div className="relative z-10">
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex items-center gap-2.5">
                                <div className={`p-2 rounded-lg bg-gradient-to-br ${plan.color}`}>
                                  <Icon size={16} className="text-white" />
                                </div>
                                <div>
                                  <p className="text-white font-bebas text-base tracking-wide">{plan.name}</p>
                                  <p className="text-gray-500 text-xs">Monthly Plan</p>
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="text-xl font-bebas text-white tracking-wide">₱{plan.price.toLocaleString()}</p>
                              </div>
                            </div>
                            <div className="space-y-1 pt-2 border-t border-gray-800">
                              {plan.features.map((feature, idx) => (
                                <div key={idx} className="flex items-center gap-2 text-xs text-gray-400">
                                  <div className="w-1 h-1 rounded-full bg-white"></div>
                                  {feature}
                                </div>
                              ))}
                            </div>
                          </div>
                        </motion.button>
                      );
                    })}
                  </div>

                  <div className="pt-3 border-t border-gray-800 mt-3">
                    <label className="flex items-start gap-3 cursor-pointer group">
                      <div className="relative flex-shrink-0 mt-0">
                        <input 
                          type="checkbox" 
                          checked={formData.termsAccepted} 
                          onChange={(e) => { setFormData({ ...formData, termsAccepted: e.target.checked }); if (errors.terms) setErrors({ ...errors, terms: '' }); }} 
                          className="peer w-5 h-5 rounded-lg border-2 border-gray-700 bg-gray-900 checked:bg-orange-500 checked:border-orange-500 appearance-none cursor-pointer transition-all"
                        />
                        <svg 
                          className={`absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-3 h-3 text-white pointer-events-none transition-all ${formData.termsAccepted ? 'opacity-100 scale-100' : 'opacity-0 scale-50'}`}
                          fill="none" 
                          stroke="currentColor" 
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <span className="text-xs text-gray-400 leading-relaxed">
                        I agree to the{' '}
                        <button type="button" onClick={(e) => { e.stopPropagation(); navigate('/terms'); }} className="text-orange-400 font-semibold hover:underline">Terms</button>
                        {' '}and{' '}
                        <button type="button" onClick={(e) => { e.stopPropagation(); navigate('/privacy'); }} className="text-orange-400 font-semibold hover:underline">Privacy Policy</button>
                      </span>
                    </label>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Continue Button */}
            <div className="flex-shrink-0 pt-4">
              <button 
                onClick={handleNext} 
                className="w-full py-2.5 bg-gray-900 border border-gray-700 text-white rounded-xl font-bebas text-base tracking-wide hover:bg-gray-800 hover:border-gray-600 hover:shadow-lg hover:shadow-gray-800/50 transition-all duration-300"
              >
                {step === 3 ? 'COMPLETE REGISTRATION' : 'CONTINUE'}
              </button>
            </div>

            {step === 1 && (
              <motion.p 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }} 
                transition={{ delay: 0.3 }} 
                className="text-center text-xs text-gray-500 mt-3 flex-shrink-0"
              >
                Already have an account? <button onClick={() => navigate('/', { replace: true })} className="text-orange-400 font-semibold hover:underline">Sign In</button>
              </motion.p>
            )}
          </motion.div>
        </div>
      </div>
    </MobileFrame>
  );
}
