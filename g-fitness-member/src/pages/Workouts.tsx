import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Play, Clock, Flame, Dumbbell, ArrowLeft } from 'lucide-react';
import { showSuccessToast } from '../utils/errorHandler';

export default function Workouts() {
  const navigate = useNavigate();

  const handleStartWorkout = (workoutName: string) => {
    showSuccessToast(`Starting ${workoutName}...`);
    setTimeout(() => navigate('/member/progress'), 1500);
  };

  const workouts = [
    { name: 'Full Body Strength', duration: '45 min', calories: '350 kcal', difficulty: 'Intermediate', color: 'var(--color-secondary)' },
    { name: 'HIIT Cardio Blast', duration: '30 min', calories: '400 kcal', difficulty: 'Advanced', color: 'var(--color-primary)' },
    { name: 'Core & Abs', duration: '20 min', calories: '180 kcal', difficulty: 'Beginner', color: 'var(--color-primary)' },
    { name: 'Upper Body Power', duration: '40 min', calories: '320 kcal', difficulty: 'Intermediate', color: 'var(--color-primary)' },
  ];

  const difficultyStyle = (d: string) => {
    if (d === 'Beginner') return { background: 'var(--color-primary-light)', color: 'var(--color-primary)' };
    if (d === 'Intermediate') return { background: 'var(--color-secondary-light)', color: 'var(--color-secondary)' };
    return { background: 'var(--color-secondary-light)', color: 'var(--color-secondary)' };
  };

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
          <h1 className="text-2xl font-bold text-white">Workouts</h1>
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Choose your training program</p>
        </div>
      </motion.div>

      {/* Today's Workout — flat violet */}
      <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1 }}
        className="rounded-2xl p-5" style={{ background: 'var(--color-primary)', border: '1px solid var(--color-primary-hover)' }}>
        <p className="text-white/70 text-xs font-semibold uppercase tracking-wide">Today's Workout</p>
        <h2 className="text-xl font-bold text-white mt-1 mb-4">Chest & Triceps</h2>
        <div className="flex gap-4 mb-4">
          <div className="flex items-center gap-1.5 text-sm text-white/80"><Clock size={15} /> 60 min</div>
          <div className="flex items-center gap-1.5 text-sm text-white/80"><Flame size={15} /> 450 kcal</div>
        </div>
        <button onClick={() => handleStartWorkout('Chest & Triceps')}
          className="w-full py-3 rounded-xl font-semibold text-sm text-black flex items-center justify-center gap-2"
          style={{ background: 'var(--color-secondary)' }}>
          <Play size={18} fill="currentColor" /> Start Workout
        </button>
      </motion.div>

      {/* Workout Library */}
      <div className="space-y-3">
        <h3 className="text-white font-semibold">Workout Library</h3>
        {workouts.map((w, i) => (
          <motion.div key={w.name} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 + i * 0.08 }}
            className="rounded-2xl p-4 transition-colors"
            style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--color-secondary)')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--color-border)')}>
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${w.color}20` }}>
                <Dumbbell size={24} style={{ color: w.color }} />
              </div>
              <div className="flex-1">
                <h4 className="text-white font-semibold text-sm">{w.name}</h4>
                <div className="flex gap-2 mt-1.5 flex-wrap">
                  <span className="text-xs flex items-center gap-1" style={{ color: 'var(--color-text-muted)' }}><Clock size={11} /> {w.duration}</span>
                  <span className="text-xs flex items-center gap-1" style={{ color: 'var(--color-text-muted)' }}><Flame size={11} /> {w.calories}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={difficultyStyle(w.difficulty)}>{w.difficulty}</span>
                </div>
              </div>
              <button onClick={() => handleStartWorkout(w.name)}
                className="w-9 h-9 rounded-full flex items-center justify-center transition-colors"
                style={{ background: 'var(--color-secondary-light)', color: 'var(--color-secondary)', border: '1px solid rgba(245,158,11,0.20)' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-secondary)'; e.currentTarget.style.color = '#000'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-secondary-light)'; e.currentTarget.style.color = 'var(--color-secondary)'; }}>
                <Play size={16} fill="currentColor" />
              </button>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
