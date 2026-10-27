import { useEffect, useRef, useState } from 'react';
import confetti from 'canvas-confetti';

/**
 * The pieces every big moment is built from (wave 1, 2026-10-27).
 *
 * Motion is CSS classes added on a timer (index.css `mo-*`), never a value that
 * only reaches its end if animation frames keep coming — a page that stops
 * compositing (backgrounded, a weak phone) still lands on the finished state.
 * `still` (the phone asks for less motion) skips straight to it.
 */

/** Which step of a moment is showing: steps[i] is the delay before step i+1. */
export function useSteps(delays: number[], still: boolean, onStep?: (step: number) => void): number {
  const [step, setStep] = useState(still ? delays.length : 0);
  const cb = useRef(onStep);
  useEffect(() => { cb.current = onStep; }, [onStep]);
  useEffect(() => {
    if (still) return;
    const timers: number[] = [];
    let at = 0;
    delays.forEach((d, i) => {
      at += d;
      timers.push(window.setTimeout(() => { setStep(i + 1); cb.current?.(i + 1); }, at));
    });
    return () => timers.forEach(clearTimeout);
    // The delays are a constant per moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [still]);
  return step;
}

/** `className` plus `on` once the moment has reached `at`. */
export const on = (step: number, at: number, cls = 'mo-in') => `${cls}${step >= at ? ' on' : ''}`;

/**
 * A number that counts from `from` to `to` once `active`. Frames drive the
 * count, and a timer sets the end value regardless — so it never stops short.
 */
export function useCountUp(to: number, active: boolean, still: boolean, opts: { from?: number; ms?: number; onTick?: (v: number) => void } = {}): number {
  const { from = 0, ms = 600 } = opts;
  const [v, setV] = useState(still ? to : from);
  const tick = useRef(opts.onTick);
  useEffect(() => { tick.current = opts.onTick; }, [opts.onTick]);
  useEffect(() => {
    if (!active || still) return;
    let raf = 0, last = from;
    const t0 = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / ms);
      const next = Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3)));
      if (next !== last) { last = next; setV(next); tick.current?.(next); }
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    const end = window.setTimeout(() => setV(to), ms + 80);
    return () => { cancelAnimationFrame(raf); clearTimeout(end); };
  }, [active, still, from, to, ms]);
  return still ? to : v;
}

/** Confetti on a canvas inside the moment, in the gym's own colours. */
export function useConfetti(still: boolean) {
  const ref = useRef<HTMLCanvasElement>(null);
  const fire = useRef<confetti.CreateTypes | null>(null);
  useEffect(() => {
    if (!ref.current || still) return;
    fire.current = confetti.create(ref.current, { resize: true, useWorker: false });
    return () => { fire.current?.reset(); fire.current = null; };
  }, [still]);
  const burst = (y = 0.35, n = 90) => {
    const f = fire.current;
    if (!f) return;
    const cs = getComputedStyle(document.documentElement);
    const colors = ['--color-primary', '--color-primary-300', '--color-secondary']
      .map((k) => cs.getPropertyValue(k).trim()).filter(Boolean).concat('#ffffff');
    void f({ particleCount: n, spread: 75, startVelocity: 38, origin: { y }, colors, scalar: 0.9, ticks: 180 });
    window.setTimeout(() => void f({ particleCount: Math.round(n / 2), spread: 110, startVelocity: 28, origin: { y }, colors, scalar: 0.8, ticks: 160 }), 160);
  };
  return { ref, burst };
}

