import { Flame } from '@phosphor-icons/react';
import { flameTier } from '../../lib/api/streak';

/**
 * The streak's orb (0151/0152): a ring cut into one segment per day of the
 * member's weekly target, filling as the week's training days land, with the
 * flame at its centre growing by tier — ember, flame, blaze, inferno.
 *
 * The next segment glows amber only while it can still be earned this week
 * (`live`); a frozen or out-of-reach week shows no invitation. Everything
 * moving here is CSS (`noc-streak-*` in index.css, inside reduced-motion:
 * no-preference) — nothing depends on an animation having run.
 */
export default function StreakOrb({
  weeks, days, target, live, size = 84, ignite = false,
}: {
  weeks: number;
  days: number;
  target: number;
  /** The next segment can still be earned this week. */
  live: boolean;
  size?: number;
  /** Play the one-time burst (this week just secured, or a milestone). */
  ignite?: boolean;
}) {
  const tier = flameTier(weeks);
  const stroke = Math.max(5, Math.round(size / 14));
  const r = (size - stroke) / 2 - 2;
  const c = 2 * Math.PI * r;
  const n = Math.max(1, target);
  const gap = n > 1 ? Math.min(10, c / n / 4) : 0;
  const seg = c / n - gap;
  const filled = Math.min(days, n);
  const flameSize = Math.round(size * (tier === 'out' ? 0.34 : tier === 'ember' ? 0.36 : tier === 'flame' ? 0.42 : 0.46));

  return (
    <div className={`streak-orb streak-orb--${tier}${ignite ? ' streak-orb--ignite' : ''}`}
      style={{ width: size, height: size }} aria-hidden>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
        <defs>
          <linearGradient id="streak-seg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--color-primary-300)" />
            <stop offset="100%" stopColor="var(--color-primary)" />
          </linearGradient>
        </defs>
        {Array.from({ length: n }, (_, i) => {
          const state = i < filled ? 'on' : i === filled && live ? 'next' : 'off';
          return (
            <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none"
              className={`streak-seg streak-seg--${state}`}
              strokeWidth={stroke} strokeLinecap="round"
              stroke={state === 'on' ? 'url(#streak-seg)' : state === 'next' ? 'var(--color-secondary)' : 'rgba(233,233,237,0.10)'}
              strokeDasharray={`${Math.max(0.01, seg)} ${c}`}
              strokeDashoffset={-(i * (c / n)) - gap / 2} />
          );
        })}
      </svg>
      <span className="streak-orb__core">
        <span className="streak-orb__flame">
          <Flame size={flameSize} weight={tier === 'out' ? 'regular' : 'fill'} />
        </span>
      </span>
      {ignite && <span className="streak-orb__burst" />}
    </div>
  );
}
