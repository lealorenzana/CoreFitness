import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { BoardRow, Tier } from '../../lib/api/season';
import { reducedMotion } from '../../lib/moments';
import { tierStyle } from '../../data/achievements';

/**
 * The season, livelier (wave 2, 2026-10-27, mock-up approved): the tiers as a
 * ladder the member's marker climbs to their real score, and the board's top
 * three on a podium with the member's own row lit. Both draw only what Season
 * already read (my_season, season tiers, the opted-in board).
 */

/** The tiers, highest at the top, with "You" placed between them by the score. */
export function TierLadder({ tiers, score, row }: {
  tiers: Tier[]; score: number; row: (t: Tier, reached: boolean) => ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<number | null>(null);
  const [grown, setGrown] = useState(reducedMotion());
  const top = [...tiers].sort((a, b) => b.pointsNeeded - a.pointsNeeded);

  useEffect(() => {
    const measure = () => {
      const el = box.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      // Each rung's centre, measured up from the bottom of the ladder, lowest tier first.
      const rungs = [...el.querySelectorAll<HTMLElement>('[data-rung]')]
        .map((n) => { const b = n.getBoundingClientRect(); return { need: Number(n.dataset.rung), y: r.bottom - (b.top + b.height / 2) }; })
        .sort((a, b) => a.need - b.need);
      if (rungs.length === 0) return;
      let y: number;
      if (score <= rungs[0].need) y = (rungs[0].y * score) / Math.max(1, rungs[0].need);
      else if (score >= rungs[rungs.length - 1].need) y = rungs[rungs.length - 1].y;
      else {
        const i = rungs.findIndex((g) => g.need > score);
        const lo = rungs[i - 1], hi = rungs[i];
        y = lo.y + (hi.y - lo.y) * ((score - lo.need) / Math.max(1, hi.need - lo.need));
      }
      setPos(y);
    };
    const raf = requestAnimationFrame(() => { measure(); window.setTimeout(() => setGrown(true), 60); });
    window.addEventListener('resize', measure);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', measure); };
  }, [score, tiers]);

  return (
    <div ref={box} className="season-ladder" data-ladder>
      <span className="season-ladder__fill" style={{ height: grown && pos != null ? pos : 0 }} />
      {pos != null && (
        <span className="season-ladder__you" style={{ bottom: grown ? pos - 15 : -15 }} aria-label={`You: ${score} points`}>You</span>
      )}
      {top.map((t) => (
        <div key={t.id} data-rung={t.pointsNeeded} className={`season-ladder__rung${score >= t.pointsNeeded ? ' is-reached' : ''}`}>
          {row(t, score >= t.pointsNeeded)}
        </div>
      ))}
    </div>
  );
}

const initials = (b: BoardRow) => `${b.firstName.charAt(0)}${b.lastInitial.charAt(0)}`.toUpperCase();
const METAL = [tierStyle('gold').ring, tierStyle('silver').ring, tierStyle('bronze').ring];

/** The top three standing on a podium (2nd, 1st, 3rd); fewer than three, no podium. */
export function Podium({ board }: { board: BoardRow[] }) {
  if (board.length < 3) return null;
  const order = [1, 0, 2];
  const heights = [96, 70, 54];
  return (
    <div className="season-podium" data-podium>
      {order.map((i, k) => {
        const b = board[i];
        return (
          <div key={i} className="season-podium__step lv-in" style={{ ['--i' as string]: k, ['--metal' as string]: METAL[i] }}>
            <span className="season-podium__av" style={b.isMe ? { borderColor: 'var(--color-secondary)' } : undefined}>{initials(b)}</span>
            <span className="season-podium__blk" style={{ height: heights[i] }}>
              <b>{i + 1}. {b.firstName}{b.isMe ? ' (you)' : ''}</b>
              <small className="tabular-nums">{b.score.toLocaleString()}</small>
            </span>
          </div>
        );
      })}
    </div>
  );
}
