import { useEffect, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { Check, Coins, FlagCheckered, Fire, Medal, Target, TrendUp } from '@phosphor-icons/react';
import { tierStyle } from '../../data/achievements';
import { levelLabel } from '../../lib/api/achievements';
import { useGymApp } from '../../hooks/useGymApp';
import { pointsWord } from '../../lib/gymApp';
import {
  buzz, currentMoment, momentPrefs, nextMoment, play, reducedMotion, subscribeMoments, type Moment,
} from '../../lib/moments';
import { Odometer, Rays } from './parts';
import { on, useConfetti, useCountUp, useSteps } from './momentHooks';

/**
 * Plays the big moments, one at a time (lib/moments.ts), over whatever screen
 * is open. Mounted once in each shell.
 *
 * The wrapper is always mounted and owns `pointer-events` — #phone-overlay-root
 * is `pointer-events: none`, and a child that keeps its last props while it
 * leaves must never eat taps (CLAUDE.md, shipped 4×). Dismissed by a tap,
 * never a timer, except the owner's small card, which is out of the way.
 */
export default function MomentHost() {
  const m = useSyncExternalStore(subscribeMoments, currentMoment, () => null);
  const prefs = useSyncExternalStore(subscribeMoments, momentPrefs, momentPrefs);
  const root = typeof document !== 'undefined' ? document.getElementById('phone-overlay-root') : null;
  if (!root) return null;
  const still = reducedMotion();
  // A key per moment, so each plays from its first step.
  const k = m ? `${m.kind}:${m.kind === 'badge' ? m.def.key : JSON.stringify(m)}` : 'none';
  return createPortal(
    <div className="absolute inset-0" style={{ zIndex: 240, pointerEvents: m && prefs.celebrations ? 'auto' : 'none' }} data-moment={m?.kind ?? ''}>
      {m && (prefs.celebrations
        ? <Full key={k} m={m} still={still} />
        : <SmallCard key={k} m={m} still={still} />)}
    </div>,
    root,
  );
}

function Full({ m, still }: { m: Moment; still: boolean }) {
  switch (m.kind) {
    case 'checkin': return <CheckinMoment m={m} still={still} />;
    case 'badge': return <BadgeMoment m={m} still={still} />;
    case 'level': return <LevelMoment m={m} still={still} />;
    case 'target': return <TargetMoment m={m} still={still} />;
    case 'challenge': return <ChallengeMoment m={m} still={still} />;
  }
}

/** The layer every full moment sits in: scrim, confetti canvas, a fade in. */
function Layer({ still, children, onTap, canvas }: {
  still: boolean; children: React.ReactNode; onTap?: () => void; canvas: React.RefObject<HTMLCanvasElement | null>;
}) {
  const [shown, setShown] = useState(still);
  useEffect(() => { const t = window.setTimeout(() => setShown(true), 16); return () => clearTimeout(t); }, []);
  return (
    <div className={`mo-layer${shown ? ' mo-show' : ''}${still ? ' mo-still' : ''}`} role="dialog" aria-modal="true" onClick={onTap}>
      <div className="mo-scrim" />
      {children}
      <canvas ref={canvas} className="mo-fx" aria-hidden />
    </div>
  );
}

function Points({ points, step, at, total, why }: { points: number | null; step: number; at: number; total?: string | null; why: string }) {
  // The gym's own word for its points (0213), never a bare number beside a coin.
  const word = pointsWord(useGymApp(), true);
  // Nothing was paid (a plan without points, or the rule is off): no points line at all.
  if (points == null || points <= 0) return null;
  return (
    <div className={on(step, at, 'mo-points mo-in')} data-moment-points>
      <Coins size={16} weight="fill" /> +{points} {word} {why}{total ? <span className="mo-tot">{total}</span> : null}
    </div>
  );
}

// ── Checking in ──────────────────────────────────────────────────────────────

function CheckinMoment({ m, still }: { m: Extract<Moment, { kind: 'checkin' }>; still: boolean }) {
  const { ref, burst } = useConfetti(still);
  const step = useSteps([500, 500, 350, 300, 600, 600], still, (s) => {
    if (s === 1) { play('arrive'); buzz([30, 50, 70]); }
    if (s === 4) play('snap');
    if (s === 6) { play('pop'); buzz(15); burst(0.3, 70); }
  });
  const balance = useCountUp(m.balance ?? 0, step >= 6 && m.balance != null, still, { from: Math.max(0, (m.balance ?? 0) - (m.points ?? 0)), ms: 700 });
  // The odometer rolls the number this visit moved: the streak when it just
  // made the week, otherwise this week's days.
  const rollWeeks = m.weekJustMade && m.weeks != null;
  const days = m.daysThisWeek;
  return (
    <Layer still={still} canvas={ref}>
      <div className={on(step, 1, 'mo-code')}><div className="mo-qr" /><Check className="mo-tick" size={48} weight="bold" /></div>
      <div className={on(step, 2)}>
        <p className="mo-eyebrow" style={{ marginTop: 22 }}>Checked in</p>
        <h2 className="mo-h1">You're in, {m.firstName}</h2>
        <p className="mo-sub">{m.activity ? `${m.activity} today. ` : ''}Have a good session.</p>
      </div>
      {(rollWeeks || days != null) && (
        <div className={on(step, 3, 'mo-streak mo-in')} data-moment-streak>
          <Fire className={`mo-flame${step >= 4 ? ' on' : ''}`} size={40} weight="fill" />
          {rollWeeks ? (
            <Odometer from={(m.weeks as number) - 1} to={m.weeks as number} rolled={step >= 4} />
          ) : (
            <Odometer from={Math.max(0, (days as number) - 1)} to={days as number} rolled={step >= 4} />
          )}
          <div className="mo-lbl">
            {rollWeeks ? (
              <><b>week streak</b>You made this week's target.</>
            ) : (
              <><b>{m.target ? `of ${m.target} days this week` : 'days this week'}</b>
                {m.weeks ? `A ${m.weeks}-week streak` : m.best ? `Your best is ${m.best} weeks` : 'Keep the week going'}</>
            )}
          </div>
        </div>
      )}
      {m.week && m.week.length === 7 && (
        <>
          <div className={on(step, 5, 'mo-wk mo-in')}>
            {m.week.map((d, i) => <span key={i} className={i === m.todayIndex ? 'mo-now' : d ? 'mo-done' : ''} />)}
          </div>
          <div className={on(step, 5, 'mo-wkl mo-in')}>
            <span>{days != null && m.target ? `${days} of ${m.target} days this week` : 'This week'}</span>
            {m.target ? <span>your target: {m.target} a week</span> : <span />}
          </div>
        </>
      )}
      <Points points={m.points} step={step} at={6} why="for the visit" total={m.balance != null ? `${balance.toLocaleString('en-PH')} total` : null} />
      <button type="button" className="mo-cta" style={{ marginTop: 'auto' }} onClick={nextMoment} data-moment-done>Done</button>
    </Layer>
  );
}

// ── Badge unlocked ───────────────────────────────────────────────────────────

function BadgeMoment({ m, still }: { m: Extract<Moment, { kind: 'badge' }>; still: boolean }) {
  const { ref, burst } = useConfetti(still);
  const tier = tierStyle(m.def.tier);
  const step = useSteps([200, 250, 500, 300, 150, 250], still, (s) => {
    if (s === 2) { play('medal'); buzz([20, 40, 90]); }
    if (s === 3) burst(0.32, 60);
  });
  const Icon = m.def.icon;
  const pct = m.rarity && m.rarity.audience > 0 ? Math.round((m.rarity.holders / m.rarity.audience) * 100) : null;
  return (
    <Layer still={still} canvas={ref} onTap={nextMoment}>
      <p className={on(step, 1, 'mo-eyebrow mo-in')}>Badge unlocked</p>
      <div className="mo-stage" style={{ ['--tier' as string]: tier.ring }}>
        <Rays fired={step >= 3} />
        <div className={on(step, 2, 'mo-medal')} style={{ ['--tier' as string]: tier.ring }}>
          <div className="mo-face"><Icon size={56} strokeWidth={2.2} /></div>
          <div className="mo-shine" />
        </div>
      </div>
      <h2 className={on(step, 4, 'mo-h1 mo-in')}>{m.def.title}</h2>
      <p className={on(step, 5, 'mo-sub mo-in')}>{m.def.description}</p>
      <span className={on(step, 5, 'mo-tier mo-in')} style={{ ['--tier' as string]: tier.ring }}>{tier.label}</span>
      {pct != null && <p className={on(step, 6, 'mo-rare mo-in')}>{pct}% of {m.rarity!.audience === 1 ? 'people' : 'members'} at your gym have it.</p>}
      <Points points={m.def.points ?? null} step={step} at={6} why="for the badge" />
      <p className="mo-tap">Tap to continue{m.remaining > 0 ? ` · ${m.remaining} more` : ''}</p>
    </Layer>
  );
}

// ── Earned level ─────────────────────────────────────────────────────────────

const R = 82, C = 2 * Math.PI * R;
function LevelMoment({ m, still }: { m: Extract<Moment, { kind: 'level' }>; still: boolean }) {
  const { ref, burst } = useConfetti(still);
  const step = useSteps([300, 200, 1250, 500, 200], still, (s) => {
    if (s === 2) for (let i = 0; i < 6; i++) window.setTimeout(() => play('tick'), i * 170);
    if (s === 3) { play('level'); buzz([40, 60, 40, 60, 160]); burst(0.38, 120); }
  });
  const needs = [m.nextDays ? `${m.nextDays} more training ${m.nextDays === 1 ? 'day' : 'days'}` : null,
    m.nextWeeks ? `${m.nextWeeks} more consistent ${m.nextWeeks === 1 ? 'week' : 'weeks'}` : null].filter(Boolean).join(' and ');
  return (
    <Layer still={still} canvas={ref} onTap={nextMoment}>
      <p className={on(step, 1, 'mo-eyebrow mo-in')}>Earned level</p>
      <div className="mo-ring">
        <svg width="190" height="190" viewBox="0 0 190 190" aria-hidden>
          <circle cx="95" cy="95" r={R} fill="none" stroke="var(--color-surface-high)" strokeWidth="12" />
          <circle className="mo-arc" cx="95" cy="95" r={R} fill="none" stroke="var(--color-primary)" strokeWidth="12" strokeLinecap="round"
            strokeDasharray={C} strokeDashoffset={step >= 2 ? 0 : C * 0.15} />
        </svg>
        <div className="mo-num">
          <Odometer from={m.from ? levelLabel(m.from as never) : ''} to={levelLabel(m.to as never)} rolled={step >= 3} height={30} />
        </div>
        <div className={`mo-flash${step >= 3 ? ' on' : ''}`} />
      </div>
      <h2 className={on(step, 4, 'mo-h1 mo-in')}>{levelLabel(m.to as never)}</h2>
      <p className={on(step, 5, 'mo-sub mo-in')}>
        Earned from your training at the gym{m.next && needs ? `. ${levelLabel(m.next as never)} needs ${needs}.` : m.next ? '.' : ' — this is the top level.'}
      </p>
      <p className="mo-tap">Tap to continue</p>
    </Layer>
  );
}

// ── Target reached ───────────────────────────────────────────────────────────

function TargetMoment({ m, still }: { m: Extract<Moment, { kind: 'target' }>; still: boolean }) {
  const { ref, burst } = useConfetti(still);
  const span = m.start != null && m.target != null ? m.target - m.start : null;
  const step = useSteps([200, 400, 950, 350, 150, 350], still, (s) => {
    if (s === 3) { play('snap'); buzz([30, 40, 90]); burst(0.5, 90); }
    if (s === 6) play('pop');
  });
  const fmt = (v: number | null) => (v == null ? '' : `${Number(v.toFixed(1)).toLocaleString('en-PH')}${m.unit ? ` ${m.unit}` : ''}`);
  return (
    <Layer still={still} canvas={ref}>
      <p className={on(step, 1, 'mo-eyebrow mo-in')}>Target reached</p>
      <div className={`${on(step, 1, 'mo-target mo-in')}${step >= 3 ? ' on' : ''}`}>
        <div className="mo-t"><b>{m.title}</b><span className="mo-v">{fmt(m.target)}</span></div>
        <div className="mo-bar"><i style={{ width: step >= 2 ? '100%' : '80%' }} /></div>
        {m.start != null && <div className="mo-t" style={{ marginTop: 8 }}><span className="mo-v">Started at {fmt(m.start)}</span><span className="mo-v">{fmt(m.target)}</span></div>}
      </div>
      <div className={on(step, 3, 'mo-stamp')}><Check size={44} weight="bold" /></div>
      <h2 className={on(step, 4, 'mo-h1 mo-in')}>{m.title}</h2>
      {span != null && span !== 0 && <p className={on(step, 5, 'mo-sub mo-in')}>From {fmt(m.start)} to {fmt(m.target)}.</p>}
      <Points points={m.points} step={step} at={6} why="for the target" />
      <button type="button" className="mo-cta" onClick={nextMoment} data-moment-done>Done</button>
    </Layer>
  );
}

// ── Challenge finished ───────────────────────────────────────────────────────

function ChallengeMoment({ m, still }: { m: Extract<Moment, { kind: 'challenge' }>; still: boolean }) {
  const { ref, burst } = useConfetti(still);
  const step = useSteps([200, 200, 450, 200, 350], still, (s) => {
    if (s === 2) { play('medal'); buzz([20, 40, 90]); }
    if (s === 4) { play('record'); buzz([40, 60, 40, 60, 160]); burst(0.4, 130); }
    if (s === 5) play('pop');
  });
  return (
    <Layer still={still} canvas={ref}>
      <p className={on(step, 1, 'mo-eyebrow mo-in')}>Challenge finished</p>
      <div className="mo-stage" style={{ ['--tier' as string]: 'var(--color-primary-300)' }}>
        <Rays fired={step >= 3} />
        <div className={on(step, 2, 'mo-medal')} style={{ ['--tier' as string]: 'var(--color-primary-300)' }}>
          <div className="mo-face" style={{ color: '#160b33' }}><FlagCheckered size={56} weight="fill" /></div>
          <div className="mo-shine" />
        </div>
      </div>
      <h2 className={on(step, 4, 'mo-h1 mo-in')}>{m.title}</h2>
      <p className={on(step, 4, 'mo-sub mo-in')}>You reached the target.</p>
      <Points points={m.points} step={step} at={5} why="for the challenge" />
      <button type="button" className="mo-cta" onClick={nextMoment} data-moment-done>Done</button>
    </Layer>
  );
}

// ── The owner turned celebrations down ───────────────────────────────────────

function SmallCard({ m, still }: { m: Moment; still: boolean }) {
  const [shown, setShown] = useState(still);
  useEffect(() => {
    play('pop'); buzz(25);
    const a = window.setTimeout(() => setShown(true), 16);
    const b = window.setTimeout(nextMoment, 3200);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, []);
  const [Icon, title, line] = cardText(m, pointsWord(useGymApp(), true));
  return (
    <button type="button" className={`mo-card${shown ? ' on' : ''}${still ? ' mo-still' : ''}`} onClick={nextMoment}
      style={{ pointerEvents: 'auto' }} role="status" data-moment-card>
      <Icon size={26} weight="fill" style={{ color: 'var(--color-primary-300)', flex: 'none' }} />
      <span className="min-w-0"><b>{title}</b>{line && <small>{line}</small>}</span>
    </button>
  );
}

function cardText(m: Moment, word: string): [typeof Check, string, string | null] {
  const pts = (p: number | null | undefined) => (p && p > 0 ? `+${p} ${word}` : null);
  switch (m.kind) {
    case 'checkin': return [Check, `You're in, ${m.firstName}`,
      [m.daysThisWeek != null && m.target ? `${m.daysThisWeek} of ${m.target} days this week` : null, pts(m.points)].filter(Boolean).join(' · ') || null];
    case 'badge': return [Medal, `Badge unlocked: ${m.def.title}`, tierStyle(m.def.tier).label];
    case 'level': return [TrendUp, `Earned level: ${levelLabel(m.to as never)}`, null];
    case 'target': return [Target, `Target reached: ${m.title}`, pts(m.points)];
    case 'challenge': return [FlagCheckered, `Challenge finished: ${m.title}`, pts(m.points)];
  }
}
