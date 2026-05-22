import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff, Dumbbell, Activity, Users, Trophy } from 'lucide-react';
import { showToast } from '../utils/toast';

export default function AdminLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const ADMIN_CREDENTIALS = {
    email: 'admin@corefitness.com',
    password: 'admin123',
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      showToast('Please enter both email and password', 'error');
      return;
    }
    setIsLoading(true);
    setTimeout(() => {
      if (email === ADMIN_CREDENTIALS.email && password === ADMIN_CREDENTIALS.password) {
        localStorage.setItem('adminAuthenticated', 'true');
        localStorage.setItem('adminUser', JSON.stringify({ email, name: 'Admin User', role: 'Super Admin' }));
        showToast('Login successful!', 'success');
        navigate('/admin/dashboard');
      } else {
        showToast('Invalid email or password', 'error');
        setIsLoading(false);
      }
    }, 1000);
  };

  return (
    <div className="flex h-screen w-full" style={{ background: 'var(--color-bg)' }}>
      {/* Left panel — branding / visual */}
      <div className="hidden lg:flex w-1/2 relative overflow-hidden items-center justify-center"
        style={{ background: 'var(--color-primary)' }}>
        {/* Decorative elements */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-10 left-10"><Dumbbell size={80} /></div>
          <div className="absolute top-1/4 right-16"><Activity size={60} /></div>
          <div className="absolute bottom-1/4 left-20"><Users size={70} /></div>
          <div className="absolute bottom-16 right-10"><Trophy size={60} /></div>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
            <Dumbbell size={200} />
          </div>
        </div>

        {/* Center content */}
        <div className="relative z-10 text-center px-12">
          <img src="/logo.png" alt="Core Fitness" className="w-24 h-24 mx-auto mb-6 rounded-2xl object-contain"
            style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }} />
          <h1 className="text-4xl font-bold text-white mb-3">Core Fitness</h1>
          <p className="text-white/70 text-lg">Management System</p>
          <div className="mt-8 flex items-center justify-center gap-6">
            {[
              { label: 'Members', value: '500+' },
              { label: 'Trainers', value: '15+' },
              { label: 'Classes', value: '30+' },
            ].map(s => (
              <div key={s.label} className="text-center">
                <p className="text-2xl font-bold text-white">{s.value}</p>
                <p className="text-xs text-white/60">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel — login form */}
      <div className="w-full lg:w-1/2 flex flex-col items-center justify-center px-6">
        <form onSubmit={handleLogin} className="w-full max-w-sm flex flex-col items-center">
          {/* Mobile logo (hidden on desktop since left panel shows it) */}
          <div className="lg:hidden mb-8 text-center">
            <img src="/logo.png" alt="Core Fitness" className="w-16 h-16 mx-auto mb-3 rounded-xl object-contain" />
          </div>

          <h2 className="text-3xl font-bold text-white">Sign in</h2>
          <p className="text-sm mt-2" style={{ color: 'var(--color-text-muted)' }}>
            Welcome back! Please sign in to continue
          </p>

          {/* Divider */}
          <div className="flex items-center gap-4 w-full my-8">
            <div className="flex-1 h-px" style={{ background: 'var(--color-border)' }} />
            <p className="text-xs whitespace-nowrap" style={{ color: 'var(--color-text-muted)' }}>admin credentials</p>
            <div className="flex-1 h-px" style={{ background: 'var(--color-border)' }} />
          </div>

          {/* Email */}
          <div className="flex items-center w-full h-12 rounded-full overflow-hidden pl-5 gap-3"
            style={{ background: 'transparent', border: '1px solid var(--color-border)' }}>
            <Mail size={16} style={{ color: 'var(--color-text-muted)' }} />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@corefitness.com"
              className="bg-transparent text-sm w-full h-full outline-none text-white placeholder-gray-500"
              required
            />
          </div>

          {/* Password */}
          <div className="flex items-center mt-4 w-full h-12 rounded-full overflow-hidden pl-5 pr-4 gap-3"
            style={{ background: 'transparent', border: '1px solid var(--color-border)' }}>
            <Lock size={16} style={{ color: 'var(--color-text-muted)' }} />
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="bg-transparent text-sm w-full h-full outline-none text-white placeholder-gray-500"
              required
            />
            <button type="button" onClick={() => setShowPassword(!showPassword)}
              className="flex-shrink-0" style={{ color: 'var(--color-text-muted)' }}>
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          {/* Remember + Forgot */}
          <div className="w-full flex items-center justify-between mt-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={remember} onChange={() => setRemember(!remember)}
                className="w-4 h-4 rounded" style={{ accentColor: 'var(--color-primary)' }} />
              <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Remember me</span>
            </label>
            <button type="button" className="text-xs underline" style={{ color: 'var(--color-text-muted)' }}>
              Forgot password?
            </button>
          </div>

          {/* Login button */}
          <button
            type="submit"
            disabled={isLoading}
            className="mt-8 w-full h-12 rounded-full text-white font-semibold text-sm transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            style={{ background: 'var(--color-primary)' }}
            onMouseEnter={e => { if (!isLoading) e.currentTarget.style.background = 'var(--color-primary-hover)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-primary)'; }}
          >
            {isLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Logging in...
              </>
            ) : 'Login'}
          </button>

          {/* Demo credentials hint */}
          <p className="text-xs mt-6 text-center" style={{ color: 'var(--color-text-muted)' }}>
            Demo: <span className="text-white font-medium">admin@corefitness.com</span> / <span className="text-white font-medium">admin123</span>
          </p>
        </form>
      </div>
    </div>
  );
}
