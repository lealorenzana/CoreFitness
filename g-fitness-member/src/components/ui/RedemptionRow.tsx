import type { Redemption } from '../../lib/api/points';
import { StatusPill } from './noc';

const REDEMPTION_STATUS: Record<Redemption['status'], { label: string; tone: 'structure' | 'action' | 'muted' }> = {
  pending: { label: 'Waiting for the gym', tone: 'action' },
  approved: { label: 'Ready — collect at the desk', tone: 'structure' },
  rejected: { label: 'Not approved', tone: 'muted' },
  fulfilled: { label: 'Collected', tone: 'muted' },
};

const day = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

/** One reward request — the Rewards preview and the Your requests page. */
export default function RedemptionRow({ m, last, busy, onWithdraw }: {
  m: Redemption; last: boolean; busy?: boolean; onWithdraw?: () => void;
}) {
  const s = REDEMPTION_STATUS[m.status];
  return (
    <div className="flex items-start" style={{
      gap: 12, padding: '13px 0', borderBottom: last ? 'none' : '1px solid var(--color-separator)',
    }}>
      <div className="flex-1 min-w-0">
        <p className="truncate" style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--color-text-primary)' }}>{m.rewardName}</p>
        <div className="flex items-center flex-wrap" style={{ gap: 8, marginTop: 6 }}>
          <StatusPill label={s.label} tone={s.tone} />
          <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
            {m.costPoints} points · asked {day(m.requestedAt)}
            {m.fulfilledAt ? ` · collected ${day(m.fulfilledAt)}` : ''}
          </span>
        </div>
        {m.decisionNote && (
          <p style={{ fontSize: 12.5, marginTop: 6, lineHeight: 1.5, color: 'var(--color-text-secondary)' }}>{m.decisionNote}</p>
        )}
        {m.status === 'rejected' && (
          <p style={{ fontSize: 12, marginTop: 4, color: 'var(--color-text-muted)' }}>Your points were not spent.</p>
        )}
      </div>
      {m.status === 'pending' && onWithdraw && (
        <button onClick={onWithdraw} disabled={busy} className="flex-none disabled:opacity-50"
          style={{ fontSize: 13, minHeight: 32, color: 'var(--color-text-secondary)' }}>
          Withdraw
        </button>
      )}
    </div>
  );
}
