import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, CaretDown, CaretUp, Heart, Play, SpeakerHigh, SpeakerSlash } from '@phosphor-icons/react';
import { toggleReelLike, type Reel } from '../../lib/api/reels';
import { INSTAGRAM_CROP, reelEmbedUrl, reelOutsideWhy, reelOutsideWords, REEL_SOURCE_WORDS } from '../../lib/reelEmbed';
import { toast } from '../ui/Toast';
import { useT } from '../../lib/i18n';

/**
 * Reels (0245), full screen: one reel per screen, swipe up for the next — the
 * shape members know from Reels and Shorts.
 *
 * A video surface, so it stays black in light mode too. The page is three bands,
 * none drawn over another: the Back bar, the snap column, and under each video a
 * strip with the words and the heart. Nothing of ours sits over a third-party
 * player (its own controls are in its middle, and a cover there would eat every
 * tap), and a swipe that starts on an iframe belongs to the iframe — so the strip
 * also carries Previous and Next.
 *
 * **Only the active reel mounts a player.** Ten iframes at once would be ten
 * players loading over mobile data; the others show their cover, or a solid
 * tile in the gym's colour when there is none — never a broken image.
 */

export interface LikeState { liked: boolean; likes: number }

/** The black frame with Back — the player, and the page's loading, failed and empty states. */
export function ReelFrame({ onBack, children }: { onBack: () => void; children: ReactNode }) {
  const t = useT();
  return (
    <div data-reel-player className="absolute inset-0 flex flex-col" style={{ background: '#000', color: '#fff' }}>
      <div className="flex-none flex items-center" style={{
        paddingTop: 'max(6px, env(safe-area-inset-top))', paddingLeft: 'max(10px, env(safe-area-inset-left))',
        paddingRight: 'max(10px, env(safe-area-inset-right))', minHeight: 48,
      }}>
        <button type="button" onClick={onBack} className="flex items-center noc-press"
          style={{ gap: 7, height: 44, padding: '0 8px', fontSize: 14, fontWeight: 600, color: '#fff' }}>
          <ArrowLeft size={17} />{t('Back')}
        </button>
        <span className="flex-1 text-center" style={{ fontSize: 15, fontWeight: 700, marginRight: 60 }}>{t('Reels')}</span>
      </div>
      <div className="flex-1 min-h-0 relative">{children}</div>
    </div>
  );
}

