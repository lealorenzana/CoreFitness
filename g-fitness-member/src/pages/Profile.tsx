import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { User, Mail, Phone, MapPin, Calendar, LogOut, Bell, Shield, Edit, CreditCard, ArrowLeft, Activity, TrendingUp, Plus, Trash2 } from 'lucide-react';
import { SharedStorage } from '../utils/sharedStorage';
import { showSuccessToast } from '../utils/errorHandler';

interface WorkoutLog {
  id: string; date: string; type: string; duration: number; notes: string;
}

function calcBMI(h: number, w: number) {
  if (!h || !w) return null;
  const m = h / 100;
  return (w / (m * m)).toFixed(1);
}

function getBMILabel(bmi: string) {
  const v = parseFloat(bmi);
  if (v < 18.5) return { label: 'Underweight', color: 'var(--color-primary)' };
  if (v < 25) return { label: 'Normal', color: 'var(--color-primary)' };
  if (v < 30) return { label: 'Overweight', color: 'var(--color-secondary)' };
  return { label: 'Obese', color: 'var(--color-secondary)' };
}

export default function Profile() {
  const navigate = useNavigate();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [activeSection, setActiveSection] = useState<'info' | 'fitness'>('info');

  const memberEmail = localStorage.getItem('memberEmail') || 'eya.lorenzana@email.com';

  const [member, setMember] = useState(() => {
    const s = SharedStorage.getMember(memberEmail);
    if (s) return {
      name: s.fullName || `${s.firstName} ${s.lastName}`,
      email: s.email, phone: s.phone,
      gym: 'G-Fitness Mamburao',
      joinDate: new Date(s.joinDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
      membershipType: s.membershipType, membershipStatus: s.membershipStatus,
    };
    return { name: 'Eya Lorenzana', email: 'eya.lorenzana@email.com', phone: '+63 912 345 6789', gym: 'G-Fitness Mamburao', joinDate: 'January 15, 2024', membershipType: 'Premium', membershipStatus: 'Active' };
  });

  // Physical stats stored locally — full body measurements
  const [physStats, setPhysStats] = useState(() => {
    const saved = localStorage.getItem(`phys_${memberEmail}`);
    return saved
      ? JSON.parse(saved)
      : { heightCm: '', weightKg: '', arms: '', waist: '', chest: '', legs: '' };
  });

  const bmi = calcBMI(Number(physStats.heightCm), Number(physStats.weightKg));
  const bmiInfo = bmi ? getBMILabel(bmi) : null;

  const savePhysStats = (updated: typeof physStats) => {
    setPhysStats(updated);
    localStorage.setItem(`phys_${memberEmail}`, JSON.stringify(updated));
  };

  // Workout logs
  const [workoutLogs, setWorkoutLogs] = useState<WorkoutLog[]>(() => {
    const saved = localStorage.getItem(`workouts_${memberEmail}`);
    return saved ? JSON.parse(saved) : [];
  });
  const [showAddWorkout, setShowAddWorkout] = useState(false);
  const [workoutForm, setWorkoutForm] = useState({ type: 'Strength Training', duration: '', notes: '' });

  const saveWorkouts = (logs: WorkoutLog[]) => {
    setWorkoutLogs(logs);
    localStorage.setItem(`workouts_${memberEmail}`, JSON.stringify(logs));
  };

  const addWorkout = () => {
    if (!workoutForm.duration) return;
    const log: WorkoutLog = {
      id: `w-${Date.now()}`, date: new Date().toISOString().split('T')[0],
      type: workoutForm.type, duration: Number(workoutForm.duration), notes: workoutForm.notes,
    };
    saveWorkouts([log, ...workoutLogs]);
    setWorkoutForm({ type: 'Strength Training', duration: '', notes: '' });
    setShowAddWorkout(false);
  };

  const deleteWorkout = (id: string) => saveWorkouts(workoutLogs.filter(w => w.id !== id));

  // Auto-refresh member data
  useEffect(() => {
    const interval = setInterval(() => {
      const s = SharedStorage.getMember(memberEmail);
      if (s) setMember({
        name: s.fullName || `${s.firstName} ${s.lastName}`,
        email: s.email, phone: s.phone, gym: 'G-Fitness Mamburao',
        joinDate: new Date(s.joinDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
        membershipType: s.membershipType, membershipStatus: s.membershipStatus,
      });
    }, 2000);
    return () => clearInterval(interval);
  }, [memberEmail]);

  const handleLogout = () => {
    ['isLoggedIn', 'isAuthenticated', 'memberId', 'user', 'selectedGym', 'memberEmail', 'memberName'].forEach(k => localStorage.removeItem(k));
    navigate('/');
  };

  const menuItems = [
    { label: 'Payment History', icon: CreditCard, action: () => navigate('/member/payments') },
    { label: 'Membership Details', icon: Shield, action: () => navigate('/member/membership') },
    { label: 'Attendance History', icon: Calendar, action: () => navigate('/member/attendance-history') },
    { label: 'Notifications', icon: Bell, action: () => showSuccessToast('Notifications are enabled!') },
  ];

  const workoutTypes = ['Strength Training', 'HIIT', 'Yoga', 'Boxing', 'CrossFit', 'Cardio', 'Stretching'];

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
          <h1 className="text-2xl font-bold text-white">Profile</h1>
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Manage your account</p>
        </div>
      </motion.div>

      {/* Profile Card — large avatar with violet ring + tier badge + yellow stats row */}
      <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1 }}
        className="rounded-2xl p-5"
        style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
        <div className="flex flex-col items-center text-center">
          {/* Large avatar with violet ring */}
          <div className="relative mb-3">
            <div
              className="w-24 h-24 rounded-full flex items-center justify-center"
              style={{
                background: 'var(--color-primary-light)',
                border: '4px solid var(--color-primary)',
              }}>
              <User size={42} style={{ color: 'var(--color-primary)' }} />
            </div>
            <button onClick={() => navigate('/member/profile/edit')}
              className="absolute bottom-0 right-0 w-8 h-8 rounded-full flex items-center justify-center text-black"
              style={{ background: 'var(--color-secondary)', border: '2px solid var(--color-surface-raised)' }}>
              <Edit size={14} />
            </button>
          </div>

          <h2 className="text-xl font-bold text-white">{member.name}</h2>

          {/* Tier badge — Premium=violet, Standard=yellow, Basic=gray */}
          <span
            className="inline-block mt-1.5 px-3 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide"
            style={{
              background:
                member.membershipType === 'Premium'
                  ? 'var(--color-primary-light)'
                  : member.membershipType === 'Standard'
                    ? 'var(--color-secondary-light)'
                    : 'var(--color-border)',
              color:
                member.membershipType === 'Premium'
                  ? 'var(--color-primary)'
                  : member.membershipType === 'Standard'
                    ? 'var(--color-secondary)'
                    : 'var(--color-text-secondary)',
              border: '1px solid ' + (
                member.membershipType === 'Premium'
                  ? 'rgba(124,58,237,0.30)'
                  : member.membershipType === 'Standard'
                    ? 'rgba(245,158,11,0.30)'
                    : 'var(--color-border)'
              ),
            }}>
            {member.membershipType} Member
          </span>

          <span
            className="inline-block mt-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold"
            style={{
              background: member.membershipStatus === 'Active'
                ? 'rgba(124,58,237,0.20)'
                : 'var(--color-secondary-light)',
              color: member.membershipStatus === 'Active'
                ? 'var(--color-primary)'
                : 'var(--color-secondary)',
            }}>
            {member.membershipStatus}
          </span>
        </div>

        {/* Yellow accent stats row — Visits | Streak | Goals */}
        <div className="grid grid-cols-3 gap-2 mt-5 pt-4" style={{ borderTop: '1px solid var(--color-border)' }}>
          {[
            { label: 'Visits', value: 24 },
            { label: 'Streak', value: 4 },
            { label: 'Goals', value: 3 },
          ].map(stat => (
            <div key={stat.label} className="text-center">
              <p className="text-2xl font-bold" style={{ color: 'var(--color-secondary)' }}>{stat.value}</p>
              <p className="text-[10px] uppercase tracking-wider mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                {stat.label}
              </p>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Section Tabs */}
      <div className="flex gap-2 p-1 rounded-xl" style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
        {[
          { id: 'info', label: 'Info', icon: User },
          { id: 'fitness', label: 'Fitness Tracker', icon: Activity },
        ].map(tab => {
          const Icon = tab.icon;
          return (
            <button key={tab.id} onClick={() => setActiveSection(tab.id as any)}
              className="flex-1 py-2.5 rounded-lg font-semibold text-sm flex items-center justify-center gap-2 transition-colors"
              style={{
                background: activeSection === tab.id ? 'var(--color-secondary)' : 'transparent',
                color: activeSection === tab.id ? '#000' : 'var(--color-text-muted)',
              }}>
              <Icon size={15} /> {tab.label}
            </button>
          );
        })}
      </div>

      {/* Info Section */}
      {activeSection === 'info' && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          {/* Contact info */}
          <div className="rounded-2xl p-4 space-y-3" style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
            {[
              { icon: Mail, label: 'Email', value: member.email },
              { icon: Phone, label: 'Phone', value: member.phone },
              { icon: MapPin, label: 'Home Gym', value: member.gym },
              { icon: Calendar, label: 'Member Since', value: member.joinDate },
            ].map(row => {
              const Icon = row.icon;
              return (
                <div key={row.label} className="flex items-center gap-3">
                  <Icon size={18} style={{ color: 'var(--color-text-muted)' }} />
                  <div>
                    <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{row.label}</p>
                    <p className="text-sm text-white">{row.value}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Physical Stats */}
          <div className="rounded-2xl p-4 space-y-3" style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
            <div className="flex items-center justify-between">
              <h3 className="text-white font-semibold flex items-center gap-2">
                <TrendingUp size={16} style={{ color: 'var(--color-secondary)' }} /> Physical Stats
              </h3>
              <button onClick={() => navigate('/member/progress')}
                className="text-xs font-semibold" style={{ color: 'var(--color-secondary)' }}>
                Full tracking →
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                ['heightCm', 'Height (cm)', '170'],
                ['weightKg', 'Weight (kg)', '65'],
                ['arms', 'Arms (cm)', '32'],
                ['waist', 'Waist (cm)', '78'],
                ['chest', 'Chest (cm)', '98'],
                ['legs',  'Legs (cm)',  '60'],
              ].map(([key, label, ph]) => (
                <div key={key}>
                  <label className="text-xs block mb-1" style={{ color: 'var(--color-text-muted)' }}>{label}</label>
                  <input type="number" value={(physStats as any)[key]} placeholder={ph}
                    onChange={e => savePhysStats({ ...physStats, [key]: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl text-white text-sm focus:outline-none"
                    style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', height: 40 }} />
                </div>
              ))}
            </div>
            {bmi && bmiInfo && (
              <div className="flex items-center justify-between p-3 rounded-xl" style={{ background: 'var(--color-bg)', border: `1px solid ${bmiInfo.color}30` }}>
                <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>BMI</span>
                <div className="flex items-center gap-2">
                  <span className="text-xl font-bold text-white">{bmi}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: `${bmiInfo.color}20`, color: bmiInfo.color }}>
                    {bmiInfo.label}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Fitness summary card linking to Progress Hub */}
          <button onClick={() => navigate('/member/progress')}
            className="w-full rounded-2xl p-4 flex items-center gap-4 transition-colors"
            style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-primary)' }}>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'var(--color-primary)' }}>
              <Activity size={20} className="text-white" />
            </div>
            <div className="flex-1 text-left">
              <p className="text-white font-semibold text-sm">Fitness Tracking</p>
              <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>Workouts • Goals • Badges • Photos</p>
            </div>
            <span className="text-xs font-semibold" style={{ color: 'var(--color-secondary)' }}>Open →</span>
          </button>

          {/* Menu items */}
          <div className="space-y-2">
            {menuItems.map(item => {
              const Icon = item.icon;
              return (
                <button key={item.label} onClick={item.action}
                  className="w-full rounded-2xl p-4 flex items-center gap-4 transition-colors"
                  style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--color-secondary)')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--color-border)')}>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'var(--color-primary)' }}>
                    <Icon size={20} className="text-white" />
                  </div>
                  <span className="text-white font-semibold flex-1 text-left">{item.label}</span>
                  <span style={{ color: 'var(--color-text-muted)' }}>›</span>
                </button>
              );
            })}
          </div>

          {/* Logout */}
          <button onClick={() => setShowLogoutConfirm(true)}
            className="w-full rounded-2xl p-4 flex items-center justify-center gap-3 font-semibold transition-colors"
            style={{ background: 'var(--color-secondary-light)', border: '1px solid rgba(245,158,11,0.30)', color: 'var(--color-secondary)' }}>
            <LogOut size={18} /> Logout
          </button>
        </motion.div>
      )}

      {/* Fitness Tracker Section */}
      {activeSection === 'fitness' && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          {/* Summary stats */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Total Sessions', value: workoutLogs.length, color: 'var(--color-secondary)' },
              { label: 'This Week', value: workoutLogs.filter(w => { const d = new Date(w.date); const now = new Date(); return (now.getTime() - d.getTime()) < 7 * 86400000; }).length, color: 'var(--color-primary)' },
              { label: 'Total Minutes', value: workoutLogs.reduce((s, w) => s + w.duration, 0), color: 'var(--color-primary)' },
            ].map(s => (
              <div key={s.label} className="rounded-xl p-3 text-center" style={{ background: 'var(--color-surface-raised)', border: `1px solid ${s.color}30` }}>
                <p className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</p>
                <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>{s.label}</p>
              </div>
            ))}
          </div>

          {/* Add workout button */}
          <button onClick={() => setShowAddWorkout(!showAddWorkout)}
            className="w-full py-3 rounded-xl font-semibold text-black flex items-center justify-center gap-2"
            style={{ background: 'var(--color-secondary)' }}>
            <Plus size={18} /> Log Workout
          </button>

          {/* Add workout form */}
          {showAddWorkout && (
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl p-4 space-y-3" style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
              <h3 className="text-white font-semibold">Log New Workout</h3>
              <div>
                <label className="text-xs block mb-1" style={{ color: 'var(--color-text-muted)' }}>Workout Type</label>
                <select value={workoutForm.type} onChange={e => setWorkoutForm({ ...workoutForm, type: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl text-white text-sm focus:outline-none"
                  style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
                  {workoutTypes.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs block mb-1" style={{ color: 'var(--color-text-muted)' }}>Duration (minutes)</label>
                <input type="number" value={workoutForm.duration} placeholder="45"
                  onChange={e => setWorkoutForm({ ...workoutForm, duration: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl text-white text-sm focus:outline-none"
                  style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }} />
              </div>
              <div>
                <label className="text-xs block mb-1" style={{ color: 'var(--color-text-muted)' }}>Notes (optional)</label>
                <input value={workoutForm.notes} placeholder="How did it go?"
                  onChange={e => setWorkoutForm({ ...workoutForm, notes: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl text-white text-sm focus:outline-none"
                  style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }} />
              </div>
              <div className="flex gap-2">
                <button onClick={() => setShowAddWorkout(false)}
                  className="flex-1 py-2 rounded-xl text-sm font-semibold"
                  style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
                  Cancel
                </button>
                <button onClick={addWorkout}
                  className="flex-1 py-2 rounded-xl text-sm font-semibold text-black"
                  style={{ background: 'var(--color-secondary)' }}>
                  Save
                </button>
              </div>
            </motion.div>
          )}

          {/* Workout log list */}
          <div className="space-y-2">
            {workoutLogs.length === 0 ? (
              <div className="rounded-2xl p-8 text-center" style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
                <Activity size={36} className="mx-auto mb-2" style={{ color: 'var(--color-border)' }} />
                <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>No workouts logged yet. Start tracking!</p>
              </div>
            ) : (
              workoutLogs.map(log => (
                <div key={log.id} className="rounded-xl p-3 flex items-center gap-3"
                  style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'var(--color-primary)' }}>
                    <Activity size={18} className="text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-semibold text-sm">{log.type}</p>
                    <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                      {log.date} &bull; {log.duration} min{log.notes ? ` — ${log.notes}` : ''}
                    </p>
                  </div>
                  <button onClick={() => deleteWorkout(log.id)}
                    className="p-1.5 rounded-lg flex-shrink-0 transition-colors"
                    style={{ color: 'var(--color-text-muted)' }}
                    onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-secondary)')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-text-muted)')}>
                    <Trash2 size={14} />
                  </button>
                </div>
              ))
            )}
          </div>
        </motion.div>
      )}

      {/* Logout Confirm Modal */}
      {showLogoutConfirm && createPortal(
        <div className="absolute inset-0 flex items-center justify-center p-4 pointer-events-auto">
          <div className="absolute inset-0 bg-black/70" onClick={() => setShowLogoutConfirm(false)} />
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            className="relative rounded-2xl p-6 max-w-[280px] w-full z-10"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
            onClick={e => e.stopPropagation()}>
            <h3 className="text-white font-bold text-xl mb-2">Confirm Logout</h3>
            <p className="text-sm mb-6" style={{ color: 'var(--color-text-muted)' }}>Are you sure you want to logout?</p>
            <div className="flex gap-3">
              <button onClick={() => setShowLogoutConfirm(false)}
                className="flex-1 py-3 rounded-xl font-semibold text-sm"
                style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
                Cancel
              </button>
              <button onClick={handleLogout}
                className="flex-1 py-3 rounded-xl font-semibold text-sm text-white"
                style={{ background: 'var(--color-secondary)' }}>
                Logout
              </button>
            </div>
          </motion.div>
        </div>,
        document.getElementById('modal-root')!
      )}
    </div>
  );
}
