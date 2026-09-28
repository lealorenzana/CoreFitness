import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { actionTip } from '../../lib/actionTips';

/**
 * One tooltip for the whole admin app.
 *
 * ## What it shows
 *
 * - **`data-tip`** — the explicit explanation. Adding one anywhere is one attribute.
 * - **`title`** — adopted on first hover (moved to `data-tip`). There were 200+
 *   of these, rendered by the browser in the operating system's own style — a
 *   light box on a dark dashboard, after a second, never for the keyboard. Now
 *   they all read like the rest of the app, with no edit to the 200 places.
 * - **An icon-only button or link's `aria-label`** — a bell, an X, a pencil has
 *   a name for a screen reader and, until now, nothing for someone looking at
 *   it. If the element has no visible text, its accessible name is its tip.
 *
 * ## Why one listener and not a wrapper
 *
 * `<Tooltip>` around every control means touching every control, and a wrapper
 * that clones its child to attach handlers quietly eats an `onClick` or a
 * `ref`. This listens once, on the document, and finds the nearest candidate
 * ancestor of whatever was hovered or focused.
 *
 * ## The rules it follows
 *
 * - Focus shows it immediately, hover waits a moment.
 * - It never intercepts a click (`pointer-events: none`).
 * - It follows the element, not the pointer, so it does not jitter.
 * - Escape, scroll and resize dismiss it.
 */

const LAYER = 500;
const GAP = 8;
const DELAY = 300;
const CANDIDATE = '[data-tip],[title],button,a[aria-label],[role="button"][aria-label]';

interface Tip { text: string; x: number; y: number; place: 'top' | 'bottom' }

/** The element to explain, adopting a `title` or a text-less control's name on the way. */
function explainable(from: EventTarget | null): HTMLElement | null {
  let el = (from as Element | null)?.closest?.(CANDIDATE) as HTMLElement | null;
  while (el) {
    const title = el.getAttribute('title');
    if (title) {
      el.setAttribute('data-tip', title);
      el.removeAttribute('title');
      if (!el.getAttribute('aria-label') && !el.textContent?.trim()) el.setAttribute('aria-label', title);
    }
    if (el.getAttribute('data-tip')) return el;
    const label = el.getAttribute('aria-label');
    // A labelled control that shows its own words needs no tooltip saying them again.
    if (label && !el.textContent?.trim()) { el.setAttribute('data-tip', label); return el; }
    // A button whose words say what it is, and a glossary sentence says what it does.
    if (el.tagName === 'BUTTON') {
      const said = actionTip(el.textContent ?? '');
      if (said) { el.setAttribute('data-tip', said); return el; }
    }
    el = el.parentElement?.closest?.(CANDIDATE) as HTMLElement | null;
  }
  return null;
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
      if (r.width === 0 && r.height === 0) return null;
      const place: 'top' | 'bottom' = r.top < 46 ? 'bottom' : 'top';
      return {
        text,
        x: Math.min(Math.max(r.left + r.width / 2, 150), window.innerWidth - 150),
        y: place === 'top' ? r.top - GAP : r.bottom + GAP,
        place,
      };
    };
    const open = (el: HTMLElement, immediate: boolean) => {
      window.clearTimeout(timer);
      anchor = el;
      const run = () => { const next = anchor ? measure(anchor) : null; if (next) setTip(next); };
      if (immediate) run(); else timer = window.setTimeout(run, DELAY);
    };
    const close = () => { window.clearTimeout(timer); anchor = null; setTip(null); };

    const onOver = (e: MouseEvent) => {
      const el = explainable(e.target);
      if (!el) { if (anchor) close(); return; }
      if (el !== anchor) open(el, false);
    };
    const onOut = (e: MouseEvent) => {
      const to = e.relatedTarget as Element | null;
      if (!to || !anchor?.contains(to)) { if (!to?.closest?.(CANDIDATE)) close(); }
    };
    const onFocus = (e: FocusEvent) => { const el = explainable(e.target); if (el) open(el, true); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };

    document.addEventListener('mouseover', onOver);
    document.addEventListener('mouseout', onOut);
    document.addEventListener('focusin', onFocus);
    document.addEventListener('focusout', close);
    document.addEventListener('click', close, true);
    document.addEventListener('keydown', onKey);
    document.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('mouseover', onOver);
      document.removeEventListener('mouseout', onOut);
      document.removeEventListener('focusin', onFocus);
      document.removeEventListener('focusout', close);
      document.removeEventListener('click', close, true);
      document.removeEventListener('keydown', onKey);
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
        maxWidth: 300,
        padding: '7px 10px',
        borderRadius: 9,
        background: 'var(--color-surface-high)',
        border: '1px solid rgba(124,58,237,0.35)',
        boxShadow: '0 10px 28px rgba(0,0,0,0.6)',
        color: 'var(--color-text-primary, #fff)',
        fontSize: 11.5,
        lineHeight: 1.45,
        whiteSpace: 'pre-line',
      }}
    >
      {tip.text}
    </div>,
    document.body
  );
}
