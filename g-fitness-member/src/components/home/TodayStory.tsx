import { useEffect, useRef, type ReactNode } from 'react';
import { ArrowDown, Barbell, Clock, Sparkle } from '@phosphor-icons/react';
import { useT } from '../../lib/i18n';
import './today-story.css';
import { useGymApp } from '../../hooks/useGymApp';
import GymMark from '../ui/GymMark';

/** Motion belongs to the app's <main> scroller, never the document. All content
 * starts visible; an unavailable observer or reduced motion leaves it usable. */
export default function TodayStory({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const story = ref.current;
    const main = story?.closest('main');
    const screen = story?.closest<HTMLElement>('#phone-screen');
    const mascot = story?.querySelector<HTMLElement>('.today-companion');
    if (!story || !main || !screen || !mascot) return;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    let docked = false;
    let flight: HTMLElement | null = null;
    let frame = 0;
    let initialized = false;
    const cancelFlight = () => {
      cancelAnimationFrame(frame);
      flight?.remove();
      frame = 0;
      flight = null;
    };
    const update = () => {
      const orb = screen.querySelector<HTMLElement>('[data-floating-chathead]');
      if (!orb || preference.matches) {
        cancelFlight();
        mascot.style.visibility = '';
      mascot.style.opacity = '';
        docked = false;
        return;
      }
      const source = mascot.getBoundingClientRect();
      const header = screen.querySelector(':scope > header')?.getBoundingClientRect();
      const edge = header?.bottom ?? main.getBoundingClientRect().top;
      // A little hysteresis prevents flickering around the handoff point.
      const next = source.top + source.height * .5 < edge + (docked ? 55 : 20);
      if (initialized && next === docked) return;
      const first = !initialized;
      initialized = true;
      docked = next;
      cancelFlight();
      if (first) {
        mascot.style.visibility = docked ? 'hidden' : '';
        return;
      }
      const destination = orb.getBoundingClientRect();
      const clone = mascot.cloneNode(true) as HTMLElement;
      clone.classList.add('today-companion-flight');
      clone.style.cssText = 'position:fixed;left:0;top:0;right:auto;width:166px;height:207px;scale:1;visibility:visible;transform-origin:0 0;pointer-events:none;z-index:85;';
      clone.querySelectorAll<HTMLElement>('*').forEach(el => { el.style.animation = 'none'; });
      screen.appendChild(clone);
      flight = clone;
      mascot.style.visibility = 'hidden';
      const homeScale = source.width / 166;
      const orbScale = destination.width / 166 * .42;


      const started = performance.now();
      const duration = docked ? 650 : 680;
      const returning = !docked;
      // Follow the live hero position throughout the flight: scrolling can keep
      // moving it after the return starts. Ease once, with no second pop.
      const tick = (now: number) => {
        const progress = Math.min(1, (now - started) / duration);
        const eased = 1 - Math.pow(1 - progress, 3);
        const live = mascot.getBoundingClientRect();
        const liveOrb = orb.getBoundingClientRect();
        const small = liveOrb.width / 166 * .42;
        const targetX = returning ? live.left : liveOrb.left + liveOrb.width / 2 - 83 * small;
        const targetY = returning ? live.top : liveOrb.top + liveOrb.height / 2 - 103.5 * small;
        const targetScale = returning ? live.width / 166 : small;
        const startX = returning ? destination.left + destination.width / 2 - 83 * orbScale : source.left;
        const startY = returning ? destination.top + destination.height / 2 - 103.5 * orbScale : source.top;
        const startScale = returning ? orbScale : homeScale;
        clone.style.transform = `translate(${startX + (targetX - startX) * eased}px, ${startY + (targetY - startY) * eased}px) scale(${startScale + (targetScale - startScale) * eased})`;
        const blend = returning ? Math.max(0, (progress - .75) / .25) : 0;
        clone.style.opacity = String(returning ? Math.min(1, progress * 5) * (1 - blend) : 1 - Math.pow(progress, 3));
        if (returning && blend > 0) {
          mascot.style.visibility = '';
      mascot.style.opacity = '';
          mascot.style.opacity = String(blend);
        }
        if (progress < 1) {
          frame = requestAnimationFrame(tick);
        } else {
          cancelFlight();
          mascot.style.visibility = docked ? 'hidden' : '';
          mascot.style.opacity = '';
          if (docked) orb.animate([{ filter: 'brightness(1)' }, { filter: 'brightness(1.4)' }, { filter: 'brightness(1)' }], { duration: 400 });
        }
      };
      frame = requestAnimationFrame(tick);
    };
    main.addEventListener('scroll', update, { passive: true });
    preference.addEventListener('change', update);
    update();
    return () => {
      main.removeEventListener('scroll', update);
      preference.removeEventListener('change', update);
      cancelFlight();
      mascot.style.visibility = '';
      mascot.style.opacity = '';
    };
  }, []);

  useEffect(() => {
    const screen = ref.current?.closest<HTMLElement>('#phone-screen');
    const header = screen?.querySelector<HTMLElement>(':scope > header');
    if (!screen || !header) return;
    const measure = () => screen.style.setProperty('--today-header-height', `${header.offsetHeight}px`);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    return () => { observer.disconnect(); screen.style.removeProperty('--today-header-height'); };
  }, []);

  useEffect(() => {
    const story = ref.current;
    const scroller = story?.closest('main');
    if (!story || !scroller || !('IntersectionObserver' in window)) return;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    let dispose = () => {};

    const setup = () => {
      dispose();
      if (preference.matches) return;
      const hero = story.querySelector<HTMLElement>('[data-today-hero]');
      const reveals = story.querySelectorAll<HTMLElement>('[data-today-reveal]');
      const observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          const target = entry.target as HTMLElement;
          target.dataset.inView = String(entry.isIntersecting);
        }
      }, { root: scroller, threshold: 0, rootMargin: '0px 0px -24px 0px' });
      reveals.forEach((element) => observer.observe(element));
      if (hero) observer.observe(hero);
      story.dataset.motionReady = 'true';

      const update = () => {
        if (!hero) return;
        const distance = Math.max(0, Math.min(hero.offsetHeight,
          scroller.getBoundingClientRect().top - hero.getBoundingClientRect().top));
        // No React state, layout mutation, or scroll interception per frame.
        story.style.setProperty('--today-drift', `${distance * .32}px`);
        story.style.setProperty('--today-mascot-y', `${distance * .17}px`);
        story.style.setProperty('--today-mascot-turn', `${distance * .025}deg`);
        story.style.setProperty('--today-copy-y', `${distance * .07}px`);
      };
      const visibility = () => { story.dataset.paused = String(document.hidden); };
      scroller.addEventListener('scroll', update, { passive: true });
      window.addEventListener('resize', update);
      document.addEventListener('visibilitychange', visibility);
      update();
      visibility();
      dispose = () => {
        observer.disconnect();
        scroller.removeEventListener('scroll', update);
        window.removeEventListener('resize', update);
        document.removeEventListener('visibilitychange', visibility);
        delete story.dataset.motionReady;
        delete story.dataset.paused;
        ['--today-drift', '--today-mascot-y', '--today-mascot-turn', '--today-copy-y']
          .forEach((property) => story.style.removeProperty(property));
      };
    };
    setup();
    preference.addEventListener('change', setup);
    return () => { dispose(); preference.removeEventListener('change', setup); };
  }, []);

  return <div ref={ref} className="today-story">{children}</div>;
}

