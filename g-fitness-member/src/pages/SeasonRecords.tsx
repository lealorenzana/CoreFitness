import { useEffect, useState } from 'react';
import { Medal } from '@phosphor-icons/react';
import { Page, PageTitle } from '../components/ui/page';
import { LineRow } from '../components/ui/noc';
import { SkeletonList } from '../components/ui/Skeleton';
import Pager from '../components/ui/Pager';
import { usePaged } from '../hooks/usePaging';
import { getCurrentMemberId } from '../services/bookingService';
import { personalRecords, recordValue, type Record_ } from '../lib/api/season';

/**
 * Every best you have beaten, newest first, twenty to a page — "See all" from
 * Season, which shows the latest five (redesign, 2026-10-27).
 */
export default function SeasonRecords() {
  /** undefined while loading; null when they could not be read. */
  const [records, setRecords] = useState<Record_[] | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    void (async () => {
      const id = await getCurrentMemberId().catch(() => null);
      const r = id ? await personalRecords(id) : null;
      if (alive) setRecords(r);
    })();
    return () => { alive = false; };
  }, []);
  const paged = usePaged(records ?? []);

  return (
    <Page>
      <PageTitle back fallback="/member/season" title="Your records" subtitle="Every best you have beaten, newest first" />
      {records === undefined ? <SkeletonList />
        : records === null ? <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Your records could not be loaded just now.</p>
        : records.length === 0 ? <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>None yet.</p>
        : (
          <section>
            {paged.rows.map((r, i) => (
              <LineRow key={r.id} icon={Medal} tone="mine" title={r.exerciseName}
                meta={`up from ${recordValue(r.kind, r.previous)} · ${new Date(r.achievedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`}
                action={<span className="tabular-nums" style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-primary-300)' }}>{recordValue(r.kind, r.value)}</span>}
                last={i === paged.rows.length - 1} />
            ))}
            <Pager page={paged.page} pages={paged.pages} total={paged.total}
              noun={paged.total === 1 ? 'record' : 'records'} onPage={paged.setPage} />
          </section>
        )}
    </Page>
  );
}
