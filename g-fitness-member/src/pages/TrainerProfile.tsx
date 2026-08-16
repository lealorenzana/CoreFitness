import Avatar from '../components/ui/Avatar';
import { SkeletonList } from '../components/ui/Skeleton';
import { panelStyle } from '../components/ui/Card';
import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Award, Calendar, Clock, MapPin, Dumbbell } from 'lucide-react';
import { toast } from '../components/ui/Toast';
import { errorMessage } from '../utils/errorMessage';
import { listPublicTrainers, trainerName, type PublicTrainer } from '../lib/api/directory';
import { listTrainerClasses } from '../lib/api/classes';
import type { ClassRow } from '../types/db';

/**
 * A coach's profile, as a member sees it.
 *
 * What this used to show — a 4.9 rating, two five-star reviews from "John Doe"
 * and "Maria Santos", a certifications list, and "8 years experience" — had no
 * table behind any of it, and the page fell back to `trainers[0]` when the id
 * didn't match, so an unknown link silently rendered somebody else's profile.
 *
 * What's left is what actually exists: name, specialization, bio, and the
 * classes they teach. Ratings and certifications reappear here when there is
 * somewhere to store them.
 */
export default function TrainerProfile() {
  const navigate = useNavigate();
  const { trainerId } = useParams();
  const [trainer, setTrainer] = useState<PublicTrainer | null>(null);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const all = await listPublicTrainers();
        // Exact id only. Matching loosely, or falling back to the first coach,
        // is how the old page showed the wrong person with full confidence.
        const found = all.find((t) => t.id === trainerId) ?? null;
        if (cancelled) return;
        setTrainer(found);
        if (found) setClasses(await listTrainerClasses(found.id).catch(() => []));
      } catch (err) {
        if (!cancelled) toast.error(errorMessage(err, 'Could not load this trainer'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [trainerId]);

  const upcoming = classes
    .filter((c) => c.scheduled_at != null && new Date(c.scheduled_at).getTime() > Date.now())
    .slice(0, 5);

  return (
    <div className="space-y-5 pb-4">
      <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3">
        <button onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/member/trainers'))}
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ ...panelStyle, color: 'var(--color-text-secondary)' }}>
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-2xl font-bold text-white">Trainer Profile</h1>
      </motion.div>

      {loading ? (
        <SkeletonList />
      ) : !trainer ? (
        <div className="rounded-2xl p-8 text-center" style={panelStyle}>
          <Dumbbell size={40} className="mx-auto mb-3" style={{ color: 'var(--color-border)' }} />
          <p className="font-medium text-white text-sm">Trainer not found</p>
          <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
            This coach may no longer be with the gym.
          </p>
          <button onClick={() => navigate('/member/trainers')}
            className="mt-4 px-6 py-2 rounded-full font-semibold text-sm text-black"
            style={{ background: 'var(--color-secondary)' }}>
            See all trainers
          </button>
        </div>
      ) : (
        <>
          <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
            className="rounded-2xl p-5 text-center"
            style={{ background: 'var(--color-primary)', border: '1px solid var(--color-primary-hover)' }}>
            <div className="mx-auto mb-3 w-fit">
              <Avatar name={trainerName(trainer)} photoUrl={trainer.photo_url} size={96} tone="secondary" />
            </div>
            <h2 className="text-xl font-bold text-white">{trainerName(trainer)}</h2>
            {trainer.specialization && (
              <p className="text-sm text-white/80 mt-1 flex items-center justify-center gap-1.5">
                <Award size={14} /> {trainer.specialization}
              </p>
            )}
          </motion.div>

          {trainer.bio && (
            <div className="rounded-2xl p-4" style={panelStyle}>
              <h3 className="text-white font-semibold mb-2 text-sm">About</h3>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>{trainer.bio}</p>
            </div>
          )}

          <div className="rounded-2xl p-4" style={panelStyle}>
            <h3 className="text-white font-semibold mb-3 text-sm flex items-center gap-2">
              <Calendar size={16} style={{ color: 'var(--color-secondary)' }} /> Upcoming classes
            </h3>
            {upcoming.length === 0 ? (
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                No classes on the timetable right now. You can still request a 1-on-1 session below.
              </p>
            ) : (
              <div className="space-y-2">
                {upcoming.map((c) => (
                  <div key={c.id} className="rounded-xl p-3"
                    style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
                    <p className="text-sm font-semibold text-white">{c.name}</p>
                    <div className="flex items-center gap-3 mt-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                      <span className="flex items-center gap-1">
                        <Clock size={11} />
                        {new Date(c.scheduled_at as string).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                        {', '}
                        {new Date(c.scheduled_at as string).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                      </span>
                      {c.location && <span className="flex items-center gap-1"><MapPin size={11} /> {c.location}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={() => navigate('/member/book-class', { state: { trainerId: trainer.id } })}
            className="w-full py-3.5 rounded-full font-semibold text-black flex items-center justify-center gap-2"
            style={{ background: 'var(--color-secondary)' }}>
            <Calendar size={18} /> Book with {trainer.first_name}
          </button>
        </>
      )}
    </div>
  );
}