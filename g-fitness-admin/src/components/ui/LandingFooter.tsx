import { useRef } from 'react';
import { motion, useScroll, useTransform, useInView } from 'framer-motion';
import { Dumbbell, Users, QrCode, CalendarDays, TrendingUp, MessageSquare, Shield, ArrowUp, Activity, Bell, CreditCard, Target } from 'lucide-react';

const FEATURES = [
  { icon: Users, title: 'Member Management', desc: 'Track memberships, body progress, and attendance in one place.' },
  { icon: QrCode, title: 'QR Attendance', desc: 'Secure time-limited QR codes for instant check-ins.' },
  { icon: CalendarDays, title: 'Class Scheduling', desc: 'Weekly grid view with duplicate detection and booking management.' },
  { icon: TrendingUp, title: 'Progress Tracking', desc: 'BMI, body measurements, workout logs, and goal achievement.' },
  { icon: MessageSquare, title: 'Trainer Feedback', desc: 'Workout recommendations, performance comments, and plans.' },
  { icon: Shield, title: 'Role-Based Access', desc: 'Admin, Staff, and Member views with appropriate permissions.' },
];

// Feature strip items — based on actual system capabilities
const FEATURE_STRIP = [
  { icon: QrCode, label: 'QR Check-in' },
  { icon: TrendingUp, label: 'Progress Tracking' },
  { icon: CalendarDays, label: 'Class Booking' },
  { icon: Users, label: 'Member Portal' },
  { icon: Bell, label: 'Smart Alerts' },
  { icon: CreditCard, label: 'Payments' },
  { icon: Dumbbell, label: 'Workout Logs' },
  { icon: Target, label: 'Goal System' },
  { icon: Activity, label: 'Body Analytics' },
  { icon: Shield, label: 'Badge Rewards' },
];

const MARQUEE_ITEMS = [
  'Member Management', 'QR Attendance', 'Class Booking', 'Progress Tracking',
  'Trainer Feedback', 'Revenue Analytics', 'Badge System', 'Goal Achievement',
];

function MarqueeContent() {
  return (
    <div className="flex items-center gap-8 px-4">
      {MARQUEE_ITEMS.map((item, i) => (
        <span key={i} className="flex items-center gap-4">
          <span className="text-white/70 font-semibold text-sm whitespace-nowrap">{item}</span>
          <span style={{ color: 'var(--color-primary)' }}>✦</span>
        </span>
      ))}
    </div>
  );
}

