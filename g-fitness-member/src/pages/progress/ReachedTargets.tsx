import { useEffect, useMemo, useState } from 'react';
import { Trophy } from '@phosphor-icons/react';
import { Page, PageTitle } from '../../components/ui/page';
import { LineRow } from '../../components/ui/noc';
import { SkeletonList } from '../../components/ui/Skeleton';
import Pager from '../../components/ui/Pager';
import { usePaged } from '../../hooks/usePaging';
import { getCurrentMemberId } from '../../services/bookingService';
import { loadGoals, type GoalView } from '../../services/goalsService';
import { errorMessage } from '../../utils/errorMessage';

const day = (key: string) => new Date(`${key}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const fmt = (n: number) => String(Number(n.toFixed(1)));

/**
 * Every target reached, newest first, twenty to a page — "See all" from
 * Progress → Targets, which shows the latest five (redesign, 2026-10-27).
 */
export default function ReachedTargets() {
  const [goals, setGoals] = useState<GoalView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const id = await getCurrentMemberId();
        if (!id) throw new Error('Your session could not be verified.');
        const s = await loadGoals(id);
        if (alive) setGoals(s.goals);
      } catch (err) {
        if (alive) setError(errorMessage(err, 'Could not load your targets.'));
      }
    })();
    return () => { alive = false; };
  }, []);
  const reached = useMemo(() => (goals ?? []).filter((g) => g.achievedOn)
    .sort((a, b) => (b.achievedOn ?? '').localeCompare(a.achievedOn ?? '')), [goals]);
  const paged = usePaged(reached);

  return (
    <Page>
      <PageTitle back fallback="/member/progress?tab=goals" title="Targets reached" subtitle="Every target you have hit, newest first" />
      {error ? <p style={{ fontSize: 13, color: 'var(--color-secondary)' }}>{error}</p>
        : goals == null ? <SkeletonList />
        : reached.length === 0 ? <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>None reached yet.</p>
        : (
          <section>
            {paged.rows.map((g, i) => (
              <LineRow key={g.id} icon={Trophy} tone="mine" title={g.title}
                meta={[g.subject, g.targetValue != null ? `${fmt(g.targetValue)} ${g.unit}`.trim() : null].filter(Boolean).join(' · ') || undefined}
                action={<span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{g.achievedOn ? day(g.achievedOn) : ''}</span>}
                last={i === paged.rows.length - 1} />
            ))}
            <Pager page={paged.page} pages={paged.pages} total={paged.total}
              noun={paged.total === 1 ? 'target reached' : 'targets reached'} onPage={paged.setPage} />
          </section>
        )}
    </Page>
  );
}
