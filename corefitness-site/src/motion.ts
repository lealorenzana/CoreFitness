import { useEffect, useRef, useState } from 'react';

/**
 * The page's motion, in one place.
 *
 * Every effect here *enhances* a page that is already complete: content is
 * visible by default, and only once `html.anim` is set (motion allowed, JS
 * running) do the reveal classes start hidden. So a reader with reduced
 * motion, a crawler, or a browser that never runs this file still gets the
 * whole page.
 *
 * The scroll loop writes CSS custom properties and nothing else — no React
 * state per frame:
 *   [data-scroll]  --p    0 → 1 as the element crosses the viewport
 *   [data-pin]     --pin  0 → 1 while a tall section's sticky child is pinned
 *   :root          --page 0 → 1 down the whole document
 */
export const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const clamp = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

/** Progress of a tall pinned section: 0 when its top meets the viewport top, 1 when its bottom meets the viewport bottom. */
export const pinProgress = (el: Element) => {
  const r = el.getBoundingClientRect();
  const span = r.height - window.innerHeight;
  return span <= 0 ? 0 : clamp(-r.top / span);
};

export function useMotionEngine() {
  useEffect(() => {
    const root = document.documentElement;
    const still = reducedMotion();
    if (!still) root.classList.add('anim');

    // --- reveal on view ------------------------------------------------------------------
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      }),
      { rootMargin: '0px 0px -8% 0px', threshold: 0.12 },
    );
    const watch = () => document.querySelectorAll('[data-reveal]:not(.in)').forEach((el) => io.observe(el));
    watch();
    const mo = new MutationObserver(watch);
    mo.observe(document.body, { childList: true, subtree: true });

    // --- scroll-driven custom properties -------------------------------------------------
    let frame = 0;
    const paint = () => {
      frame = 0;
      const vh = window.innerHeight;
      const max = root.scrollHeight - vh;
      root.style.setProperty('--page', String(max > 0 ? clamp(window.scrollY / max) : 0));
      if (still) return;
      document.querySelectorAll<HTMLElement>('[data-scroll]').forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.bottom < -vh || r.top > vh * 2) return;
        el.style.setProperty('--p', (clamp((vh - r.top) / (vh + r.height))).toFixed(4));
      });
      document.querySelectorAll<HTMLElement>('[data-pin]').forEach((el) => {
        el.style.setProperty('--pin', pinProgress(el).toFixed(4));
      });
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(paint); };
    paint();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);

    // --- pointer: tilt, spotlight, magnetic buttons, cursor glow ---------------------------
    const fine = window.matchMedia('(pointer: fine)').matches;
    const glow = document.querySelector<HTMLElement>('.cursor-glow');
    const onMove = (e: PointerEvent) => {
      if (glow) glow.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
      const t = e.target as Element | null;
      const tilt = t?.closest<HTMLElement>('.tilt');
      if (tilt) {
        const r = tilt.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width;
        const y = (e.clientY - r.top) / r.height;
        tilt.style.setProperty('--mx', `${(x * 100).toFixed(1)}%`);
        tilt.style.setProperty('--my', `${(y * 100).toFixed(1)}%`);
        if (!still) {
          tilt.style.setProperty('--ry', `${((x - 0.5) * 10).toFixed(2)}deg`);
          tilt.style.setProperty('--rx', `${((0.5 - y) * 10).toFixed(2)}deg`);
        }
      }
      const mag = t?.closest<HTMLElement>('.magnetic');
      if (mag && !still) {
        const r = mag.getBoundingClientRect();
        mag.style.setProperty('--tx', `${((e.clientX - r.left - r.width / 2) * 0.25).toFixed(1)}px`);
        mag.style.setProperty('--ty', `${((e.clientY - r.top - r.height / 2) * 0.35).toFixed(1)}px`);
      }
    };
    const onLeave = (e: PointerEvent) => {
      const el = e.target as HTMLElement;
      if (el.classList?.contains('tilt')) { el.style.setProperty('--rx', '0deg'); el.style.setProperty('--ry', '0deg'); }
      if (el.classList?.contains('magnetic')) { el.style.setProperty('--tx', '0px'); el.style.setProperty('--ty', '0px'); }
    };
    if (fine) {
      document.addEventListener('pointermove', onMove, { passive: true });
      document.addEventListener('pointerout', onLeave, { passive: true });
      root.classList.add('fine');
    }

    return () => {
      io.disconnect(); mo.disconnect();
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerout', onLeave);
    };
  }, []);
}

/** Which of `count` equal chapters a pinned section is in. Re-renders only when the chapter changes. */
export function useChapter<T extends HTMLElement>(count: number) {
  const ref = useRef<T>(null);
  const [chapter, setChapter] = useState(0);
  useEffect(() => {
    let frame = 0;
    const read = () => {
      frame = 0;
      if (!ref.current) return;
      const next = Math.min(count - 1, Math.floor(pinProgress(ref.current) * count));
      setChapter((c) => (c === next ? c : next));
    };
    const on = () => { if (!frame) frame = requestAnimationFrame(read); };
    read();
    window.addEventListener('scroll', on, { passive: true });
    window.addEventListener('resize', on);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', on);
      window.removeEventListener('resize', on);
    };
  }, [count]);
  return [ref, chapter] as const;
}

/** Counts up to `to` the first time it is seen. The final number is what renders without motion. */
export function useCountUp(to: number | null, ms = 1400) {
  const ref = useRef<HTMLElement>(null);
  const [shown, setShown] = useState<number | null>(() => (reducedMotion() ? to : 0));
  useEffect(() => {
    if (to === null || reducedMotion() || !ref.current) { setShown(to); return; }
    let raf = 0;
    const io = new IntersectionObserver(([e]) => {
      if (!e?.isIntersecting) return;
      io.disconnect();
      const start = performance.now();
      const tick = (now: number) => {
        const k = Math.min(1, (now - start) / ms);
        setShown(Math.round(to * (1 - Math.pow(1 - k, 3))));
        if (k < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, { threshold: 0.6 });
    io.observe(ref.current);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
  }, [to, ms]);
  return [ref, shown] as const;
}
