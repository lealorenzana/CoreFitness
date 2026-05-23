import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { User, Lock, ArrowRight, Eye, EyeOff, ArrowLeft, Dumbbell, CheckCircle2 } from 'lucide-react';
import MobileFrame from '../components/layout/MobileFrame';
import LoadingOverlay from '../components/ui/LoadingOverlay';
import { login } from '../utils/auth';
import { showSuccessToast } from '../utils/errorHandler';
import { getSelectedGym, PROTOTYPE_LOGIN, PROTOTYPE_LOADING_MS } from '../utils/prototype';
import { GYMS } from '../data/gyms';

function getOverlayRoot(): HTMLElement | null {
  return document.getElementById('phone-overlay-root') ?? document.getElementById('phone-screen');
}

type Role = 'member' | 'trainer';

export default function Login() {
  const navigate = useNavigate();
  const selectedGym = getSelectedGym();
  const gymData = GYMS.find(g => g.id === selectedGym?.id) || GYMS[0];
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedRole, setSelectedRole] = useState<Role>('member');
  const [overlayRoot, setOverlayRoot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setOverlayRoot(getOverlayRoot());
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    setEmail(PROTOTYPE_LOGIN.email);
    setPassword(PROTOTYPE_LOGIN.password);

    setTimeout(() => {
      const result = login(PROTOTYPE_LOGIN.email, PROTOTYPE_LOGIN.password);

      if (result.success && result.user) {
        localStorage.setItem('isLoggedIn', 'true');
        localStorage.setItem('memberId', result.user.id);
      } else {
        localStorage.setItem('isLoggedIn', 'true');
        localStorage.setItem('memberId', 'GF-2024-001');
        localStorage.setItem(
          'user',
          JSON.stringify({
            id: 'GF-2024-001',
            email: PROTOTYPE_LOGIN.email,
            firstName: 'Eya',
            lastName: 'Lorenzana',
            membershipType: 'Premium',
            membershipStatus: 'Active',
          })
        );
      }
      setIsLoading(false);

      if (selectedRole === 'trainer') {
        localStorage.setItem('trainerMode', 'true');
        showSuccessToast('Welcome, Coach!');
        navigate('/trainer/home');
      } else {
        localStorage.removeItem('trainerMode');
        const onboardingDone = localStorage.getItem('onboarding_complete') === 'true';
        showSuccessToast('Welcome back!');
        navigate(onboardingDone ? '/member/home' : '/onboarding');
      }
    }, PROTOTYPE_LOADING_MS);
  };

  const isTrainer = selectedRole === 'trainer';

  return (
    <MobileFrame>
      {overlayRoot && isLoading && createPortal(<LoadingOverlay message="Logging you in..." />, overlayRoot)}

      <div className="px-6 min-h-full flex flex-col justify-center relative" style={{ backgroundColor: '#050400' }}>
        {/* Ambient glow */}
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, var(--color-secondary-light) 0%, transparent 70%)' }} />

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-5 relative z-10">

          {/* Back */}
          <button onClick={() => navigate('/')}
            className="flex items-center gap-2 text-white/40 hover:text-yellow-400 transition-colors">
            <ArrowLeft size={18} />
            <span className="text-sm">Back to Gyms</span>
          </button>

          {/* Gym badge */}
          {selectedGym && (
            <div className="rounded-xl px-4 py-2 text-center" style={{ background: 'var(--color-secondary-light)', border: '1px solid rgba(246,201,14,0.18)' }}>
              <p className="text-xs text-white/40">Signing in to</p>
              <p className="font-bold" style={{ color: '#f6c90e' }}>{selectedGym.name}</p>
            </div>
          )}

          {/* Pending banner */}
          {localStorage.getItem('registration_pending') === 'true' && (
            <div className="rounded-xl px-4 py-3 text-center" style={{ background: 'var(--color-primary-light)', border: '1px solid rgba(124,58,237,0.25)' }}>
              <p className="text-xs font-semibold" style={{ color: 'var(--color-primary)' }}>⏳ Your registration is pending approval</p>
              <p className="text-[10px] mt-1 text-white/50">Please pay at the gym to activate your account</p>
            </div>
          )}

          {/* Logo + title */}
          <div className="text-center">
            <motion.img src={gymData.logo} alt={gymData.name}
              className="w-20 h-20 mx-auto mb-4 object-contain rounded-2xl"
              style={{ boxShadow: '0 0 40px rgba(245,158,11,0.20), 0 0 80px var(--color-secondary-light)' }}
              initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.1 }} />
            <h1 className="text-2xl font-bold text-white tracking-wider">{gymData.name.toUpperCase()}</h1>
          </div>

          {/* ── ROLE SELECTOR ── */}
          <div>
            <p className="text-xs text-center mb-3 font-medium" style={{ color: 'var(--color-text-muted)' }}>
              Please select your role
            </p>
            <div className="grid grid-cols-2 gap-3">
              {([
                { role: 'member' as Role, label: 'Member', icon: User, desc: 'Gym member access' },
                { role: 'trainer' as Role, label: 'Trainer', icon: Dumbbell, desc: 'Coach & trainer access' },
              ]).map(({ role, label, icon: Icon, desc }) => {
                const isActive = selectedRole === role;
                return (
                  <button key={role} onClick={() => setSelectedRole(role)}
                    className="relative flex flex-col items-center gap-2 p-4 rounded-2xl transition-all active:scale-95"
                    style={{
                      background: isActive ? (role === 'trainer' ? 'var(--color-primary-light)' : 'rgba(245,158,11,0.1)') : 'rgba(255,255,255,0.04)',
                      border: `2px solid ${isActive ? (role === 'trainer' ? 'var(--color-primary)' : 'var(--color-secondary)') : 'rgba(255,255,255,0.08)'}`,
                    }}>
                    {/* Check badge */}
                    {isActive && (
                      <span className="absolute -top-2 -right-2 w-5 h-5 rounded-full flex items-center justify-center"
                        style={{ background: role === 'trainer' ? 'var(--color-primary)' : 'var(--color-secondary)' }}>
                        <CheckCircle2 size={12} className="text-white" />
                      </span>
                    )}
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center"
                      style={{
                        background: isActive
                          ? (role === 'trainer' ? 'rgba(124,58,237,0.25)' : 'rgba(245,158,11,0.2)')
                          : 'rgba(255,255,255,0.06)',
                      }}>
                      <Icon size={22} style={{
                        color: isActive
                          ? (role === 'trainer' ? 'var(--color-primary)' : 'var(--color-secondary)')
                          : 'rgba(255,255,255,0.3)',
                      }} />
                    </div>
                    <p className="text-xs font-bold text-white">{label}</p>
                    <p className="text-[9px] text-center" style={{ color: 'var(--color-text-muted)' }}>{desc}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── LOGIN FORM ── */}
          <motion.form onSubmit={handleLogin} className="space-y-4"
            key={selectedRole} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <div className="rounded-2xl p-5 space-y-4"
              style={{
                background: 'rgba(10,8,0,0.75)',
                border: `1px solid ${isTrainer ? 'rgba(124,58,237,0.35)' : 'var(--color-secondary-light)'}`,
                boxShadow: `0 0 0 1px ${isTrainer ? 'rgba(124,58,237,0.15)' : 'var(--color-secondary-light)'}, 0 24px 64px rgba(0,0,0,0.6)`,
              }}>
              <div>
                <label className="block text-xs font-medium text-white/70 mb-2 uppercase tracking-wider">Email</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2" size={15}
                    style={{ color: isTrainer ? 'rgba(124,58,237,0.6)' : 'rgba(245,158,11,0.50)' }} />
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                    placeholder={isTrainer ? 'trainer@corefitness.com' : 'eya.lorenzana@email.com'}
                    className="w-full rounded-lg pl-9 pr-4 py-2.5 text-sm text-white outline-none transition-all"
                    style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid ${isTrainer ? 'rgba(124,58,237,0.3)' : 'var(--color-secondary-light)'}` }}
                    readOnly={isLoading} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-white/70 mb-2 uppercase tracking-wider">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2" size={15}
                    style={{ color: isTrainer ? 'rgba(124,58,237,0.6)' : 'rgba(245,158,11,0.50)' }} />
                  <input type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="w-full rounded-lg pl-9 pr-10 py-2.5 text-sm text-white outline-none transition-all"
                    style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid ${isTrainer ? 'rgba(124,58,237,0.3)' : 'var(--color-secondary-light)'}` }}
                    readOnly={isLoading} />
                  <button type="button" onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors">
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              <button type="submit" disabled={isLoading}
                className="w-full py-3 rounded-xl font-bold text-sm transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                style={{ background: isLoading ? 'rgba(124,58,237,0.4)' : (isTrainer ? 'var(--color-primary)' : 'var(--color-secondary)'), color: isTrainer ? '#fff' : '#000' }}>
                <ArrowRight size={16} />
                {isLoading ? 'Logging in...' : `Login as ${isTrainer ? 'Trainer' : 'Member'}`}
              </button>
            </div>
          </motion.form>

          {/* Footer */}
          <div className="text-center space-y-1.5">
            <p className="text-white/40 text-xs">
              Don&apos;t have an account?{' '}
              <button onClick={() => navigate('/register')}
                className="font-semibold hover:text-yellow-300 transition-colors" style={{ color: '#f6c90e' }}>
                Sign Up
              </button>
            </p>
            <p className="text-[10px] text-white/25">
              <button onClick={() => navigate('/terms')} className="hover:text-white/40">Terms of Service</button>
              <span className="mx-1.5">•</span>
              <button onClick={() => navigate('/privacy')} className="hover:text-white/40">Privacy Policy</button>
            </p>
          </div>
        </motion.div>
      </div>
    </MobileFrame>
  );
}
