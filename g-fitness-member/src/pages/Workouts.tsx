import { SkeletonList } from '../components/ui/Skeleton';
import { panelStyle } from '../components/ui/Card';
import { motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, ExternalLink, BookOpen, Sparkles, ClipboardList, ChevronRight,
  PlayCircle, HeartPulse, Dumbbell,
} from 'lucide-react';
import { toast } from '../components/ui/Toast';
import { errorMessage } from '../utils/errorMessage';
import {
  listWorkoutResources,
  linkHost,
  type WorkoutResourceRow,
} from '../lib/api/workoutResources';
import { getCurrentMemberId, getExperienceLevel, type ExperienceLevel } from '../services/bookingService';
import type { ClassLevel } from '../types/db';

/**
 * Free workout resources, curated by the gym (migration 0019).
 *
 * This screen used to list four invented routines — "HIIT Cardio Blast · 30 min
 * · 400 kcal" — with calorie figures typed by hand, and a "Start Workout" button
 * that navigated to the progress page without starting anything.
 *
 * What replaced it links out to material the gym has chosen, credited to whoever
 * wrote it. Nothing here claims to be Core Fitness's own programming, and no
 * number appears that nobody measured.
 */

/**
 * A colour and an icon per category.
 *
 * Keyed on a *substring* of the category rather than an exact match, because
 * `workout_resources.category` is free text the gym edits — an exact map would
 * silently fall back to grey the first time someone typed "Beginner Programs"
 * with a capital P. Anything unrecognised gets the neutral mark, which is a
 * fine outcome rather than a broken one.
 *
 * Only two hues are used, per the app's convention: violet for structure,
 * amber for the things that are the point (the programmes a member follows).
 */
const CATEGORY_TONES: { match: string; icon: typeof BookOpen; bg: string; fg: string }[] = [
  { match: 'beginner',  icon: Sparkles,      bg: 'var(--color-secondary-light)', fg: 'var(--color-secondary)' },
  { match: 'strength',  icon: Dumbbell,      bg: 'var(--color-secondary-light)', fg: 'var(--color-secondary)' },
  { match: 'bodyweight',icon: Dumbbell,      bg: 'var(--color-primary-light)',   fg: 'var(--color-primary)' },
  { match: 'follow',    icon: PlayCircle,    bg: 'var(--color-primary-light)',   fg: 'var(--color-primary)' },
  { match: 'guidance',  icon: HeartPulse,    bg: 'var(--color-primary-light)',   fg: 'var(--color-primary)' },
  { match: 'reference', icon: BookOpen,      bg: 'var(--color-primary-light)',   fg: 'var(--color-primary)' },
];

function categoryTone(category: string | null) {
  const c = (category ?? '').toLowerCase();
  return (
    CATEGORY_TONES.find((t) => c.includes(t.match)) ?? {
      icon: BookOpen,
      bg: 'var(--color-bg)',
      fg: 'var(--color-text-muted)',
    }
  );
}

const LEVEL_LABEL: Record<ClassLevel, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
  all_levels: 'All levels',
};

