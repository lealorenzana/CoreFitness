import { useNavigate } from 'react-router-dom';
import { PauseCircle } from '@phosphor-icons/react';
import type { GymContext } from '../../lib/gymContext';
import { logout } from '../../utils/auth';
import GymMark from './GymMark';
import { NocButton } from './noc';

/**
 * The gym's free trial has ended (0198, `gym_lock_reason() = 'trial_ended'`).
 *
 * The whole app stops for members and coaches — not a banner over screens that
 * still open, because every write there is refused in SQL anyway, and a screen
 * that looks usable and then fails is the ambush CLAUDE.md warns about.
 *
 * Calm and blameless: it never shows the gym's bill or a price (that is between
 * the gym and Core Fitness), says their membership and history are kept, and
 * points them at the front desk. What a member can still do: sign out, or open
 * another gym they belong to.
 */
export default function GymPaused({ ctx, role }: { ctx: GymContext; role: 'member' | 'trainer' }) {
  const navigate = useNavigate();
  const name = ctx.gymName ?? 'Your gym';
  return (
    <div data-gym-paused className="flex-1 min-h-0 overflow-y-auto flex flex-col items-center justify-center text-center"
      style={{ padding: '32px var(--gutter)', gap: 18, background: 'var(--color-bg)' }}>
      <GymMark name={name} logoUrl={ctx.logoUrl} size={64} />
      <span className="grid place-items-center" style={{ width: 52, height: 52, borderRadius: 16,
        background: 'color-mix(in srgb, var(--color-secondary) 14%, transparent)', color: 'var(--color-secondary)' }}>
        <PauseCircle size={28} weight="fill" />
      </span>
      <div style={{ maxWidth: 320 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-text-primary)', lineHeight: 1.25 }}>
          {name}&rsquo;s app is paused
        </h1>
        <p style={{ fontSize: 14, lineHeight: 1.55, marginTop: 10, color: 'var(--color-text-secondary)' }}>
          {role === 'member'
            ? <>The gym is renewing its Core Fitness plan. Your membership, points and history are kept just as they were, and everything opens again the moment it is done.</>
            : <>The gym is renewing its Core Fitness plan. Your classes, trainees and notes are kept just as they were, and everything opens again the moment it is done.</>}
        </p>
        <p style={{ fontSize: 13, lineHeight: 1.5, marginTop: 10, color: 'var(--color-text-muted)' }}>
          {role === 'member'
            ? 'Training today? Check in at the front desk as usual.'
            : 'Ask the gym’s owner or front desk when it will be back.'}
        </p>
      </div>
      <div className="flex flex-col" style={{ gap: 8, width: '100%', maxWidth: 300 }}>
        {ctx.gymCount > 1 && (
          <NocButton variant="fill" onClick={() => navigate('/choose-gym')}>Open another gym</NocButton>
        )}
        <NocButton variant="ghost" onClick={() => void logout().then(() => navigate('/login', { replace: true }))}>Sign out</NocButton>
      </div>
    </div>
  );
}
