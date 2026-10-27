import { useEffect, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { Coins, Fire, type Icon } from '@phosphor-icons/react';
import type { LucideIcon } from 'lucide-react';
import { flameTier, type FlameTier } from '../../lib/api/streak';
import { getBalance } from '../../lib/api/points';
import { storedSession } from '../../lib/offlineReads';
import { useGymApp } from '../../hooks/useGymApp';
import { moduleOn, pointsWord } from '../../lib/gymApp';
import { reducedMotion } from '../../lib/moments';
import { useCountUp } from '../moments/momentHooks';
import { lastBalance, rememberBalance } from '../../lib/livelyCache';

/**
 * Wave 2 of the lively member app (2026-10-27, mock-up approved): the pieces
 * the everyday screens share. Each draws a real number the screen already has;
 * none decides one.
 */

const FLAME_SIZE: Record<FlameTier, number> = { out: 24, ember: 28, flame: 32, blaze: 38, inferno: 42 };

/** The streak's flame, grown by its tier (Ember → Inferno) and breathing; grey with no streak. */
export function FlameMark({ weeks, style }: { weeks: number; style?: CSSProperties }) {
  const tier = flameTier(weeks);
  const size = FLAME_SIZE[tier];
  return (
    <span className={`lv-flame lv-flame--${tier}`} style={{ width: size + 22, height: size + 22, ...style }} aria-hidden>
      {tier !== 'out' && <span className="lv-halo" />}
      <Fire size={size} weight={tier === 'out' ? 'regular' : 'fill'} />
    </span>
  );
}

/**
 * One ring (never concentric — CLAUDE.md) that fills to a real fraction once on
 * arrival; nothing at all without one, like ProgressBar.
 */
export function ProgressRing({ fraction, label, size = 78 }: { fraction: number | null | undefined; label: string; size?: number }) {
  const [shown, setShown] = useState(reducedMotion());
  useEffect(() => { const t = window.setTimeout(() => setShown(true), 120); return () => clearTimeout(t); }, []);
  if (fraction == null || !Number.isFinite(fraction)) return null;
  const r = size / 2 - 7, c = 2 * Math.PI * r, f = Math.max(0, Math.min(1, fraction));
  return (
    <span className="relative inline-grid place-items-center flex-none" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ position: 'absolute', inset: 0, transform: 'rotate(-90deg)' }} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-surface-high)" strokeWidth="8" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-primary)" strokeWidth="8" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={shown ? c * (1 - f) : c} style={{ transition: 'stroke-dashoffset 1.1s cubic-bezier(.4,0,.2,1)' }} />
      </svg>
      <b className="tabular-nums" style={{ position: 'relative', fontSize: size > 70 ? 18 : 15, fontWeight: 800, color: 'var(--color-text-primary)' }}>{label}</b>
    </span>
  );
}

/** A badge as a medal in its real metal (wave 1's, small). `tier` is a colour. */
export function Medal({ tier, icon: Glyph, size = 64, shine = false, locked = false, label }: {
  tier: string; icon: Icon | LucideIcon; size?: number; shine?: boolean; locked?: boolean; label?: string;
}) {
  return (
    <span className={`lv-medal${shine ? ' lv-medal--new' : ''}${locked ? ' lv-medal--locked' : ''}`}
      style={{ ['--tier' as string]: tier, width: size, height: size }} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <Glyph size={Math.round(size * 0.42)} />
      {!locked && <span className="lv-shine" />}
    </span>
  );
}


/** A number that counts up from zero once, on arrival (wave 2's stats). */
export function CountNumber({ value }: { value: number }) {
  const v = useCountUp(value, true, reducedMotion(), { ms: 800 });
  return <span className="tabular-nums">{v.toLocaleString('en-PH')}</span>;
}

/** The member's points, in the gym's own word, counting up when they changed. Tap: Rewards. */
export function PointsChip() {
  const navigate = useNavigate();
  const app = useGymApp();
  const on = moduleOn(app, 'points');
  const uid = storedSession()?.user.id ?? null;
  const [balance, setBalance] = useState<number | null>(null);
  const [from, setFrom] = useState(() => lastBalance(uid) ?? 0);
  useEffect(() => {
    if (!on || !uid) return;
    let alive = true;
    void (async () => {
      const b = await getBalance(uid).catch(() => null);
      if (!alive || b == null) return;
      setFrom(lastBalance(uid) ?? 0);
      setBalance(b);
      rememberBalance(uid, b);
    })();
    return () => { alive = false; };
  }, [on, uid]);
  const shown = useCountUp(balance ?? 0, balance != null, reducedMotion() || balance === from, { from, ms: 900 });
  if (!on || balance == null) return null;
  return (
    <button type="button" onClick={() => navigate('/member/rewards')} className="lv-points noc-press" data-points-chip
      aria-label={`${balance} ${pointsWord(app, true)}. Open Rewards`}>
      <Coins size={15} weight="fill" /> <span className="tabular-nums">{shown.toLocaleString('en-PH')}</span> {pointsWord(app, true)}
    </button>
  );
}