export default function Workouts() {
  const navigate = useNavigate();
  const [resources, setResources] = useState<WorkoutResourceRow[]>([]);
  const [level, setLevel] = useState<ExperienceLevel | null>(null);
  const [category, setCategory] = useState<string>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await listWorkoutResources();
        if (cancelled) return;
        setResources(rows);
        const id = await getCurrentMemberId().catch(() => null);
        if (id && !cancelled) setLevel(await getExperienceLevel(id).catch(() => null));
      } catch (err) {
        if (!cancelled) toast.error(errorMessage(err, 'Could not load the resource library'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const categories = useMemo(
    () => [...new Set(resources.map((r) => r.category).filter((c): c is string => !!c))],
    [resources]
  );

  const visible = useMemo(
    () => (category === 'all' ? resources : resources.filter((r) => r.category === category)),
    [resources, category]
  );

  // Same rule as class matching: suggest, never restrict.
  const suits = (r: WorkoutResourceRow) =>
    level != null && (r.level === 'all_levels' || r.level === level);

  return (
    <div className="space-y-5 pb-4">
      <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3">
        <button onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/member/home'))}
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ ...panelStyle, color: 'var(--color-text-secondary)' }}>
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-white">Workout Resources</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
            Free training material, picked by your gym
          </p>
        </div>
      </motion.div>

      {/* The plan builder. This library is material to read; the builder turns
          it into a week you can actually start on. Linked from here because a
          feature ships when a route leads to it - the free-workout library and
          the trainer recommendations were both built, correct, and reachable
          from nowhere. */}
      <motion.button
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        onClick={() => navigate('/member/plan')}
        className="w-full p-4 rounded-2xl flex items-center gap-3 text-left"
        style={panelStyle}
      >
        <span
          className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: 'var(--color-primary-light)' }}
        >
          <ClipboardList size={20} style={{ color: 'var(--color-primary)' }} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-white">Build your training week</p>
          <p className="text-xs mt-0.5 leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
            Five questions, then a plan built around your days and your goal
          </p>
        </div>
        <ChevronRight size={18} style={{ color: 'var(--color-text-muted)' }} className="flex-shrink-0" />
      </motion.button>

      {categories.length > 1 && (
        <div className="flex gap-1.5 flex-wrap">
          {['all', ...categories].map((c) => {
            // The count is the useful half: "Follow-along 3" tells you whether
            // a filter is worth tapping, which a bare label never did.
            const n = c === 'all' ? resources.length : resources.filter((r) => r.category === c).length;
            const active = category === c;
            return (
              <button key={c} onClick={() => setCategory(c)}
                className="px-3 py-1.5 rounded-full text-xs font-semibold transition-colors capitalize flex items-center gap-1.5"
                style={{
                  background: active ? 'var(--color-primary)' : 'var(--color-surface-raised)',
                  color: active ? '#fff' : 'var(--color-text-muted)',
                  border: `1px solid ${active ? 'var(--color-primary)' : 'var(--color-border)'}`,
                }}>
                {c === 'all' ? 'Everything' : c}
                <span className="tabular-nums" style={{ opacity: 0.7 }}>{n}</span>
              </button>
            );
          })}
        </div>
      )}

      {loading ? (
        <SkeletonList />
      ) : visible.length === 0 ? (
        <div className="rounded-2xl p-8 text-center" style={panelStyle}>
          <BookOpen size={40} className="mx-auto mb-3" style={{ color: 'var(--color-border)' }} />
          <p className="font-medium text-white text-sm">Nothing here yet</p>
          <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
            Your gym hasn't added any resources to this category.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((r, i) => (
            <motion.a key={r.id}
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.05, 0.3) }}
              href={r.url}
              target="_blank"
              // noreferrer alongside noopener: the destination has no business
              // knowing which member app screen sent the member there.
              rel="noopener noreferrer"
              className="block rounded-2xl p-4 transition-all active:scale-[0.98]"
              style={panelStyle}>
              <div className="flex items-start gap-3">
                {/* A category mark, so twelve links stop reading as one list.
                    Colour and icon come from the category, which is a real
                    column the gym edits — not a hardcoded per-title map that
                    would go blank the moment they added a category. */}
                <span
                  className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: categoryTone(r.category).bg }}
                  aria-hidden
                >
                  {(() => {
                    const Icon = categoryTone(r.category).icon;
                    return <Icon size={17} style={{ color: categoryTone(r.category).fg }} />;
                  })()}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-white font-semibold text-sm">{r.title}</h3>
                    {suits(r) && (
                      <span className="text-xs px-2 py-0.5 rounded-full font-bold flex items-center gap-1"
                        style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary)' }}>
                        <Sparkles size={8} /> For you
                      </span>
                    )}
                  </div>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--color-secondary)' }}>
                    {r.provider}
                  </p>
                  {r.description && (
                    <p className="text-xs mt-1.5" style={{ color: 'var(--color-text-muted)' }}>
                      {r.description}
                    </p>
                  )}
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
                      style={{ background: 'var(--color-bg)', color: 'var(--color-text-muted)' }}>
                      {LEVEL_LABEL[r.level]}
                    </span>
                    {/* Show where the tap goes before it's tapped. */}
                    <span className="text-xs flex items-center gap-1" style={{ color: 'var(--color-text-muted)' }}>
                      <ExternalLink size={9} /> {linkHost(r.url)}
                    </span>
                  </div>
                </div>
              </div>
            </motion.a>
          ))}
        </div>
      )}

      <p className="text-xs text-center px-4" style={{ color: 'var(--color-text-muted)' }}>
        These are free resources published by others, not Core Fitness programmes.
        Check with a trainer before starting something new.
      </p>
    </div>
  );
}