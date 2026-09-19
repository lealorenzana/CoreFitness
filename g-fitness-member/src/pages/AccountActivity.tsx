import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Page, PageTitle } from '../components/ui/page';
import { Chip } from '../components/ui/noc';
import { SkeletonList } from '../components/ui/Skeleton';
import ActivityLineRow from '../components/ui/ActivityLineRow';
import { getCurrentMemberId } from '../services/bookingService';
import { getAccountActivity } from '../services/membershipHubService';
import type { ActivityRow } from '../services/membershipHubService';
import { matchesFilter, toLines, type Filter } from '../utils/activityLines';
import { errorMessage } from '../utils/errorMessage';

/**
 * Account activity — the whole statement (2026-09-19). The You tab shows six
 * lines and "See all"; this is where "all" lives, grouped by month, with the
 * same filters and the same folding of same-day repeats.
 */
export default function AccountActivity() {
  const [params, setParams] = useSearchParams();
  const raw = params.get('filter');
  const filter: Filter = raw === 'points' || raw === 'payments' ? raw : 'all';
  const setFilter = (f: Filter) => setParams(f === 'all' ? {} : { filter: f }, { replace: true });

  const [rows, setRows] = useState<ActivityRow[] | null>(null);
  const [gaps, setGaps] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const id = await getCurrentMemberId();
        if (!id) throw new Error('Your session could not be verified.');
        const r = await getAccountActivity(id);
        if (!alive) return;
        setRows(r.activity);
        setGaps(r.gaps);
      } catch (err) {
        if (alive) setError(errorMessage(err, 'Could not load your activity.'));
      }
    })();
    return () => { alive = false; };
  }, []);

  const months = useMemo(() => {
    const lines = toLines((rows ?? []).filter((a) => matchesFilter(a, filter)));
    const out: [string, typeof lines][] = [];
    for (const l of lines) {
      const label = new Date(l.at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      const last = out[out.length - 1];
      if (last && last[0] === label) last[1].push(l);
      else out.push([label, [l]]);
    }
    return out;
  }, [rows, filter]);

  return (
    <Page>
      <PageTitle back fallback="/member/membership" title="Account activity"
        subtitle="Points earned and spent, payments, and changes to your membership" />

      <div className="flex" style={{ gap: 8 }}>
        <Chip label="All" on={filter === 'all'} onClick={() => setFilter('all')} />
        <Chip label="Points" on={filter === 'points'} onClick={() => setFilter('points')} />
        <Chip label="Payments" on={filter === 'payments'} onClick={() => setFilter('payments')} />
      </div>

      {error ? (
        <p style={{ fontSize: 13, color: 'var(--color-secondary)' }}>{error}</p>
      ) : rows == null ? (
        <SkeletonList />
      ) : months.length === 0 ? (
        <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--color-text-muted)' }}>
          {filter === 'payments' ? 'No payments recorded yet — they appear here once the desk records one.'
            : 'Nothing yet. Check-ins and workouts earn points, and payments at the desk appear here.'}
        </p>
      ) : (
        months.map(([label, lines]) => (
          <section key={label}>
            <h2 style={{ fontSize: 'var(--text-title)', fontWeight: 700, color: 'var(--color-text-primary)' }}>{label}</h2>
            <div className="noc-rows" style={{ marginTop: 4 }}>
              {lines.map((l, i) => <ActivityLineRow key={`${l.key}:${i}`} l={l} last={i === lines.length - 1} />)}
            </div>
          </section>
        ))
      )}

      {gaps.length > 0 && (
        <p style={{ fontSize: 12, color: 'var(--color-secondary)' }}>
          Could not load {gaps.join(' or ')} — this list may be missing entries.
        </p>
      )}
    </Page>
  );
}
