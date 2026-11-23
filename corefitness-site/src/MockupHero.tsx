import { useEffect, useRef } from 'react';
import Icon from './Icon';
import HeroPlan from './HeroPlan';

/** Only the upper section changes in this copy. All original lower-page motion stays intact. */
export default function MockupHero() {
  const hero = useRef<HTMLElement>(null);
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
          <p className="v2-screen-caption">Actual Core Fitness UI · Lab demo records</p>
        </div>
      </div>
      <div className="v2-actions">
        <a className="v2-primary" href="#apply"><Icon name="arrow" /> Register your gym</a>
        <a className="v2-secondary" href="#day">See a day at a gym</a>
      </div>
      <div className="v2-hero-bottom"><span>Cash, GCash or Maya <i /> Android and iPhone <i /> English and Filipino</span>
        <details className="v2-floor"><summary>Explore the gym floor plan <span>↗</span></summary><div className="v2-floor-content"><HeroPlan /></div></details>
      </div>
    </section>
  );
}
