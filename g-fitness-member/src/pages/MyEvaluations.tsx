import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Page, PageTitle } from '../components/ui/page';
import { SkeletonList } from '../components/ui/Skeleton';
import { Stars } from '../components/ui/StarRating';
import { getCurrentMemberId } from '../services/bookingService';
import { listPublicTrainers, trainerName } from '../lib/api/directory';
import { currentPeriod, getMyRatingHistory, periodLabel, type MyRatingHistoryEntry } from '../lib/api/trainerRatings';
import { errorMessage } from '../utils/errorMessage';

/**
 * Your past evaluations of one coach, month by month (2026-09-19) — opened from
 * the coach's profile. Only this member's own: 0066 narrowed reads so one
 * member cannot read another's written reasons.
 */
export default function MyEvaluations() {
  const { trainerId } = useParams();
  const [rows, setRows] = useState<MyRatingHistoryEntry[] | null>(null);
  const [coach, setCoach] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const period = currentPeriod();

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const id = await getCurrentMemberId();
        if (!id || !trainerId) throw new Error('Could not identify your account.');
        const [history, coaches] = await Promise.all([
          getMyRatingHistory(id, trainerId),
          listPublicTrainers().catch(() => []),
        ]);
        if (!alive) return;
        setRows(history);
        const t = coaches.find((c) => c.id === trainerId);
        setCoach(t ? trainerName(t) : null);
      } catch (err) {
        if (alive) setError(errorMessage(err, 'Could not load your evaluations.'));
      }
    })();
    return () => { alive = false; };
  }, [trainerId]);

  return (
    <Page>
      <PageTitle back fallback={`/member/trainer/${trainerId ?? ''}`} title="Your evaluations"
        subtitle={coach ? `Of ${coach} — only you, the coach and the gym can read these` : 'Only you, the coach and the gym can read these'} />
      {error ? (
        <p style={{ fontSize: 13, color: 'var(--color-secondary)' }}>{error}</p>
      ) : rows == null ? (
        <SkeletonList />
      ) : rows.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>You have not evaluated this coach yet.</p>
      ) : (
        <section className="noc-rows">
          {rows.map((h, i) => (
            <div key={h.period} style={{ padding: '14px 0', borderBottom: i === rows.length - 1 ? 'none' : '1px solid var(--color-separator)' }}>
              <div className="flex items-center justify-between" style={{ gap: 8 }}>
                <span style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--color-text-primary)' }}>
                  {periodLabel(h.period)}
                  {h.period === period && <span style={{ fontWeight: 400, color: 'var(--color-text-muted)' }}> · this month</span>}
                </span>
                <span className="flex items-center flex-none" style={{ gap: 6 }}>
                  <Stars value={h.stars} size={13} />
                  <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{h.stars}.0</span>
                </span>
              </div>
              <p className="whitespace-pre-line" style={{ fontSize: 13, marginTop: 6, lineHeight: 1.55, color: h.comment ? 'var(--color-text-secondary)' : 'var(--color-text-muted)' }}>
                {h.comment ?? 'No reason written.'}
              </p>
            </div>
          ))}
        </section>
      )}
    </Page>
  );
}