export default function ReelPlayer({ reels, startId, onBack, onLikeChange }: {
  reels: Reel[];
  startId?: string | null;
  onBack: () => void;
  /** Told after the server has answered, so a list behind the player can agree. */
  onLikeChange?: (id: string, state: LikeState) => void;
}) {
  const t = useT();
  const scroller = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<string | null>(() =>
    (startId && reels.some((r) => r.id === startId) ? startId : reels[0]?.id ?? null));
  const [likes, setLikes] = useState<Record<string, LikeState>>(() =>
    Object.fromEntries(reels.map((r) => [r.id, { liked: r.liked, likes: r.likes }])));
  const pending = useRef(new Set<string>());
  // With sound when the phone allows it (the member tapped to get here); a phone that refuses
  // a video with sound makes it muted (`onBlocked`), and the corner button gives it back.
  const [muted, setMuted] = useState(false);

  // Open at the asked-for reel, before the first paint.
  const [startAt] = useState(active);
  useLayoutEffect(() => {
    const el = scroller.current;
    const i = reels.findIndex((r) => r.id === startAt);
    if (el && i > 0) el.scrollTop = i * el.clientHeight;
  }, [reels, startAt]);

  // The reel that fills most of the screen is the one that plays.
  useEffect(() => {
    const el = scroller.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting && e.intersectionRatio >= 0.6) {
          const id = (e.target as HTMLElement).dataset.reelId;
          if (id) setActive(id);
        }
      }
    }, { root: el, threshold: [0.6] });
    el.querySelectorAll('[data-reel-id]').forEach((n) => io.observe(n));
    return () => io.disconnect();
  }, [reels]);

  const step = (dir: 1 | -1) => {
    const el = scroller.current;
    if (el) el.scrollBy({ top: dir * el.clientHeight, behavior: 'smooth' });
  };

  const like = async (id: string) => {
    if (pending.current.has(id)) return;
    const before = likes[id];
    if (!before) return;
    pending.current.add(id);
    const guess = { liked: !before.liked, likes: Math.max(0, before.likes + (before.liked ? -1 : 1)) };
    setLikes((s) => ({ ...s, [id]: guess }));
    try {
      const on = await toggleReelLike(id);
      // The server's answer wins: a heart tapped on another phone may have already counted.
      const settled = on === guess.liked ? guess : { liked: on, likes: Math.max(0, before.likes + (on === before.liked ? 0 : on ? 1 : -1)) };
      setLikes((s) => ({ ...s, [id]: settled }));
      onLikeChange?.(id, settled);
    } catch (e) {
      setLikes((s) => ({ ...s, [id]: before }));
      toast.error(e instanceof Error ? e.message : t('Could not save your like. Try again.'));
    } finally {
      pending.current.delete(id);
    }
  };

  return (
    <ReelFrame onBack={onBack}>
      <div ref={scroller} data-reel-scroller className="absolute inset-0 overflow-y-scroll scrollbar-hide"
        style={{ scrollSnapType: 'y mandatory', overscrollBehavior: 'contain' }}>
        {reels.map((r, i) => (
          <ReelSlide key={r.id} reel={r} active={r.id === active} like={likes[r.id] ?? { liked: r.liked, likes: r.likes }}
            onLike={() => void like(r.id)} muted={muted} onMute={() => setMuted((m) => !m)} onBlocked={() => setMuted(true)}
            onPrev={i > 0 ? () => step(-1) : undefined} onNext={i < reels.length - 1 ? () => step(1) : undefined} />
        ))}
      </div>
    </ReelFrame>
  );
}

