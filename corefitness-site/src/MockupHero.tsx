import { useEffect, useRef, useState } from 'react';
import Icon from './Icon';
import HeroPlan from './HeroPlan';

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const OPEN_MS = 1700; // the flood, the sparkle, the line, then the film opens (mockup-hero.css, .v2-tour)
const SHUT_MS = 420;

/**
 * The 34 second ad (output/promo/ad, Remotion, the 2.39:1 cut). Mounted only while it plays, so the
 * file never loads with the page. Opening follows the ad's own Approve moment: a colour flood out of
 * the button, the sparkle, then a line that opens into the film.
 */
function TourPlayer({ origin, onClose }: { origin: { x: number; y: number }; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [closing, setClosing] = useState(false);
  const [muted, setMuted] = useState(false);
  useEffect(() => {
    dialog.current?.showModal();
    const t = window.setTimeout(() => {
      const v = video.current;
      if (!v) return;
      // The click allows sound; a browser that still refuses gets the film muted, with Sound on.
      v.play().catch(() => { v.muted = true; setMuted(true); void v.play().catch(() => undefined); });
    }, reduceMotion() ? 0 : OPEN_MS);
    return () => window.clearTimeout(t);
  }, []);
  const close = () => {
    if (closing) return;
    video.current?.pause();
    setClosing(true);
    window.setTimeout(() => { dialog.current?.close(); onClose(); }, reduceMotion() ? 0 : SHUT_MS);
  };
  return (
    <dialog ref={dialog} className={`v2-tour${closing ? ' is-closing' : ''}`} aria-label="Core Fitness in 34 seconds"
      style={{ ['--x' as string]: `${origin.x}px`, ['--y' as string]: `${origin.y}px` }}
      onCancel={(e) => { e.preventDefault(); close(); }}
      onClick={(e) => { if (!(e.target as HTMLElement).closest('.v2-tour-frame, .v2-tour-close')) close(); }}>
      <div className="v2-tour-flood" aria-hidden="true" />
      <svg className="v2-tour-spark" viewBox="0 0 10 10" aria-hidden="true">
        <path d="M5 0 C5.6 3.4 6.6 4.4 10 5 C6.6 5.6 5.6 6.6 5 10 C4.4 6.6 3.4 5.6 0 5 C3.4 4.4 4.4 3.4 5 0 Z" />
      </svg>
      <div className="v2-tour-line" aria-hidden="true" />
      <div className="v2-tour-frame">
        <video ref={video} src="/mockup-art/core-fitness-tour.mp4" poster="/mockup-art/core-fitness-tour-poster.webp"
          playsInline preload="auto" width={1920} height={804} onEnded={close} />
      </div>
      {muted && (
        <button type="button" className="v2-tour-sound" onClick={() => { if (video.current) video.current.muted = false; setMuted(false); }}>
          Sound on
        </button>
      )}
      <button type="button" className="v2-tour-close" onClick={close} aria-label="Close the video">×</button>
    </dialog>
  );
}

/** Only the upper section changes in this copy. All original lower-page motion stays intact. */
export default function MockupHero({ tourHidden = false }: { tourHidden?: boolean }) {
  const hero = useRef<HTMLElement>(null);
  const [tour, setTour] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    const element = hero.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => {
      document.body.classList.toggle('v2-in-hero', entry.isIntersecting);
    }, { rootMargin: '-68px 0px 0px 0px' });
    observer.observe(element);
    return () => { observer.disconnect(); document.body.classList.remove('v2-in-hero'); };
  }, []);

  const words = (text: string, start: number) => text.split(' ').map((word, i) => (
    <span key={word + i}><span className="word"><span style={{ ['--w' as string]: start + i }}>{word}</span></span>{' '}</span>
  ));

  return (
    <section className="hero v2-hero" data-scroll data-hero ref={hero} aria-label="Core Fitness, your gym and your members connected">
      <div className="v2-stars" aria-hidden="true">
        {Array.from({ length: 68 }, (_, i) => <i key={i} className={i % 11 === 0 ? 'cross' : ''} style={{
          left: `${(i * 71 + 9) % 100}%`, top: `${(i * 37 + 4) % 96}%`,
          ['--twinkle' as string]: `${4 + i % 6}s`, ['--star-size' as string]: `${i % 5 === 0 ? 5 : 2}px`,
          opacity: .12 + (i % 4) * .075,
        }} />)}
      </div>
      <div className="v2-floating floating-one" aria-hidden="true"><img src="/mockup-art/floating-dumbbells.webp" alt="" /></div>
      <div className="v2-floating floating-two" aria-hidden="true"><img src="/mockup-art/floating-dumbbells.webp" alt="" /></div>
      <div className="v2-hero-inner">
        <div className="hero-copy v2-copy">
          <h1>{words('Run your gym,', 0)}<br />{words('give your', 3)}<br />{words('members an app.', 5)}</h1>
          <p className="v2-lede">Memberships, payments, check-in and personal training. Give your gym one place to run, and your members an app to train, connect and come back to.</p>
          <p className="v2-origin">Built for a real gym in Mamburao, and open to yours.</p>
        </div>
        <div className="v2-scene" aria-label="Core Fitness owner and member app screens with original gym characters">
          <div className="v2-device-float">
            <div className="v2-monitor">
              <div className="v2-monitor-edge" />
              <div className="v2-monitor-screen"><img src="/mockup-art/dashboard.png" alt="Actual Core Fitness owner dashboard with Lab demo records" /></div>
              <div className="v2-monitor-chin"><span className="v2-monitor-brand">CORE FITNESS</span><span className="v2-device-controls"><i /><i /><i /></span></div>
              <div className="v2-monitor-foot" />
            </div>
            <div className="v2-phone"><div className="v2-phone-camera" /><img src="/mockup-art/member.png" alt="Actual Core Fitness member Today screen with Lab demo records" /></div>
          </div>
          <div className="v2-character character-left" aria-hidden="true"><img src="/mockup-art/gym-characters-clean.webp" alt="" /></div>
          <div className="v2-character character-right" aria-hidden="true"><img src="/mockup-art/gym-characters-clean.webp" alt="" /></div>
          <div className="v2-character character-mascot" aria-hidden="true"><img src="/mockup-art/gym-characters-clean.webp" alt="" /></div>
          <img className="v2-foreground" src="/mockup-art/gym-foreground.webp" alt="" aria-hidden="true" />
          <img className="v2-bottle" src="/mockup-art/bottle-mascot.webp" alt="" aria-hidden="true" />
        </div>
      </div>
      <div className="v2-actions">
        <a className="v2-primary" href="#apply"><Icon name="arrow" /> Register your gym</a>
        <a className="v2-secondary" href="#day">See a day at a gym</a>
        {!tourHidden && (
          <button type="button" className="v2-watch" id="ad" onClick={(e) => {
            const r = (e.currentTarget.querySelector('.v2-watch-play') ?? e.currentTarget).getBoundingClientRect();
            setTour({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
          }}>
            <span className="v2-watch-play" aria-hidden="true" />Watch the tour <span className="v2-watch-len">0:34</span>
          </button>
        )}
      </div>
      {!tourHidden && tour && <TourPlayer origin={tour} onClose={() => setTour(null)} />}
      <div className="v2-hero-bottom"><span>Cash, GCash or Maya <i /> Android and iPhone <i /> English and Filipino</span>
        <details className="v2-floor"><summary>Explore the gym floor plan <span>↗</span></summary><div className="v2-floor-content"><HeroPlan /></div></details>
      </div>
    </section>
  );
}
