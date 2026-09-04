import Avatar from '../components/ui/Avatar';
import { SkeletonList } from '../components/ui/Skeleton';
import { panelStyle } from '../components/ui/Card';
import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Award, ArrowLeft, ArrowRight, Calendar, Dumbbell } from 'lucide-react';
import { toast } from '../components/ui/Toast';
import { errorMessage } from '../utils/errorMessage';
import { listPublicTrainers, trainerName, type PublicTrainer } from '../lib/api/directory';
import { getRatingSummaries, type TrainerRatingSummary } from '../lib/api/trainerRatings';
import { RatingLine } from '../components/ui/StarRating';
import { listClasses } from '../lib/api/classes';

/**
 * The gym's coaching team, as a member sees it.
 *
 * This page used to be two pages in a trench coat: a member-facing directory
 * built from `data/trainers.ts`, plus a trainer-facing roster of "assigned
 * members" from `mockTrainerAssignments`. Which one you got was decided by
 * `useTrainerView()`, which matched the **first word of your display name**
 * against the mock trainer list — so any member called Ana saw a coach's client
 * roster, and a coach whose name didn't match saw the member view.
 *
 * That branch is gone. Trainers have their own screens under `pages/trainer/`,
 * behind a real role check against `profiles.role`. This is the member view,
 * and only the member view.
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
          // One query for every coach's score, not one per row. A failure leaves
          // the map empty and the rows simply carry no rating line — a coach
          // list that fails to render because the scores are down would be a
          // worse trade than a coach list with no scores.
          getRatingSummaries().catch(() => new Map<string, TrainerRatingSummary>()),
        ]);
        if (cancelled) return;
        setTrainers(coaches);
        setRatings(scores);

        // How many sessions each coach still has ahead of them.
        //
        // This comment used to end "unlike the star ratings this page used to
        // show" — those were hardcoded 4.9s with no table behind them. Ratings
        // are real as of 0042: written by members who completed a session with
        // the coach, and withheld until three exist.
        const now = Date.now();
        const counts: Record<string, number> = {};
        for (const c of classes) {
          if (!c.trainer_id || !c.scheduled_at) continue;
          if (new Date(c.scheduled_at).getTime() <= now) continue;
          counts[c.trainer_id] = (counts[c.trainer_id] ?? 0) + 1;
        }
        setClassCounts(counts);
      } catch (err) {
        if (!cancelled) toast.error(errorMessage(err, 'Could not load the trainers'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="space-y-5 pb-4">
      {/* This screen is reached from Book, from Home's coach note and from a
          notification, so it needed a way out that is not the dock — every
          other pushed screen in the app has one, and its absence here read as
          a dead end. `navigate(-1)` returns you wherever you came from. */}
      <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          aria-label="Go back"
          className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ ...panelStyle, color: 'var(--color-text-secondary)' }}
        >
          <ArrowLeft size={18} />
        </button>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-white">Our Trainers</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
            Find a coach and book a session
          </p>
        </div>
      </motion.div>

      {loading ? (
        <SkeletonList />
      ) : trainers.length === 0 ? (
        <div className="rounded-2xl p-8 text-center" style={panelStyle}>
          <Dumbbell size={44} className="mx-auto mb-3" style={{ color: 'var(--color-border)' }} />
          <p className="font-medium text-white text-sm">No trainers yet</p>
          <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
            The gym hasn't added its coaching team to the app yet.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {trainers.map((t, i) => {
            const upcoming = classCounts[t.id] ?? 0;
            return (
              <motion.button key={t.id}
                initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.06, 0.3) }}
                onClick={() => navigate(`/member/trainer/${t.id}`)}
                className="w-full rounded-2xl p-4 text-left transition-all active:scale-[0.98]"
                style={panelStyle}>
                <div className="flex items-center gap-4">
                  <Avatar name={trainerName(t)} photoUrl={t.photo_url} size={56} tone="secondary" />
                  <div className="flex-1 min-w-0">
                    <h3 className="text-white font-semibold">{trainerName(t)}</h3>
                    <p className="text-xs mt-0.5 flex items-center gap-1.5" style={{ color: 'var(--color-text-muted)' }}>
                      <Award size={12} style={{ color: 'var(--color-secondary)' }} />
                      {t.specialization ?? 'General training'}
                    </p>
                    <p className="mt-1.5">
                      <RatingLine
                        average={ratings.get(t.id)?.average_stars ?? null}
                        count={ratings.get(t.id)?.rating_count ?? 0}
                      />
                    </p>
                    {upcoming > 0 && (
                      <p className="text-xs mt-1.5 flex items-center gap-1.5" style={{ color: 'var(--color-text-secondary)' }}>
                        <Calendar size={11} style={{ color: 'var(--color-secondary)' }} />
                        {upcoming} upcoming {upcoming === 1 ? 'class' : 'classes'}
                      </p>
                    )}
                  </div>
                  <ArrowRight size={18} style={{ color: 'var(--color-text-muted)' }} />
                </div>

                {t.bio && (
                  <p className="text-xs mt-3 line-clamp-2" style={{ color: 'var(--color-text-muted)' }}>
                    {t.bio}
                  </p>
                )}
              </motion.button>
            );
          })}
        </div>
      )}

      <button onClick={() => navigate('/member/book-class')}
        className="w-full py-3.5 rounded-full font-semibold text-black flex items-center justify-center gap-2"
        style={{ background: 'var(--color-secondary)' }}>
        <Calendar size={18} /> Book a Session
      </button>
    </div>
  );
}