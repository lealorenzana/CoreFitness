import type { CSSProperties } from 'react';

const ART = '/art/login-gym';

type SpriteProps = {
  name: string; x: number; y: number; seconds?: number; delay?: number;
  frames?: 6 | 8; className?: string;
};

/** Equal square frames, played inside a clipped cell at a shared scale. */
function Sprite({ name, x, y, seconds = 1.4, delay = 0, frames = 6, className = '' }: SpriteProps) {
  const style = {
    left: `${x}%`, top: `${y}%`, '--frames': frames,
    '--pace': `${seconds}s`, '--phase': `${delay}s`,
  } as CSSProperties;
  return (
    <span className={`gym-person ${className}`} style={style}>
      <span className="gym-cell">
        <img className="gym-strip" src={`${ART}/${name}.webp`} alt="" draggable={false}
          width={frames * 512} height={512} decoding="async" />
      </span>
    </span>
  );
}

const AREAS = [
  ['CARDIO', 5.5, 9.8], ['FREE WEIGHTS', 5.5, 38.5], ['STRETCHING', 3.5, 72],
  ['FRONT DESK', 25, 74.5], ['RACKS', 71.5, 5.5], ['STUDIO', 72.5, 37.6],
  ['LOCKERS', 72.5, 71.3],
] as const;

/** Decorative artwork and labels share one coordinate system, including on phones. */
export default function LoginFloorPlan() {
  return (
    <div className="al-plan" aria-hidden="true">
      <div className="gym-scene">
        <img className="gym-floor" src={`${ART}/gym-floor.webp`} alt="" width={2400} height={1350}
          fetchPriority="high" draggable={false} />
        <div className="gym-occupants">
          <Sprite name="p-runner-1" x={11.6} y={24} seconds={.84} className="gym-runner" />
          <Sprite name="p-runner-2" x={26.8} y={24} seconds={.96} delay={-.32} className="gym-runner" />
          <Sprite name="p-bench-press" x={19.2} y={59} seconds={3.6} className="gym-bench" />
          <Sprite name="p-curl" x={27.8} y={65} seconds={2.4} className="gym-curl" />
          <Sprite name="p-squat" x={80.8} y={19} seconds={3.6} className="gym-squat" />
          <Sprite name="p-coach-spot" x={86.8} y={23} seconds={4.8} delay={-1.6} className="gym-coach" />
          <Sprite name="p-stretch" x={9.3} y={83.3} seconds={6} className="gym-stretch" />
          <Sprite name="p-studio-instructor" x={82.7} y={57} seconds={1.5} />
          {[75.2, 82.7, 90.3].flatMap((x, col) => [44.3, 50.5].map((y, row) => (
            <Sprite key={`${col}-${row}`} name="p-studio-member" x={x} y={y} seconds={1.5}
              delay={-.75 - col * .04 - row * .08} />
          )))}
          <Sprite name="p-desk" x={30.3} y={80.5} seconds={4.8} className="gym-desk" />
          {/* Entrance -> front desk -> the open doorway beside the lockers. */}
          <div className="gym-walk-route">
            <Sprite name="p-walker" x={0} y={0} frames={8} seconds={1} className="gym-walker" />
          </div>
          <Sprite name="p-kettlebell" x={60} y={97} seconds={2.4} className="gym-mascot" />
        </div>
        <div className="gym-area-labels">
          {AREAS.map(([label, x, y]) => <span key={label} className="gym-area" style={{ left: `${x}%`, top: `${y}%` }}>{label}</span>)}
          <span className="gym-here"><i />You are here</span>
        </div>
      </div>
    </div>
  );
}
