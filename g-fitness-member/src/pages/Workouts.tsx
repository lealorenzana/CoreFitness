import { SkeletonList } from '../components/ui/Skeleton';
import { panelStyle } from '../components/ui/Card';
import { motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, ExternalLink, BookOpen, Sparkles, ClipboardList, ChevronRight,
  PlayCircle, HeartPulse, Dumbbell, GraduationCap, FlaskConical, Smartphone, Code,
} from 'lucide-react';
import { toast } from '../components/ui/Toast';
import { errorMessage } from '../utils/errorMessage';
import {
  listWorkoutResources,
  linkHost,
  hasPreview,
  type WorkoutResourceRow,
} from '../lib/api/workoutResources';
import { getCurrentMemberId, getExperienceLevel, type ExperienceLevel } from '../services/bookingService';
import type { ClassLevel } from '../types/db';
import { Page, CategoryRail, Bento, BentoCell } from '../components/ui/page';
import { CLAMP_2 } from '../components/ui/styles';

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
  // Before 'strength': "Strength & hypertrophy education" is reading, not a
  // programme to follow, so it takes the structural violet (0075).
  { match: 'education', icon: GraduationCap, bg: 'var(--color-primary-light)',   fg: 'var(--color-primary)' },
  { match: 'strength',  icon: Dumbbell,      bg: 'var(--color-secondary-light)', fg: 'var(--color-secondary)' },
  { match: 'program',   icon: ClipboardList, bg: 'var(--color-secondary-light)', fg: 'var(--color-secondary)' },
  { match: 'librar',    icon: BookOpen,      bg: 'var(--color-primary-light)',   fg: 'var(--color-primary)' },
  { match: 'research',  icon: FlaskConical,  bg: 'var(--color-primary-light)',   fg: 'var(--color-primary)' },
  { match: 'app',       icon: Smartphone,    bg: 'var(--color-primary-light)',   fg: 'var(--color-primary)' },
  { match: 'developer', icon: Code,          bg: 'var(--color-primary-light)',   fg: 'var(--color-primary)' },
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

/** The category's icon, resolved once. Was an IIFE inline in the card. */
function CategoryIcon({ category, size = 17 }: { category: string | null; size?: number }) {
  const { icon: Icon, fg } = categoryTone(category);
  return <Icon size={size} style={{ color: fg }} />;
}

/**
 * The preview screenshot at the top of a card (0061).
 *
 * **Only drawn when there is one.** Ten of the twelve seeded resources have a
 * picture; the Reddit wiki and the NHS page answer with a bot check and a
 * cookie wall, so no honest screenshot of them exists. Those cards keep the
 * category mark and no banner rather than showing a placeholder rectangle —
 * on a phone that is a third of a card spent saying nothing, and a stand-in
 * image would be the same lie as a hardcoded fallback identity.
 *
 * A file that 404s removes the banner for the same reason: the browser's
 * broken-image glyph is not a preview.
 *
 * Module level, never declared inside the page's render body — a component
 * defined during render remounts its subtree on every pass, which would
 * re-request the image each time the category filter changed.
 */
