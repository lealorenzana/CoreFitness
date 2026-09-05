import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * One tooltip for the whole admin app, driven by `data-tip`.
 *
 * ## Why not the `title` attribute
 *
 * Dozens of controls already carried an explanation as `title="…"`. The browser
 * renders that in the operating system's own style — a light box on a dark
 * dashboard — after roughly a second, and never for anyone navigating by
 * keyboard. So the text existed and was, in practice, unreadable: too slow for
 * the person scanning, wrong-looking when it did appear, and absent for anyone
 * not using a mouse.
 *
 * ## Why not a wrapper component
 *
 * `<Tooltip>` around every control means touching every control, and a wrapper
 * that clones its child to attach handlers is the kind of thing that quietly
 * eats an `onClick` or a `ref`. This listens once, on the document, and finds
 * the nearest `[data-tip]` ancestor of whatever was hovered or focused. Adding
 * a tooltip anywhere in the app is then one attribute, and it works on elements
 * rendered by components this file has never heard of.
 *
 * `Tooltip.tsx` remains for the rarer case where the text is a React node
 * rather than a string.
 *
 * ## The rules it follows
 *
 * - **Focus shows it immediately, hover waits.** A keyboard user has already
 *   committed to the control; a mouse passing over one has not.
 * - **It never intercepts a click.** `pointer-events: none`, so it cannot come
 *   between you and the button it is describing.
 * - **It follows the element, not the pointer**, so it does not jitter.
 * - **Escape and scroll dismiss it**, because a tooltip anchored to something
 *   that has moved is worse than none.
 */

const LAYER = 500;
const GAP = 8;
const DELAY = 300;

interface Tip {
  text: string;
  x: number;
  y: number;
  place: 'top' | 'bottom';
}

export default function TooltipLayer() {
  const [tip, setTip] = useState<Tip | null>(null);

  useEffect(() => {
    let timer: number | undefined;
    let anchor: HTMLElement | null = null;

    const measure = (el: HTMLElement): Tip | null => {
      const text = el.getAttribute('data-tip');
      if (!text) return null;
      const r = el.getBoundingClientRect();
      // Nothing to point at — the element is scrolled out or display:none.
      if (r.width === 0 && r.height === 0) return null;
      // Flip below when there is no room above. 46px is a two-line box plus gap.
      const place: 'top' | 'bottom' = r.top < 46 ? 'bottom' : 'top';
      return {
        text,
        x: Math.min(Math.max(r.left + r.width / 2, 100), window.innerWidth - 100),
        y: place === 'top' ? r.top - GAP : r.bottom + GAP,
        place,
      };
    };

    const open = (el: HTMLElement, immediate: boolean) => {
      window.clearTimeout(timer);
      anchor = el;
      const run = () => {
        // Re-measure at fire time: the element may have moved during the delay.
        const next = anchor ? measure(anchor) : null;
        if (next) setTip(next);
      };
      if (immediate) run();
      else timer = window.setTimeout(run, DELAY);
    };

    const close = () => {
      window.clearTimeout(timer);
      anchor = null;
      setTip(null);
    };

    const onOver = (e: MouseEvent) => {
      const el = (e.target as HTMLElement | null)?.closest?.('[data-tip]') as HTMLElement | null;
      if (!el) { if (anchor) close(); return; }
      if (el === anchor) return;
      open(el, false);
    };

    const onFocus = (e: FocusEvent) => {
      const el = (e.target as HTMLElement | null)?.closest?.('[data-tip]') as HTMLElement | null;
      if (el) open(el, true);
    };

    // A click means the control is doing its job; the explanation is spent, and
    // leaving it hanging over the modal that just opened is litter.
    document.addEventListener('mouseover', onOver);
    document.addEventListener('mouseout', (e) => {
      const to = (e as MouseEvent).relatedTarget as HTMLElement | null;
      if (!to?.closest?.('[data-tip]')) close();
    });
    document.addEventListener('focusin', onFocus);
    document.addEventListener('focusout', close);
    document.addEventListener('click', close, true);
    document.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Escape') close();
    });
    // Capture phase: a tooltip anchored to a row that has scrolled away points
    // at nothing, and inner scrollers do not bubble their scroll event.
    document.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);

    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('mouseover', onOver);
      document.removeEventListener('focusin', onFocus);
      document.removeEventListener('focusout', close);
      document.removeEventListener('click', close, true);
      document.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, []);

  if (!tip) return null;

  return createPortal(
    <div
      role="tooltip"
      className="fixed pointer-events-none"
      style={{
        zIndex: LAYER,
        left: tip.x,
        top: tip.y,
        transform: `translate(-50%, ${tip.place === 'top' ? '-100%' : '0'})`,
        maxWidth: 280,
        padding: '6px 9px',
        borderRadius: 8,
        background: 'var(--color-surface-high)',
        border: '1px solid var(--color-border)',
        boxShadow: '0 6px 20px rgba(0,0,0,0.55)',
        color: 'var(--color-text-secondary)',
        fontSize: 11,
        lineHeight: 1.45,
      }}
    >
      {tip.text}
    </div>,
    document.body
  );
}