export default function LandingFooter() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: containerRef, offset: ['start end', 'end end'] });
  const giantTextY = useTransform(scrollYProgress, [0, 1], ['20vh', '0vh']);
  const giantTextScale = useTransform(scrollYProgress, [0, 1], [0.8, 1]);
  const giantTextOpacity = useTransform(scrollYProgress, [0, 1], [0, 1]);

  const scrollToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });

  return (
    <>
      {/* ─── Parallax Features Section ─── */}
      <section className="relative py-24 px-6 overflow-hidden" style={{ background: '#000' }}>
        {/* NO gradient transition - same solid black as login section bottom */}

        {/* Section glow */}
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[600px] h-[300px] rounded-full"
          style={{ background: 'radial-gradient(ellipse, rgba(124,58,237,0.12) 0%, transparent 70%)', filter: 'blur(80px)' }} />

        <div className="max-w-5xl mx-auto relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 60 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-100px' }}
            transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
            className="text-center mb-16"
          >
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8, delay: 0.1 }}
              className="text-xs font-semibold uppercase tracking-[0.3em] mb-3" style={{ color: 'var(--color-primary)' }}>
              Powerful Features
            </motion.p>
            <motion.h2
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="text-4xl md:text-5xl font-bold text-white">
              Everything you need to manage your gym
            </motion.h2>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8, delay: 0.3 }}
              className="text-sm mt-4 max-w-lg mx-auto" style={{ color: 'rgba(255,255,255,0.5)' }}>
              Core Fitness provides a complete management system for modern fitness businesses.
            </motion.p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((feat, i) => {
              const Icon = feat.icon;
              return (
                <motion.div
                  key={feat.title}
                  initial={{ opacity: 0, y: 50, scale: 0.95 }}
                  whileInView={{ opacity: 1, y: 0, scale: 1 }}
                  viewport={{ once: true, margin: '-50px' }}
                  transition={{ duration: 0.7, delay: i * 0.12, ease: [0.16, 1, 0.3, 1] }}
                  whileHover={{ y: -8, scale: 1.03, transition: { duration: 0.3 } }}
                  className="rounded-2xl p-6 group cursor-default"
                  style={{
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    backdropFilter: 'blur(10px)',
                  }}
                >
                  <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    whileInView={{ scale: 1, opacity: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5, delay: 0.3 + i * 0.12 }}
                    className="w-10 h-10 rounded-xl flex items-center justify-center mb-4 transition-all duration-300 group-hover:shadow-lg"
                    style={{ background: 'rgba(124,58,237,0.15)' }}>
                    <Icon size={20} style={{ color: 'var(--color-primary)' }} />
                  </motion.div>
                  <h3 className="text-white font-semibold text-sm mb-2">{feat.title}</h3>
                  <p className="text-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.5)' }}>{feat.desc}</p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ─── Cinematic Footer ─── */}
      <div ref={containerRef} className="relative h-screen w-full" style={{ clipPath: 'polygon(0% 0, 100% 0%, 100% 100%, 0 100%)' }}>
        <footer className="fixed bottom-0 left-0 flex h-screen w-full flex-col justify-between overflow-hidden"
          style={{ background: 'rgba(124,58,237,0.2)', color: '#fff' }}>

          {/* Aurora glow */}
          <div className="absolute left-1/2 top-1/2 h-[60vh] w-[80vw] -translate-x-1/2 -translate-y-1/2 rounded-[50%] pointer-events-none z-0"
            style={{ background: 'radial-gradient(circle, rgba(124,58,237,0.12) 0%, rgba(245,158,11,0.08) 40%, transparent 70%)', filter: 'blur(80px)', animation: 'footer-breathe 8s ease-in-out infinite alternate' }} />

          {/* Grid background */}
          <div className="absolute inset-0 z-0 pointer-events-none"
            style={{
              backgroundSize: '60px 60px',
              backgroundImage: 'linear-gradient(to right, rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.02) 1px, transparent 1px)',
              maskImage: 'linear-gradient(to bottom, transparent, black 30%, black 70%, transparent)',
            }} />

          {/* Giant background text */}
          <motion.div
            style={{ y: giantTextY, scale: giantTextScale, opacity: giantTextOpacity }}
            className="absolute -bottom-[5vh] left-0 right-0 z-0 pointer-events-none select-none text-center"
          >
            <span className="text-[20vw] font-black leading-none tracking-tighter"
              style={{ color: 'transparent', WebkitTextStroke: '1px rgba(255,255,255,0.04)', background: 'linear-gradient(180deg, rgba(255,255,255,0.08) 0%, transparent 60%)', WebkitBackgroundClip: 'text', backgroundClip: 'text' }}>
              CORE FITNESS
            </span>
          </motion.div>

          {/* Marquee */}
          <div className="absolute top-12 left-0 w-full overflow-hidden py-4 z-10 -rotate-2 scale-110"
            style={{ borderTop: '1px solid rgba(255,255,255,0.05)', borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)' }}>
            <div className="flex w-max text-xs tracking-[0.2em] uppercase" style={{ animation: 'footer-scroll-marquee 40s linear infinite' }}>
              <MarqueeContent />
              <MarqueeContent />
            </div>
          </div>

          {/* Center content */}
          <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 mt-20 max-w-4xl mx-auto">
            <motion.h2
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8 }}
              className="text-5xl md:text-7xl font-black text-center tracking-tighter mb-8"
              style={{ color: '#fff', filter: 'drop-shadow(0 0 20px rgba(255,255,255,0.1))' }}
            >
              Ready to begin?
            </motion.h2>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="flex flex-wrap justify-center gap-4"
            >
              <motion.button whileHover={{ scale: 1.05, y: -2 }} whileTap={{ scale: 0.95 }}
                className="footer-glass-pill px-8 py-4 rounded-full font-bold text-sm flex items-center gap-2 text-white"
                onClick={scrollToTop}>
                <Dumbbell size={18} /> Go to Login
              </motion.button>
              <motion.button whileHover={{ scale: 1.05, y: -2 }} whileTap={{ scale: 0.95 }}
                className="footer-glass-pill px-8 py-4 rounded-full font-bold text-sm flex items-center gap-2 text-white/70">
                <Shield size={18} /> Learn More
              </motion.button>
            </motion.div>
          </div>

          {/* Bottom bar */}
          <div className="relative z-20 w-full pb-8 px-6 md:px-12 flex items-center justify-between">
            <p className="text-[10px] tracking-widest uppercase" style={{ color: 'rgba(255,255,255,0.4)' }}>
              © 2026 Core Fitness. All rights reserved.
            </p>

            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={scrollToTop}
              className="footer-glass-pill w-10 h-10 rounded-full flex items-center justify-center"
              style={{ color: 'rgba(255,255,255,0.5)' }}
            >
              <ArrowUp size={16} />
            </motion.button>
          </div>
        </footer>
      </div>

      {/* CSS Animations */}
      <style>{`
        @keyframes footer-breathe { 0% { transform: translate(-50%,-50%) scale(1); opacity: 0.6; } 100% { transform: translate(-50%,-50%) scale(1.1); opacity: 1; } }
        @keyframes footer-scroll-marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        @keyframes footer-heartbeat { 0%,100% { transform: scale(1); } 15%,45% { transform: scale(1.2); } 30% { transform: scale(1); } }
        @keyframes feature-strip-scroll { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        .footer-glass-pill {
          background: linear-gradient(145deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.01) 100%);
          box-shadow: 0 10px 30px -10px rgba(0,0,0,0.5), inset 0 1px 1px rgba(255,255,255,0.08), inset 0 -1px 2px rgba(0,0,0,0.3);
          border: 1px solid rgba(255,255,255,0.08);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .footer-glass-pill:hover {
          background: linear-gradient(145deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.03) 100%);
          border-color: rgba(255,255,255,0.2);
          box-shadow: 0 20px 40px -10px rgba(0,0,0,0.7), inset 0 1px 1px rgba(255,255,255,0.15);
          color: #fff;
        }
      `}</style>
    </>
  );
}