function ReelSlide({ reel, active, like, onLike, muted, onMute, onBlocked, onPrev, onNext }: {
  reel: Reel; active: boolean; like: LikeState; onLike: () => void;
  muted: boolean; onMute: () => void; onBlocked: () => void; onPrev?: () => void; onNext?: () => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const source = REEL_SOURCE_WORDS[reel.source];
  const embed = reel.source === 'upload' ? null : reelEmbedUrl(reel.url);
  const opensOutside = reel.source !== 'upload' && !embed;
  const byline = [reel.author, source].filter(Boolean).join(' · ');

  return (
    <section data-reel-id={reel.id} data-reel-active={active ? 'true' : undefined} aria-label={reel.title}
      className="flex flex-col" style={{ height: '100%', scrollSnapAlign: 'start', scrollSnapStop: 'always' }}>
      <div className="flex-1 min-h-0 relative overflow-hidden" style={{ background: '#000' }}>
        {active && reel.source === 'upload' ? (
          <UploadPlayer src={reel.url} poster={reel.cover} muted={muted} onMute={onMute} onBlocked={onBlocked} />
        ) : active && embed && reel.source === 'instagram' ? (
          // Instagram's own header and likes are cropped away: only its video shows (reelEmbed.ts).
          <div className="absolute inset-x-0" data-reel-crop
            style={{ top: '50%', transform: 'translateY(-50%)', aspectRatio: `1 / ${INSTAGRAM_CROP.ratio}`, maxHeight: '100%', overflow: 'hidden' }}>
            <iframe src={embed} title={reel.title} scrolling="no"
              style={{ position: 'absolute', left: 0, top: -INSTAGRAM_CROP.header, width: '100%', height: `calc(100% + ${INSTAGRAM_CROP.header + INSTAGRAM_CROP.below}px)`, border: 0 }}
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen />
          </div>
        ) : active && embed ? (
          <iframe src={embed} title={reel.title} className="absolute inset-0 w-full h-full" style={{ border: 0 }}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen />
        ) : (
          <ReelCover reel={reel} large />
        )}
        {opensOutside && (
          <div className="absolute inset-x-0 bottom-0 flex flex-col items-center text-center" style={{ padding: '0 20px 22px', gap: 8 }}>
            <a href={reel.url} target="_blank" rel="noopener noreferrer" data-reel-open
              className="inline-flex items-center justify-center noc-press on-fill"
              style={{ height: 46, padding: '0 20px', borderRadius: 'var(--radius-btn, 10px)', fontSize: 14.5, fontWeight: 700,
                background: 'var(--color-secondary)', color: 'var(--color-bg)' }}>
              {reelOutsideWhy(reel.url) === 'photo' ? `${t('See the photos in')} ${source}` : `${t('Open in')} ${source}`}
            </a>
            <p style={{ fontSize: 12.5, color: 'rgb(255 255 255 / 0.82)', background: 'rgb(0 0 0 / 0.6)', padding: '3px 8px', borderRadius: 6 }}>
              {t(reelOutsideWords(reel.url, source))}
            </p>
          </div>
        )}
      </div>

      {/* The words and the heart, under the video — never over a player. */}
      <div className="flex-none flex items-start" data-reel-strip style={{
        gap: 12, padding: '10px max(14px, env(safe-area-inset-right)) max(12px, env(safe-area-inset-bottom)) max(14px, env(safe-area-inset-left))',
        background: '#000', borderTop: '1px solid rgb(255 255 255 / 0.1)',
      }}>
        <div className="flex-1 min-w-0">
          {reel.hidden && (
            <span className="inline-block" data-reel-hidden style={{ fontSize: 12, padding: '1px 8px', borderRadius: 4, marginBottom: 5,
              color: 'var(--color-secondary)', border: '1px solid color-mix(in srgb, var(--color-secondary) 60%, transparent)' }}>
              {t('Hidden — only you and the gym see this')}
            </span>
          )}
          <h2 className="truncate" data-reel-title style={{ fontSize: 15.5, fontWeight: 700 }}>{reel.title}</h2>
          {reel.caption && (
            <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
              className="block w-full text-left" style={{ fontSize: 13, lineHeight: 1.45, marginTop: 2, color: 'rgb(255 255 255 / 0.85)',
                ...(open ? { maxHeight: 120, overflowY: 'auto' } : { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }) }}>
              {reel.caption}
            </button>
          )}
          {byline && <p className="truncate" style={{ fontSize: 12, marginTop: 4, color: 'rgb(255 255 255 / 0.65)' }}>{byline}</p>}
          {/* A site's player can refuse (TikTok answers "429 Too Many Requests" to a busy network):
              the way out is always one tap away, never a dead screen. */}
          {embed && (
            <a href={reel.url} target="_blank" rel="noopener noreferrer" data-reel-open-small
              className="inline-block" style={{ fontSize: 12, marginTop: 4, fontWeight: 600, color: 'var(--color-secondary-300, var(--color-secondary))' }}>
              {`${t('Not playing? Open in')} ${source}`}
            </a>
          )}
        </div>
        <div className="flex-none flex items-center" style={{ gap: 4 }}>
          <button type="button" onClick={onLike} aria-pressed={like.liked} data-reel-like
            aria-label={like.liked ? t('Remove your like') : t('Like')}
            className="flex flex-col items-center noc-press" style={{ minWidth: 48, padding: '2px 4px' }}>
            <Heart size={28} weight={like.liked ? 'fill' : 'regular'}
              style={{ color: like.liked ? 'var(--color-primary-400, var(--color-primary))' : '#fff' }} />
            <span data-reel-likes className="tabular-nums" style={{ fontSize: 12, fontWeight: 600 }}>{like.likes}</span>
          </button>
          <div className="flex flex-col" style={{ gap: 2 }}>
            <button type="button" onClick={onPrev} disabled={!onPrev} aria-label={t('Previous reel')}
              className="grid place-items-center noc-press disabled:opacity-30" style={{ width: 36, height: 30, color: '#fff' }}>
              <CaretUp size={18} />
            </button>
            <button type="button" onClick={onNext} disabled={!onNext} aria-label={t('Next reel')}
              className="grid place-items-center noc-press disabled:opacity-30" style={{ width: 36, height: 30, color: '#fff' }}>
              <CaretDown size={18} />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

/** An uploaded reel: plays muted when it arrives, a tap pauses or plays it, the corner button gives it sound. */
function UploadPlayer({ src, poster, muted, onMute, onBlocked }: { src: string; poster: string | null; muted: boolean; onMute: () => void; onBlocked: () => void }) {
  const t = useT();
  const ref = useRef<HTMLVideoElement>(null);
  const [paused, setPaused] = useState(false);
  const toggle = () => {
    const v = ref.current;
    if (!v) return;
    if (v.paused) void v.play().catch(() => undefined); else v.pause();
  };
  // Plays as soon as it is on screen. A phone may refuse a video with sound that nobody
  // tapped for: then it starts muted, and the corner button gives it sound.
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    void v.play().catch(() => { v.muted = true; onBlocked(); void v.play().catch(() => undefined); });
    // Only when the video changes: `onBlocked` is a new function each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);
  return (
    <>
      <video ref={ref} src={src} poster={poster ?? undefined} playsInline loop autoPlay muted={muted}
        onPlay={() => setPaused(false)} onPause={() => setPaused(true)} onClick={toggle}
        className="absolute inset-0 w-full h-full" style={{ objectFit: 'contain', background: '#000' }} />
      {paused && (
        <span aria-hidden className="absolute grid place-items-center pointer-events-none"
          style={{ left: '50%', top: '50%', width: 64, height: 64, marginLeft: -32, marginTop: -32, borderRadius: 32, background: 'rgb(0 0 0 / 0.55)' }}>
          <Play size={30} weight="fill" color="#fff" />
        </span>
      )}
      <button type="button" onClick={onMute} aria-label={muted ? t('Turn the sound on') : t('Mute')}
        className="absolute grid place-items-center noc-press"
        style={{ right: 12, bottom: 12, width: 40, height: 40, borderRadius: 20, background: 'rgb(0 0 0 / 0.6)', color: '#fff' }}>
        {muted ? <SpeakerSlash size={19} /> : <SpeakerHigh size={19} />}
      </button>
    </>
  );
}

/**
 * A reel's picture: its cover, or — with none, or one that fails to load — a
 * solid tile in the gym's colour with the source and the title. Shared by the
 * player, Today's strip and the coach's list.
 */
export function ReelCover({ reel, large }: { reel: Reel; large?: boolean }) {
  const [broken, setBroken] = useState(false);
  if (reel.cover && !broken) {
    return <img src={reel.cover} alt="" loading="lazy" onError={() => setBroken(true)}
      className="absolute inset-0 w-full h-full" style={{ objectFit: large ? 'contain' : 'cover', background: '#000' }} />;
  }
  return (
    <span data-reel-tile className={`absolute inset-0 flex flex-col on-fill ${large ? 'justify-center text-center' : 'justify-end'}`}
      style={{ background: 'var(--fill-primary, var(--color-primary))', color: '#fff', padding: large ? 20 : 7 }}>
      <span style={{ fontSize: large ? 13 : 12, fontWeight: 700, opacity: 0.9 }}>{REEL_SOURCE_WORDS[reel.source]}</span>
      {/* Small tiles carry the title under them (Today, the coach's list), so only the big one repeats it. */}
      {large && (
        <span style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.25, marginTop: 2,
          display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {reel.title}
        </span>
      )}
    </span>
  );
}
