import { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Star, Calendar, Users, Dumbbell, LogOut, TrendingUp } from 'lucide-react';

const TRAINER = {
  name: 'Cyrelle Joy Duhac',
  specialization: 'Strength & Conditioning',
  photoUrl: '/trainer-duhac.png',
  email: 'cyrelle.duhac@corefitness.com',
  phone: '+63 917 123 4567',
  rating: 4.8,
  sessionsCompleted: 342,
  membersAssigned: 5,
  joinDate: '2024-03-15',
};

export default function TrainerProfile() {
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem('isLoggedIn');
    localStorage.removeItem('trainerMode');
    navigate('/login');
  };

  return (
    <div className="space-y-4 pb-4">
      {/* Profile Card */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        className="rounded-xl p-4 text-center" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
        <div className="w-20 h-20 rounded-full overflow-hidden mx-auto mb-3" style={{ border: '3px solid var(--color-primary)' }}>
          <img src={TRAINER.photoUrl} alt={TRAINER.name} className="w-full h-full object-cover" />
        </div>
        <h2 className="text-base font-bold text-white">{TRAINER.name}</h2>
        <p className="text-[11px] mt-0.5" style={{ color: 'var(--color-primary)' }}>{TRAINER.specialization}</p>
        <div className="flex items-center justify-center gap-1 mt-1">
          <Star size={12} style={{ color: 'var(--color-secondary)', fill: 'var(--color-secondary)' }} />
          <span className="text-xs font-bold text-white">{TRAINER.rating}</span>
          <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>rating</span>
        </div>
      </motion.div>

      {/* Stats */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        className="grid grid-cols-3 gap-2">
        {[
          { icon: Calendar, label: 'Sessions', value: TRAINER.sessionsCompleted, color: 'var(--color-primary)' },
          { icon: Users, label: 'Members', value: TRAINER.membersAssigned, color: 'var(--color-secondary)' },
          { icon: TrendingUp, label: 'Rating', value: TRAINER.rating, color: '#22c55e' },
        ].map(s => (
          <div key={s.label} className="rounded-xl p-3 text-center"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
            <s.icon size={14} className="mx-auto mb-1" style={{ color: s.color }} />
            <p className="text-sm font-bold text-white">{s.value}</p>
            <p className="text-[8px]" style={{ color: 'var(--color-text-muted)' }}>{s.label}</p>
          </div>
        ))}
      </motion.div>

      {/* Info */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
        className="rounded-xl p-4 space-y-3" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
        <p className="text-[10px] uppercase font-semibold" style={{ color: 'var(--color-text-muted)' }}>Contact Info</p>
        {[
          { label: 'Email', value: TRAINER.email },
          { label: 'Phone', value: TRAINER.phone },
          { label: 'Member Since', value: new Date(TRAINER.joinDate).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) },
        ].map(item => (
          <div key={item.label} className="flex items-center justify-between">
            <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>{item.label}</span>
            <span className="text-[11px] font-medium text-white">{item.value}</span>
          </div>
        ))}
      </motion.div>

      {/* Actions */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
        className="space-y-2">
        <button onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 p-3 rounded-full text-xs font-semibold transition-colors active:scale-[0.98]"
          style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}>
          <LogOut size={14} /> Logout
        </button>
      </motion.div>
    </div>
  );
}
