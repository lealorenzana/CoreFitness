import { useId, type CSSProperties, type ReactNode } from 'react';
import { Minus, Plus, type Icon } from '@phosphor-icons/react';

/**
 * The pieces the full-screen routine run is drawn from (GuidedWorkout).
 * Motion is CSS (`noc-gw-*` in index.css), never framer's rAF — see CLAUDE.md.
 */

/**
 * The exercise's glyph, huge and blurred, behind everything — violet from the
 * top right, an amber echo lower left, and a scrim so text stays readable.
 * Keyed by the caller on the exercise, so each one arrives with its own icon.
 */
export function WorkoutBackdrop({ icon: Glyph, cue }: { icon: Icon; cue: string }) {
  return (
    <div aria-hidden className="absolute inset-0 overflow-hidden pointer-events-none">
      <div className="absolute inset-0" style={{
        background:
          'radial-gradient(120% 70% at 100% 0%, rgba(124, 58, 237, 0.34) 0%, transparent 60%),'
          + 'radial-gradient(90% 60% at 0% 100%, rgba(245, 158, 11, 0.14) 0%, transparent 60%),'
          + 'var(--color-bg)',
      }} />
      <div key={cue} className="absolute noc-gw-icon-in" style={{ top: '-4%', right: '-30%', width: 460, height: 460 }}>
        <div className="noc-gw-drift" style={{ color: '#7C3AED', opacity: 0.55, filter: 'blur(44px)' }}>
          <Glyph size={460} weight="fill" />
        </div>
      </div>
      {/* The icon itself, softly out of focus — recognisable, never sharp enough to compete with the text. */}
      <div key={cue + ':a'} className="absolute noc-gw-icon-in" style={{ top: '2%', right: '-22%', width: 380, height: 380, animationDelay: '40ms' }}>
        <div className="noc-gw-drift" style={{ color: '#A78BFA', opacity: 0.42, filter: 'blur(9px)' }}>
          <Glyph size={380} weight="duotone" />
        </div>
      </div>
      <div key={cue + ':b'} className="absolute noc-gw-icon-in" style={{ bottom: '6%', left: '-26%', width: 300, height: 300, animationDelay: '120ms' }}>
        <div className="noc-gw-drift noc-gw-drift--slow" style={{ color: '#F59E0B', opacity: 0.22, filter: 'blur(38px)' }}>
          <Glyph size={300} weight="fill" />
        </div>
      </div>
      {/* A crisp hairline copy over the blur — the depth that reads as "premium". */}
      <div key={cue + ':c'} className="absolute noc-gw-icon-in" style={{ top: '2%', right: '-22%', width: 380, height: 380, animationDelay: '60ms' }}>
        <div className="noc-gw-drift" style={{ color: 'rgba(196, 181, 253, 0.16)' }}>
          <Glyph size={380} weight="thin" />
        </div>
      </div>
      <div className="absolute inset-0" style={{
        background: 'linear-gradient(180deg, rgba(8, 8, 14, 0.05) 0%, rgba(8, 8, 14, 0.45) 42%, rgba(8, 8, 14, 0.9) 100%)',
      }} />
    </div>
  );
}

/**
 * A circular gauge. `fraction` is how much of the ring is lit (0–1); the
 * dash offset eases between the screen clock's quarter-second ticks.
 */
export function CountRing({
  fraction, size = 220, stroke = 10, tone = 'structure', children,
}: {
  fraction: number;
  size?: number;
  stroke?: number;
  tone?: 'structure' | 'action';
  children?: ReactNode;
}) {
  const id = 'gw' + useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const r = (size - stroke) / 2;
  const len = 2 * Math.PI * r;
  const f = Math.max(0, Math.min(1, fraction));
  const [a, b] = tone === 'action' ? ['#FBBF24', '#F59E0B'] : ['#C4B5FD', '#7C3AED'];
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', overflow: 'visible' }} aria-hidden>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={a} />
            <stop offset="100%" stopColor={b} />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(233, 233, 237, 0.08)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={`url(#${id})`} strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={len} strokeDashoffset={len * (1 - f)}
          style={{ transition: 'stroke-dashoffset 0.3s linear', filter: `drop-shadow(0 0 10px ${b})` }} />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  );
}

/**
 * A big number with − and + either side: the weight or reps for the set in
 * focus. The number is still a text field, so an odd plate is one tap away.
 */
export function Stepper({
  label, value, step, onChange, decimal = false,
}: {
  label: string;
  value: string;
  step: number;
  onChange: (next: string) => void;
  decimal?: boolean;
}) {
  const n = Number(value) || 0;
  const fmt = (x: number) => String(Math.round(Math.max(0, x) * 100) / 100);
  const btn: CSSProperties = {
    width: 36, height: 36, borderRadius: 11, flex: 'none',
    border: '1px solid rgba(233, 233, 237, 0.14)', background: 'rgba(255, 255, 255, 0.04)',
    color: 'var(--color-text-secondary)',
  };
  return (
    <div className="flex flex-col items-center" style={{ gap: 6, minWidth: 0 }}>
      <div className="flex items-center w-full" style={{ gap: 6 }}>
        <button type="button" className="grid place-items-center noc-press" style={btn}
          aria-label={`Less ${label}`} onClick={() => onChange(fmt(n - step))}>
          <Minus size={16} weight="bold" />
        </button>
        <input
          aria-label={label}
          inputMode={decimal ? 'decimal' : 'numeric'}
          value={value}
          placeholder="—"
          onChange={(e) => onChange(e.target.value.replace(decimal ? /[^\d.]/g : /\D/g, ''))}
          className="tabular-nums bg-transparent outline-none text-center"
          style={{ width: '100%', minWidth: 0, fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--color-text-primary)' }}
        />
        <button type="button" className="grid place-items-center noc-press" style={btn}
          aria-label={`More ${label}`} onClick={() => onChange(fmt(n + step))}>
          <Plus size={16} weight="bold" />
        </button>
      </div>
      <span style={{ fontSize: 11.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>{label}</span>
    </div>
  );
}

/** Falling confetti for the finish screen. Deterministic, so it looks the same on every render. */
export function Confetti({ count = 26 }: { count?: number }) {
  const colors = ['#7C3AED', '#C4B5FD', '#F59E0B', '#FBBF24', '#A78BFA'];
  return (
    <div aria-hidden className="absolute inset-0 overflow-hidden pointer-events-none">
      {Array.from({ length: count }, (_, i) => {
        const left = (i * 37) % 100;
        const style = {
          left: `${left}%`,
          width: i % 3 ? 7 : 5,
          height: i % 3 ? 12 : 5,
          borderRadius: i % 3 ? 2 : 999,
          background: colors[i % colors.length],
          animationDelay: `${(i * 97) % 900}ms`,
          animationDuration: `${2400 + ((i * 131) % 1400)}ms`,
          '--dx': `${((i * 53) % 80) - 40}px`,
          '--rot': `${((i * 71) % 2) ? '' : '-'}${360 + ((i * 29) % 360)}deg`,
        } as CSSProperties;
        return <span key={i} className="absolute noc-gw-confetti" style={{ top: -20, ...style }} />;
      })}
    </div>
  );
}
