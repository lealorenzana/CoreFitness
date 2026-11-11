import { useCallback, useEffect, useRef } from 'react';

/**
 * Drag a bottom sheet down to close it (the owner, 2026-11-11: "it has the handle, so it should slide to exit").
 *
 * Give the returned ref to the sheet panel. A downward drag that starts on the sheet follows the finger; let go past
 * 90px (or with a quick flick) and it slides away and `onClose` runs, otherwise it springs back. A drag that starts
 * inside a list scrolled away from its top scrolls the list instead — the sheet only moves once the content is at
 * its top, as on the phone's own sheets. The sheet's entrance animation (`noc-sheet`, fill-mode both) would pin its
 * transform, so it is switched off for the drag. Reduced motion: no slide-away animation, it just closes.
 */
export function useSwipeToClose(onClose: () => void) {
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  const cleanup = useRef<(() => void) | null>(null);

  return useCallback((el: HTMLElement | null) => {
    cleanup.current?.();
    cleanup.current = null;
    if (!el) return;

    let startY = 0, startT = 0, dy = 0, active = false, decided = false;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /** Is there a scrolled-down list between the touch and the sheet? Then the finger scrolls it. */
    const insideScrolled = (t: EventTarget | null) => {
      for (let n = t as HTMLElement | null; n && n !== el; n = n.parentElement) {
        const oy = getComputedStyle(n).overflowY;
        if ((oy === 'auto' || oy === 'scroll') && n.scrollTop > 0) return true;
      }
      return false;
    };
    const isField = (t: EventTarget | null) => !!(t as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable="true"], [data-no-swipe]');

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1 || isField(e.target) || insideScrolled(e.target)) { active = false; return; }
      startY = e.touches[0].clientY; startT = performance.now(); dy = 0; active = true; decided = false;
    };
    const onMove = (e: TouchEvent) => {
      if (!active) return;
      const d = e.touches[0].clientY - startY;
      if (!decided) {
        if (Math.abs(d) < 6) return;
        decided = true;
        if (d < 0) { active = false; return; }      // upward: the content's to scroll
        el.style.animation = 'none';
        el.style.transition = 'none';
      }
      dy = Math.max(0, d);
      el.style.transform = `translateY(${dy}px)`;
      if (e.cancelable) e.preventDefault();          // the sheet moves, not the page behind it
    };
    const onEnd = () => {
      if (!active || !decided) { active = false; return; }
      active = false;
      const fast = dy > 40 && dy / Math.max(1, performance.now() - startT) > 0.6;
      if (dy > 90 || fast) {
        if (still) { closeRef.current(); return; }
        el.style.transition = 'transform 180ms ease-in';
        el.style.transform = 'translateY(100%)';
        window.setTimeout(() => closeRef.current(), 170);
      } else {
        el.style.transition = 'transform 220ms cubic-bezier(.2,.9,.3,1.2)';
        el.style.transform = 'translateY(0)';
      }
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onEnd);
    cleanup.current = () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, []);
}
