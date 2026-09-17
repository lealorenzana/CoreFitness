import { SkeletonList } from '../../components/ui/Skeleton';
import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Star } from '@phosphor-icons/react';
import Avatar from '../../components/ui/Avatar';
import Modal from '../../components/ui/Modal';
import { InlineStat, LineRow, NocButton, Panel, SectionHead, StatusPill } from '../../components/ui/noc';
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
import { Page } from '../../components/ui/page';

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

  const logoutModal = (
    <Modal
      isOpen={showLogoutConfirm}
      onClose={() => setShowLogoutConfirm(false)}
      title="Log out"
      subtitle="You will need your email and password to get back in."
      confirmLabel="Log out"
      cancelLabel="Stay signed in"
      onConfirm={() => void handleLogout()}
    >
      <span />
    </Modal>
  );

  if (error || !overview) {
    return (
      <Page>
        <div className="text-center" style={{ padding: '40px 24px' }}>
          <p style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--color-text-primary)' }}>Couldn't load your profile</p>
          <p style={{ fontSize: 12.5, marginTop: 4, color: 'var(--color-text-muted)' }}>{error}</p>
        </div>
        {/* Logout stays reachable — being unable to load a profile must never
            trap someone in the app with no way out. */}
        <NocButton variant="ghost" className="w-full" onClick={() => void handleLogout()}>Log out</NocButton>
      </Page>
    );
  }

  const { profile, trainer } = overview.trainer;
  const fullName = `${profile.first_name} ${profile.last_name}`;

  // Derived, not stored: a second state holding the average would be one more
  // thing to keep in step with the list it came from.
  const ratingSummary = summarise(ratings ?? []);

  // A missing phone renders nothing rather than an em dash placeholder.
  const info = [
    { label: 'Email', value: profile.email },
    { label: 'Phone', value: profile.phone },
    {
      label: 'Since',
      value: new Date(profile.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
    },
    { label: 'Hours', value: trainer.availability },
  ].filter((i) => i.value);

  const withComments = (ratings ?? []).filter((r) => r.comment);

  return (
    <Page>
      {/* Identity — the member Profile's layout: the whole row opens Edit. */}
      <button onClick={() => navigate('/trainer/profile/edit')} className="w-full flex items-center text-left" style={{ gap: 14 }}>
        <Avatar name={fullName} photoUrl={profile.photo_url} size={64} />
        <span className="flex-1 min-w-0">
          <span className="block truncate" style={{ fontSize: 20, fontWeight: 600, color: 'var(--color-text-primary)' }}>
            {fullName}
          </span>
          <span className="flex flex-wrap" style={{ gap: 6, marginTop: 7 }}>
            <StatusPill label="Coach" tone="structure" />
            {trainer.specialization && <StatusPill label={trainer.specialization} tone="muted" />}
          </span>
        </span>
        <span className="flex-none" style={{ fontSize: 13, color: 'var(--color-secondary)' }}>Edit</span>
      </button>

      <div className="grid grid-cols-2" style={{ gap: 12 }}>
        <InlineStat value={overview.sessionsThisWeek} label="Sessions this week" />
        <InlineStat value={overview.membersAssigned} label="Members" />
      </div>

      <div className="rule" />

      {trainer.bio && (
        <section>
          <SectionHead title="About" />
          <p style={{ fontSize: 14, marginTop: 8, lineHeight: 1.6, color: 'var(--color-text-secondary)' }}>{trainer.bio}</p>
        </section>
      )}

      {ratings !== null && ratings.length > 0 && (
        <section>
          <SectionHead title="How members rate you" />
          <Panel glow="structure" style={{ marginTop: 12 }}>
            <p className="flex items-baseline" style={{ gap: 8 }}>
              <span className="tabular-nums" style={{
                fontSize: 'var(--text-hero)', fontWeight: 600, lineHeight: 1,
                letterSpacing: 'var(--tracking-hero)', color: 'var(--color-text-primary)',
              }}>
                {ratingSummary.average!.toFixed(1)}
              </span>
              <Star size={18} weight="fill" style={{ color: 'var(--color-secondary)' }} />
              <span style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>
                from {ratingSummary.count} {ratingSummary.count === 1 ? 'evaluation' : 'evaluations'}
              </span>
            </p>
            {/* Said plainly rather than left to be inferred. A coach who thinks
                they can work out who wrote a review behaves differently towards
                the members they suspect — and it is a guarantee the database
                keeps, not this screen. */}
            <p style={{ fontSize: 12.5, marginTop: 10, color: 'var(--color-text-muted)' }}>
              Evaluations are anonymous. The gym can see who wrote them; you cannot.
            </p>
          </Panel>

          {withComments.length > 0 && (
            <div style={{ marginTop: 6 }}>
              {withComments.slice(0, 5).map((r, i, arr) => (
                <div key={`${r.period}-${i}`}>
                  <div style={{ padding: '12px 0' }}>
                    <div className="flex items-center" style={{ gap: 3 }}>
                      {Array.from({ length: 5 }, (_, n) => (
                        <Star key={n} size={12} weight={n < r.stars ? 'fill' : 'regular'}
                          style={{ color: n < r.stars ? 'var(--color-secondary)' : 'var(--color-text-muted)' }} />
                      ))}
                      <span style={{ fontSize: 12, marginLeft: 6, color: 'var(--color-text-muted)' }}>
                        {new Date(r.period).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })}
                      </span>
                    </div>
                    <p style={{ fontSize: 14, marginTop: 5, lineHeight: 1.55, color: 'var(--color-text-secondary)' }}>
                      {r.comment}
                    </p>
                  </div>
                  {i < arr.length - 1 && <div className="hair" />}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <section>
        <SectionHead title="Details" meta={
          <button onClick={() => navigate('/trainer/profile/edit')} style={{ color: 'var(--color-secondary)' }}>Edit</button>
        } />
        <div style={{ marginTop: 4 }}>
          {info.map((row, i) => (
            <LineRow key={row.label} gutter={row.label} gutterWidth={64} title={row.value} last={i === info.length - 1} />
          ))}
        </div>
      </section>

      <section>
        <SectionHead title="Your account" />
        <div style={{ marginTop: 4 }}>
          <LineRow title="Bookable hours" meta="When members can book you 1-on-1" action="Open" actionTone="structure"
            onClick={() => navigate('/trainer/availability')} />
          <LineRow title="Achievements" meta="Milestones from the coaching you have done" action="Open" actionTone="structure"
            onClick={() => navigate('/trainer/achievements')} />
          <LineRow title="Settings" meta="Sound, password and about" action="Open" actionTone="structure"
            onClick={() => navigate('/trainer/settings')} last />
        </div>
      </section>

      <NocButton variant="ghost" className="w-full" onClick={() => setShowLogoutConfirm(true)}>
        Log out
      </NocButton>

      {logoutModal}
    </Page>
  );
}
