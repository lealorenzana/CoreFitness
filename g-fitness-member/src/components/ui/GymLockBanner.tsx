import { Warning } from '@phosphor-icons/react';
import type { GymContext } from '../../lib/gymContext';

/**
 * Your gym is read-only.
 *
 * Suspended, or past what it owes Core Fitness (0099's `gym_lock_reason`).
 * Everything still opens and nothing is lost — bookings, check-ins and logging
 * are what stop. Said plainly and in the gym's own words rather than letting a
 * member discover it as a failed tap: a rule nobody can read ambushes them
 * (CLAUDE.md).
 *
 * Amber, because errors here are amber — there is no red in this app.
 */
export default function GymLockBanner({ ctx }: { ctx: GymContext | null }) {
  if (!ctx?.lockReason) return null;

  return (
    <div
      role="status"
      className="flex items-start gap-2"
      style={{
        margin: '0 var(--gutter) var(--stack-tight)',
        padding: '10px 12px',
        borderRadius: 'var(--radius-card)',
        background: 'var(--color-secondary-light)',
        border: '1px solid var(--color-secondary)',
      }}
    >
      <Warning size={16} weight="fill" style={{ color: 'var(--color-secondary)', flex: 'none', marginTop: 1 }} />
      <span style={{ fontSize: 12.5, lineHeight: 1.45, color: 'var(--color-text-secondary)' }}>
        <strong style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>
          {ctx.gymName ?? 'This gym'} is read-only right now.
        </strong>{' '}
        {ctx.lockReason === 'suspended'
          ? 'Booking, checking in and logging are paused until the gym is back. Everything you have is still here.'
          : 'The gym has not settled its Core Fitness subscription, so booking and logging are paused. Everything you have is still here.'}
      </span>
    </div>
  );
}
