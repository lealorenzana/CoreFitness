import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  Mail, Phone, Lock, MapPin, Calendar, ArrowLeft, ArrowRight,
  CheckCircle, Eye, EyeOff, User, CreditCard, Zap, Crown, CheckCircle2,
  Dumbbell, ShieldAlert,
} from 'lucide-react';
import MobileFrame from '../components/layout/MobileFrame';
import LoadingOverlay from '../components/ui/LoadingOverlay';
import { showErrorToast } from '../utils/errorHandler';
import { SharedStorage } from '../utils/sharedStorage';
import { PROTOTYPE_REGISTER, PROTOTYPE_LOADING_MS, getSelectedGym, setSelectedGym } from '../utils/prototype';
import { GYMS } from '../data/gyms';

function getOverlayRoot(): HTMLElement | null {
  return document.getElementById('phone-overlay-root') ?? document.getElementById('phone-screen');
}

const STEPS = ['Personal', 'Account', 'Plan'];
type RegisterRole = 'member' | 'trainer';

export default function Register() {
  const navigate = useNavigate();
  const selectedGym = getSelectedGym();
  const gymData = GYMS.find(g => g.id === selectedGym?.id) || GYMS[0];

  const [role, setRole] = useState<RegisterRole>('member');
  const [step, setStep] = useState(0); // 0 = role select, 1-3 = member steps
  const [formData, setFormData] = useState({
    firstName: '', lastName: '', email: '', phone: '',
    address: '', birthdate: '', password: '', confirmPassword: '',
    selectedPlan: 'standard', termsAccepted: false,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [overlayRoot, setOverlayRoot] = useState<HTMLElement | null>(null);

  useEffect(() => { setOverlayRoot(getOverlayRoot()); }, []);

  const update = (key: string, val: any) => setFormData(p => ({ ...p, [key]: val }));

  const plans = [
    { id: 'basic',    name: 'Basic',    price: 800,  icon: CreditCard, desc: 'Gym access + Locker',                    color: 'var(--color-primary)' },
    { id: 'standard', name: 'Standard', price: 1500, icon: Zap,        desc: 'Gym + Group classes + 2 PT sessions',    color: 'var(--color-secondary)' },
    { id: 'premium',  name: 'Premium',  price: 2500, icon: Crown,      desc: 'Unlimited + All classes + 8 PT + Sauna', color: '#22c55e' },
  ];

  const handleContinue = () => {
    if (step === 0) { setStep(1); return; }
    if (step === 1) {
      if (!formData.firstName) update('firstName', PROTOTYPE_REGISTER.firstName);
      if (!formData.lastName)  update('lastName',  PROTOTYPE_REGISTER.lastName);
      if (!formData.email)     update('email',     PROTOTYPE_REGISTER.email);
      if (!formData.phone)     update('phone',     PROTOTYPE_REGISTER.phone);
      setStep(2); return;
    }
    if (step === 2) {
      if (!formData.address)   update('address',   PROTOTYPE_REGISTER.address);
      if (!formData.birthdate) update('birthdate', PROTOTYPE_REGISTER.birthdate);
      if (!formData.password)  { update('password', PROTOTYPE_REGISTER.password); update('confirmPassword', PROTOTYPE_REGISTER.confirmPassword); }
      setStep(3); return;
    }
    if (!formData.termsAccepted) {
      showErrorToast({ type: 'validation', message: 'Please accept the Terms and Privacy Policy', details: '' });
      return;
    }
    setIsLoading(true);
    setTimeout(() => {
      if (!getSelectedGym()) setSelectedGym('g-fitness', 'G-Fitness');
      const planMap: Record<string, string> = { basic: 'Basic', standard: 'Standard', premium: 'Premium' };
      SharedStorage.addPendingRegistration({
        id: `pending-${Date.now()}`,
        firstName: formData.firstName || PROTOTYPE_REGISTER.firstName,
        lastName:  formData.lastName  || PROTOTYPE_REGISTER.lastName,
        fullName:  `${formData.firstName || PROTOTYPE_REGISTER.firstName} ${formData.lastName || PROTOTYPE_REGISTER.lastName}`,
        email:     formData.email    || PROTOTYPE_REGISTER.email,
        phone:     formData.phone    || PROTOTYPE_REGISTER.phone,
        address:   formData.address  || PROTOTYPE_REGISTER.address,
        membershipType: planMap[formData.selectedPlan] || 'Standard',
        registeredAt: new Date().toISOString(),
        status: 'Pending',
      });
      localStorage.setItem('registration_pending', 'true');
      setIsLoading(false);
      setShowSuccess(true);
      setTimeout(() => navigate('/login', { replace: true }), 2500);
    }, PROTOTYPE_LOADING_MS);
  };

  // ── Success Screen ──
  if (showSuccess) {
    return (
      <MobileFrame>
        <div className="flex items-center justify-center h-full px-6" style={{ backgroundColor: '#050400' }}>
          <motion.div initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center space-y-4">
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', delay: 0.2 }}
              className="w-20 h-20 rounded-full flex items-center justify-center mx-auto"
              style={{ background: 'var(--color-primary-light)', border: '3px solid var(--color-primary)' }}>
              <CheckCircle size={40} style={{ color: 'var(--color-primary)' }} />
            </motion.div>
            <h2 className="text-2xl font-bold text-white">Registration Submitted!</h2>
            <p className="text-sm text-white/60">Please visit the gym reception to pay and activate your membership.</p>
            <div className="rounded-xl px-4 py-3" style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)' }}>
              <p className="text-xs font-semibold" style={{ color: 'var(--color-secondary)' }}>⏳ Status: Pending Admin Approval</p>
              <p className="text-[10px] mt-1 text-white/40">Your account activates once payment is confirmed</p>
            </div>
            <div className="flex items-center justify-center gap-2 text-white/30 text-xs">
              <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--color-primary)' }} />
              Redirecting to login...
            </div>
          </motion.div>
        </div>
      </MobileFrame>
    );
  }

  // ── Input helper ──
  const Field = ({ label, icon: Icon, type = 'text', value, onChange, placeholder }: any) => (
    <div>
      <label className="text-[10px] uppercase font-medium block mb-1.5" style={{ color: 'var(--color-text-muted)' }}>{label}</label>
      <div className="relative">
        {Icon && <Icon size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'rgba(245,158,11,0.5)' }} />}
        <input type={type} value={value} onChange={onChange} placeholder={placeholder}
          className="w-full rounded-xl text-white text-sm outline-none transition-all"
          style={{
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(245,158,11,0.2)',
            paddingLeft: Icon ? '2.25rem' : '0.75rem', paddingRight: '0.75rem',
            paddingTop: '0.625rem', paddingBottom: '0.625rem',
          }}
          onFocus={e => { e.currentTarget.style.border = '1px solid rgba(245,158,11,0.5)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(245,158,11,0.08)'; }}
          onBlur={e => { e.currentTarget.style.border = '1px solid rgba(245,158,11,0.2)'; e.currentTarget.style.boxShadow = 'none'; }}
        />
      </div>
    </div>
  );

  return (
    <MobileFrame>
      {overlayRoot && isLoading && createPortal(<LoadingOverlay message="Completing registration..." />, overlayRoot)}

      <div className="h-full flex flex-col" style={{ backgroundColor: '#050400' }}>
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-80 h-80 rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(245,158,11,0.06) 0%, transparent 70%)' }} />

        <div className="flex-1 flex flex-col px-5 py-5 overflow-hidden relative z-10">
          {/* Header */}
          <div className="flex items-center justify-between mb-4 flex-shrink-0">
            <button onClick={() => step === 0 ? navigate('/login') : setStep(step - 1)}
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)' }}>
              <ArrowLeft size={16} />
            </button>
            <div className="text-center">
              <p className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--color-text-muted)' }}>
                {step === 0 ? 'Sign Up' : `Step ${step} of 3`}
              </p>
              <p className="text-sm font-bold text-white">
                {step === 0 ? 'Choose Role' : step === 1 ? 'Personal' : step === 2 ? 'Account' : 'Plan'}
              </p>
            </div>
            <img src={gymData.logo} alt={gymData.name} className="w-9 h-9 rounded-xl object-contain"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }} />
          </div>

          {/* Progress bar (only for member steps) */}
          {step > 0 && role === 'member' && (
            <div className="flex gap-1.5 mb-5 flex-shrink-0">
              {[1, 2, 3].map(s => (
                <div key={s} className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                  <motion.div animate={{ width: s <= step ? '100%' : '0%' }} transition={{ duration: 0.4 }}
                    className="h-full rounded-full" style={{ background: 'var(--color-secondary)' }} />
                </div>
              ))}
            </div>
          )}

          {/* Content */}
          <div className="flex-1 overflow-y-auto scrollbar-hide">
            <AnimatePresence mode="wait">

              {/* ── STEP 0: Role Selection ── */}
              {step === 0 && (
                <motion.div key="role" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                  className="space-y-4 pb-4">
                  <div>
                    <h1 className="text-xl font-bold text-white">Create Account</h1>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>Select your role to get started</p>
                  </div>

                  {/* Role cards */}
                  <div className="space-y-3">
                    {/* Member */}
                    <button onClick={() => setRole('member')}
                      className="w-full p-4 rounded-2xl text-left flex items-center gap-4 transition-all relative"
                      style={{
                        background: role === 'member' ? 'rgba(245,158,11,0.08)' : 'rgba(255,255,255,0.04)',
                        border: `2px solid ${role === 'member' ? 'var(--color-secondary)' : 'rgba(255,255,255,0.08)'}`,
                      }}>
                      {role === 'member' && (
                        <span className="absolute top-3 right-3">
                          <CheckCircle2 size={16} style={{ color: 'var(--color-secondary)' }} />
                        </span>
                      )}
                      <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ background: role === 'member' ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.06)' }}>
                        <User size={22} style={{ color: role === 'member' ? 'var(--color-secondary)' : 'rgba(255,255,255,0.3)' }} />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-white">Member</p>
                        <p className="text-[10px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                          Register as a gym member. Choose a plan and get access to all member features.
                        </p>
                      </div>
                    </button>

                    {/* Trainer */}
                    <button onClick={() => setRole('trainer')}
                      className="w-full p-4 rounded-2xl text-left flex items-center gap-4 transition-all relative"
                      style={{
                        background: role === 'trainer' ? 'var(--color-primary-light)' : 'rgba(255,255,255,0.04)',
                        border: `2px solid ${role === 'trainer' ? 'var(--color-primary)' : 'rgba(255,255,255,0.08)'}`,
                      }}>
                      {role === 'trainer' && (
                        <span className="absolute top-3 right-3">
                          <CheckCircle2 size={16} style={{ color: 'var(--color-primary)' }} />
                        </span>
                      )}
                      <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ background: role === 'trainer' ? 'rgba(124,58,237,0.2)' : 'rgba(255,255,255,0.06)' }}>
                        <Dumbbell size={22} style={{ color: role === 'trainer' ? 'var(--color-primary)' : 'rgba(255,255,255,0.3)' }} />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-white">Trainer</p>
                        <p className="text-[10px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                          Trainer accounts are created by the gym admin. Contact your gym to get your login credentials.
                        </p>
                      </div>
                    </button>
                  </div>

                  {/* Trainer info box */}
                  {role === 'trainer' && (
                    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                      className="p-4 rounded-2xl space-y-2"
                      style={{ background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.25)' }}>
                      <div className="flex items-center gap-2">
                        <ShieldAlert size={16} style={{ color: 'var(--color-primary)' }} />
                        <p className="text-xs font-semibold text-white">Trainer Access Info</p>
                      </div>
                      <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                        Trainer accounts are managed by the gym administrator. The admin will create your account and provide your login credentials (email + password).
                      </p>
                      <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                        Once you have your credentials, go to <span className="text-white font-semibold">Login → Select "Trainer" → Enter credentials</span>.
                      </p>
                      <button onClick={() => navigate('/login')}
                        className="w-full py-2 rounded-xl text-xs font-semibold mt-1"
                        style={{ background: 'var(--color-primary)', color: '#fff' }}>
                        Go to Login
                      </button>
                    </motion.div>
                  )}
                </motion.div>
              )}

              {/* ── STEP 1: Personal Info (Member only) ── */}
              {step === 1 && (
                <motion.div key="s1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                  className="space-y-3 pb-4">
                  <div className="mb-1">
                    <h1 className="text-xl font-bold text-white">Personal Information</h1>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>Tell us about yourself</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="First Name" icon={User} value={formData.firstName} placeholder="Eya"
                      onChange={(e: any) => update('firstName', e.target.value)} />
                    <Field label="Last Name" icon={User} value={formData.lastName} placeholder="Lorenzana"
                      onChange={(e: any) => update('lastName', e.target.value)} />
                  </div>
                  <Field label="Email Address" icon={Mail} type="email" value={formData.email}
                    placeholder="eya@email.com" onChange={(e: any) => update('email', e.target.value)} />
                  <Field label="Phone Number" icon={Phone} type="tel" value={formData.phone}
                    placeholder="+63 912 345 6789" onChange={(e: any) => update('phone', e.target.value)} />
                </motion.div>
              )}

              {/* ── STEP 2: Account Setup ── */}
              {step === 2 && (
                <motion.div key="s2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                  className="space-y-3 pb-4">
                  <div className="mb-1">
                    <h1 className="text-xl font-bold text-white">Account Setup</h1>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>Secure your account</p>
                  </div>
                  <Field label="Home Address" icon={MapPin} value={formData.address}
                    placeholder="Mamburao, Occidental Mindoro" onChange={(e: any) => update('address', e.target.value)} />
                  <Field label="Birthdate" icon={Calendar} type="date" value={formData.birthdate}
                    onChange={(e: any) => update('birthdate', e.target.value)} />
                  <div>
                    <label className="text-[10px] uppercase font-medium block mb-1.5" style={{ color: 'var(--color-text-muted)' }}>Password</label>
                    <div className="relative">
                      <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'rgba(245,158,11,0.5)' }} />
                      <input type={showPassword ? 'text' : 'password'} value={formData.password}
                        onChange={e => update('password', e.target.value)} placeholder="Min. 6 characters"
                        className="w-full rounded-xl text-white text-sm outline-none pl-9 pr-10 py-2.5"
                        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(245,158,11,0.2)' }}
                        onFocus={e => { e.currentTarget.style.border = '1px solid rgba(245,158,11,0.5)'; }}
                        onBlur={e => { e.currentTarget.style.border = '1px solid rgba(245,158,11,0.2)'; }} />
                      <button type="button" onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30">
                        {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] uppercase font-medium block mb-1.5" style={{ color: 'var(--color-text-muted)' }}>Confirm Password</label>
                    <div className="relative">
                      <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'rgba(245,158,11,0.5)' }} />
                      <input type={showConfirmPassword ? 'text' : 'password'} value={formData.confirmPassword}
                        onChange={e => update('confirmPassword', e.target.value)} placeholder="Re-enter password"
                        className="w-full rounded-xl text-white text-sm outline-none pl-9 pr-10 py-2.5"
                        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(245,158,11,0.2)' }}
                        onFocus={e => { e.currentTarget.style.border = '1px solid rgba(245,158,11,0.5)'; }}
                        onBlur={e => { e.currentTarget.style.border = '1px solid rgba(245,158,11,0.2)'; }} />
                      <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30">
                        {showConfirmPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* ── STEP 3: Choose Plan ── */}
              {step === 3 && (
                <motion.div key="s3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                  className="space-y-3 pb-4">
                  <div className="mb-1">
                    <h1 className="text-xl font-bold text-white">Choose Your Plan</h1>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>Select a membership that fits you</p>
                  </div>
                  {plans.map(plan => {
                    const Icon = plan.icon;
                    const isSelected = formData.selectedPlan === plan.id;
                    return (
                      <button key={plan.id} type="button" onClick={() => update('selectedPlan', plan.id)}
                        className="w-full p-4 rounded-2xl text-left transition-all relative"
                        style={{
                          background: isSelected ? `${plan.color}12` : 'rgba(255,255,255,0.04)',
                          border: `2px solid ${isSelected ? plan.color : 'rgba(255,255,255,0.08)'}`,
                        }}>
                        {isSelected && (
                          <span className="absolute top-3 right-3">
                            <CheckCircle2 size={16} style={{ color: plan.color }} />
                          </span>
                        )}
                        <div className="flex items-center gap-3">
                          <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                            style={{ background: `${plan.color}20` }}>
                            <Icon size={20} style={{ color: plan.color }} />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center justify-between">
                              <p className="text-sm font-bold text-white">{plan.name}</p>
                              <p className="text-base font-bold" style={{ color: plan.color }}>₱{plan.price}<span className="text-[10px] text-white/40">/mo</span></p>
                            </div>
                            <p className="text-[10px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{plan.desc}</p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                  <label className="flex items-start gap-3 mt-2 cursor-pointer p-3 rounded-xl"
                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div onClick={() => update('termsAccepted', !formData.termsAccepted)}
                      className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors"
                      style={{ background: formData.termsAccepted ? 'var(--color-secondary)' : 'rgba(255,255,255,0.08)', border: `1px solid ${formData.termsAccepted ? 'var(--color-secondary)' : 'rgba(255,255,255,0.15)'}` }}>
                      {formData.termsAccepted && <CheckCircle2 size={12} className="text-black" />}
                    </div>
                    <span className="text-[11px] text-white/50 leading-relaxed">
                      I agree to the{' '}
                      <button type="button" onClick={e => { e.preventDefault(); navigate('/terms'); }}
                        className="font-semibold" style={{ color: 'var(--color-secondary)' }}>Terms</button>
                      {' '}and{' '}
                      <button type="button" onClick={e => { e.preventDefault(); navigate('/privacy'); }}
                        className="font-semibold" style={{ color: 'var(--color-secondary)' }}>Privacy Policy</button>
                    </span>
                  </label>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* CTA Button — hide if trainer selected on step 0 */}
          {!(step === 0 && role === 'trainer') && (
            <div className="flex-shrink-0 pt-3">
              <button onClick={handleContinue} disabled={isLoading}
                className="w-full py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                style={{ background: 'var(--color-secondary)', color: '#000' }}>
                {step === 3 ? (
                  <><CheckCircle size={16} /> Complete Registration</>
                ) : (
                  <>Continue <ArrowRight size={16} /></>
                )}
              </button>
              {step === 0 && (
                <p className="text-center text-[11px] text-white/30 mt-3">
                  Already have an account?{' '}
                  <button onClick={() => navigate('/login')} className="font-semibold" style={{ color: 'var(--color-secondary)' }}>
                    Sign In
                  </button>
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </MobileFrame>
  );
}

function getOverlayRoot(): HTMLElement | null {
  return document.getElementById('phone-overlay-root') ?? document.getElementById('phone-screen');
}

const STEPS = ['Personal', 'Account', 'Plan'];

export default function Register() {
  const navigate = useNavigate();
  const selectedGym = getSelectedGym();
  const gymData = GYMS.find(g => g.id === selectedGym?.id) || GYMS[0];

  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    firstName: '', lastName: '', email: '', phone: '',
    address: '', birthdate: '', password: '', confirmPassword: '',
    selectedPlan: 'standard', termsAccepted: false,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [overlayRoot, setOverlayRoot] = useState<HTMLElement | null>(null);

  useEffect(() => { setOverlayRoot(getOverlayRoot()); }, []);

  const update = (key: string, val: any) => setFormData(p => ({ ...p, [key]: val }));

  const plans = [
    { id: 'basic',    name: 'Basic',    price: 800,  icon: CreditCard, desc: 'Gym access + Locker',                        color: 'var(--color-primary)' },
    { id: 'standard', name: 'Standard', price: 1500, icon: Zap,        desc: 'Gym + Group classes + 2 PT sessions',        color: 'var(--color-secondary)' },
    { id: 'premium',  name: 'Premium',  price: 2500, icon: Crown,      desc: 'Unlimited + All classes + 8 PT + Sauna',     color: '#22c55e' },
  ];

  const handleContinue = () => {
    if (step === 1) {
      // Auto-fill for prototype
      if (!formData.firstName) update('firstName', PROTOTYPE_REGISTER.firstName);
      if (!formData.lastName)  update('lastName',  PROTOTYPE_REGISTER.lastName);
      if (!formData.email)     update('email',     PROTOTYPE_REGISTER.email);
      if (!formData.phone)     update('phone',     PROTOTYPE_REGISTER.phone);
      setStep(2); return;
    }
    if (step === 2) {
      if (!formData.address)   update('address',   PROTOTYPE_REGISTER.address);
      if (!formData.birthdate) update('birthdate', PROTOTYPE_REGISTER.birthdate);
      if (!formData.password)  { update('password', PROTOTYPE_REGISTER.password); update('confirmPassword', PROTOTYPE_REGISTER.confirmPassword); }
      setStep(3); return;
    }
    if (!formData.termsAccepted) {
      showErrorToast({ type: 'validation', message: 'Please accept the Terms and Privacy Policy', details: '' });
      return;
    }
    setIsLoading(true);
    setTimeout(() => {
      if (!getSelectedGym()) setSelectedGym('g-fitness', 'G-Fitness');
      const planMap: Record<string, string> = { basic: 'Basic', standard: 'Standard', premium: 'Premium' };
      SharedStorage.addPendingRegistration({
        id: `pending-${Date.now()}`,
        firstName: formData.firstName || PROTOTYPE_REGISTER.firstName,
        lastName:  formData.lastName  || PROTOTYPE_REGISTER.lastName,
        fullName:  `${formData.firstName || PROTOTYPE_REGISTER.firstName} ${formData.lastName || PROTOTYPE_REGISTER.lastName}`,
        email:     formData.email    || PROTOTYPE_REGISTER.email,
        phone:     formData.phone    || PROTOTYPE_REGISTER.phone,
        address:   formData.address  || PROTOTYPE_REGISTER.address,
        membershipType: planMap[formData.selectedPlan] || 'Standard',
        registeredAt: new Date().toISOString(),
        status: 'Pending',
      });
      localStorage.setItem('registration_pending', 'true');
      setIsLoading(false);
      setShowSuccess(true);
      setTimeout(() => navigate('/login', { replace: true }), 2500);
    }, PROTOTYPE_LOADING_MS);
  };

  // ── Success Screen ──
  if (showSuccess) {
    return (
      <MobileFrame>
        <div className="flex items-center justify-center h-full px-6" style={{ backgroundColor: '#050400' }}>
          <motion.div initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center space-y-4">
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', delay: 0.2 }}
              className="w-20 h-20 rounded-full flex items-center justify-center mx-auto"
              style={{ background: 'var(--color-primary-light)', border: '3px solid var(--color-primary)' }}>
              <CheckCircle size={40} style={{ color: 'var(--color-primary)' }} />
            </motion.div>
            <h2 className="text-2xl font-bold text-white">Registration Submitted!</h2>
            <p className="text-sm text-white/60">Please visit the gym reception to pay and activate your membership.</p>
            <div className="rounded-xl px-4 py-3" style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)' }}>
              <p className="text-xs font-semibold" style={{ color: 'var(--color-secondary)' }}>⏳ Status: Pending Admin Approval</p>
              <p className="text-[10px] mt-1 text-white/40">Your account activates once payment is confirmed</p>
            </div>
            <div className="flex items-center justify-center gap-2 text-white/30 text-xs">
              <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--color-primary)' }} />
              Redirecting to login...
            </div>
          </motion.div>
        </div>
      </MobileFrame>
    );
  }

  // ── Input helper ──
  const Field = ({ label, icon: Icon, type = 'text', value, onChange, placeholder, readOnly = false, right }: any) => (
    <div>
      <label className="text-[10px] uppercase font-medium block mb-1.5" style={{ color: 'var(--color-text-muted)' }}>{label}</label>
      <div className="relative">
        {Icon && <Icon size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'rgba(245,158,11,0.5)' }} />}
        <input type={type} value={value} onChange={onChange} placeholder={placeholder} readOnly={readOnly}
          className="w-full rounded-xl text-white text-sm outline-none transition-all"
          style={{
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(245,158,11,0.2)',
            paddingLeft: Icon ? '2.25rem' : '0.75rem',
            paddingRight: right ? '2.5rem' : '0.75rem',
            paddingTop: '0.625rem', paddingBottom: '0.625rem',
          }}
          onFocus={e => { e.currentTarget.style.border = '1px solid rgba(245,158,11,0.5)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(245,158,11,0.08)'; }}
          onBlur={e => { e.currentTarget.style.border = '1px solid rgba(245,158,11,0.2)'; e.currentTarget.style.boxShadow = 'none'; }}
        />
        {right}
      </div>
    </div>
  );

  return (
    <MobileFrame>
      {overlayRoot && isLoading && createPortal(<LoadingOverlay message="Completing registration..." />, overlayRoot)}

      <div className="h-full flex flex-col" style={{ backgroundColor: '#050400' }}>
        {/* Ambient glow */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-80 h-80 rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(245,158,11,0.06) 0%, transparent 70%)' }} />

        <div className="flex-1 flex flex-col px-5 py-5 overflow-hidden relative z-10">
          {/* Header */}
          <div className="flex items-center justify-between mb-4 flex-shrink-0">
            <button onClick={() => step === 1 ? navigate('/login') : setStep(step - 1)}
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)' }}>
              <ArrowLeft size={16} />
            </button>
            <div className="text-center">
              <p className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--color-text-muted)' }}>Step {step} of 3</p>
              <p className="text-sm font-bold text-white">{STEPS[step - 1]}</p>
            </div>
            <img src={gymData.logo} alt={gymData.name} className="w-9 h-9 rounded-xl object-contain"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }} />
          </div>

          {/* Progress bar */}
          <div className="flex gap-1.5 mb-5 flex-shrink-0">
            {[1, 2, 3].map(s => (
              <div key={s} className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                <motion.div animate={{ width: s <= step ? '100%' : '0%' }} transition={{ duration: 0.4 }}
                  className="h-full rounded-full" style={{ background: 'var(--color-secondary)' }} />
              </div>
            ))}
          </div>

          {/* Step title */}
          <div className="mb-4 flex-shrink-0">
            <h1 className="text-xl font-bold text-white">
              {step === 1 ? 'Personal Information' : step === 2 ? 'Account Setup' : 'Choose Your Plan'}
            </h1>
            <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
              {step === 1 ? 'Tell us about yourself' : step === 2 ? 'Secure your account' : 'Select a membership that fits you'}
            </p>
          </div>

          {/* Step content */}
          <div className="flex-1 overflow-y-auto scrollbar-hide">
            <AnimatePresence mode="wait">
              {step === 1 && (
                <motion.div key="s1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                  className="space-y-3 pb-4">
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="First Name" icon={User} value={formData.firstName} placeholder="Eya"
                      onChange={(e: any) => update('firstName', e.target.value)} />
                    <Field label="Last Name" icon={User} value={formData.lastName} placeholder="Lorenzana"
                      onChange={(e: any) => update('lastName', e.target.value)} />
                  </div>
                  <Field label="Email Address" icon={Mail} type="email" value={formData.email}
                    placeholder="eya@email.com" onChange={(e: any) => update('email', e.target.value)} />
                  <Field label="Phone Number" icon={Phone} type="tel" value={formData.phone}
                    placeholder="+63 912 345 6789" onChange={(e: any) => update('phone', e.target.value)} />
                </motion.div>
              )}

              {step === 2 && (
                <motion.div key="s2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                  className="space-y-3 pb-4">
                  <Field label="Home Address" icon={MapPin} value={formData.address}
                    placeholder="Mamburao, Occidental Mindoro" onChange={(e: any) => update('address', e.target.value)} />
                  <Field label="Birthdate" icon={Calendar} type="date" value={formData.birthdate}
                    onChange={(e: any) => update('birthdate', e.target.value)} />
                  <div>
                    <label className="text-[10px] uppercase font-medium block mb-1.5" style={{ color: 'var(--color-text-muted)' }}>Password</label>
                    <div className="relative">
                      <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'rgba(245,158,11,0.5)' }} />
                      <input type={showPassword ? 'text' : 'password'} value={formData.password}
                        onChange={e => update('password', e.target.value)} placeholder="Min. 6 characters"
                        className="w-full rounded-xl text-white text-sm outline-none pl-9 pr-10 py-2.5"
                        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(245,158,11,0.2)' }}
                        onFocus={e => { e.currentTarget.style.border = '1px solid rgba(245,158,11,0.5)'; }}
                        onBlur={e => { e.currentTarget.style.border = '1px solid rgba(245,158,11,0.2)'; }} />
                      <button type="button" onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30">
                        {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] uppercase font-medium block mb-1.5" style={{ color: 'var(--color-text-muted)' }}>Confirm Password</label>
                    <div className="relative">
                      <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'rgba(245,158,11,0.5)' }} />
                      <input type={showConfirmPassword ? 'text' : 'password'} value={formData.confirmPassword}
                        onChange={e => update('confirmPassword', e.target.value)} placeholder="Re-enter password"
                        className="w-full rounded-xl text-white text-sm outline-none pl-9 pr-10 py-2.5"
                        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(245,158,11,0.2)' }}
                        onFocus={e => { e.currentTarget.style.border = '1px solid rgba(245,158,11,0.5)'; }}
                        onBlur={e => { e.currentTarget.style.border = '1px solid rgba(245,158,11,0.2)'; }} />
                      <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30">
                        {showConfirmPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}

              {step === 3 && (
                <motion.div key="s3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                  className="space-y-3 pb-4">
                  {plans.map(plan => {
                    const Icon = plan.icon;
                    const isSelected = formData.selectedPlan === plan.id;
                    return (
                      <button key={plan.id} type="button" onClick={() => update('selectedPlan', plan.id)}
                        className="w-full p-4 rounded-2xl text-left transition-all relative"
                        style={{
                          background: isSelected ? `${plan.color}12` : 'rgba(255,255,255,0.04)',
                          border: `2px solid ${isSelected ? plan.color : 'rgba(255,255,255,0.08)'}`,
                        }}>
                        {isSelected && (
                          <span className="absolute top-3 right-3">
                            <CheckCircle2 size={16} style={{ color: plan.color }} />
                          </span>
                        )}
                        <div className="flex items-center gap-3">
                          <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                            style={{ background: `${plan.color}20` }}>
                            <Icon size={20} style={{ color: plan.color }} />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center justify-between">
                              <p className="text-sm font-bold text-white">{plan.name}</p>
                              <p className="text-base font-bold" style={{ color: plan.color }}>₱{plan.price}<span className="text-[10px] text-white/40">/mo</span></p>
                            </div>
                            <p className="text-[10px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{plan.desc}</p>
                          </div>
                        </div>
                      </button>
                    );
                  })}

                  {/* Terms */}
                  <label className="flex items-start gap-3 mt-2 cursor-pointer p-3 rounded-xl"
                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div onClick={() => update('termsAccepted', !formData.termsAccepted)}
                      className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors"
                      style={{ background: formData.termsAccepted ? 'var(--color-secondary)' : 'rgba(255,255,255,0.08)', border: `1px solid ${formData.termsAccepted ? 'var(--color-secondary)' : 'rgba(255,255,255,0.15)'}` }}>
                      {formData.termsAccepted && <CheckCircle2 size={12} className="text-black" />}
                    </div>
                    <span className="text-[11px] text-white/50 leading-relaxed">
                      I agree to the{' '}
                      <button type="button" onClick={e => { e.preventDefault(); navigate('/terms'); }}
                        className="font-semibold" style={{ color: 'var(--color-secondary)' }}>Terms</button>
                      {' '}and{' '}
                      <button type="button" onClick={e => { e.preventDefault(); navigate('/privacy'); }}
                        className="font-semibold" style={{ color: 'var(--color-secondary)' }}>Privacy Policy</button>
                    </span>
                  </label>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* CTA Button */}
          <div className="flex-shrink-0 pt-3">
            <button onClick={handleContinue} disabled={isLoading}
              className="w-full py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-50"
              style={{ background: 'var(--color-secondary)', color: '#000' }}>
              {step === 3 ? (
                <><CheckCircle size={16} /> Complete Registration</>
              ) : (
                <>Continue <ArrowRight size={16} /></>
              )}
            </button>
            {step === 1 && (
              <p className="text-center text-[11px] text-white/30 mt-3">
                Already have an account?{' '}
                <button onClick={() => navigate('/login')} className="font-semibold" style={{ color: 'var(--color-secondary)' }}>
                  Sign In
                </button>
              </p>
            )}
          </div>
        </div>
      </div>
    </MobileFrame>
  );
}

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

      // Map plan id to membership type label
      const planMap: Record<string, string> = {
        basic: 'Basic',
        standard: 'Standard',
        premium: 'Premium',
      };

      // Save pending registration to SharedStorage
      const pendingData = {
        id: `pending-${Date.now()}`,
        firstName: formData.firstName || PROTOTYPE_REGISTER.firstName,
        lastName: formData.lastName || PROTOTYPE_REGISTER.lastName,
        fullName: `${formData.firstName || PROTOTYPE_REGISTER.firstName} ${formData.lastName || PROTOTYPE_REGISTER.lastName}`,
        email: formData.email || PROTOTYPE_REGISTER.email,
        phone: formData.phone || PROTOTYPE_REGISTER.phone,
        address: formData.address || PROTOTYPE_REGISTER.address,
        membershipType: planMap[formData.selectedPlan || PROTOTYPE_REGISTER.selectedPlan] || 'Premium',
        plan: formData.selectedPlan || PROTOTYPE_REGISTER.selectedPlan,
        registeredAt: new Date().toISOString(),
        status: 'Pending' as const,
      };

      SharedStorage.addPendingRegistration(pendingData);
      localStorage.setItem('registration_pending', 'true');

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
            <CheckCircle size={64} style={{ color: 'var(--color-primary)' }} className="mx-auto mb-6" />
            <h2 className="text-3xl font-bold text-white mb-3">Registration Submitted!</h2>
            <p className="text-sm text-white/60 mb-2">Please pay at the gym reception to activate your membership.</p>
            <p className="text-xs text-white/40 mb-6">Your account will be activated once payment is confirmed by admin.</p>
            <div className="rounded-xl p-3 mb-6" style={{ background: 'var(--color-secondary-light)', border: '1px solid rgba(245,158,11,0.25)' }}>
              <p className="text-xs font-semibold" style={{ color: 'var(--color-secondary)' }}>⏳ Status: Pending Approval</p>
            </div>
            <div className="flex items-center justify-center gap-2 text-white/35 text-sm">
              <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: 'var(--color-primary)' }} />
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
