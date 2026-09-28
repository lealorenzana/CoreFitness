import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * One tooltip for the whole platform app — the admin app's TooltipLayer, with
 * one addition: a plain `title="…"` is adopted the first time it is hovered
 * (moved to `data-tip`), so every chart bar, chip and badge that already
 * explained itself does so in the app's own style instead of the operating
 * system's slow grey box. Adding a tooltip anywhere is one attribute.
 *
 * Focus shows it at once, hover after a moment; it never takes a click
 * (pointer-events: none); it is anchored to the element, not the pointer; Esc,
 * scroll and resize dismiss it.
 */
const GAP = 8;
const DELAY = 280;
interface Tip { text: string; x: number; y: number; place: 'top' | 'bottom' }

const target = (from: EventTarget | null): HTMLElement | null => {
  const el = (from as Element | null)?.closest?.('[data-tip],[title]') as HTMLElement | null;
  if (!el) return null;
  const title = el.getAttribute('title');
  if (title) {
    el.setAttribute('data-tip', title);
    el.removeAttribute('title');
    if (!el.getAttribute('aria-label') && !el.textContent?.trim()) el.setAttribute('aria-label', title);
  }
  return el.getAttribute('data-tip') ? el : null;
};

export default function TooltipLayer() {
  const [tip, setTip] = useState<Tip | null>(null);

  useEffect(() => {
    let timer: number | undefined;
    let anchor: HTMLElement | null = null;
    const measure = (el: HTMLElement): Tip | null => {
      const text = el.getAttribute('data-tip');
      const r = el.getBoundingClientRect();
      if (!text || (r.width === 0 && r.height === 0)) return null;
      const place: 'top' | 'bottom' = r.top < 60 ? 'bottom' : 'top';
      return { text, x: Math.min(Math.max(r.left + r.width / 2, 150), window.innerWidth - 150),
        y: place === 'top' ? r.top - GAP : r.bottom + GAP, place };
    };
    const open = (el: HTMLElement, now: boolean) => {
      window.clearTimeout(timer);
      anchor = el;
      const run = () => { const t = anchor ? measure(anchor) : null; if (t) setTip(t); };
      if (now) run(); else timer = window.setTimeout(run, DELAY);
    };
    const close = () => { window.clearTimeout(timer); anchor = null; setTip(null); };
    const onOver = (e: MouseEvent) => {
      const el = target(e.target);
      if (!el) { if (anchor) close(); return; }
      if (el !== anchor) open(el, false);
    };
    const onOut = (e: MouseEvent) => { if (!(e.relatedTarget as Element | null)?.closest?.('[data-tip],[title]')) close(); };
    const onFocus = (e: FocusEvent) => { const el = target(e.target); if (el) open(el, true); };
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
    <div role="tooltip" className={`tip tip-${tip.place}`} style={{ left: tip.x, top: tip.y }}>{tip.text}</div>,
    document.body,
  );
}
