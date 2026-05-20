import { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { User, Lock, ArrowRight, Eye, EyeOff } from 'lucide-react';
import MobileFrame from '../components/layout/MobileFrame';
import { login } from '../utils/auth';
import { handleError, showErrorToast, showSuccessToast } from '../utils/errorHandler';

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    // Validate inputs
    if (!email || !password) {
      setError('Please enter both email and password');
      return;
    }
    
    setIsLoading(true);
    
    // Simulate API call delay
    setTimeout(() => {
      const result = login(email, password);
      
      if (result.success && result.user) {
        showSuccessToast(`Welcome back, ${result.user.firstName}!`);
        localStorage.setItem('isLoggedIn', 'true');
        localStorage.setItem('memberId', result.user.id);
        navigate('/member/home');
      } else {
        setError(result.error || 'Login failed');
        showErrorToast(handleError({ message: result.error || 'Invalid credentials' }));
        setIsLoading(false);
      }
    }, 1000);
  };

  return (
    <MobileFrame>
      <div className="px-6 min-h-full flex flex-col justify-center" style={{ backgroundColor: '#0d0d0d' }}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-7"
        >
          {/* Logo */}
          <div className="text-center">
            <motion.img 
              src="/logo.png" 
              alt="Core Fitness" 
              className="w-32 h-32 mx-auto mb-5"
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
              CORE FITNESS
            </motion.h1>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="relative"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-orange-500/20 to-transparent blur-xl"></div>
              <p className="relative text-gray-300 text-base font-medium tracking-wide">
                Smart Fitness. <span className="text-orange-400">Smarter Management.</span>
              </p>
            </motion.div>
          </div>

          {/* Login Form */}
          <motion.form
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            onSubmit={handleLogin}
            className="space-y-5"
          >
            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-red-400 text-sm">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-semibold text-white mb-2">Email Address</label>
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="eya.lorenzana@email.com"
                  className="w-full bg-gray-900 border border-gray-800 rounded-xl pl-12 pr-4 py-3.5 text-white placeholder-gray-600 focus:outline-none focus:border-orange-500 transition-colors"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-white mb-2">Password</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full bg-gray-900 border border-gray-800 rounded-xl pl-12 pr-12 py-3.5 text-white placeholder-gray-600 focus:outline-none focus:border-orange-500 transition-colors"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-white text-black py-4 rounded-xl font-bold hover:bg-gray-100 transition-all disabled:opacity-50 flex items-center justify-center gap-2 mt-6"
            >
              {isLoading ? (
                'Logging in...'
              ) : (
                <>
                  <ArrowRight size={20} />
                  Login to Member Portal
                </>
              )}
            </button>
          </motion.form>

          {/* Divider */}
          <div className="relative py-3">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-800"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-3 text-gray-600" style={{ backgroundColor: '#0d0d0d' }}>or</span>
            </div>
          </div>

          {/* Browse Gyms */}
          <button
            onClick={() => navigate('/gyms')}
            className="w-full bg-gray-900 border border-gray-800 text-white py-3.5 rounded-xl text-sm font-semibold hover:border-gray-700 transition-colors"
          >
            Browse Gyms & Services
          </button>

          {/* Register Link */}
          <div className="text-center pt-2 space-y-1.5">
            <p className="text-gray-400 text-xs">
              Don't have an account?{' '}
              <button
                onClick={() => navigate('/register')}
                className="text-orange-400 font-semibold hover:text-orange-300 transition-colors"
              >
                Register Now
              </button>
            </p>

            {/* Terms and Privacy Links */}
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="text-[10px] text-gray-600"
            >
              <button
                onClick={() => navigate('/terms')}
                className="hover:text-gray-500 transition-colors"
              >
                Terms of Service
              </button>
              <span className="mx-1.5">•</span>
              <button
                onClick={() => navigate('/privacy')}
                className="hover:text-gray-500 transition-colors"
              >
                Privacy Policy
              </button>
            </motion.p>
          </div>
        </motion.div>
      </div>
    </MobileFrame>
  );
}
