import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { Calendar, Dumbbell, Trophy, TrendingUp, Bell, ChevronRight, Zap, Target } from 'lucide-react';
import Notifications from '../components/Notifications';

export default function Home() {
  const navigate = useNavigate();
  const member = {
    name: 'Juan Dela Cruz',
    membershipType: 'Premium',
    qrCode: 'GF-2024-001',
    expiryDate: 'Dec 31, 2024',
    gym: 'Core Fitness Mamburao',
    daysLeft: 45,
  };

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
      title: 'Browse Events',
      subtitle: 'Join upcoming activities',
      icon: Trophy,
      color: 'from-purple-500 to-pink-500',
      action: () => navigate('/member/events'),
    },
    {
      title: 'Track Progress',
      subtitle: 'View your fitness journey',
      icon: TrendingUp,
      color: 'from-green-500 to-emerald-500',
      action: () => navigate('/member/progress'),
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
            
            {/* QR Code */}
            <div className="bg-white p-3 rounded-2xl shadow-lg">
              <QRCodeSVG value={member.qrCode} size={100} />
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

          {/* Days Left Badge */}
          <div className="mt-3 bg-white/10 backdrop-blur-sm rounded-xl px-3 py-2 inline-block">
            <p className="text-white text-xs">
              <span className="font-bold text-lg">{member.daysLeft}</span> days remaining
            </p>
          </div>
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
