import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SectionHead, SeeAll } from '../ui/noc';
import { ReelCover } from '../reels/ReelPlayer';
import { listReels, type Reel } from '../../lib/api/reels';
import { useGymApp } from '../../hooks/useGymApp';
import { moduleOn } from '../../lib/gymApp';
import { useT } from '../../lib/i18n';

/** At most this many tiles on Today; the rest are on the Reels screen. */
const MAX_TILES = 8;

/**
 * Today's line of the gym's reels (0245): small 9:16 tiles, the newest first,
 * then See all into the player. **Renders nothing** while the gym has reels off,
 * has none, or the read failed — it is an extra on Today, read in its own effect
 * so it never holds the day up.
 */
export default function ReelsStrip() {
  const t = useT();
  const navigate = useNavigate();
  const app = useGymApp();
  // Only once the gym is known: an unknown module reads as on, and that is no reason to ask.
  const on = app ? moduleOn(app, 'reels') : false;
  const [reels, setReels] = useState<Reel[] | null>(null);

  useEffect(() => {
    if (!on) return;
    let alive = true;
    void (async () => {
      const list = await listReels().catch(() => null);
      if (alive) setReels(list);
    })();
    return () => { alive = false; };
  }, [on]);

  if (!on || !reels || reels.length === 0) return null;
  const shown = reels.slice(0, MAX_TILES);

  return (
    <section aria-label={t('Reels')} data-today-reels className="flex flex-col" style={{ gap: 10 }}>
      <SectionHead title={t('Reels')} meta={t('From your gym')} />
      <div className="flex overflow-x-auto scrollbar-hide" style={{ gap: 8, margin: '0 calc(-1 * var(--gutter))', padding: '0 var(--gutter)' }}>
        {shown.map((r) => (
          <button key={r.id} type="button" data-reel-tile-id={r.id} onClick={() => navigate(`/member/reels?reel=${encodeURIComponent(r.id)}`)}
            aria-label={r.title} className="flex-none flex flex-col text-left noc-press" style={{ width: 92, gap: 5 }}>
            <span className="relative block overflow-hidden" style={{
              width: 92, aspectRatio: '9 / 16', borderRadius: 12, border: '1px solid rgb(var(--hair-rgb, 255 255 255) / 0.12)',
            }}>
              <ReelCover reel={r} />
            </span>
            <span className="block" style={{ fontSize: 12, lineHeight: 1.3, fontWeight: 600, color: 'var(--color-text-primary)',
              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {r.title}
            </span>
          </button>
        ))}
      </div>
      <SeeAll label={t('See all reels')} count={reels.length} onClick={() => navigate('/member/reels')} />
    </section>
  );
}
