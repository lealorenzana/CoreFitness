import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { Calendar, Dumbbell, Trophy, TrendingUp, Bell, ChevronRight, Zap, Target, RefreshCw, AlertCircle, CheckCircle, Ban } from 'lucide-react';
import Notifications from '../components/Notifications';
import { useState, useEffect, useRef } from 'react';
import { generateSecureQR, getQRTimeRemaining } from '../utils/qrCode';
import { getCurrentUser } from '../utils/auth';
import { SharedStorage } from '../utils/sharedStorage';

export default function Home() {
  const navigate = useNavigate();
  const currentUser = getCurrentUser();
  const memberEmail = localStorage.getItem('memberEmail') || currentUser?.email || 'eya.lorenzana@email.com';

  // Load member data from SharedStorage (same as Profile page)
  const getActiveMember = () => {
    const sharedMember = SharedStorage.getMember(memberEmail);
    if (sharedMember) {
      // Calculate days left from expiry
      const expiryDate = sharedMember.expiryDate || 'Dec 31, 2026';
      const daysLeft = Math.max(0, Math.floor((new Date(expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
      return {
        name: sharedMember.fullName || `${sharedMember.firstName} ${sharedMember.lastName}`,
        membershipType: sharedMember.membershipType || 'Premium',
        qrCode: sharedMember.qrCode || 'GF-2024-001',
        expiryDate: expiryDate,
        gym: 'Core Fitness Mamburao',
        daysLeft,
      };
    }
    // Fallback for demo
    return {
      name: currentUser?.name || 'Eya Lorenzana',
      membershipType: 'Premium',
      qrCode: 'GF-2024-001',
      expiryDate: 'Dec 31, 2026',
      gym: 'Core Fitness Mamburao',
      daysLeft: 591,
    };
  };

  const member = getActiveMember();

  const [qrCode, setQrCode] = useState('');
  const [timeRemaining, setTimeRemaining] = useState(60);
  const [isExpired, setIsExpired] = useState(false);
  const [hasBeenUsed, setHasBeenUsed] = useState(false);
  const hasGeneratedRef = useRef(false);

  // Check if QR was already used today
  useEffect(() => {
    const today = new Date().toDateString();
    const lastUsed = localStorage.getItem('qr_last_used');
    
    if (lastUsed) {
      const data = JSON.parse(lastUsed);
      if (data.date === today && data.memberId === member.qrCode) {
        setHasBeenUsed(true);
      }
    }
  }, [member.qrCode]);

  // Check if membership is expired
  const checkMembershipStatus = () => {
    const today = new Date();
    const expiryDate = new Date(member.expiryDate);
    const daysUntilExpiry = Math.floor((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    
    return {
      isExpired: today > expiryDate,
      daysUntilExpiry: daysUntilExpiry,
      isExpiringSoon: daysUntilExpiry <= 7 && daysUntilExpiry > 0
    };
  };

  const membershipStatus = checkMembershipStatus();

  // Generate QR code ONCE per day (only if membership is active)
  const generateNewQR = () => {
    // Check if membership is expired
    if (membershipStatus.isExpired) {
      return; // Don't generate QR if expired
    }

    const newQR = generateSecureQR(member.qrCode, 'gym-001');
    setQrCode(newQR);
    setTimeRemaining(60);
    setIsExpired(false);
  };

  // Generate QR code ONCE on mount (if not used today and membership active)
  useEffect(() => {
    if (!hasGeneratedRef.current && !hasBeenUsed && !membershipStatus.isExpired) {
      generateNewQR();
      hasGeneratedRef.current = true;
    }
  }, [hasBeenUsed, membershipStatus.isExpired]);

  // Update countdown timer every second
  useEffect(() => {
    if (!qrCode || hasBeenUsed) return;

    const interval = setInterval(() => {
      const remaining = getQRTimeRemaining(qrCode);
      setTimeRemaining(remaining);
      
      // Mark as expired when reaches 0
      if (remaining === 0) {
        setIsExpired(true);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [qrCode, hasBeenUsed]);

  const stats = [
    { label: 'Check-ins', value: '24', icon: Calendar, color: 'from-blue-500 to-cyan-500', bgColor: 'bg-blue-500/20' },
    { label: 'Workouts', value: '18', icon: Dumbbell, color: 'from-orange-500 to-red-500', bgColor: 'bg-orange-500/20' },
    { label: 'This Week', value: '3', icon: Zap, color: 'from-yellow-500 to-orange-500', bgColor: 'bg-yellow-500/20' },
    { label: 'Goals Hit', value: '12', icon: Target, color: 'from-green-500 to-emerald-500', bgColor: 'bg-green-500/20' },
  ];

  const quickActions = [
    {
      title: 'Book a Class',
      subtitle: 'Reserve your training session',
      icon: Calendar,
      color: 'from-primary-start to-primary-end',
      action: () => navigate('/member/book-class'),
    },
    {
      title: 'Booking History',
      subtitle: 'View your class bookings',
      icon: CheckCircle,
      color: 'from-blue-500 to-cyan-500',
      action: () => navigate('/member/booking-history'),
    },
    {
      title: 'Renew Membership',
      subtitle: 'Extend your membership',
      icon: RefreshCw,
      color: 'from-green-500 to-emerald-500',
      action: () => navigate('/member/renew-membership'),
    },
    {
      title: 'Browse Events',
      subtitle: 'Join upcoming activities',
      icon: Trophy,
      color: 'from-purple-500 to-pink-500',
      action: () => navigate('/member/events'),
    },
  ];

  return (
    <div className="space-y-6 pb-4 min-h-full">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-2xl font-orbitron font-bold text-white">Welcome Back!</h1>
          <p className="text-gray-400 text-sm mt-1">Let's crush your goals today 💪</p>
        </div>
        <Notifications />
      </motion.div>

      {/* Membership Card with QR */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.1 }}
        className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary-start via-primary-end to-orange-600 p-6 shadow-2xl"
      >
        <div className="relative z-10">
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              <div className="bg-white/20 backdrop-blur-sm px-3 py-1 rounded-full inline-block mb-3">
                <p className="text-white text-xs font-bold uppercase">{member.membershipType}</p>
              </div>
              <h2 className="text-xl font-bold text-white">{member.name}</h2>
              <p className="text-white/90 text-sm mt-1">{member.gym}</p>
            </div>
            
            {/* QR Code with Timer */}
            <div className="relative">
              {membershipStatus.isExpired ? (
                // Membership Expired - Show blocked message
                <div className="relative">
                  <div className="bg-white p-3 rounded-2xl shadow-lg blur-md opacity-20">
                    <QRCodeSVG value={member.qrCode} size={100} />
                  </div>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="bg-red-600 rounded-full p-3">
                      <Ban size={32} className="text-white" />
                    </div>
                  </div>
                </div>
              ) : hasBeenUsed ? (
                // Already used today - Show message
                <div className="relative">
                  <div className="bg-white p-3 rounded-2xl shadow-lg blur-md opacity-30">
                    <QRCodeSVG value={member.qrCode} size={100} />
                  </div>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="bg-green-500 rounded-full p-3">
                      <CheckCircle size={32} className="text-white" />
                    </div>
                  </div>
                </div>
              ) : isExpired ? (
                // Expired QR - Show blur and message
                <div className="relative">
                  <div className="bg-white p-3 rounded-2xl shadow-lg blur-sm opacity-50">
                    <QRCodeSVG value={qrCode || member.qrCode} size={100} />
                  </div>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="bg-red-500 rounded-full p-3">
                      <AlertCircle size={32} className="text-white" />
                    </div>
                  </div>
                </div>
              ) : (
                // Active QR
                <div className="bg-white p-3 rounded-2xl shadow-lg">
                  <QRCodeSVG value={qrCode || member.qrCode} size={100} />
                </div>
              )}
              
              {/* Status Badge */}
              {membershipStatus.isExpired ? (
                <div className="absolute -bottom-2 -right-2 bg-gradient-to-r from-red-600 to-red-700 rounded-full px-3 py-1 shadow-lg">
                  <p className="text-white text-xs font-bold">EXPIRED</p>
                </div>
              ) : hasBeenUsed ? (
                <div className="absolute -bottom-2 -right-2 bg-gradient-to-r from-green-500 to-emerald-600 rounded-full px-3 py-1 shadow-lg">
                  <p className="text-white text-xs font-bold">USED</p>
                </div>
              ) : isExpired ? (
                <div className="absolute -bottom-2 -right-2 bg-gradient-to-r from-red-500 to-red-600 rounded-full px-3 py-1 shadow-lg">
                  <p className="text-white text-xs font-bold">EXPIRED</p>
                </div>
              ) : (
                <div className={`absolute -bottom-2 -right-2 rounded-full px-3 py-1 shadow-lg ${
                  timeRemaining <= 10 
                    ? 'bg-gradient-to-r from-red-500 to-red-600 animate-pulse' 
                    : 'bg-gradient-to-r from-green-500 to-emerald-500'
                }`}>
                  <p className="text-white text-xs font-bold">{timeRemaining}s</p>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-white/20">
            <div>
              <p className="text-white/70 text-xs uppercase tracking-wide">Member ID</p>
              <p className="text-white font-mono font-bold text-sm">{member.qrCode}</p>
            </div>
            <div className="text-right">
              <p className="text-white/70 text-xs uppercase tracking-wide">Valid Until</p>
              <p className="text-white font-bold text-sm">{member.expiryDate}</p>
            </div>
          </div>

          {/* Status Messages */}
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <div className="bg-white/10 backdrop-blur-sm rounded-xl px-3 py-2 inline-block">
              <p className="text-white text-xs">
                <span className="font-bold text-lg">{member.daysLeft}</span> days remaining
              </p>
            </div>
            
            {membershipStatus.isExpired ? (
              <div className="bg-red-600/30 backdrop-blur-sm rounded-xl px-3 py-2 inline-block border border-red-600/50 flex items-center gap-2">
                <Ban size={14} className="text-red-300" />
                <p className="text-red-300 text-xs font-semibold">
                  Membership Expired
                </p>
              </div>
            ) : membershipStatus.isExpiringSoon ? (
              <div className="bg-orange-500/20 backdrop-blur-sm rounded-xl px-3 py-2 inline-block border border-orange-500/30 flex items-center gap-2 animate-pulse">
                <AlertCircle size={14} className="text-orange-300" />
                <p className="text-orange-300 text-xs font-semibold">
                  Expires in {membershipStatus.daysUntilExpiry} days!
                </p>
              </div>
            ) : hasBeenUsed ? (
              <div className="bg-green-500/20 backdrop-blur-sm rounded-xl px-3 py-2 inline-block border border-green-500/30 flex items-center gap-2">
                <CheckCircle size={14} className="text-green-300" />
                <p className="text-green-300 text-xs font-semibold">
                  Already checked in today
                </p>
              </div>
            ) : isExpired ? (
              <div className="bg-red-500/20 backdrop-blur-sm rounded-xl px-3 py-2 inline-block border border-red-500/30 flex items-center gap-2">
                <AlertCircle size={14} className="text-red-300" />
                <p className="text-red-300 text-xs font-semibold">
                  QR Expired - Use manual check-in
                </p>
              </div>
            ) : (
              <div className={`backdrop-blur-sm rounded-xl px-3 py-2 inline-block border ${
                timeRemaining <= 10 
                  ? 'bg-red-500/20 border-red-500/30' 
                  : 'bg-green-500/20 border-green-500/30'
              }`}>
                <p className={`text-xs flex items-center gap-1 ${
                  timeRemaining <= 10 ? 'text-red-300' : 'text-green-300'
                }`}>
                  <span className={`w-2 h-2 rounded-full ${
                    timeRemaining <= 10 ? 'bg-red-400' : 'bg-green-400'
                  } animate-pulse`}></span>
                  {timeRemaining <= 10 ? 'Expiring soon!' : `Valid for ${timeRemaining}s`}
                </p>
              </div>
            )}
          </div>
          
          {/* Instructions */}
          {membershipStatus.isExpired ? (
            <div className="mt-3 bg-red-600/10 border border-red-600/30 rounded-xl p-4">
              <p className="text-red-300 text-sm font-semibold mb-2">🚫 Membership Expired</p>
              <p className="text-red-200 text-xs mb-3">
                Your membership has expired on {member.expiryDate}. Please renew to continue using gym facilities.
              </p>
              <button
                onClick={() => navigate('/member/renew-membership')}
                className="w-full bg-gradient-to-r from-red-500 to-red-600 text-white py-2.5 rounded-xl font-semibold hover:shadow-lg transition-all"
              >
                Renew Membership Now
              </button>
            </div>
          ) : membershipStatus.isExpiringSoon ? (
            <div className="mt-3 bg-orange-500/10 border border-orange-500/30 rounded-xl p-4">
              <p className="text-orange-300 text-sm font-semibold mb-2">⚠️ Membership Expiring Soon!</p>
              <p className="text-orange-200 text-xs mb-3">
                Your membership expires in {membershipStatus.daysUntilExpiry} days. Renew now to avoid interruption.
              </p>
              <button
                onClick={() => navigate('/member/renew-membership')}
                className="w-full bg-gradient-to-r from-orange-500 to-orange-600 text-white py-2.5 rounded-xl font-semibold hover:shadow-lg transition-all"
              >
                Renew Now
              </button>
            </div>
          ) : hasBeenUsed ? (
            <div className="mt-3 bg-green-500/10 border border-green-500/30 rounded-xl p-4">
              <p className="text-green-300 text-sm font-semibold mb-2">✅ You've already checked in today!</p>
              <p className="text-green-200 text-xs">
                Your attendance has been recorded. Come back tomorrow for a new QR code.
              </p>
            </div>
          ) : isExpired ? (
            <div className="mt-3 bg-red-500/10 border border-red-500/30 rounded-xl p-4">
              <p className="text-red-300 text-sm font-semibold mb-2">⏰ QR Code Expired</p>
              <p className="text-red-200 text-xs mb-3">
                Your QR code has expired. Please use manual check-in at the front desk.
              </p>
              <div className="bg-red-500/20 rounded-lg p-3">
                <p className="text-red-100 text-xs font-semibold mb-1">💡 Why did it expire?</p>
                <p className="text-red-200 text-xs">
                  QR codes expire after 60 seconds for security. This prevents sharing and ensures you're at the gym when checking in.
                </p>
              </div>
            </div>
          ) : (
            <div className="mt-3 bg-blue-500/10 border border-blue-500/30 rounded-xl p-4">
              <p className="text-blue-300 text-sm font-semibold mb-2">📱 How to use your QR code:</p>
              <ol className="text-blue-200 text-xs space-y-1 ml-4 list-decimal">
                <li>Show this QR code to the front desk staff</li>
                <li>Staff will scan it to record your attendance</li>
                <li>QR expires in {timeRemaining} seconds</li>
                <li>One QR code per day - cannot be reused</li>
              </ol>
            </div>
          )}
        </div>

        {/* Background decoration */}
        <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/10 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-white/10 rounded-full blur-3xl"></div>
      </motion.div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3">
        {stats.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 + index * 0.05 }}
              className={`${stat.bgColor} border-2 border-gray-700 rounded-2xl p-4 shadow-lg`}
            >
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${stat.color} flex items-center justify-center mb-3 shadow-md`}>
                <Icon size={20} className="text-white" />
              </div>
              <p className="text-gray-300 text-xs font-medium uppercase tracking-wide">{stat.label}</p>
              <p className="text-3xl font-bold text-white mt-1 font-orbitron">{stat.value}</p>
            </motion.div>
          );
        })}
      </div>

      {/* Quick Actions */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="space-y-3"
      >
        <h3 className="text-white font-semibold text-lg flex items-center gap-2">
          <Zap size={20} className="text-primary-start" />
          Quick Actions
        </h3>
        <div className="space-y-3">
          {quickActions.map((action, index) => {
            const Icon = action.icon;
            return (
              <motion.button
                key={action.title}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.5 + index * 0.1 }}
                onClick={action.action}
                className="w-full bg-gray-800 border-2 border-gray-600 rounded-2xl p-4 flex items-center gap-4 hover:border-primary-start hover:bg-gray-700 transition-all duration-200 active:scale-98 shadow-lg"
              >
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${action.color} flex items-center justify-center flex-shrink-0 shadow-md`}>
                  <Icon size={24} className="text-white" />
                </div>
                <div className="flex-1 text-left">
                  <p className="text-white font-semibold">{action.title}</p>
                  <p className="text-gray-300 text-sm">{action.subtitle}</p>
                </div>
                <ChevronRight size={20} className="text-gray-400" />
              </motion.button>
            );
          })}
        </div>
      </motion.div>

      {/* Motivational Banner */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.8 }}
        className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-purple-600 to-pink-600 p-6 shadow-xl"
      >
        <div className="relative z-10">
          <h3 className="text-white font-bold text-lg mb-2">Keep Pushing! 🔥</h3>
          <p className="text-white/90 text-sm">
            You're doing great! Stay consistent and you'll reach your goals.
          </p>
        </div>
        <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full blur-2xl"></div>
      </motion.div>
    </div>
  );
}