/** A layered, gym-colored kettlebell companion. Its face, wave and float are
 * separate CSS layers, so it stays crisp without video or animation downloads. */
export function TodayCompanion({ booking = false, dumbbell = false }: { booking?: boolean; dumbbell?: boolean }) {
  const gym = useGymApp();
  return <div className={`today-companion${booking ? ' today-clock-companion' : ''}${dumbbell ? ' today-dumbbell-companion' : ''}`} aria-hidden="true">
    <div className="today-companion-shadow" />
    <div className="today-companion-float">
      {dumbbell ? <><div className="today-dumbbell-plate is-left" /><div className="today-dumbbell-plate is-right" /></> : booking ? <><div className="today-clock-bell is-left" /><div className="today-clock-bell is-right" /></> : <div className="today-companion-handle" />}
      <div className="today-companion-arm is-left" />
      <div className="today-companion-arm is-wave" />
      <div className="today-companion-foot is-left" />
      <div className="today-companion-foot is-right" />
      <div className="today-companion-body">
        {booking && <div className="today-clock-dial"><i className="today-clock-hour" /><i className="today-clock-minute" /><i className="today-clock-pin" /></div>}
        <div className="today-companion-face">
          <i className="today-companion-eye is-left" /><i className="today-companion-eye is-right" />
          <i className="today-companion-cheek is-left" /><i className="today-companion-cheek is-right" />
          <i className="today-companion-smile" />
        </div>
        <span className="today-companion-emblem">{gym ? <GymMark name={gym.gymName} logoUrl={gym.logoUrl} size={25} /> : booking ? <Clock size={21} weight="bold" /> : <Barbell size={21} weight="bold" />}</span>
      </div>
    </div>
  </div>;
}

export function TodayHero({ checkedIn, unavailable, onContinue }: {
  checkedIn: boolean; unavailable: boolean; onContinue: () => void;
}) {
  const t = useT();
  return <section className="today-hero" data-today-hero aria-labelledby="today-hero-title">
    <div className="today-hero-atmosphere" aria-hidden="true" />
    <div className="today-hero-orbit" aria-hidden="true" />
    <span className="today-hero-spark is-one" aria-hidden="true"><Sparkle weight="fill" /></span>
    <span className="today-hero-spark is-two" aria-hidden="true"><Sparkle weight="fill" /></span>
    <span className="today-hero-weight" aria-hidden="true"><Barbell size={27} weight="duotone" /></span>
    <div className="today-hero-copy">
      <span className="today-hero-kicker">{t('One step at a time')}</span>
      <h2 id="today-hero-title">{t('Make today')}<br /><em>{t('your day.')}</em></h2>
      <p>{t(unavailable ? 'Your next chapter starts here.' : checkedIn ? 'You showed up. Take it from here.' : 'Show up. Find your rhythm. Keep going.')}</p>
    </div>
    <TodayCompanion />
    <div className="today-hero-footer">
      <button type="button" className="today-hero-continue" onClick={onContinue}>
        {t('See your day')}<ArrowDown size={16} weight="bold" />
      </button>
      <span className="today-hero-scroll" aria-hidden="true"><i />{t('Scroll to explore')}</span>
    </div>
  </section>;
}


