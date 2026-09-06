import { SkeletonList } from '../../components/ui/Skeleton';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Calendar, Users, LogOut, Pencil, Mail, Phone, Clock, Trophy, Star,
  Settings as SettingsIcon,
} from 'lucide-react';
import Avatar from '../../components/ui/Avatar';
import ListRow from '../../components/ui/ListRow';
import SectionHeader from '../../components/ui/SectionHeader';
import StatCard from '../../components/ui/StatCard';
import { panelStyle } from '../../components/ui/Card';
import { logout } from '../../utils/auth';
import { listMyRatings, summarise, type AnonymousRating } from '../../lib/api/trainerFeedback';
import {
  getCurrentTrainerId,
  getTrainerOverview,
  TRAINER_OVERVIEW_CACHE_KEY,
  type TrainerOverview,
} from '../../services/trainerService';
import { readCache, writeCache } from '../../lib/pageCache';
import { errorMessage } from '../../utils/errorMessage';

export default function TrainerProfile() {
  const navigate = useNavigate();
  // Same slot Trainer Home fills — one query, two screens.
  const cached = readCache<TrainerOverview>(TRAINER_OVERVIEW_CACHE_KEY);
  const [overview, setOverview] = useState<TrainerOverview | null>(cached ?? null);
  const [loading, setLoading] = useState(cached === undefined);
  const [error, setError] = useState('');
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  /**
   * How members have rated this coach (0042, monthly since 0066).
   *
   * **Without any member identity, enforced in SQL.** `my_trainer_ratings()`
   * reads a view with no member_id column and the base table no longer answers
   * to trainers at all (0072) — so there is nothing to hide in this component,
   * which is the point. Filtering a name out in JSX would have left it in the
   * network response for anyone who opened devtools.
   *
   * NULL average means nobody has rated yet. Never rendered as 0: zero stars is
   * a score nobody can give, so printing it would invent a verdict out of the
   * absence of one.
   */
  const [ratings, setRatings] = useState<AnonymousRating[] | null>(null);

  // Its own effect: a coach whose ratings fail to load must still get a
  // working profile. An empty result and a failed read are different, so a
  // failure leaves `ratings` at null and the section renders nothing rather
  // than "no ratings yet", which would be a claim about the members.
  useEffect(() => {
    let alive = true;
    listMyRatings()
      .then((rows) => { if (alive) setRatings(rows); })
      .catch(() => { /* no section, rather than a false one */ });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const id = await getCurrentTrainerId();
        if (!id) throw new Error('Not signed in');
        const data = await getTrainerOverview(id);
        if (cancelled) return;
        if (!data) throw new Error('No trainer profile found for this account');
        setOverview(writeCache(TRAINER_OVERVIEW_CACHE_KEY, data));
      } catch (err) {
        console.error('Trainer profile load failed:', err);
        // Quiet when there is already a profile on screen — see TrainerHome.
        if (!cancelled && !cached) setError(errorMessage(err, 'Failed to load'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // `cached` is the mount-time snapshot; re-running on it would refetch on
    // every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
          style={{ background: 'var(--color-secondary-light)', color: 'var(--color-secondary)', border: '1px solid var(--color-secondary)' }}>
          <LogOut size={14} /> Logout
        </button>
      </div>
    );
  }

  const { profile, trainer } = overview.trainer;
  const fullName = `${profile.first_name} ${profile.last_name}`;
  // Initials now come from <Avatar>, which owns that fallback for the whole app.

  // Derived, not stored: a second state holding the average would be one more
  // thing to keep in step with the list it came from.
  const ratingSummary = summarise(ratings ?? []);

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

      <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        className="grid grid-cols-2 gap-2">
        {stats.map((s) => (
          <StatCard key={s.label} value={s.value} label={s.label} icon={s.icon} />
        ))}
      </motion.section>

      {ratings !== null && ratings.length > 0 && (
        <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}>
          <SectionHeader title="How members rate you" />
          <div className="p-4 space-y-3" style={{ ...panelStyle, borderRadius: 'var(--radius-panel)' }}>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-white tabular-nums">
                {ratingSummary.average!.toFixed(1)}
              </span>
              <Star size={16} style={{ color: 'var(--color-secondary)', fill: 'var(--color-secondary)' }} />
              <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                from {ratingSummary.count} {ratingSummary.count === 1 ? 'evaluation' : 'evaluations'}
              </span>
            </div>

            {/* Said plainly rather than left to be inferred. A coach who thinks
                they can work out who wrote a review behaves differently towards
                the members they suspect — so the guarantee is worth stating,
                and it is a guarantee the database keeps, not this screen. */}
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              Evaluations are anonymous. The gym can see who wrote them; you cannot.
            </p>

            {ratings.filter((r) => r.comment).length > 0 && (
              <div className="space-y-2 pt-1">
                {ratings.filter((r) => r.comment).slice(0, 5).map((r, i) => (
                  <div key={`${r.period}-${i}`} className="rounded-xl p-3"
                    style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
                    <div className="flex items-center gap-1 mb-1">
                      {Array.from({ length: 5 }, (_, n) => (
                        <Star key={n} size={11}
                          style={{
                            color: n < r.stars ? 'var(--color-secondary)' : 'var(--color-border)',
                            fill: n < r.stars ? 'var(--color-secondary)' : 'transparent',
                          }} />
                      ))}
                      <span className="text-xs ml-1" style={{ color: 'var(--color-text-muted)' }}>
                        {new Date(r.period).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })}
                      </span>
                    </div>
                    <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                      {r.comment}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </motion.section>
      )}

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
