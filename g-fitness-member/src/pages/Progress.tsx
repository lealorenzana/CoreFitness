import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { TrendingUp, Target, Award, Calendar, ArrowRight, ArrowLeft } from 'lucide-react';

export default function Progress() {
  const navigate = useNavigate();
  const stats = [
    { label: 'Weight', value: '75 kg', change: '-2.5 kg', trend: 'down', icon: TrendingUp },
    { label: 'Body Fat', value: '18%', change: '-3%', trend: 'down', icon: Target },
    { label: 'Muscle Mass', value: '62 kg', change: '+1.2 kg', trend: 'up', icon: Award },
    { label: 'Workouts', value: '24', change: '+8', trend: 'up', icon: Calendar },
  ];

  const weeklyProgress = [
    { day: 'Mon', value: 80 },
    { day: 'Tue', value: 60 },
    { day: 'Wed', value: 90 },
    { day: 'Thu', value: 70 },
    { day: 'Fri', value: 85 },
    { day: 'Sat', value: 95 },
    { day: 'Sun', value: 50 },
  ];

  const maxValue = Math.max(...weeklyProgress.map(d => d.value));

  const monthlyGoals = [
    { title: 'Weight Target', current: 75, target: 72, unit: 'kg', color: 'from-green-500 to-emerald-500' },
    { title: 'Workout Sessions', current: 18, target: 24, unit: 'sessions', color: 'from-blue-500 to-cyan-500' },
    { title: 'Body Fat', current: 18, target: 15, unit: '%', color: 'from-yellow-500 to-orange-500' },
  ];

  return (
    <div className="space-y-6">
      {/* Header with Back Button */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-4"
      >
        <button
          onClick={() => navigate('/member/home')}
          className="w-10 h-10 rounded-xl bg-dark-lighter border border-dark-border flex items-center justify-center text-gray-400 hover:text-white hover:border-primary-start transition-all"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <h1 className="text-3xl font-orbitron font-bold text-gradient">Progress</h1>
          <p className="text-gray-400 mt-1">Track your fitness journey</p>
        </div>
      </motion.div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-4">
        {stats.map((stat, index) => {
          const Icon = stat.icon;
          const isPositive = stat.trend === 'up';
          return (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1 + index * 0.1 }}
              className="bg-dark-lighter border border-dark-border rounded-2xl p-4 hover:border-primary-start/50 transition-all"
            >
              <Icon size={20} className="text-primary-start mb-2" />
              <p className="text-gray-400 text-xs">{stat.label}</p>
              <p className="text-2xl font-bold text-white mt-1 font-orbitron">{stat.value}</p>
              <p className={`text-xs mt-1 ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
                {stat.change} this month
              </p>
            </motion.div>
          );
        })}
      </div>

      {/* Weekly Activity */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="bg-dark-lighter border border-dark-border rounded-2xl p-6"
      >
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-white font-semibold text-lg">Weekly Activity</h3>
          <button
            onClick={() => navigate('/member/attendance-history')}
            className="text-primary-start text-sm hover:text-primary-end transition-colors flex items-center gap-1"
          >
            View Calendar <ArrowRight size={14} />
          </button>
        </div>
        <div className="flex items-end justify-between gap-2 h-40">
          {weeklyProgress.map((day, index) => {
            const height = (day.value / maxValue) * 100;
            return (
              <div key={day.day} className="flex-1 flex flex-col items-center gap-2">
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: `${height}%` }}
                  transition={{ delay: 0.6 + index * 0.1, duration: 0.5 }}
                  className="w-full bg-gradient-to-t from-primary-start to-primary-end rounded-t-lg relative group"
                >
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-dark-lighter px-2 py-1 rounded text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                    {day.value} min
                  </div>
                </motion.div>
                <span className="text-xs text-gray-400">{day.day}</span>
              </div>
            );
          })}
        </div>
      </motion.div>

      {/* Monthly Goals */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.8 }}
        className="space-y-4"
      >
        <h3 className="text-white font-semibold text-lg">Monthly Goals</h3>
        <div className="space-y-3">
          {monthlyGoals.map((goal, index) => {
            const progress = (goal.current / goal.target) * 100;
            return (
              <motion.div
                key={goal.title}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.9 + index * 0.1 }}
                className="bg-dark-lighter border border-dark-border rounded-2xl p-4"
              >
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-white font-semibold">{goal.title}</h4>
                  <span className="text-gray-400 text-sm">
                    {goal.current}/{goal.target} {goal.unit}
                  </span>
                </div>
                <div className="w-full h-2 bg-dark rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(progress, 100)}%` }}
                    transition={{ delay: 1 + index * 0.1, duration: 0.5 }}
                    className={`h-full bg-gradient-to-r ${goal.color}`}
                  ></motion.div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </motion.div>
    </div>
  );
}