function ResourceBanner({ src }: { src: string }) {
  const [broken, setBroken] = useState(false);
  if (broken) return null;
  return (
    <div className="w-full overflow-hidden"
      style={{ aspectRatio: '3 / 1', background: 'var(--color-bg)' }}>
      <img
        src={src}
        // Decorative: the title, provider and host all sit directly beneath it,
        // so a screen reader announcing the picture too would just repeat them.
        alt=""
        loading="lazy"
        onError={() => setBroken(true)}
        className="w-full h-full object-cover object-top"
      />
    </div>
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
    <Page>
      {/* The header every other screen in this app uses: a round back button and
          the title in the display face. This one was alone on `text-2xl
          font-bold` sentence case, which is why it read as a page from a
          different app. */}
      <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3">
        <button onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/member/home'))}
          aria-label="Back"
          className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ ...panelStyle, color: 'var(--color-text-secondary)' }}>
          <ArrowLeft size={18} />
        </button>
        <div className="min-w-0">
          <h1 className="display text-xl text-white leading-none">Free workouts</h1>
          <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
            Training material your gym picked, free to everyone
          </p>
        </div>
      </motion.div>

      {/* The plan builder. This library is material to read; the builder turns
          it into a week you can actually start on. Linked from here because a
          feature ships when a route leads to it - the free-workout library and
          the trainer recommendations were both built, correct, and reachable
          from nowhere.

          Amber, and the only amber on the screen: everything below is something
          to read, and this is the one thing here that *does* something. It used
          to be another violet panel in a stack of violet panels. */}
      <motion.button
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        onClick={() => navigate('/member/plan')}
        className="w-full rounded-2xl flex items-center gap-3 text-left active:opacity-90"
        style={{
          padding: 'var(--card-pad)',
          background: 'var(--color-secondary-light)',
          border: '1px solid rgba(245,158,11,0.30)',
        }}
      >
        <span
          className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: 'var(--color-secondary)' }}
        >
          <ClipboardList size={20} style={{ color: '#1A1200' }} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-white" style={{ fontSize: 'var(--text-body)' }}>Build your training week</p>
          <p className="mt-0.5 leading-relaxed" style={{ fontSize: 'var(--text-meta)', color: 'var(--color-text-secondary)' }}>
            Six short questions, then a plan built around your days and your goal
          </p>
        </div>
        <ChevronRight size={18} style={{ color: 'var(--color-secondary)' }} className="flex-shrink-0" />
      </motion.button>

      {categories.length > 1 && (
        <CategoryRail
          active={category}
          onPick={setCategory}
          items={['all', ...categories].map((c) => ({
            id: c,
            label: c === 'all' ? 'Everything' : c,
            icon: c === 'all'
              ? <BookOpen size={20} />
              : <CategoryIcon category={c} size={20} />,
            // The count is the useful half: "Follow-along 3" tells you whether
            // a filter is worth tapping, which a bare label never did.
            count: c === 'all' ? resources.length : resources.filter((r) => r.category === c).length,
          }))}
        />
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
        /*
          A bento, on the same rules as the timetable.

          Twelve identical full-width rows is a list you scroll rather than a
          library you browse — and it wasted the one thing that distinguishes
          these entries from each other, which is that some of them have a
          picture. So a resource the gym attached an image to takes the full
          width and leads with that image; the rest are squares. That hierarchy
          is the gym's own editorial choice rather than one invented here, which
          is the test this project applies to every "featured" treatment.

          The odd tail widens, for the same reason it does on Book a Session: a
          half-width hole at the bottom reads as a missing card.
        */
        <Bento>
          {(() => {
            const plain = visible.filter((r) => !hasPreview(r));
            const lastPlain = plain[plain.length - 1];
            return visible.map((r, i) => {
              const banner = hasPreview(r);
              return (
                <BentoCell
                  key={r.id}
                  wide={banner || (plain.length % 2 === 1 && r.id === lastPlain?.id)}
                  className="overflow-hidden"
                  // The picture goes edge to edge, so this cell supplies no
                  // padding of its own and the body below pads itself.
                  style={{ padding: 0 }}
                >
                  <motion.a
                    initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(i * 0.05, 0.3) }}
                    href={r.url}
                    target="_blank"
                    // noreferrer alongside noopener: the destination has no
                    // business knowing which member app screen sent them there.
                    rel="noopener noreferrer"
                    className="flex flex-col h-full active:opacity-90"
                  >
                    {/* Picture first, edge to edge, with the category mark
                        floated on it. The image is already a real column
                        (0061/0076); this only stops boxing it inside padding. */}
                    {banner && (
                      <div className="relative">
                        <ResourceBanner src={r.image_url as string} />
                        <span
                          className="absolute top-3 right-3 w-9 h-9 rounded-xl flex items-center justify-center"
                          style={{ background: 'rgba(8,8,14,0.72)', backdropFilter: 'blur(6px)' }}
                          aria-hidden
                        >
                          <CategoryIcon category={r.category} />
                        </span>
                      </div>
                    )}

                    <div className="flex flex-col flex-1" style={{ padding: 'var(--card-pad)' }}>
                      {/* A category mark, so twelve links stop reading as one
                          list. Colour and icon come from the category, which is
                          a real column the gym edits — not a hardcoded per-title
                          map that would go blank the moment they added one. */}
                      {!banner && (
                        <span
                          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 mb-3"
                          style={{ background: categoryTone(r.category).bg }}
                          aria-hidden
                        >
                          <CategoryIcon category={r.category} />
                        </span>
                      )}

                      <h3 className="text-white font-semibold leading-snug"
                        style={{ fontSize: 'var(--text-body)', ...CLAMP_2 }}>
                        {r.title}
                      </h3>
                      <p className="mt-0.5" style={{ fontSize: 'var(--text-meta)', color: 'var(--color-secondary)' }}>
                        {r.provider}
                      </p>
                      {suits(r) && (
                        <span className="mt-1.5 self-start px-2 py-0.5 rounded-full font-bold flex items-center gap-1"
                          style={{ fontSize: 'var(--text-meta)', background: 'var(--color-primary-light)', color: 'var(--color-primary)' }}>
                          <Sparkles size={9} /> For you
                        </span>
                      )}
                      {r.description && (
                        <p className="mt-1.5 leading-snug"
                          style={{ fontSize: 'var(--text-meta)', color: 'var(--color-text-muted)', ...CLAMP_2 }}>
                          {r.description}
                        </p>
                      )}

                      {/* Pinned to the bottom so a row of cells has one line of
                          footers across it however unevenly the titles wrap. */}
                      <div className="mt-auto pt-3 flex items-center gap-2 flex-wrap">
                        <span className="px-2 py-0.5 rounded-full font-semibold"
                          style={{ fontSize: 'var(--text-meta)', background: 'var(--color-bg)', color: 'var(--color-text-muted)' }}>
                          {LEVEL_LABEL[r.level]}
                        </span>
                        {/* Show where the tap goes before it is tapped. */}
                        <span className="flex items-center gap-1"
                          style={{ fontSize: 'var(--text-meta)', color: 'var(--color-text-muted)' }}>
                          <ExternalLink size={9} /> {linkHost(r.url)}
                        </span>
                      </div>
                    </div>
                  </motion.a>
                </BentoCell>
              );
            });
          })()}
        </Bento>
      )}

      <p className="text-xs text-center px-4" style={{ color: 'var(--color-text-muted)' }}>
        These are free resources published by others, not Core Fitness programmes.
        Check with a trainer before starting something new.
      </p>
    </Page>
  );
}