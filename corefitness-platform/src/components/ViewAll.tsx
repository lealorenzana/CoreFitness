import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Maximize2, Search, X } from 'lucide-react';

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
/** A box with more than it shows; `show` = its list area is too short to read (a sliver), so the list hides and a
 *  centred Show all takes its place (the owner, 2026-11-08: "a button show all, not a scroll with little space"). */
interface Spot { el: HTMLElement; top: number; right: number; show?: { top: number; left: number; width: number; height: number; n: number } }
/** Below this a list area shows a sliver, not a list. */
const SLIVER = 150;
/** A box's heading — kept visible in a compact box and pinned in a scrolling one. */
const HEADS = '.section-title, .card-head, .ov-head';

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
  /** What to find in the open window (the owner, 2026-11-08: "a search bar to easily find something"). */
  const [q, setQ] = useState('');
  const [shown, setShown] = useState<{ n: number; of: number } | null>(null);
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
        const wasCompact = el.dataset.vaCompact !== undefined;
        if (el.scrollHeight <= el.clientHeight + 12 || el.clientHeight < 24) { if (wasCompact) delete el.dataset.vaCompact; if (el.dataset.vaScrolls !== undefined) delete el.dataset.vaScrolls; continue; }
        const oy = getComputedStyle(el).overflowY;
        // A compacted box is overflow:hidden by our own rule — it still scrolls in truth, so it keeps its Show all.
        if (oy !== 'auto' && oy !== 'scroll' && !wasCompact) continue;
        // A column of several boxes (a side rail) keeps its own scroll, as the owner asked: only a single box is fitted.
        if (el.querySelectorAll(boxes).length > 1 || el.closest('[data-va-keep]')) continue;
        // A box that scrolls keeps its heading (and the search under it) in place while the rows move (the owner,
        // 2026-11-08: "the top should stay along with the search while the contents are scrollable"). CSS does the rest.
        el.dataset.vaScrolls = '';
        const need = Math.floor((el.clientHeight / el.scrollHeight) * 100) / 100;
        // A sliver: no fitting, no scroll — the list hides (visibility, so the box keeps its size) and Show all sits on it.
        // Shrinking a little to fit comes first (a meter or a chart a few pixels too tall stays on screen); only a box
        // that cannot fit even at MIN_FIT becomes Show all.
        if (el.clientHeight < SLIVER && !el.querySelector('input, textarea, select') && !(fit && need >= MIN_FIT && !scrolls(el))) {
          el.dataset.vaCompact = '';
          const box = (el.closest(boxes) as HTMLElement | null) ?? el;
          if (!area.contains(box) || box.classList.contains(FLOAT) || found.has(box)) continue;
          const r = el.getBoundingClientRect(), b = box.getBoundingClientRect();
          if (b.width < 160 || b.bottom < 0 || b.top > innerHeight) continue;
          // The box's own heading stays readable (2026-11-08: a card that was its own scroller went blank, title and
          // all): Show all sits under the heading, and counts only what is below it.
          const headEl = el.firstElementChild as HTMLElement | null;
          const head = headEl && headEl.matches(HEADS) ? headEl : null;
          const hb = head ? head.getBoundingClientRect().bottom - r.top : 0;
          const kids = head ? el.childElementCount - 1 : el.childElementCount;
          const list = kids > 1 ? el : ((head ? head.nextElementSibling : el.firstElementChild) as HTMLElement | null) ?? el;
          const n = list === el ? kids : list.childElementCount;
          found.set(box, { el: box, top: 0, right: 0, show: { top: r.top + hb, left: r.left, width: r.width, height: r.height - hb, n } });
          continue;
        }
        if (wasCompact) delete el.dataset.vaCompact;
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
        // A heading that already has buttons at its right (Open the site, Write to the owner, CSV): View all sits to
        // their left, on the same line, instead of on top of them (2026-11-08).
        const head = box.querySelector<HTMLElement>(HEADS);
        const btns = head ? Array.from(head.querySelectorAll<HTMLElement>('button, a')).filter((b) => b.getBoundingClientRect().width > 0) : [];
        if (btns.length) {
          const left = Math.min(...btns.map((b) => b.getBoundingClientRect().left));
          const bt = btns[0].getBoundingClientRect();
          found.set(box, { el: box, top: Math.max(bt.top + (bt.height - 24) / 2, 0), right: innerWidth - left + 8 });
        } else {
          found.set(box, { el: box, top: Math.max(r.top, 0) + 12, right: innerWidth - r.right + 14 });
        }
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

  // The window's list: the element inside it with the most children. Rows that do not contain every word hide.
  useEffect(() => {
    if (!open) return;
    let list: HTMLElement = open, most = 0;
    for (const n of [open, ...Array.from(open.querySelectorAll<HTMLElement>('*'))]) {
      if (n.childElementCount > most) { most = n.childElementCount; list = n; }
    }
    const rows = Array.from(list.children) as HTMLElement[];
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    let n = 0;
    for (const r of rows) {
      const hit = words.every((w) => (r.textContent ?? '').toLowerCase().includes(w));
      if (hit) { r.style.removeProperty('display'); n++; } else r.style.setProperty('display', 'none');
    }
    setShown(words.length ? { n, of: rows.length } : null);
    return () => { for (const r of rows) r.style.removeProperty('display'); };
  }, [open, q]);

  const close = useCallback(() => {
    document.querySelectorAll('.va-hole').forEach((n) => n.remove());
    requestAnimationFrame(() => scan());
    setOpen((el) => { el?.classList.remove(FLOAT); return null; });
    document.body.classList.remove('va-open');
    setQ('');
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
    el.querySelectorAll<HTMLElement>('[data-va-compact]').forEach((n) => { delete n.dataset.vaCompact; });
    el.classList.add(FLOAT);
    el.scrollTop = 0;
    document.body.classList.add('va-open');
    setOpen(el);
  };

  return createPortal(
    <>
      {!open && spots.map((s, i) => s.show ? (
        <button key={i} type="button" className="va-show" style={{ top: s.show.top, left: s.show.left, width: s.show.width, height: s.show.height }}
          onClick={() => lift(s.el)} aria-label="Show all of this box" data-va-show>
          <span><Maximize2 size={14} /> Show all{s.show.n > 1 ? ` (${s.show.n})` : ''}</span>
        </button>
      ) : (
        <button key={i} type="button" className="va-btn" style={{ top: s.top, right: s.right }} onClick={() => lift(s.el)}
          aria-label="View all of this box" data-va>
          <Maximize2 size={12} /> View all
        </button>
      ))}
      {open && (
        <>
          <div className="va-backdrop" onClick={close} />
          <label className="va-search" data-va-search>
            <Search size={15} />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find in this list…" aria-label="Find in this list" />
            {shown && <span className="va-search__n">{shown.n} of {shown.of}</span>}
          </label>
          <button type="button" className="va-close" onClick={close} aria-label="Close the full view" data-va-close>
            <X size={16} /> Close
          </button>
        </>
      )}
    </>,
    document.body,
  );
}
