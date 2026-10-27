import type { ReactNode } from 'react';

/** The big moments' small components; their hooks are in momentHooks.ts. */

/** Two values stacked; `on` rolls the first up and out and the second in. */
export function Odometer({ from, to, rolled, height = 44 }: { from: ReactNode; to: ReactNode; rolled: boolean; height?: number }) {
  return (
    <span className={`mo-odo${rolled ? ' on' : ''}`} style={{ ['--h' as string]: `${height}px` }} aria-label={String(to)}>
      <span aria-hidden><span>{from}</span><span>{to}</span></span>
    </span>
  );
}

/** 12 rays that fire outwards once around a medal — a loop would turn a moment into wallpaper. */
export function Rays({ fired }: { fired: boolean }) {
  return (
    <div className={`mo-rays${fired ? ' on' : ''}`} aria-hidden>
      {Array.from({ length: 12 }, (_, i) => <span key={i} style={{ ['--r' as string]: `${i * 30}deg` }} />)}
    </div>
  );
}
