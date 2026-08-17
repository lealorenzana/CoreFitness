import type { CSSProperties } from 'react';
import type { LucideIcon } from 'lucide-react';
import { useReducedMotion } from 'framer-motion';

/**
 * A Lucide glyph with one looping CSS animation.
 *
 * CSS, not Framer: these loop forever on screens the member leaves open, and a
 * `requestAnimationFrame` loop does not fire on a page that is not compositing.
 * The base state is the *resting* glyph — if the animation never runs, the icon
 * is simply still, never invisible (same rule as `chip-in` in index.css).
 *
 * Motion marks a **live condition**, never decoration. A resting or empty state
 * gets the plain `<Icon />`: an animated glyph beside "Nothing booked yet" is
 * movement drawing the eye to an absence.
 */

export type IconMotion = 'hop' | 'swing' | 'flick' | 'tick';

/** Where each motion pivots. `swing` hangs from its top, `flick` lifts off its base. */
const ORIGIN: Record<IconMotion, string> = {
  hop: '50% 50%',
  swing: '50% 100%',
  flick: '50% 80%',
  tick: '50% 50%',
};

interface MotionIconProps {
  icon: LucideIcon;
  motion?: IconMotion;
  size?: number;
  color?: string;
  className?: string;
  /**
   * Overrides the 2.4s default, e.g. `"1.8s"`.
   *
   * Written as the `--mi-dur` custom property the keyframes read, rather than a
   * second `animation` declaration — the shorthand would also reset the
   * timing function and iteration count, quietly turning a loop into a
   * one-shot.
   */
  duration?: string;
}

export default function MotionIcon({
  icon: Icon, motion = 'hop', size = 20, color = 'currentColor', className, duration,
}: MotionIconProps) {
  const reduce = useReducedMotion();
  const style = {
    display: 'inline-flex',
    transformOrigin: ORIGIN[motion],
    // `undefined`, not `'none'`: the element then carries no animation at all,
    // so nothing is mid-flight if the preference changes.
    animation: reduce ? undefined : `mi-${motion} var(--mi-dur, 2.4s) ease-in-out infinite`,
    ...(duration ? { '--mi-dur': duration } : {}),
  } as CSSProperties;

  return (
    <span className={className} style={style}>
      <Icon size={size} style={{ color }} />
    </span>
  );
}
