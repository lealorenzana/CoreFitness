import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CaretRight } from '@phosphor-icons/react';
import Avatar from '../components/ui/Avatar';
import { SkeletonList } from '../components/ui/Skeleton';
import { toast } from '../components/ui/Toast';
import { errorMessage } from '../utils/errorMessage';
import { listPublicTrainers, trainerName, type PublicTrainer } from '../lib/api/directory';
import { getRatingSummaries, type TrainerRatingSummary } from '../lib/api/trainerRatings';
import { RatingLine } from '../components/ui/StarRating';
import { listClasses } from '../lib/api/classes';
import { Page, PageTitle } from '../components/ui/page';
import { NocButton } from '../components/ui/noc';

/**
 * The gym's coaching team, as a member sees it (Nocturne redesign).
 *
 * This page used to be two pages in a trench coat: a member-facing directory
 * built from `data/trainers.ts`, plus a trainer-facing roster decided by
 * matching the first word of your display name against a mock list. That branch
 * is gone; trainers have their own screens behind a real role check. This is the
 * member view, and only the member view.
 *
 * Ratings are real (0042) — written by members who completed a session with the
 * coach, and withheld until three exist. The upcoming-class count is computed
 * from the timetable, not stored.
 */
export default function Trainers() {
  const navigate = useNavigate();
  const [trainers, setTrainers] = useState<PublicTrainer[]>([]);
  const [classCounts, setClassCounts] = useState<Record<string, number>>({});
  const [ratings, setRatings] = useState<Map<string, TrainerRatingSummary>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [coaches, classes, scores] = await Promise.all([
          listPublicTrainers(),
          listClasses().catch(() => []),
          // One query for every coach's score. A failure leaves the rows with no
          // rating line — better than a coach list that fails to render.
          getRatingSummaries().catch(() => new Map<string, TrainerRatingSummary>()),
        ]);
        if (cancelled) return;
        setTrainers(coaches);
        setRatings(scores);
        const now = Date.now();
        const counts: Record<string, number> = {};
        for (const c of classes) {
          if (!c.trainer_id || !c.scheduled_at) continue;
          if (new Date(c.scheduled_at).getTime() <= now) continue;
          counts[c.trainer_id] = (counts[c.trainer_id] ?? 0) + 1;
        }
        setClassCounts(counts);
      } catch (err) {
        if (!cancelled) toast.error(errorMessage(err, 'Could not load the coaches'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <Page>
      <PageTitle back title="Coaches"
        subtitle={loading || trainers.length === 0 ? 'The coaching team at Core Fitness' : `${trainers.length} at the gym`} />

      {loading ? (
        <SkeletonList />
      ) : trainers.length === 0 ? (
        <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--color-text-muted)' }}>
          The gym has not added its coaching team to the app yet.
        </p>
      ) : (
        <section>
          {trainers.map((t, i) => {
            const upcoming = classCounts[t.id] ?? 0;
            const score = ratings.get(t.id);
            return (
              <div key={t.id}>
                <button onClick={() => navigate(`/member/trainer/${t.id}`)}
                  className="w-full flex items-center text-left" style={{ gap: 12, padding: '14px 0' }}>
                  <Avatar name={trainerName(t)} photoUrl={t.photo_url} size={42} />
                  <span className="flex-1 min-w-0">
                    <span className="block truncate" style={{ fontSize: 14.5, color: 'var(--color-text-primary)' }}>{trainerName(t)}</span>
                    <span className="block" style={{ fontSize: 12, marginTop: 2, color: 'var(--color-text-secondary)' }}>
                      {t.specialization ?? 'General training'}
                      {upcoming > 0 ? ` · ${upcoming} upcoming ${upcoming === 1 ? 'class' : 'classes'}` : ''}
                    </span>
                    <span className="block" style={{ marginTop: 5 }}>
                      <RatingLine average={score?.average_stars ?? null} count={score?.rating_count ?? 0} size={12} />
                    </span>
                  </span>
                  <CaretRight size={15} className="flex-none" style={{ color: 'var(--color-text-secondary)' }} />
                </button>
                {i < trainers.length - 1 && <div className="hair" />}
              </div>
            );
          })}
        </section>
      )}

      <NocButton variant="action" onClick={() => navigate('/member/book-class')}>Book a session</NocButton>
    </Page>
  );
}
