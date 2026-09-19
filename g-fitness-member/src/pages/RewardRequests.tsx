import { useEffect, useState } from 'react';
import { Page, PageTitle } from '../components/ui/page';
import { SkeletonList } from '../components/ui/Skeleton';
import RedemptionRow from '../components/ui/RedemptionRow';
import { toast } from '../components/ui/Toast';
import { getCurrentMemberId } from '../services/bookingService';
import { cancelRedemption, listMyRedemptions, type Redemption } from '../lib/api/points';
import { errorMessage } from '../utils/errorMessage';

/** Every reward you have asked for, newest first (2026-09-19) — Rewards shows three and "See all". */
export default function RewardRequests() {
  const [memberId, setMemberId] = useState<string | null>(null);
  const [rows, setRows] = useState<Redemption[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const id = await getCurrentMemberId();
        if (!id) throw new Error('Your session could not be verified.');
        const r = await listMyRedemptions(id);
        if (!alive) return;
        setMemberId(id);
        setRows(r);
      } catch (err) {
        if (alive) setError(errorMessage(err, 'Could not load your requests.'));
      }
    })();
    return () => { alive = false; };
  }, []);

  const withdraw = async (id: string) => {
    if (!memberId) return;
    setBusy(id);
    try {
      await cancelRedemption(id);
      setRows(await listMyRedemptions(memberId));
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const spent = (rows ?? []).filter((r) => r.status !== 'rejected').reduce((s, r) => s + r.costPoints, 0);

  return (
    <Page>
      <PageTitle back fallback="/member/rewards" title="Your requests"
        subtitle={rows ? `${rows.length} in all · ${spent.toLocaleString()} points spent` : 'Every reward you asked for'} />
      {error ? (
        <p style={{ fontSize: 13, color: 'var(--color-secondary)' }}>{error}</p>
      ) : rows == null ? (
        <SkeletonList />
      ) : rows.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Nothing asked for yet.</p>
      ) : (
        <section>
          {rows.map((m, i) => (
            <RedemptionRow key={m.id} m={m} last={i === rows.length - 1} busy={busy === m.id} onWithdraw={() => void withdraw(m.id)} />
          ))}
        </section>
      )}
    </Page>
  );
}
