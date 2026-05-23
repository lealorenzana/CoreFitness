import { useState, useEffect } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform, useScroll } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff, ArrowRight, ChevronDown, Users, Dumbbell, Building } from 'lucide-react';
import { showToast } from '../utils/toast';
import LandingFooter from '../components/ui/LandingFooter';

// Floating particles
function Particles() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-[1]">
      {Array.from({ length: 30 }).map((_, i) => (
        <motion.div
          key={i}
          className="absolute w-1 h-1 rounded-full"
          style={{
            background: i % 3 === 0 ? 'rgba(124,58,237,0.6)' : 'rgba(255,255,255,0.3)',
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 100}%`,
          }}
          animate={{
            y: [0, -30 - Math.random() * 50, 0],
            x: [0, (Math.random() - 0.5) * 30, 0],
            opacity: [0, 0.8, 0],
            scale: [0, 1 + Math.random(), 0],
          }}
          transition={{
            duration: 4 + Math.random() * 4,
            repeat: Infinity,
            delay: Math.random() * 5,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  );
}

export default function AdminLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [focusedInput, setFocusedInput] = useState<string | null>(null);

  // 3D tilt effect
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const rotateX = useTransform(mouseY, [-300, 300], [8, -8]);
  const rotateY = useTransform(mouseX, [-300, 300], [-8, 8]);

  // Scroll-based parallax for login content
  const { scrollY } = useScroll();
  const loginOpacity = useTransform(scrollY, [0, 400], [1, 0]);
  const loginY = useTransform(scrollY, [0, 400], [0, -60]);
  const loginScale = useTransform(scrollY, [0, 400], [1, 0.95]);
  const loginBlur = useTransform(scrollY, [0, 400], [0, 8]);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    mouseX.set(e.clientX - rect.left - rect.width / 2);
    mouseY.set(e.clientY - rect.top - rect.height / 2);
  };
  const handleMouseLeave = () => { mouseX.set(0); mouseY.set(0); };

  const ADMIN_CREDENTIALS = { email: 'admin@corefitness.com', password: 'admin123' };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) { showToast('Please enter both email and password', 'error'); return; }
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
    <div className="w-full" style={{ background: '#000' }}>
    {/* Login Section — full viewport */}
    <div className="min-h-screen w-full relative overflow-hidden flex flex-col items-center justify-center">
      {/* Background violet gradient */}
      <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, rgba(124,58,237,0.4), rgba(124,58,237,0.15), #000)' }} />
      {/* Bottom fade to next section */}
      <div className="absolute bottom-0 left-0 right-0 h-32 pointer-events-none z-20"
        style={{ background: 'linear-gradient(to bottom, transparent, #000)' }} />

      {/* Noise texture */}
      <div className="absolute inset-0 opacity-[0.03] mix-blend-soft-light"
        style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`, backgroundSize: '200px 200px' }} />

      {/* Animated glow orbs */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[120vh] h-[60vh] rounded-b-[50%]" style={{ background: 'rgba(124,58,237,0.2)', filter: 'blur(80px)' }} />
      <motion.div className="absolute top-0 left-1/2 -translate-x-1/2 w-[100vh] h-[60vh] rounded-b-full"
        style={{ background: 'rgba(124,58,237,0.2)', filter: 'blur(60px)' }}
        animate={{ opacity: [0.15, 0.3, 0.15], scale: [0.98, 1.02, 0.98] }}
        transition={{ duration: 8, repeat: Infinity, repeatType: 'mirror' }} />
      <motion.div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[90vh] h-[90vh] rounded-t-full"
        style={{ background: 'rgba(124,58,237,0.2)', filter: 'blur(60px)' }}
        animate={{ opacity: [0.3, 0.5, 0.3], scale: [1, 1.1, 1] }}
        transition={{ duration: 6, repeat: Infinity, repeatType: 'mirror', delay: 1 }} />

      {/* Extra mesh gradient orbs */}
      <motion.div className="absolute top-1/4 left-[15%] w-64 h-64 rounded-full"
        style={{ background: 'rgba(245,158,11,0.08)', filter: 'blur(80px)' }}
        animate={{ x: [0, 30, 0], y: [0, -20, 0] }}
        transition={{ duration: 10, repeat: Infinity, repeatType: 'mirror' }} />
      <motion.div className="absolute bottom-1/3 right-[15%] w-72 h-72 rounded-full"
        style={{ background: 'rgba(124,58,237,0.1)', filter: 'blur(90px)' }}
        animate={{ x: [0, -25, 0], y: [0, 15, 0] }}
        transition={{ duration: 12, repeat: Infinity, repeatType: 'mirror', delay: 2 }} />

      {/* Floating particles */}
      <Particles />

      {/* All login content — fades/moves on scroll */}
      <motion.div
        style={{ opacity: loginOpacity, y: loginY, scale: loginScale, filter: useTransform(loginBlur, v => `blur(${v}px)`) }}
        className="relative z-10 flex flex-col items-center"
      >

      {/* Tagline above card */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1, delay: 0.3 }}
        className="relative z-10 text-center mb-8"
      >
        <motion.p
          className="text-xs font-semibold uppercase tracking-[0.3em] mb-2"
          style={{ color: 'rgba(124,58,237,0.8)' }}
          animate={{ opacity: [0.6, 1, 0.6] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        >
          Gym Management Platform
        </motion.p>
        <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
          <span className="text-white">The Future of </span>
          <span className="relative inline-block">
            <span className="relative z-10 text-transparent bg-clip-text"
              style={{ backgroundImage: 'linear-gradient(90deg, #7C3AED, #F59E0B, #7C3AED)', backgroundSize: '200% 100%', animation: 'gradient-shift 4s ease-in-out infinite' }}>
              Fitness
            </span>
          </span>
          <span className="text-white"> Starts Here </span>
        </h2>
      </motion.div>

      {/* Card with 3D tilt */}
      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.95, filter: 'blur(10px)' }}
        animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
        transition={{ duration: 0.8, delay: 0.5 }}
        className="w-full max-w-sm relative z-10"
        style={{ perspective: 1500 }}
      >
        <motion.div
          className="relative"
          style={{ rotateX, rotateY }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          whileHover={{ z: 10 }}
        >
          <div className="relative group">
            {/* Card glow effect */}
            <motion.div className="absolute -inset-[1px] rounded-2xl opacity-0 group-hover:opacity-70 transition-opacity duration-700"
              animate={{ boxShadow: ['0 0 10px 2px rgba(255,255,255,0.03)', '0 0 15px 5px rgba(255,255,255,0.05)', '0 0 10px 2px rgba(255,255,255,0.03)'], opacity: [0.2, 0.4, 0.2] }}
              transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut', repeatType: 'mirror' }} />

            {/* Traveling light beams */}
            <div className="absolute -inset-[1px] rounded-2xl overflow-hidden pointer-events-none">
              <motion.div className="absolute top-0 left-0 h-[3px] w-[50%] opacity-70"
                style={{ background: 'linear-gradient(to right, transparent, white, transparent)', filter: 'blur(1.5px)' }}
                animate={{ left: ['-50%', '100%'], opacity: [0.3, 0.7, 0.3] }}
                transition={{ left: { duration: 2.5, ease: 'easeInOut', repeat: Infinity, repeatDelay: 1 }, opacity: { duration: 1.2, repeat: Infinity, repeatType: 'mirror' } }} />
              <motion.div className="absolute top-0 right-0 h-[50%] w-[3px] opacity-70"
                style={{ background: 'linear-gradient(to bottom, transparent, white, transparent)', filter: 'blur(1.5px)' }}
                animate={{ top: ['-50%', '100%'], opacity: [0.3, 0.7, 0.3] }}
                transition={{ top: { duration: 2.5, ease: 'easeInOut', repeat: Infinity, repeatDelay: 1, delay: 0.6 }, opacity: { duration: 1.2, repeat: Infinity, repeatType: 'mirror', delay: 0.6 } }} />
              <motion.div className="absolute bottom-0 right-0 h-[3px] w-[50%] opacity-70"
                style={{ background: 'linear-gradient(to right, transparent, white, transparent)', filter: 'blur(1.5px)' }}
                animate={{ right: ['-50%', '100%'], opacity: [0.3, 0.7, 0.3] }}
                transition={{ right: { duration: 2.5, ease: 'easeInOut', repeat: Infinity, repeatDelay: 1, delay: 1.2 }, opacity: { duration: 1.2, repeat: Infinity, repeatType: 'mirror', delay: 1.2 } }} />
              <motion.div className="absolute bottom-0 left-0 h-[50%] w-[3px] opacity-70"
                style={{ background: 'linear-gradient(to bottom, transparent, white, transparent)', filter: 'blur(1.5px)' }}
                animate={{ bottom: ['-50%', '100%'], opacity: [0.3, 0.7, 0.3] }}
                transition={{ bottom: { duration: 2.5, ease: 'easeInOut', repeat: Infinity, repeatDelay: 1, delay: 1.8 }, opacity: { duration: 1.2, repeat: Infinity, repeatType: 'mirror', delay: 1.8 } }} />
              {/* Corner spots */}
              <motion.div className="absolute top-0 left-0 h-[5px] w-[5px] rounded-full bg-white/40" style={{ filter: 'blur(1px)' }} animate={{ opacity: [0.2, 0.4, 0.2] }} transition={{ duration: 2, repeat: Infinity, repeatType: 'mirror' }} />
              <motion.div className="absolute top-0 right-0 h-[8px] w-[8px] rounded-full bg-white/60" style={{ filter: 'blur(2px)' }} animate={{ opacity: [0.2, 0.4, 0.2] }} transition={{ duration: 2.4, repeat: Infinity, repeatType: 'mirror', delay: 0.5 }} />
              <motion.div className="absolute bottom-0 right-0 h-[8px] w-[8px] rounded-full bg-white/60" style={{ filter: 'blur(2px)' }} animate={{ opacity: [0.2, 0.4, 0.2] }} transition={{ duration: 2.2, repeat: Infinity, repeatType: 'mirror', delay: 1 }} />
              <motion.div className="absolute bottom-0 left-0 h-[5px] w-[5px] rounded-full bg-white/40" style={{ filter: 'blur(1px)' }} animate={{ opacity: [0.2, 0.4, 0.2] }} transition={{ duration: 2.3, repeat: Infinity, repeatType: 'mirror', delay: 1.5 }} />
            </div>

            {/* Hover border glow */}
            <div className="absolute -inset-[0.5px] rounded-2xl opacity-0 group-hover:opacity-70 transition-opacity duration-500"
              style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.03), rgba(255,255,255,0.07), rgba(255,255,255,0.03))' }} />

            {/* Glass card */}
            <div className="relative rounded-2xl p-7 overflow-hidden"
              style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.05)', boxShadow: '0 25px 50px rgba(0,0,0,0.5)' }}>
              <div className="absolute inset-0 opacity-[0.03]"
                style={{ backgroundImage: 'linear-gradient(135deg, white 0.5px, transparent 0.5px), linear-gradient(45deg, white 0.5px, transparent 0.5px)', backgroundSize: '30px 30px' }} />

              {/* Logo — staggered entrance */}
              <div className="text-center space-y-2 mb-6 relative">
                <motion.div initial={{ scale: 0, opacity: 0, rotate: -180 }} animate={{ scale: 1, opacity: 1, rotate: 0 }}
                  transition={{ type: 'spring', duration: 1, delay: 0.6 }}
                  className="mx-auto w-12 h-12 rounded-full overflow-hidden relative"
                  style={{ border: '1px solid rgba(255,255,255,0.1)' }}>
                  <img src="/core-fitness-logo.png" alt="Core Fitness" className="w-full h-full object-cover" />
                  <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom right, rgba(255,255,255,0.1), transparent)' }} />
                </motion.div>
                <motion.h1 initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8, duration: 0.5 }}
                  className="text-xl font-bold text-white">Welcome Back</motion.h1>
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.9 }}
                  className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>Sign in to Core Fitness Admin</motion.p>
              </div>

              {/* Form — staggered field reveals */}
              <form onSubmit={handleLogin} className="space-y-3 relative">
                <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 1.0 }}
                  className="relative" whileHover={{ scale: 1.01 }}>
                  <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 transition-colors duration-300"
                    style={{ color: focusedInput === 'email' ? '#fff' : 'rgba(255,255,255,0.35)' }} />
                  <input type="email" placeholder="Email address" value={email}
                    onChange={e => setEmail(e.target.value)}
                    onFocus={() => setFocusedInput('email')} onBlur={() => setFocusedInput(null)}
                    className="w-full h-10 pl-10 pr-4 rounded-lg text-sm text-white placeholder-white/30 outline-none transition-all duration-300"
                    style={{ background: focusedInput === 'email' ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)', border: `1px solid ${focusedInput === 'email' ? 'rgba(255,255,255,0.2)' : 'transparent'}` }} />
                </motion.div>

                <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 1.1 }}
                  className="relative" whileHover={{ scale: 1.01 }}>
                  <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 transition-colors duration-300"
                    style={{ color: focusedInput === 'password' ? '#fff' : 'rgba(255,255,255,0.35)' }} />
                  <input type={showPassword ? 'text' : 'password'} placeholder="Password" value={password}
                    onChange={e => setPassword(e.target.value)}
                    onFocus={() => setFocusedInput('password')} onBlur={() => setFocusedInput(null)}
                    className="w-full h-10 pl-10 pr-10 rounded-lg text-sm text-white placeholder-white/30 outline-none transition-all duration-300"
                    style={{ background: focusedInput === 'password' ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)', border: `1px solid ${focusedInput === 'password' ? 'rgba(255,255,255,0.2)' : 'transparent'}` }} />
                  <button type="button" onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors duration-300 hover:text-white"
                    style={{ color: 'rgba(255,255,255,0.35)' }}>
                    {showPassword ? <Eye size={16} /> : <EyeOff size={16} />}
                  </button>
                </motion.div>

                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.2 }}
                  className="flex items-center justify-between pt-1">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <div className="relative">
                      <input type="checkbox" checked={rememberMe} onChange={() => setRememberMe(!rememberMe)}
                        className="appearance-none w-4 h-4 rounded border border-white/20 bg-white/5 checked:bg-white checked:border-white transition-all duration-200" />
                      {rememberMe && (
                        <motion.div initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }}
                          className="absolute inset-0 flex items-center justify-center text-black pointer-events-none">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                        </motion.div>
                      )}
                    </div>
                    <span className="text-xs text-white/60">Remember me</span>
                  </label>
                  <button type="button" className="text-xs text-white/60 hover:text-white transition-colors">Forgot password?</button>
                </motion.div>

                <motion.button type="submit" disabled={isLoading} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.3 }}
                  whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                  className="w-full relative group/button mt-5">
                  <div className="absolute inset-0 bg-white/10 rounded-lg opacity-0 group-hover/button:opacity-70 transition-opacity duration-300" style={{ filter: 'blur(12px)' }} />
                  <div className="relative overflow-hidden bg-white text-black font-medium h-10 rounded-lg flex items-center justify-center">
                    <AnimatePresence mode="wait">
                      {isLoading ? (
                        <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                          <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                        </motion.div>
                      ) : (
                        <motion.span key="text" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                          className="flex items-center gap-1.5 text-sm font-medium">
                          Sign In <ArrowRight size={14} className="group-hover/button:translate-x-1 transition-transform duration-300" />
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </div>
                </motion.button>

                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.4 }}
                  className="flex items-center gap-3 mt-2 mb-4">
                  <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.05)' }} />
                  <motion.span className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}
                    animate={{ opacity: [0.7, 0.9, 0.7] }} transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}>or</motion.span>
                  <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.05)' }} />
                </motion.div>

                <motion.button type="button" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.5 }}
                  whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                  onClick={() => { setEmail(ADMIN_CREDENTIALS.email); setPassword(ADMIN_CREDENTIALS.password); }}
                  className="w-full relative group/demo">
                  <div className="relative overflow-hidden h-10 rounded-lg flex items-center justify-center gap-2 transition-all duration-300"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)' }}>
                    <span className="text-xs">Use Demo Credentials</span>
                    <motion.div className="absolute inset-0" style={{ background: 'linear-gradient(to right, transparent, rgba(255,255,255,0.05), transparent)' }}
                      initial={{ x: '-100%' }} whileHover={{ x: '100%' }} transition={{ duration: 1, ease: 'easeInOut' }} />
                  </div>
                </motion.button>

                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.6 }}
                  className="text-center text-[10px] mt-3" style={{ color: 'rgba(255,255,255,0.3)' }}>
                  admin@corefitness.com / admin123
                </motion.p>
              </form>
            </div>
          </div>
        </motion.div>
      </motion.div>

      {/* Animated stats below card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.8, duration: 0.6 }}
        className="relative z-10 mt-8 flex items-center gap-6"
      >
        {[
          { icon: Users, label: 'Members', value: '500+' },
          { icon: Dumbbell, label: 'Trainers', value: '15+' },
          { icon: Building, label: 'Gyms', value: '3' },
        ].map((stat, i) => {
          const Icon = stat.icon;
          return (
            <motion.div key={stat.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 2.0 + i * 0.15 }}
              className="flex items-center gap-2 text-center"
            >
              <Icon size={14} style={{ color: 'rgba(124,58,237,0.7)' }} />
              <span className="text-white font-bold text-sm">{stat.value}</span>
              <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.4)' }}>{stat.label}</span>
            </motion.div>
          );
        })}
      </motion.div>

      </motion.div>
      {/* End of scroll-animated login content */}

      {/* Scroll indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 2.5 }}
        className="absolute bottom-10 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-2"
      >
        <span className="text-[10px] uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.3)' }}>Scroll to explore</span>
        <motion.div
          animate={{ y: [0, 6, 0] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
        >
          <ChevronDown size={18} style={{ color: 'rgba(255,255,255,0.4)' }} />
        </motion.div>
      </motion.div>
    </div>

    {/* Parallax Features + Cinematic Footer */}
    <LandingFooter />

    {/* Gradient text animation */}
    <style>{`
      @keyframes gradient-shift {
        0% { background-position: 0% 50%; }
        50% { background-position: 100% 50%; }
        100% { background-position: 0% 50%; }
      }
    `}</style>
    </div>
  );
}
