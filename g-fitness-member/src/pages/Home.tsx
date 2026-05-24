import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { Calendar, Trophy, ChevronRight, RefreshCw, AlertCircle, CheckCircle, Ban, ArrowRight, X } from 'lucide-react';
import Notifications from '../components/Notifications';
import { useState, useEffect, useRef } from 'react';
import { generateSecureQR, getQRTimeRemaining } from '../utils/qrCode';
import { getCurrentUser } from '../utils/auth';
import { SharedStorage } from '../utils/sharedStorage';
import { MOCK_HOME_QUICK_STATS, MOCK_UPCOMING_CLASS } from '../data/mockHomeDashboard';

/** Circular progress ring used in the hero stats row. */
function ProgressRing({ value, goal, label, unit }: { value: number; goal: number; label: string; unit?: string }) {
  const size = 64;
  const stroke = 5;
  const radius = (size - stroke) / 2;
  const circ = 2 * Math.PI * radius;
  const pct = Math.min(1, value / Math.max(1, goal));
  const offset = circ * (1 - pct);

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {/* Background track */}
          <circle cx={size / 2} cy={size / 2} r={radius}
            stroke="rgba(255,255,255,0.12)" strokeWidth={stroke} fill="none" />
          {/* Progress arc */}
          <circle cx={size / 2} cy={size / 2} r={radius}
            stroke="#F59E0B" strokeWidth={stroke} fill="none"
            strokeDasharray={circ} strokeDashoffset={offset}
            strokeLinecap="round" transform={`rotate(-90 ${size / 2} ${size / 2})`}
            style={{ transition: 'stroke-dashoffset 0.8s ease-out' }} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-sm font-bold text-white leading-none">{value}</span>
          {unit && <span className="text-[8px] mt-0.5" style={{ color: 'rgba(255,255,255,0.6)' }}>{unit}</span>}
        </div>
      </div>
      <p className="text-[9px] text-center font-medium" style={{ color: 'rgba(255,255,255,0.6)' }}>{label}</p>
    </div>
  );
}

