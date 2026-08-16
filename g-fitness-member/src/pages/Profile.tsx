import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Mail, Phone, MapPin, Calendar, LogOut, Shield, Edit, CreditCard,
  ArrowLeft, Activity, Settings as SettingsIcon,
} from 'lucide-react';
import { logout } from '../utils/auth';
import Avatar from '../components/ui/Avatar';
import { SkeletonList } from '../components/ui/Skeleton';
import { panelStyle } from '../components/ui/Card';
import SectionHeader from '../components/ui/SectionHeader';
import ListRow from '../components/ui/ListRow';
import { Pill } from '../components/ui/StatCard';
import { getCurrentMemberId } from '../services/bookingService';
import { getMemberProfile } from '../lib/api/members';
import { getCurrentMembership } from '../lib/api/memberships';

/**
 * The member's own profile.
 *
 * Four things were wrong here, and all four were invisible to the build:
 *
 *  1. The avatar was `<img src="/eya.png" alt="Eya Lorenzana">` — a hardcoded
 *     photo of one real person, shown to **every** member on their own profile.
 *  2. The stats row read Visits 24 / Streak 4 / Goals 3. All three were
 *     literals. No member ever had 24 visits because nothing counted them.
 *  3. A "Notifications" row whose only action was a toast saying
 *     "Notifications are enabled!" — it enabled nothing, and firing it repeatedly
 *     stacked six identical green banners over the page.
 *  4. A whole "Fitness Tracker" tab storing measurements and workout logs in
 *     `localStorage['phys_' + memberEmail]` — except `memberEmail` was still ''
 *     when the state initialiser ran, so every account on a device shared one
 *     key. The Progress Hub stores the same things in Postgres, per member.
 *
 * What's left is identity, membership, and links to the pages that hold the
 * real data.
 */
export default function Profile() {
  const navigate = useNavigate();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [member, setMember] = useState({
    name: '', email: '', phone: '', photoUrl: null as string | null,
    gym: 'Core Fitness Mamburao',
    joinDate: '', planName: '', status: '',
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const id = await getCurrentMemberId().catch(() => null);
        if (!id || cancelled) return;
        const [profile, membership] = await Promise.all([
          getMemberProfile(id).catch(() => null),
          getCurrentMembership(id).catch(() => null),
        ]);
        if (cancelled || !profile) return;
        setMember({
          name: `${profile.profile.first_name} ${profile.profile.last_name}`.trim(),
          email: profile.profile.email,
          phone: profile.profile.phone ?? '',
          photoUrl: profile.profile.photo_url ?? null,
          gym: 'Core Fitness Mamburao',
          joinDate: new Date(profile.profile.created_at).toLocaleDateString('en-US', {
            year: 'numeric', month: 'long', day: 'numeric',
          }),
          planName: membership?.membership_plans?.name ?? '',
          status: membership?.status ?? '',
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleLogout = async () => {
    await logout();
    ['isLoggedIn', 'trainerMode', 'memberId', 'selectedGym', 'memberEmail', 'memberName']
      .forEach((k) => localStorage.removeItem(k));
    navigate('/');
  };

  // `status` is a lowercase enum in Postgres. This used to compare against
  // 'Active' with a capital A, so an active membership always rendered in the
  // amber "something is wrong" styling.
  const isActive = member.status === 'active';

  const contactRows = [
    { icon: Mail, label: 'Email', value: member.email },
    { icon: Phone, label: 'Phone', value: member.phone },
    { icon: MapPin, label: 'Home gym', value: member.gym },
    { icon: Calendar, label: 'Member since', value: member.joinDate },
  ].filter((r) => r.value);

  return (
    <div className="space-y-5 pb-4">
      <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3">
        <button
          onClick={() => navigate('/member/home')}
          className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ ...panelStyle, color: 'var(--color-text-secondary)' }}
        >
          <ArrowLeft size={18} />
        </button>
        <div className="min-w-0">
          <h1 className="display text-xl text-white">Profile</h1>
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Manage your account</p>
        </div>
      </motion.div>

      {loading ? (
        <SkeletonList />
      ) : (
        <>
          {/* Identity */}
          <motion.section
            initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.05 }}
            className="p-5 flex items-center gap-4"
            style={{ ...panelStyle, borderRadius: 'var(--radius-panel)', boxShadow: 'var(--shadow-panel)' }}
          >
            <div className="relative flex-shrink-0">
              <Avatar name={member.name} photoUrl={member.photoUrl} size={72} />
              <button
                onClick={() => navigate('/member/profile/edit')}
                aria-label="Edit profile"
                className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full flex items-center justify-center text-black"
                style={{ background: 'var(--color-secondary)', border: '2px solid var(--color-surface-raised)' }}
              >
                <Edit size={14} />
              </button>
            </div>

            <div className="min-w-0">
              <h2 className="display text-lg text-white truncate">{member.name}</h2>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {member.planName && <Pill label={member.planName} tone="primary" />}
                {member.status && (
                  <Pill label={isActive ? 'Active' : member.status} tone={isActive ? 'primary' : 'secondary'} />
                )}
              </div>
            </div>
          </motion.section>

          {/* Contact */}
          <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <SectionHeader
              title="Details"
              action={
                <button
                  onClick={() => navigate('/member/profile/edit')}
                  className="text-xs font-semibold"
                  style={{ color: 'var(--color-secondary)' }}
                >
                  Edit
                </button>
              }
            />
            <div
              className="p-4 space-y-3"
              style={{ ...panelStyle, borderRadius: 'var(--radius-panel)' }}
            >
              {contactRows.map((row) => {
                const Icon = row.icon;
                return (
                  <div key={row.label} className="flex items-center gap-3">
                    <Icon size={16} style={{ color: 'var(--color-text-muted)' }} className="flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{row.label}</p>
                      <p className="text-sm text-white truncate">{row.value}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.section>

          {/* Everything else lives on its own page */}
          <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
            <SectionHeader title="Your account" />
            <div className="space-y-2">
              <ListRow
                icon={Activity} tone="primary"
                title="Progress"
                subtitle="Measurements, workouts, goals and charts"
                onClick={() => navigate('/member/progress')}
              />
              <ListRow
                icon={Shield} tone="primary"
                title="Membership"
                subtitle="Your plan, days left and renewal"
                onClick={() => navigate('/member/renew-membership')}
              />
              <ListRow
                icon={CreditCard} tone="primary"
                title="Payments"
                subtitle="What you've paid and when"
                onClick={() => navigate('/member/payments')}
              />
              <ListRow
                icon={Calendar} tone="primary"
                title="Attendance"
                subtitle="Every gym visit on record"
                onClick={() => navigate('/member/attendance-history')}
              />
              <ListRow
                icon={SettingsIcon} tone="muted"
                title="Settings"
                subtitle="Password, privacy and about"
                onClick={() => navigate('/member/settings')}
              />
            </div>
          </motion.section>

          <button
            onClick={() => setShowLogoutConfirm(true)}
            className="w-full p-4 flex items-center justify-center gap-2 font-semibold text-sm"
            style={{
              background: 'var(--color-secondary-light)',
              border: '1px solid rgba(245,158,11,0.30)',
              color: 'var(--color-secondary)',
              borderRadius: 'var(--radius-btn)',
            }}
          >
            <LogOut size={17} /> Log out
          </button>
        </>
      )}

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
