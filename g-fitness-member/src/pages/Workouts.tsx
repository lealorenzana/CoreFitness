import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUpRight } from '@phosphor-icons/react';
import { SkeletonList } from '../components/ui/Skeleton';
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
import { Page, PageTitle } from '../components/ui/page';
import { Chip, Eyebrow, Panel, StatusPill } from '../components/ui/noc';
import { CLAMP_2 } from '../components/ui/styles';

/**
 * Free workout resources, curated by the gym (migration 0019) — Nocturne redesign.
 *
 * This screen used to list four invented routines — "HIIT Cardio Blast · 30 min
 * · 400 kcal" — with calorie figures typed by hand, and a "Start Workout" button
 * that navigated to the progress page without starting anything.
 *
 * What replaced it links out to material the gym has chosen, credited to whoever
 * wrote it. Nothing here claims to be Core Fitness's own programming, and no
 * number appears that nobody measured. **Never gated** — it exists for members
 * who cannot pay.
 *
 * The bento and the per-category icon tiles are gone: a library is a list you
 * read down, and twelve coloured tiles distinguished nothing the category chip
 * does not. The preview picture (0061) stays, full width above its entry, and
 * only where one exists — that is the gym's own editorial hierarchy.
 */

/**
 * The preview screenshot above an entry. **Only drawn when there is one**, and a
 * file that 404s removes it — the browser's broken-image glyph is not a preview.
 * Module level so a filter change does not remount it and re-request the image.
 */
function ResourceBanner({ src }: { src: string }) {
  const [broken, setBroken] = useState(false);
  if (broken) return null;
  return (
    <div className="w-full overflow-hidden"
      style={{ aspectRatio: '3 / 1', borderRadius: 10, marginBottom: 12, background: 'var(--color-surface)',
        boxShadow: 'inset 0 0 0 1px var(--color-hairline)' }}>
      {/* Decorative: the title, provider and host sit directly beneath it. */}
      <img src={src} alt="" loading="lazy" onError={() => setBroken(true)}
        className="w-full h-full object-cover object-top" />
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
      <PageTitle back fallback="/member/book-class" title="Free workouts"
        subtitle="Training material your gym picked, free to everyone" />

      {/* The plan builder: this library is material to read; the builder turns
          it into a week you can start on. The one amber thing on the screen,
          because it is the one thing here that *does* something. */}
      <Panel glow="action" filled onClick={() => navigate('/member/plan')} ariaLabel="Build your training week">
        <div className="flex items-center" style={{ gap: 12 }}>
          <div className="flex-1 min-w-0">
            <p style={{ fontSize: 15.5, fontWeight: 500, color: 'var(--color-text-primary)' }}>Build your training week</p>
            <p style={{ fontSize: 12.5, marginTop: 3, lineHeight: 1.5, color: 'var(--color-text-secondary)' }}>
              Six short questions, then a plan built around your days and your goal
            </p>
          </div>
          <span className="flex-none" style={{ fontSize: 13, color: 'var(--color-secondary)' }}>Start</span>
        </div>
      </Panel>

      {categories.length > 1 && (
        // Counts are the useful half: they say whether a filter is worth tapping.
        <div className="flex overflow-x-auto scrollbar-hide" style={{ gap: 8, margin: '0 calc(var(--gutter) * -1)', padding: '0 var(--gutter)' }}>
          {['all', ...categories].map((c) => (
            <Chip
              key={c}
              on={category === c}
              onClick={() => setCategory(c)}
              label={`${c === 'all' ? 'Everything' : c} · ${c === 'all' ? resources.length : resources.filter((r) => r.category === c).length}`}
            />
          ))}
        </div>
      )}

      {loading ? (
        <SkeletonList />
      ) : visible.length === 0 ? (
        <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--color-text-muted)' }}>
          Nothing here yet — your gym has not added any resources to this category.
        </p>
      ) : (
        <section>
          <Eyebrow mark>{category === 'all' ? 'The library' : category}</Eyebrow>
          <div style={{ marginTop: 8 }}>
            {visible.map((r, i) => (
              <div key={r.id}>
                <a
                  href={r.url}
                  target="_blank"
                  // noreferrer alongside noopener: the destination has no
                  // business knowing which member app screen sent them there.
                  rel="noopener noreferrer"
                  className="block"
                  style={{ padding: '16px 0' }}
                >
                  {hasPreview(r) && <ResourceBanner src={r.image_url as string} />}
                  <div className="flex items-start justify-between" style={{ gap: 12 }}>
                    <span className="min-w-0">
                      <span className="block" style={{ fontSize: 15, lineHeight: 1.35, color: 'var(--color-text-primary)', ...CLAMP_2 }}>
                        {r.title}
                      </span>
                      <span className="block" style={{ fontSize: 12.5, marginTop: 3, color: 'var(--color-text-secondary)' }}>
                        {r.provider}
                        {/* Show where the tap goes before it is tapped. */}
                        <span style={{ color: 'var(--color-text-muted)' }}> · {linkHost(r.url)}</span>
                      </span>
                    </span>
                    <ArrowUpRight size={16} className="flex-none" style={{ marginTop: 3, color: 'var(--color-text-muted)' }} aria-hidden />
                  </div>
                  {r.description && (
                    <p style={{ fontSize: 12.5, marginTop: 6, lineHeight: 1.5, color: 'var(--color-text-muted)', ...CLAMP_2 }}>
                      {r.description}
                    </p>
                  )}
                  <span className="flex flex-wrap" style={{ gap: 6, marginTop: 10 }}>
                    <StatusPill label={LEVEL_LABEL[r.level]} tone="muted" />
                    {r.category && category === 'all' && <StatusPill label={r.category} tone="muted" />}
                    {suits(r) && <StatusPill label="Suits your level" tone="structure" />}
                  </span>
                </a>
                {i < visible.length - 1 && <div className="hair" />}
              </div>
            ))}
          </div>
        </section>
      )}

      <p style={{ fontSize: 12.5, lineHeight: 1.6, color: 'var(--color-text-muted)' }}>
        These are free resources published by others, not Core Fitness programmes.
        Check with a trainer before starting something new.
      </p>
    </Page>
  );
}
