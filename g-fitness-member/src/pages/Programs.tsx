import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarBlank, Lock } from '@phosphor-icons/react';
import { Page, PageTitle } from '../components/ui/page';
import { Eyebrow, ProgressBar, StatusPill } from '../components/ui/noc';
import { SkeletonList } from '../components/ui/Skeleton';
import { useFeatures } from '../hooks/useFeatures';
import { isEnabled } from '../lib/api/planFeatures';
import { listGymPrograms, programProgress, type ProgramSummary, type ProgressDay } from '../lib/api/programs';
import { getCurrentMemberId } from '../services/bookingService';

const LEVEL: Record<string, string> = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced', all_levels: 'All levels' };

/**
 * Train → Programs (2026-10-04): the gym's own multi-week programs on a screen
 * of their own. They used to sit at the top of Free workouts, so a member who
 * did not open that screen never learned their gym had any.
 *
 * Only published programs reach members; a Premium one their plan does not
 * include shows with a lock and says why (0049), never hidden. The one they
 * follow comes first, with how far through they are.
 */
export default function Programs() {
  const navigate = useNavigate();
  const { features } = useFeatures();
  const [programs, setPrograms] = useState<ProgramSummary[] | null>(null);
  const [progress, setProgress] = useState<ProgressDay[]>([]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const me = await getCurrentMemberId();
      const [p, g] = await Promise.all([listGymPrograms(), me ? programProgress(me) : Promise.resolve([] as ProgressDay[])]);
      if (alive) { setPrograms(p ?? []); setProgress(g); }
    })();
    return () => { alive = false; };
  }, []);

  const following = progress[0]?.programId ?? null;
  const unlocked = isEnabled(features, 'premium_programs');
  const ordered = [...(programs ?? [])].sort((a, b) => Number(b.id === following) - Number(a.id === following));

  return (
    <Page>
      <PageTitle back fallback="/member/training" title="Programs" subtitle="Your gym's plans, week by week — follow one and the app shows the next day" />
      {programs === null ? <SkeletonList count={3} /> : programs.length === 0 ? (
        <div style={{ padding: 18, borderRadius: 18, border: '1px solid var(--color-border)', background: 'var(--color-surface)' }}>
          <CalendarBlank size={24} style={{ color: 'var(--color-primary-300)' }} />
          <p style={{ marginTop: 8, fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)' }}>No programs yet</p>
          <p style={{ marginTop: 4, fontSize: 13, lineHeight: 1.5, color: 'var(--color-text-muted)' }}>
            When your gym publishes one it appears here. Until then, Free workouts and your coach have plenty to follow.
          </p>
        </div>
      ) : (
        <div className="flex flex-col" style={{ gap: 12 }}>
          {ordered.map((p) => {
            const locked = p.premium && !unlocked;
            const mine = p.id === following;
            const done = mine ? progress.filter((d) => d.done).length : 0;
            return (
              <button key={p.id} onClick={() => navigate(`/member/program/${p.id}`)} className="text-left noc-press"
                style={{ borderRadius: 18, overflow: 'hidden', border: `1px solid ${mine ? 'var(--color-primary)' : 'var(--color-border)'}`, background: 'var(--color-surface)' }}>
                {p.coverUrl && <img src={p.coverUrl} alt="" style={{ width: '100%', aspectRatio: '16 / 7', objectFit: 'cover', display: 'block' }} />}
                <div style={{ padding: 14 }}>
                  <div className="flex items-center justify-between" style={{ gap: 8 }}>
                    <Eyebrow>{p.weeks} week{p.weeks === 1 ? '' : 's'} · {LEVEL[p.level] ?? p.level}</Eyebrow>
                    {locked ? <span className="inline-flex items-center" style={{ gap: 4, fontSize: 12, color: 'var(--color-text-muted)' }}><Lock size={13} aria-hidden /> Premium</span>
                      : mine ? <StatusPill label="Following" tone="structure" /> : null}
                  </div>
                  <p style={{ marginTop: 6, fontSize: 17, fontWeight: 700, color: 'var(--color-text-primary)' }}>{p.name}</p>
                  {p.description && <p style={{ marginTop: 4, fontSize: 13, lineHeight: 1.5, color: 'var(--color-text-muted)' }}>{p.description}</p>}
                  {mine && progress.length > 0 && (
                    <div style={{ marginTop: 10 }}>
                      <ProgressBar fraction={done / progress.length} />
                      <p style={{ marginTop: 6, fontSize: 12.5, color: 'var(--color-text-muted)' }}>{done} of {progress.length} days done</p>
                    </div>
                  )}
                  {locked && <p style={{ marginTop: 8, fontSize: 12.5, color: 'var(--color-text-muted)' }}>Included with Premium — see your plan to switch.</p>}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </Page>
  );
}
