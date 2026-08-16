import { SkeletonList } from '../../components/ui/Skeleton';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Calendar, Users, LogOut, Pencil, Mail, Phone, Clock, Trophy,
  Settings as SettingsIcon,
} from 'lucide-react';
import Avatar from '../../components/ui/Avatar';
import ListRow from '../../components/ui/ListRow';
import SectionHeader from '../../components/ui/SectionHeader';
import StatCard from '../../components/ui/StatCard';
import { panelStyle } from '../../components/ui/Card';
import { logout } from '../../utils/auth';
import {
  getCurrentTrainerId,
  getTrainerOverview,
  type TrainerOverview,
} from '../../services/trainerService';
import { errorMessage } from '../../utils/errorMessage';

export default function TrainerProfile() {
  const navigate = useNavigate();
  const [overview, setOverview] = useState<TrainerOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const id = await getCurrentTrainerId();
        if (!id) throw new Error('Not signed in');
        const data = await getTrainerOverview(id);
        if (cancelled) return;
        if (!data) throw new Error('No trainer profile found for this account');
        setOverview(data);
      } catch (err) {
        console.error('Trainer profile load failed:', err);
        if (!cancelled) setError(errorMessage(err, 'Failed to load'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleLogout = async () => {
    setShowLogoutConfirm(false);
    await logout();
    localStorage.removeItem('isLoggedIn');
    localStorage.removeItem('trainerMode');
    navigate('/login');
  };

  if (loading) return <SkeletonList count={3} />;

  if (error || !overview) {
    return (
      <div className="space-y-4 pb-4">
        <div className="py-12 text-center px-6">
          <p className="text-xs text-white mb-1">Couldn't load your profile</p>
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{error}</p>
        </div>
        {/* Logout stays reachable — being unable to load a profile must never
            trap someone in the app with no way out. */}
        <button onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 p-3 rounded-full text-xs font-semibold transition-colors active:scale-[0.98]"
          style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}>
          <LogOut size={14} /> Logout
        </button>
      </div>
    );
  }

  const { profile, trainer } = overview.trainer;
  const fullName = `${profile.first_name} ${profile.last_name}`;
  // Initials now come from <Avatar>, which owns that fallback for the whole app.

  // No rating table exists, so the old 4.8-star badge is gone rather than faked.
  const stats = [
    { icon: Calendar, label: 'Sessions this week', value: overview.sessionsThisWeek },
    { icon: Users, label: 'Members', value: overview.membersAssigned },
  ];

  // A missing phone renders nothing rather than an em dash placeholder.
  const info = [
    { icon: Mail, label: 'Email', value: profile.email },
    { icon: Phone, label: 'Phone', value: profile.phone },
    {
      icon: Calendar,
      label: 'Coaching since',
      value: new Date(profile.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
    },
  ].filter((i) => i.value);

  return (
    <div className="space-y-5 pb-4">
      {/* Identity. Given the same violet treatment as the member's membership
          card — this is the trainer's equivalent "who I am here" panel, and a
          flat grey box on the screen that carries your own name and face read
          as the least important thing in the app. */}
      <motion.section
        initial={{ opacity: 0, scale: 0.97, y: -8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 26 }}
        className="p-5 relative overflow-hidden"
        style={{
          background: 'var(--color-primary)',
          borderRadius: 'var(--radius-panel)',
          boxShadow: 'var(--shadow-panel)',
        }}
      >
        <div
          className="absolute top-0 right-0 w-40 h-40 rounded-full opacity-25 pointer-events-none"
          style={{
            background: 'radial-gradient(circle, rgba(245,158,11,0.55) 0%, transparent 70%)',
            transform: 'translate(30%, -35%)',
          }}
        />
        <div className="relative z-10 flex items-center gap-4">
          <div className="relative flex-shrink-0">
            <span
              className="block rounded-full"
              style={{ padding: 3, background: 'rgba(255,255,255,0.25)' }}
            >
              <Avatar name={fullName} photoUrl={profile.photo_url} size={72} />
            </span>
            <button
              onClick={() => navigate('/trainer/profile/edit')}
              aria-label="Edit profile"
              className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full flex items-center justify-center text-black active:scale-90 transition-transform"
              style={{ background: 'var(--color-secondary)', border: '2px solid var(--color-primary)' }}
            >
              <Pencil size={14} />
            </button>
          </div>
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.7)' }}>
              Coach
            </p>
            <h1 className="display text-2xl text-white truncate leading-tight">{fullName}</h1>
            {trainer.specialization && (
              <span
                className="inline-block mt-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold"
                style={{ background: 'rgba(0,0,0,0.28)', color: '#fff' }}
              >
                {trainer.specialization}
              </span>
            )}
          </div>
        </div>
      </motion.section>

      {trainer.bio && (
        <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <SectionHeader title="About" />
          <div className="p-4" style={{ ...panelStyle, borderRadius: 'var(--radius-panel)' }}>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>{trainer.bio}</p>
          </div>
        </motion.section>
      )}

      {/* No rating table exists, so the old 4.8-star badge is gone rather than faked. */}
      <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        className="grid grid-cols-2 gap-2">
        {stats.map((s) => (
          <StatCard key={s.label} value={s.value} label={s.label} icon={s.icon} />
        ))}
      </motion.section>

      <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
        <SectionHeader
          title="Details"
          action={
            <button onClick={() => navigate('/trainer/profile/edit')}
              className="text-xs font-semibold" style={{ color: 'var(--color-secondary)' }}>
              Edit
            </button>
          }
        />
        <div className="p-4 space-y-3" style={{ ...panelStyle, borderRadius: 'var(--radius-panel)' }}>
          {info.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.label} className="flex items-center gap-3">
                <Icon size={16} className="flex-shrink-0" style={{ color: 'var(--color-text-muted)' }} />
                <div className="min-w-0">
                  <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{item.label}</p>
                  <p className="text-sm text-white truncate">{item.value}</p>
                </div>
              </div>
            );
          })}
          {trainer.availability && (
            <div className="flex items-center gap-3">
              <Clock size={16} className="flex-shrink-0" style={{ color: 'var(--color-text-muted)' }} />
              <div className="min-w-0">
                <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Availability</p>
                <p className="text-sm text-white">{trainer.availability}</p>
              </div>
            </div>
          )}
        </div>
      </motion.section>

      <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        <SectionHeader title="Your account" />
        <div className="space-y-2">
          <ListRow
            icon={Clock} tone="primary"
            title="Bookable hours"
            subtitle="When members can book you 1-on-1"
            onClick={() => navigate('/trainer/availability')}
          />
          <ListRow
            icon={Trophy} tone="secondary"
            title="Achievements"
            subtitle="Milestones from the coaching you have done"
            onClick={() => navigate('/trainer/achievements')}
          />
          <ListRow
            icon={SettingsIcon} tone="muted"
            title="Settings"
            subtitle="Sound, password and about"
            onClick={() => navigate('/trainer/settings')}
          />
        </div>
      </motion.section>

      <button onClick={() => setShowLogoutConfirm(true)}
        className="w-full p-4 flex items-center justify-center gap-2 font-semibold text-sm"
        style={{
          background: 'var(--color-secondary-light)',
          border: '1px solid rgba(245,158,11,0.30)',
          color: 'var(--color-secondary)',
          borderRadius: 'var(--radius-btn)',
        }}>
        <LogOut size={17} /> Log out
      </button>

      {/* Same confirmation the member side has had all along — this screen was
          the odd one out, signing a trainer straight out on one tap of a button
          that sits directly under the settings list they were aiming for.

          `pointer-events-auto` is required: #modal-root is `pointer-events:
          none` so it doesn't swallow taps for the whole app, and without it
          this dialog would render perfectly and refuse every click. */}
      {showLogoutConfirm && createPortal(
        <div className="absolute inset-0 flex items-center justify-center p-4 pointer-events-auto">
          <div className="absolute inset-0 bg-black/80" onClick={() => setShowLogoutConfirm(false)} />
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            className="relative p-6 max-w-[300px] w-full z-10"
            style={{
              background: 'var(--color-surface-raised)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-panel)',
              boxShadow: 'var(--shadow-panel)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="display text-lg text-white mb-1">Log out?</h3>
            <p className="text-xs mb-5" style={{ color: 'var(--color-text-muted)' }}>
              You'll need your email and password to get back in.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="flex-1 h-11 rounded-full font-semibold text-sm"
                style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}
              >
                Cancel
              </button>
              <button
                onClick={handleLogout}
                className="flex-1 h-11 rounded-full font-semibold text-sm text-black"
                style={{ background: 'var(--color-secondary)' }}
              >
                Log out
              </button>
            </div>
          </motion.div>
        </div>,
        document.getElementById('modal-root')!
      )}
    </div>
  );
}
