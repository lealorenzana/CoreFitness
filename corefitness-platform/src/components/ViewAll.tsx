import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Maximize2, X } from 'lucide-react';

/**
 * "View all" for any box that has more than it can show (2026-11-02, the owner's ask).
 *
 * Every page fits the screen, so a long box scrolls inside itself — and a small
 * box with its own scrollbar is hard to read. This layer finds those boxes on
 * any page (no page has to opt in), puts a View all button on each, and lifts
 * the box itself out as a large floating window over the page: the same
 * element, so its buttons, inputs and state keep working. Esc, ✕ or a click
 * outside puts it back. Nothing is cloned and nothing navigates.
 *
 * `boxes`: what counts as a box (the scroll area's nearest match is lifted).
 * `root`: where to look.
 */
interface Spot { el: HTMLElement; top: number; right: number }

const FLOAT = 'va-floating';
/** The smallest a reading box is shrunk to (2026-11-02) — below it the text stops being readable, so it scrolls. */
const MIN_FIT = 0.6;

/**
 * Something you work through, not just read: a form, or a long list (8+ rows side by side in one parent).
 * Those keep their scroll; a box that is only for reading is fitted instead (the owner's rule).
 */
function scrolls(el: HTMLElement): boolean {
  if (el.querySelector('input, textarea, select')) return true;
  let most = 0;
  for (const n of [el, ...Array.from(el.querySelectorAll<HTMLElement>('*'))]) {
    if (n.childElementCount > most) most = n.childElementCount;
    if (most >= 8) return true;
  }
  return false;
}

/** Put a fitted box back to its own size. */
function unfit(el: HTMLElement) {
  if (el.dataset.vaFit === undefined) return;
  for (const c of Array.from(el.children) as HTMLElement[]) c.style.removeProperty('zoom');
  el.style.removeProperty('overflow-y');
  delete el.dataset.vaFit;
}

export default function ViewAll({ boxes, root, fit = false }: { boxes: string; root: string; fit?: boolean }) {
  const [spots, setSpots] = useState<Spot[]>([]);
  const [open, setOpen] = useState<HTMLElement | null>(null);
  const frame = useRef(0);

  const scan = useCallback(() => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const area = document.querySelector(root);
      if (!area) { setSpots([]); return; }
      const found = new Map<HTMLElement, Spot>();
      for (const el of area.querySelectorAll<HTMLElement>('*')) {
        if (el === area || el.closest('.' + FLOAT)) continue; // never the page itself, nor the open window
        // `fit`: a box with more than it shows has its contents shrunk to fit — no scrollbar — and keeps
        // View all for the full size. Re-measured each pass, so new rows (or fewer) are fitted again.
        const wasFit = el.dataset.vaFit !== undefined;
        if (wasFit) unfit(el);
        if (el.scrollHeight <= el.clientHeight + 12 || el.clientHeight < 60) continue;
        const oy = getComputedStyle(el).overflowY;
        if (oy !== 'auto' && oy !== 'scroll') continue;
        // A column of several boxes (a side rail) keeps its own scroll, as the owner asked: only a single box is fitted.
        if (el.querySelectorAll(boxes).length > 1 || el.closest('[data-va-keep]')) continue;
        const need = Math.floor((el.clientHeight / el.scrollHeight) * 100) / 100;
        if (fit && need >= MIN_FIT && !scrolls(el)) {
          // Padding and gaps do not shrink with the contents, so step down until it really fits.
          let ratio = need;
          const kids = Array.from(el.children) as HTMLElement[];
          for (;;) {
            for (const c of kids) c.style.setProperty('zoom', String(ratio));
            if (el.scrollHeight <= el.clientHeight + 2 || ratio <= MIN_FIT) break;
            ratio = Math.max(MIN_FIT, Math.round((ratio - 0.03) * 100) / 100);
          }
          el.dataset.vaFit = String(ratio);
          el.style.setProperty('overflow-y', 'hidden');
          // Fitted, it shows everything: no View all (the owner's call). View all is for what still scrolls.
          if (el.scrollHeight <= el.clientHeight + 2) continue;
        }
        const box = (el.closest(boxes) as HTMLElement | null) ?? el;
        if (!area.contains(box) || box.classList.contains(FLOAT) || found.has(box)) continue;
        const r = box.getBoundingClientRect();
        if (r.width < 160 || r.bottom < 0 || r.top > innerHeight) continue;
        // The box's top-right corner, beside its title (2026-11-08): at the bottom it covered the page numbers.
        found.set(box, { el: box, top: Math.max(r.top, 0) + 12, right: innerWidth - r.right + 14 });
      }
      setSpots([...found.values()]);
    });
  }, [boxes, root]);

  useEffect(() => {
    scan();
    const mo = new MutationObserver(scan);
    mo.observe(document.body, { childList: true, subtree: true, characterData: true });
    addEventListener('resize', scan);
    addEventListener('scroll', scan, true);
    const t = setInterval(scan, 1500);
    return () => { mo.disconnect(); removeEventListener('resize', scan); removeEventListener('scroll', scan, true); clearInterval(t); cancelAnimationFrame(frame.current); };
  }, [scan]);

  const close = useCallback(() => {
    document.querySelectorAll('.va-hole').forEach((n) => n.remove());
    requestAnimationFrame(() => scan());
    setOpen((el) => { el?.classList.remove(FLOAT); return null; });
    document.body.classList.remove('va-open');
  }, [scan]);

  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    addEventListener('keydown', key);
    return () => removeEventListener('keydown', key);
  }, [open, close]);

  // A route change takes the floating box away with its page.
  useEffect(() => () => {
    document.querySelectorAll('.' + FLOAT).forEach((n) => n.classList.remove(FLOAT));
    document.querySelectorAll('.va-hole').forEach((n) => n.remove());
  }, []);
  useEffect(() => { if (open && !open.isConnected) close(); }, [spots, open, close]);

  const lift = (el: HTMLElement) => {
    // A same-size stand-in keeps its place, so nothing behind the window moves.
    const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    const hole = document.createElement('div');
    hole.className = 'va-hole';
    hole.style.cssText = `width:${r.width}px;height:${r.height}px;grid-column:${cs.gridColumn};grid-row:${cs.gridRow};flex:none;`;
    el.parentElement?.insertBefore(hole, el);
    // Full size in the window: undo the fitting inside it.
    unfit(el);
    el.querySelectorAll<HTMLElement>('[data-va-fit]').forEach(unfit);
    el.classList.add(FLOAT);
    el.scrollTop = 0;
    document.body.classList.add('va-open');
    setOpen(el);
  };

  return createPortal(
    <>
      {!open && spots.map((s, i) => (
        <button key={i} type="button" className="va-btn" style={{ top: s.top, right: s.right }} onClick={() => lift(s.el)}
          aria-label="View all of this box" data-va>
          <Maximize2 size={12} /> View all
        </button>
      ))}
      {open && (
        <>
          <div className="va-backdrop" onClick={close} />
          <button type="button" className="va-close" onClick={close} aria-label="Close the full view" data-va-close>
            <X size={16} /> Close
          </button>
        </>
      )}
    </>,
    document.body,
  );
}
