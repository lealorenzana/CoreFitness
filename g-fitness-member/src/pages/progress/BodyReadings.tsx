import { useEffect, useMemo, useState } from 'react';
import { Scales } from '@phosphor-icons/react';
import { Page, PageTitle } from '../../components/ui/page';
import { LineRow } from '../../components/ui/noc';
import { SkeletonList } from '../../components/ui/Skeleton';
import Pager from '../../components/ui/Pager';
import { usePaged } from '../../hooks/usePaging';
import { getCurrentMemberId } from '../../services/bookingService';
import { progressService, type BodyProgressEntry } from '../../services/progressService';
import { errorMessage } from '../../utils/errorMessage';
import { FIELDS } from './bodyFields';

/**
 * Every body reading, newest first, twenty to a page — "See all" from
 * Progress → Body, which shows the latest five (redesign, 2026-10-27).
 */
export default function BodyReadings() {
  const [entries, setEntries] = useState<BodyProgressEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const id = await getCurrentMemberId();
        if (!id) throw new Error('Your session could not be verified.');
        const rows = await progressService.getBodyProgress(id);
        if (alive) setEntries(rows);
      } catch (err) {
        if (alive) setError(errorMessage(err, 'Could not load your readings.'));
      }
    })();
    return () => { alive = false; };
  }, []);
  const newestFirst = useMemo(() => [...(entries ?? [])].reverse(), [entries]);
  const paged = usePaged(newestFirst);

  return (
    <Page>
      <PageTitle back fallback="/member/body" title="Body readings" subtitle="Every reading you have logged, newest first" />
      {error ? <p style={{ fontSize: 13, color: 'var(--color-secondary)' }}>{error}</p>
        : entries == null ? <SkeletonList />
        : newestFirst.length === 0 ? <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>No readings yet.</p>
        : (
          <section>
            {paged.rows.map((e, i) => {
              const values = FIELDS.filter((f) => f.key !== 'weight' && e[f.key] != null)
                .map((f) => `${f.label} ${e[f.key]}${f.unit === '%' ? '%' : ` ${f.unit}`}`);
              return (
                <LineRow key={e.id} icon={Scales} tone="mine"
                  title={e.weight != null ? `${e.weight} kg` : 'No weight'}
                  meta={values.length ? values.join(' · ') : undefined}
                  action={<span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                    {new Date(`${e.date}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>}
                  last={i === paged.rows.length - 1} />
              );
            })}
            <Pager page={paged.page} pages={paged.pages} total={paged.total}
              noun={paged.total === 1 ? 'reading' : 'readings'} onPage={paged.setPage} />
          </section>
        )}
    </Page>
  );
}
