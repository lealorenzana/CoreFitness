import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { User, Lock, ArrowRight, Eye, EyeOff, ArrowLeft } from 'lucide-react';
import MobileFrame from '../components/layout/MobileFrame';
import LoadingOverlay from '../components/ui/LoadingOverlay';
import { login } from '../utils/auth';
import { showSuccessToast } from '../utils/errorHandler';
import { getSelectedGym, PROTOTYPE_LOGIN, PROTOTYPE_LOADING_MS } from '../utils/prototype';
import { GYMS } from '../data/gyms';

function getOverlayRoot(): HTMLElement | null {
  return document.getElementById('phone-overlay-root') ?? document.getElementById('phone-screen');
}

export default function Login() {
  const navigate = useNavigate();
  const selectedGym = getSelectedGym();
  const gymData = GYMS.find(g => g.id === selectedGym?.id) || GYMS[0];
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
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
      const onboardingDone = localStorage.getItem('onboarding_complete') === 'true';
      const destination = onboardingDone ? '/member/home' : '/onboarding';

      if (result.success && result.user) {
        localStorage.setItem('isLoggedIn', 'true');
        localStorage.setItem('memberId', result.user.id);
        showSuccessToast(`Welcome back, ${result.user.firstName}!`);
        navigate(destination);
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
        showSuccessToast('Welcome back, Eya!');
        navigate(destination);
      }
      setIsLoading(false);
    }, PROTOTYPE_LOADING_MS);
  };

  return (
    <MobileFrame>
      {overlayRoot &&
        isLoading &&
        createPortal(<LoadingOverlay message="Logging you in..." />, overlayRoot)}

      <div className="px-6 min-h-full flex flex-col justify-center relative" style={{ backgroundColor: '#050400' }}>
        {/* Ambient gold glow */}
        <div
          className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, var(--color-secondary-light) 0%, transparent 70%)' }}
        />

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-7 relative z-10"
        >
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 text-white/40 hover:text-yellow-400 transition-colors mb-2"
          >
            <ArrowLeft size={18} />
            <span className="text-sm">Back to Gyms</span>
          </button>

          {selectedGym && (
            <div className="rounded-xl px-4 py-2 text-center" style={{ background: 'var(--color-secondary-light)', border: '1px solid rgba(246,201,14,0.18)' }}>
              <p className="text-xs text-white/40">Signing in to</p>
              <p className="font-bold" style={{ color: '#f6c90e' }}>{selectedGym.name}</p>
            </div>
          )}

          <div className="text-center">
            <motion.img
              src={gymData.logo}
              alt={gymData.name}
              className="w-28 h-28 mx-auto mb-5 object-contain rounded-2xl"
              style={{ boxShadow: '0 0 40px rgba(245,158,11,0.20), 0 0 80px var(--color-secondary-light)' }}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.1 }}
            />
            <motion.h1
              className="text-3xl font-bebas font-bold text-white mb-1 tracking-wider"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              style={{ letterSpacing: '0.1em' }}
            >
              {gymData.name.toUpperCase()}
            </motion.h1>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="text-white/50 text-base font-medium tracking-widest uppercase text-sm"
            >
              Member Portal
            </motion.p>
          </div>

          <motion.form
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            onSubmit={handleLogin}
            className="space-y-5"
          >
            <div className="rounded-2xl p-6" style={{ background: 'rgba(10,8,0,0.75)', border: '1px solid var(--color-secondary-light)', boxShadow: '0 0 0 1px var(--color-secondary-light), 0 24px 64px rgba(0,0,0,0.6)' }}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-white/70 mb-2">Email Address</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2" size={16} style={{ color: 'rgba(245,158,11,0.50)' }} />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="eya.lorenzana@email.com"
                      className="w-full rounded-lg pl-9 pr-4 py-2.5 text-sm text-white outline-none transition-all"
                      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--color-secondary-light)' }}
                      onFocus={(e) => { e.currentTarget.style.border = '1px solid rgba(245,158,11,0.50)'; e.currentTarget.style.boxShadow = '0 0 0 3px var(--color-secondary-light)'; }}
                      onBlur={(e) => { e.currentTarget.style.border = '1px solid var(--color-secondary-light)'; e.currentTarget.style.boxShadow = 'none'; }}
                      readOnly={isLoading}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-white/70 mb-2">Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2" size={16} style={{ color: 'rgba(245,158,11,0.50)' }} />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      className="w-full rounded-lg pl-9 pr-10 py-2.5 text-sm text-white outline-none transition-all"
                      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--color-secondary-light)' }}
                      onFocus={(e) => { e.currentTarget.style.border = '1px solid rgba(245,158,11,0.50)'; e.currentTarget.style.boxShadow = '0 0 0 3px var(--color-secondary-light)'; }}
                      onBlur={(e) => { e.currentTarget.style.border = '1px solid var(--color-secondary-light)'; e.currentTarget.style.boxShadow = 'none'; }}
                      readOnly={isLoading}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-yellow-400 transition-colors"
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 rounded-lg font-semibold text-sm text-black transition-all disabled:opacity-50 flex items-center justify-center gap-2 mt-6"
                style={{
                  background: isLoading ? 'rgba(245,158,11,0.50)' : 'var(--color-secondary)',
                }}
              >
                <ArrowRight size={18} />
                {isLoading ? 'Logging in...' : 'Login to Member Portal'}
              </button>
            </div>
          </motion.form>

          <div className="text-center pt-2 space-y-1.5">
            <p className="text-white/40 text-xs">
              Don&apos;t have an account?{' '}
              <button
                onClick={() => navigate('/register')}
                className="font-semibold hover:text-yellow-300 transition-colors"
                style={{ color: '#f6c90e' }}
              >
                Sign Up
              </button>
            </p>
            <p className="text-[10px] text-white/25">
              <button onClick={() => navigate('/terms')} className="hover:text-white/40">
                Terms of Service
              </button>
              <span className="mx-1.5">•</span>
              <button onClick={() => navigate('/privacy')} className="hover:text-white/40">
                Privacy Policy
              </button>
            </p>
          </div>
        </motion.div>
      </div>
    </MobileFrame>
  );
}
