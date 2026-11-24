import { useCallback, useEffect, useRef } from 'react';

/**
 * Drag a bottom sheet by hand (the owner, 2026-11-11: "it has the handle, so it should slide to exit";
 * 2026-11-24: "slide-able up or down when held").
 *
 * Give the returned ref to the sheet panel. Works with a finger and with a mouse held down.
 *   - Down: the sheet follows; let go past 90px (or a quick flick) and it slides away and `onClose` runs,
 *     otherwise it springs back. A stretched sheet first drops back to its normal height.
 *   - Up: the sheet stretches to nearly the full screen (`data-expanded`, read by the sheet's `--sheet-max`).
 * A drag that starts inside a list scrolled away from its top scrolls the list instead, as on the phone's own
 * sheets; so does an upward drag inside a list that can scroll, once the sheet is already stretched. Fields never
 * drag. The entrance animation is switched off for the drag so it cannot pin the transform.
 * Reduced motion: no slide-away animation, it just closes.
 */
export function useSwipeToClose(onClose: () => void) {
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  const cleanup = useRef<(() => void) | null>(null);

  return useCallback((el: HTMLElement | null) => {
    cleanup.current?.();
    cleanup.current = null;
    if (!el) return;

    let startY = 0, startT = 0, dy = 0, active = false, decided = false, dir: 'down' | 'up' = 'down';
    let suppressClick = false;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const expanded = () => el.dataset.expanded === 'true';

    /** The scrolling list the touch is in, if any. */
    const scrollerOf = (t: EventTarget | null) => {
      for (let n = t as HTMLElement | null; n && n !== el; n = n.parentElement) {
        const oy = getComputedStyle(n).overflowY;
        if ((oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight) return n;
      }
      return null;
    };
    const isField = (t: EventTarget | null) => !!(t as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable="true"], [data-no-swipe]');
    let scroller: HTMLElement | null = null;

    const start = (y: number, target: EventTarget | null) => {
      scroller = scrollerOf(target);
      if (isField(target) || (scroller && scroller.scrollTop > 0)) { active = false; return; }
      startY = y; startT = performance.now(); dy = 0; active = true; decided = false;
    };
    /** Returns true when the sheet took the gesture (the caller then stops the page from scrolling). */
    const move = (y: number) => {
      if (!active) return false;
      const d = y - startY;
      if (!decided) {
        if (Math.abs(d) < 6) return false;
        decided = true;
        dir = d > 0 ? 'down' : 'up';
        // Up inside a list that can scroll, or up on a sheet already stretched: the content's to scroll.
        if (dir === 'up' && (expanded() || scroller)) { active = false; return false; }
        el.style.animation = 'none';
        el.style.transition = 'none';
      }
      dy = dir === 'down' ? Math.max(0, d) : Math.min(0, d);
      // Upward the sheet only gives a little (it grows on release); downward it follows the finger.
      el.style.transform = `translateY(${dir === 'down' ? dy : dy / 4}px)`;
      return true;
    };
    const end = () => {
      if (!active || !decided) { active = false; return; }
      active = false;
      suppressClick = true;
      const fast = Math.abs(dy) > 40 && Math.abs(dy) / Math.max(1, performance.now() - startT) > 0.6;
      const back = () => {
        el.style.transition = 'transform 220ms cubic-bezier(.2,.9,.3,1.2)';
        el.style.transform = 'translateY(0)';
      };
      if (dir === 'up') {
        if (dy < -40 || fast) el.dataset.expanded = 'true';
        back();
        return;
      }
      if (expanded() && (dy > 60 || fast) && dy < 220) { delete el.dataset.expanded; back(); return; }
      if (dy > 90 || fast) {
        if (still) { closeRef.current(); return; }
        el.style.transition = 'transform 180ms ease-in';
        el.style.transform = 'translateY(100%)';
        window.setTimeout(() => closeRef.current(), 170);
        return;
      }
      back();
    };

    // Finger.
    const onTouchStart = (e: TouchEvent) => { if (e.touches.length === 1) start(e.touches[0].clientY, e.target); else active = false; };
    const onTouchMove = (e: TouchEvent) => { if (move(e.touches[0].clientY) && e.cancelable) e.preventDefault(); };
    // Mouse, held down (a computer, or the browser preview).
    const onMouseMove = (e: MouseEvent) => { if (move(e.clientY)) e.preventDefault(); };
    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      end();
    };
    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      start(e.clientY, e.target);
      if (!active) return;
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    };
    // A drag that ends over a button must not also press it.
    const onClickCapture = (e: MouseEvent) => { if (suppressClick) { suppressClick = false; e.stopPropagation(); e.preventDefault(); } };
    const onPointerDown = () => { suppressClick = false; };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', end);
    el.addEventListener('touchcancel', end);
    el.addEventListener('mousedown', onMouseDown);
    el.addEventListener('pointerdown', onPointerDown, true);
    el.addEventListener('click', onClickCapture, true);
    cleanup.current = () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', end);
      el.removeEventListener('touchcancel', end);
      el.removeEventListener('mousedown', onMouseDown);
      el.removeEventListener('pointerdown', onPointerDown, true);
      el.removeEventListener('click', onClickCapture, true);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);
}
