import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock } from '@phosphor-icons/react';
import { LineRow, SectionHead, StatusPill } from '../ui/noc';
import { useFeatures } from '../../hooks/useFeatures';
import { isEnabled } from '../../lib/api/planFeatures';
import { listGymPrograms, programProgress, type ProgramSummary, type ProgressDay } from '../../lib/api/programs';

/**
 * "Your gym's programs" (0122) — first on the workouts screen, because the
 * gym's own training is the thing the gym most wants its members to follow.
 *
 * Renders nothing when the gym has published none (or before 0122): an empty
 * heading reads as "the gym forgot", not "there are none yet". A Premium program
 * a member's plan does not include shows with a lock — never hidden (0049).
 */
export default function GymPrograms({ memberId }: { memberId: string | null }) {
  const navigate = useNavigate();
  const { features } = useFeatures();
  const [programs, setPrograms] = useState<ProgramSummary[] | null>(null);
  const [progress, setProgress] = useState<ProgressDay[]>([]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const [p, g] = await Promise.all([listGymPrograms(), memberId ? programProgress(memberId) : Promise.resolve([])]);
      if (!alive) return;
      setPrograms(p);
      setProgress(g);
    })();
    return () => { alive = false; };
  }, [memberId]);

  if (!programs || programs.length === 0) return null;
  const following = progress[0]?.programId ?? null;
  const unlocked = isEnabled(features, 'premium_programs');
  // The one being followed first, then the rest in the gym's order.
  const ordered = [...programs].sort((a, b) => Number(b.id === following) - Number(a.id === following));

  return (
    <section>
      <SectionHead title="Your gym's programs" />
      {ordered.map((p, i) => {
        const locked = p.premium && !unlocked;
        const done = p.id === following ? progress.filter((d) => d.done).length : 0;
        const meta = p.id === following
          ? `Following · ${done} of ${progress.length} days done`
          : `${p.weeks} week${p.weeks === 1 ? '' : 's'} · ${p.level === 'all_levels' ? 'all levels' : p.level}`;
        return (
          <LineRow key={p.id} title={p.name} meta={meta} last={i === ordered.length - 1}
            onClick={() => navigate(`/member/program/${p.id}`)}
            action={locked
              ? <span className="inline-flex items-center" style={{ gap: 4, fontSize: 12, color: 'var(--color-text-muted)' }}><Lock size={13} aria-hidden /> Premium</span>
              : p.id === following ? <StatusPill label="Following" tone="structure" /> : undefined} />
        );
      })}
    </section>
  );
}
