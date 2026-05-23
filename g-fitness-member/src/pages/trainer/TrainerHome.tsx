import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Users, Calendar, Clock, Star, TrendingUp, ChevronRight, Dumbbell } from 'lucide-react';

const TRAINER = {
  name: 'Cyrelle Joy Duhac',
  specialization: 'Strength & Conditioning',
  photoUrl: '/trainer-duhac.png',
  rating: 4.8,
  sessionsCompleted: 342,
  membersAssigned: 5,
  classesToday: 2,
  pendingBookings: 2,
};

const TODAY_CLASSES = [
  { id: '1', name: 'Morning Strength', time: '6:00 AM', members: 8, capacity: 12 },
  { id: '2', name: 'Power Hour', time: '5:00 PM', members: 10, capacity: 12 },
];

const RECENT_ACTIVITY = [
  { id: '1', text: 'Aaron Diwa completed Strength Basics', time: '2h ago', type: 'progress' },
  { id: '2', text: 'New booking from Clairey Anne Belen', time: '3h ago', type: 'booking' },
  { id: '3', text: 'Ana Par Ituralde hit weekly goal', time: '5h ago', type: 'achievement' },
];

export default function TrainerHome() {
  const navigate = useNavigate();

  return (
    <div className="space-y-4 pb-4">
      {/* Greeting */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full overflow-hidden flex-shrink-0" style={{ border: '2px solid var(--color-primary)' }}>
            <img src={TRAINER.photoUrl} alt={TRAINER.name} className="w-full h-full object-cover" />
          </div>
          <div className="flex-1">
            <p className="text-[10px] uppercase" style={{ color: 'var(--color-text-muted)' }}>Good morning, Coach</p>
            <p className="text-base font-bold text-white">{TRAINER.name.split(' ')[0]}</p>
          </div>
          <div className="flex items-center gap-1 px-2 py-1 rounded-full" style={{ background: 'var(--color-primary-light)' }}>
            <Star size={11} style={{ color: 'var(--color-secondary)', fill: 'var(--color-secondary)' }} />
            <span className="text-[11px] font-bold text-white">{TRAINER.rating}</span>
          </div>
        </div>
      </motion.div>

      {/* Quick Stats */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        className="grid grid-cols-3 gap-2">
        {[
          { label: 'Members', value: TRAINER.membersAssigned, icon: Users, color: 'var(--color-primary)' },
          { label: 'Classes Today', value: TRAINER.classesToday, icon: Calendar, color: 'var(--color-secondary)' },
          { label: 'Pending', value: TRAINER.pendingBookings, icon: Clock, color: '#22c55e' },
        ].map((stat, i) => (
          <div key={stat.label} className="rounded-xl p-3 text-center"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
            <stat.icon size={16} className="mx-auto mb-1" style={{ color: stat.color }} />
            <p className="text-lg font-bold text-white">{stat.value}</p>
            <p className="text-[9px]" style={{ color: 'var(--color-text-muted)' }}>{stat.label}</p>
          </div>
        ))}
      </motion.div>

      {/* Today's Classes */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-bold text-white">Today's Classes</p>
          <button onClick={() => navigate('/trainer/schedule')} className="text-[10px] font-semibold flex items-center gap-0.5"
            style={{ color: 'var(--color-primary)' }}>
            View All <ChevronRight size={11} />
          </button>
        </div>
        <div className="space-y-2">
          {TODAY_CLASSES.map(cls => (
            <div key={cls.id} className="flex items-center gap-3 p-3 rounded-xl"
              style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{ background: 'var(--color-primary-light)' }}>
                <Dumbbell size={14} style={{ color: 'var(--color-primary)' }} />
              </div>
              <div className="flex-1">
                <p className="text-xs font-semibold text-white">{cls.name}</p>
                <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>{cls.time}</p>
              </div>
              <div className="text-right">
                <p className="text-[11px] font-bold" style={{ color: 'var(--color-primary)' }}>{cls.members}/{cls.capacity}</p>
                <p className="text-[8px]" style={{ color: 'var(--color-text-muted)' }}>enrolled</p>
              </div>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Recent Activity */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
        <p className="text-xs font-bold text-white mb-2">Recent Activity</p>
        <div className="space-y-1.5">
          {RECENT_ACTIVITY.map(act => (
            <div key={act.id} className="flex items-center gap-2.5 p-2.5 rounded-xl"
              style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
              <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: act.type === 'progress' ? 'var(--color-primary-light)' : act.type === 'booking' ? 'rgba(245,158,11,0.15)' : 'rgba(34,197,94,0.15)' }}>
                {act.type === 'progress' && <TrendingUp size={12} style={{ color: 'var(--color-primary)' }} />}
                {act.type === 'booking' && <Clock size={12} style={{ color: 'var(--color-secondary)' }} />}
                {act.type === 'achievement' && <Star size={12} style={{ color: '#22c55e' }} />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-white truncate">{act.text}</p>
                <p className="text-[9px]" style={{ color: 'var(--color-text-muted)' }}>{act.time}</p>
              </div>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Sessions Summary */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
        className="rounded-xl p-4" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
        <p className="text-xs font-bold text-white mb-2">This Week</p>
        <div className="flex items-center justify-between">
          <div className="text-center">
            <p className="text-xl font-bold" style={{ color: 'var(--color-primary)' }}>12</p>
            <p className="text-[9px]" style={{ color: 'var(--color-text-muted)' }}>Sessions</p>
          </div>
          <div className="w-px h-8" style={{ background: 'var(--color-border)' }} />
          <div className="text-center">
            <p className="text-xl font-bold" style={{ color: 'var(--color-secondary)' }}>48</p>
            <p className="text-[9px]" style={{ color: 'var(--color-text-muted)' }}>Members Trained</p>
          </div>
          <div className="w-px h-8" style={{ background: 'var(--color-border)' }} />
          <div className="text-center">
            <p className="text-xl font-bold text-white">96%</p>
            <p className="text-[9px]" style={{ color: 'var(--color-text-muted)' }}>Attendance</p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
