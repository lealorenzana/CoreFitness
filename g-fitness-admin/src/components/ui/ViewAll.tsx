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

export default function ViewAll({ boxes, root }: { boxes: string; root: string }) {
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
        if (el === area || el.scrollHeight <= el.clientHeight + 12 || el.clientHeight < 60) continue; // never the page itself
        const oy = getComputedStyle(el).overflowY;
        if (oy !== 'auto' && oy !== 'scroll') continue;
        const box = (el.closest(boxes) as HTMLElement | null) ?? el;
        if (!area.contains(box) || box.classList.contains(FLOAT) || found.has(box)) continue;
        const r = box.getBoundingClientRect();
        if (r.width < 160 || r.bottom < 0 || r.top > innerHeight) continue;
        found.set(box, { el: box, top: Math.min(r.bottom, innerHeight) - 34, right: innerWidth - r.right + 14 });
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
    setOpen((el) => { el?.classList.remove(FLOAT); return null; });
    document.body.classList.remove('va-open');
  }, []);

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