export default function Home() {
  const navigate = useNavigate();
  const currentUser = getCurrentUser();
  const memberEmail = localStorage.getItem('memberEmail') || currentUser?.email || 'eya.lorenzana@email.com';

  const getActiveMember = () => {
    const s = SharedStorage.getMember(memberEmail);
    if (s) {
      const daysLeft = Math.max(0, Math.floor((new Date(s.expiryDate).getTime() - Date.now()) / 86400000));
      return {
        name: s.fullName || `${s.firstName} ${s.lastName}`,
        firstName: s.firstName || (s.fullName || '').split(' ')[0] || 'there',
        membershipType: s.membershipType || 'Premium',
        qrCode: s.qrCode || 'GF-2024-001',
        expiryDate: s.expiryDate, gym: 'G-Fitness Mamburao', daysLeft,
      };
    }
    return {
      name: currentUser?.name || 'Eya Lorenzana',
      firstName: (currentUser?.name || 'Eya').split(' ')[0],
      membershipType: 'Premium', qrCode: 'GF-2024-001',
      expiryDate: 'Dec 31, 2026', gym: 'G-Fitness Mamburao', daysLeft: 591,
    };
  };

  const member = getActiveMember();
  const [qrCode, setQrCode] = useState('');
  const [timeRemaining, setTimeRemaining] = useState(60);
  const [isExpired, setIsExpired] = useState(false);
  const [hasBeenUsed, setHasBeenUsed] = useState(false);
  const [showQRModal, setShowQRModal] = useState(false);
  const hasGeneratedRef = useRef(false);

  const membershipExpired = new Date() > new Date(member.expiryDate);
  const expiringSoon = !membershipExpired && member.daysLeft <= 7;

  // Greeting based on time-of-day
  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good Morning';
    if (h < 17) return 'Good Afternoon';
    return 'Good Evening';
  })();

  useEffect(() => {
    const today = new Date().toDateString();
    const lastUsed = localStorage.getItem('qr_last_used');
    if (lastUsed) {
      const d = JSON.parse(lastUsed);
      if (d.date === today && d.memberId === member.qrCode) setHasBeenUsed(true);
    }
  }, [member.qrCode]);

  useEffect(() => {
    if (!hasGeneratedRef.current && !hasBeenUsed && !membershipExpired) {
      setQrCode(generateSecureQR(member.qrCode, 'gym-001'));
      setTimeRemaining(60);
      setIsExpired(false);
      hasGeneratedRef.current = true;
    }
  }, [hasBeenUsed, membershipExpired, member.qrCode]);

  useEffect(() => {
    if (!qrCode || hasBeenUsed) return;
    const interval = setInterval(() => {
      const r = getQRTimeRemaining(qrCode);
      setTimeRemaining(r);
      if (r === 0) setIsExpired(true);
    }, 1000);
    return () => clearInterval(interval);
  }, [qrCode, hasBeenUsed]);

  const upcoming = MOCK_UPCOMING_CLASS;

  const quickActions = [
    { title: 'Booking History',    subtitle: 'View your class bookings', icon: CheckCircle, action: () => navigate('/member/booking-history') },
    { title: 'Renew Membership',   subtitle: 'Extend your membership',   icon: RefreshCw,   action: () => navigate('/member/renew-membership') },
    { title: 'Browse Events',      subtitle: 'Join upcoming activities', icon: Trophy,      action: () => navigate('/member/events') },
  ];

  return (
    <div className="space-y-5 pb-4 min-h-full">
      {/* Top bar */}
      <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Welcome Back!</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>Let's crush your goals today</p>
        </div>
        <Notifications />
      </motion.div>

      {/* Hero card — flat violet, white heading, yellow subtitle, yellow CTA + 3 progress rings */}
      <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.05 }}
        className="rounded-2xl p-5 overflow-hidden relative"
        style={{ background: 'var(--color-primary)' }}>
        {/* Subtle decorative glow */}
        <div className="absolute top-0 right-0 w-32 h-32 rounded-full opacity-20"
          style={{ background: 'radial-gradient(circle, rgba(245,158,11,0.4) 0%, transparent 70%)', transform: 'translate(30%, -30%)' }} />

        <div className="relative z-10">
          <h2 className="text-lg font-bold text-white leading-tight">
            {greeting} {member.firstName} 🔥
          </h2>
          <p className="text-sm font-medium mt-1" style={{ color: 'var(--color-secondary)' }}>
            Continue your journey
          </p>
          <button onClick={() => navigate('/member/book-class')}
            className="mt-3 inline-flex items-center gap-2 px-5 h-10 rounded-full font-semibold text-sm text-black transition-all active:scale-95"
            style={{ background: 'var(--color-secondary)' }}>
            Book a Class <ArrowRight size={14} />
          </button>
        </div>

        {/* 3 circular progress rings */}
        <div className="relative z-10 grid grid-cols-3 gap-2 mt-5 pt-4" style={{ borderTop: '1px solid rgba(255,255,255,0.15)' }}>
          {MOCK_HOME_QUICK_STATS.map(s => (
            <ProgressRing key={s.id} value={s.value} goal={s.goal} label={s.label} unit={s.unit} />
          ))}
        </div>
      </motion.div>

      {/* Membership / QR card */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        className="rounded-2xl p-5"
        style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-bold uppercase mb-2"
              style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary)' }}>
              {member.membershipType}
            </span>
            <h3 className="text-base font-bold text-white">{member.name}</h3>
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{member.gym}</p>
          </div>

          {/* QR Code */}
          <div className="relative flex-shrink-0 cursor-pointer" onClick={() => !membershipExpired && !hasBeenUsed && setShowQRModal(true)}>
            {membershipExpired ? (
              <div className="relative">
                <div className="bg-white p-2 rounded-xl opacity-20 blur-sm"><QRCodeSVG value={member.qrCode} size={70} /></div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: 'var(--color-secondary)' }}>
                    <Ban size={18} className="text-white" />
                  </div>
                </div>
              </div>
            ) : hasBeenUsed ? (
              <div className="relative">
                <div className="bg-white p-2 rounded-xl opacity-25 blur-sm"><QRCodeSVG value={member.qrCode} size={70} /></div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: 'var(--color-primary)' }}>
                    <CheckCircle size={18} className="text-white" />
                  </div>
                </div>
              </div>
            ) : isExpired ? (
              <div className="relative">
                <div className="bg-white p-2 rounded-xl opacity-30 blur-sm"><QRCodeSVG value={qrCode || member.qrCode} size={70} /></div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: 'var(--color-secondary)' }}>
                    <AlertCircle size={18} className="text-white" />
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-white p-2 rounded-xl hover:scale-105 transition-transform"><QRCodeSVG value={qrCode || member.qrCode} size={70} /></div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between pt-3 mb-2" style={{ borderTop: '1px solid var(--color-border)' }}>
          <div>
            <p className="text-xs uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>Member ID</p>
            <p className="font-mono font-bold text-sm text-white">{member.qrCode}</p>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>Valid Until</p>
            <p className="font-bold text-sm text-white">{member.expiryDate}</p>
          </div>
        </div>

        {/* Status messages */}
        <div className="flex flex-wrap gap-2">
          {membershipExpired && (
            <div className="px-2.5 py-1 rounded-full flex items-center gap-1"
              style={{ background: 'var(--color-secondary-light)', border: '1px solid rgba(245,158,11,0.30)' }}>
              <Ban size={12} style={{ color: 'var(--color-secondary)' }} />
              <p className="text-xs font-semibold" style={{ color: 'var(--color-secondary)' }}>Membership Expired</p>
            </div>
          )}
          {expiringSoon && (
            <div className="px-2.5 py-1 rounded-full flex items-center gap-1 animate-pulse"
              style={{ background: 'var(--color-secondary-light)', border: '1px solid rgba(245,158,11,0.30)' }}>
              <AlertCircle size={12} style={{ color: 'var(--color-secondary)' }} />
              <p className="text-xs font-semibold" style={{ color: 'var(--color-secondary)' }}>Expires in {member.daysLeft} days</p>
            </div>
          )}
          {hasBeenUsed && (
            <div className="px-2.5 py-1 rounded-full flex items-center gap-1"
              style={{ background: 'var(--color-primary-light)', border: '1px solid rgba(124,58,237,0.30)' }}>
              <CheckCircle size={12} style={{ color: 'var(--color-primary)' }} />
              <p className="text-xs font-semibold" style={{ color: 'var(--color-primary)' }}>Checked in today</p>
            </div>
          )}
        </div>

        {(membershipExpired || expiringSoon) && (
          <button onClick={() => navigate('/member/renew-membership')}
            className="w-full mt-3 h-10 rounded-full font-semibold text-sm text-black"
            style={{ background: 'var(--color-secondary)' }}>
            {membershipExpired ? 'Renew Membership Now' : 'Renew Now'}
          </button>
        )}
      </motion.div>

      {/* Upcoming class card — violet 4px left border */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
        className="rounded-2xl p-4 relative overflow-hidden"
        style={{
          background: 'var(--color-surface-raised)',
          border: '1px solid var(--color-border)',
          borderLeft: '4px solid var(--color-primary)',
        }}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--color-text-muted)' }}>Upcoming Class</p>
            <h3 className="text-base font-bold text-white truncate">{upcoming.className}</h3>
            <p className="text-xs mt-0.5 font-medium" style={{ color: 'var(--color-secondary)' }}>
              {upcoming.day} · {upcoming.time}
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{upcoming.trainer} · {upcoming.location}</p>
          </div>
          <button onClick={() => navigate('/member/book-class')}
            className="h-10 px-4 rounded-full font-semibold text-sm text-white flex-shrink-0"
            style={{ background: 'var(--color-primary)' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-primary-hover)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'var(--color-primary)')}>
            Book
          </button>
        </div>
      </motion.div>

      {/* Quick Actions */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="space-y-2">
        <h3 className="text-white font-semibold flex items-center gap-2">
          <Calendar size={16} style={{ color: 'var(--color-secondary)' }} /> Quick Actions
        </h3>
        {quickActions.map((action, i) => {
          const Icon = action.icon;
          return (
            <motion.button key={action.title} initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.35 + i * 0.05 }}
              onClick={action.action}
              className="w-full rounded-2xl p-4 flex items-center gap-4 transition-colors"
              style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--color-primary)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--color-border)')}>
              <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'var(--color-primary-light)' }}>
                <Icon size={20} style={{ color: 'var(--color-primary)' }} />
              </div>
              <div className="flex-1 text-left">
                <p className="text-white font-semibold text-sm">{action.title}</p>
                <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{action.subtitle}</p>
              </div>
              <ChevronRight size={18} style={{ color: 'var(--color-text-muted)' }} />
            </motion.button>
          );
        })}
      </motion.div>

      {/* QR Code Modal */}
      <AnimatePresence>
        {showQRModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowQRModal(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm z-50"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[60] w-[90%] max-w-sm"
            >
              <div className="bg-[rgba(10,8,0,0.95)] border-2 rounded-3xl p-6 shadow-2xl relative"
                style={{ borderColor: 'var(--color-primary)' }}>
                <button
                  onClick={() => setShowQRModal(false)}
                  className="absolute top-3 right-3 p-2 rounded-lg bg-gray-800 text-white/40 hover:text-white transition-colors z-10"
                >
                  <X size={18} />
                </button>
                
                <div className="text-center">
                  <h3 className="text-white font-bold text-lg mb-1">Check-In QR Code</h3>
                  <p className="text-white/60 text-xs mb-4">Show this to staff for gym entry</p>
                  
                  <div className="bg-white p-4 rounded-2xl inline-block mb-4">
                    <QRCodeSVG value={qrCode || member.qrCode} size={180} />
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex items-center justify-between p-2.5 rounded-xl" style={{ background: 'var(--color-surface-raised)' }}>
                      <span className="text-white/60 text-xs">Member ID</span>
                      <span className="text-white font-mono font-bold text-sm">{member.qrCode}</span>
                    </div>
                    
                    <p className="text-white/40 text-[10px] mt-3">
                      Show this QR code to staff for gym check-in
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
