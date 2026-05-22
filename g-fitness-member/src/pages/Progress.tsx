import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { TrendingUp, Target, Award, Calendar, ArrowRight, ArrowLeft } from 'lucide-react';

export default function Progress() {
  const navigate = useNavigate();

  const stats = [
    { label: 'Weight', value: '75 kg', change: '-2.5 kg', positive: false, icon: TrendingUp, color: 'var(--color-primary)' },
    { label: 'Body Fat', value: '18%', change: '-3%', positive: false, icon: Target, color: 'var(--color-secondary)' },
    { label: 'Muscle Mass', value: '62 kg', change: '+1.2 kg', positive: true, icon: Award, color: 'var(--color-primary)' },
    { label: 'Workouts', value: '24', change: '+8', positive: true, icon: Calendar, color: 'var(--color-primary)' },
  ];

  const weeklyProgress = [
    { day: 'Mon', value: 80 }, { day: 'Tue', value: 60 }, { day: 'Wed', value: 90 },
    { day: 'Thu', value: 70 }, { day: 'Fri', value: 85 }, { day: 'Sat', value: 95 }, { day: 'Sun', value: 50 },
  ];
  const maxValue = Math.max(...weeklyProgress.map(d => d.value));

  const monthlyGoals = [
    { title: 'Weight Target', current: 75, target: 72, unit: 'kg', color: 'var(--color-primary)' },
    { title: 'Workout Sessions', current: 18, target: 24, unit: 'sessions', color: 'var(--color-primary)' },
    { title: 'Body Fat', current: 18, target: 15, unit: '%', color: 'var(--color-secondary)' },
  ];

  return (
    <div className="space-y-5 pb-4">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3">
        <button onClick={() => navigate('/member/home')}
          className="w-10 h-10 rounded-xl flex items-center justify-center transition-colors"
          style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}
          onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--color-secondary)')}
          onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--color-border)')}>
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-white">Progress</h1>
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Track your fitness journey</p>
        </div>
      </motion.div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3">
        {stats.map((s, i) => {
          const Icon = s.icon;
          return (
            <motion.div key={s.label} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1 + i * 0.08 }}
              className="rounded-2xl p-4" style={{ background: 'var(--color-surface-raised)', border: `1px solid ${s.color}30` }}>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-2" style={{ background: `${s.color}20` }}>
                <Icon size={16} style={{ color: s.color }} />
              </div>
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{s.label}</p>
              <p className="text-2xl font-bold text-white mt-0.5">{s.value}</p>
              <p className="text-xs mt-1" style={{ color: s.positive ? 'var(--color-primary)' : 'var(--color-secondary)' }}>{s.change} this month</p>
            </motion.div>
          );
        })}
      </div>

      {/* Weekly Activity */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
        className="rounded-2xl p-5" style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-semibold">Weekly Activity</h3>
          <button onClick={() => navigate('/member/attendance-history')}
            className="text-xs flex items-center gap-1 transition-colors" style={{ color: 'var(--color-secondary)' }}>
            View Calendar <ArrowRight size={12} />
          </button>
        </div>
        <div className="flex items-end justify-between gap-2 h-32">
          {weeklyProgress.map((d, i) => (
            <div key={d.day} className="flex-1 flex flex-col items-center gap-1.5">
              <motion.div initial={{ height: 0 }} animate={{ height: `${(d.value / maxValue) * 100}%` }}
                transition={{ delay: 0.5 + i * 0.08, duration: 0.4 }}
                className="w-full rounded-t-lg" style={{ background: 'var(--color-secondary)', minHeight: '4px' }} />
              <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{d.day}</span>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Monthly Goals */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }} className="space-y-3">
        <h3 className="text-white font-semibold">Monthly Goals</h3>
        {monthlyGoals.map((goal, i) => (
          <motion.div key={goal.title} initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.8 + i * 0.08 }}
            className="rounded-2xl p-4" style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-white font-semibold text-sm">{goal.title}</h4>
              <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{goal.current}/{goal.target} {goal.unit}</span>
            </div>
            <div className="h-2 rounded-full" style={{ background: 'var(--color-border)' }}>
              <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min((goal.current / goal.target) * 100, 100)}%` }}
                transition={{ delay: 0.9 + i * 0.08, duration: 0.5 }}
                className="h-full rounded-full" style={{ background: goal.color }} />
            </div>
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}
