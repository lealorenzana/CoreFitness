import { useCallback, useRef, useState } from 'react';

/**
 * As many cards a page as the grid has room for (2026-11-08): Gyms showed nine cards — three rows, 944px — in a
 * 533px box, so the last row was cut and the grid scrolled inside itself. Columns are read from the grid's own
 * columns, the row height from the tallest card (every gym card reserves its warning line, so all are one height
 * and the page size is the same on every page), and the page is columns × the rows that fit. Re-measured when the
 * box or a card changes size and when cards come or go. Below 1280px the page scrolls and `fallback` is used.
 */
export function useFitCards(fallback = 9) {
  const [perPage, setPerPage] = useState(fallback);
  const watchers = useRef<{ ro: ResizeObserver; mo: MutationObserver } | null>(null);
  const ref = useCallback((el: HTMLElement | null) => {
    watchers.current?.ro.disconnect();
    watchers.current?.mo.disconnect();
    watchers.current = null;
    if (!el) return;
    const measure = () => {
      if (window.innerWidth < 1280) { setPerPage((p) => (p === fallback ? p : fallback)); return; }
      const cards = Array.from(el.children) as HTMLElement[];
      if (!cards.length) return;
      for (const c of cards) watchers.current?.ro.observe(c);
      const cs = getComputedStyle(el);
      const cols = Math.max(1, cs.gridTemplateColumns.split(' ').filter(Boolean).length);
      const gap = parseFloat(cs.rowGap) || 0;
      const cardH = Math.max(...cards.map((c) => c.getBoundingClientRect().height));
      if (cardH < 40) return;
      const rows = Math.max(1, Math.floor((el.clientHeight + gap) / (cardH + gap)));
      const n = cols * rows;
      setPerPage((p) => (p === n ? p : n));
    };
    const ro = new ResizeObserver(measure);
    const mo = new MutationObserver(measure);
    watchers.current = { ro, mo };
    ro.observe(el);
    mo.observe(el, { childList: true });
    measure();
  }, [fallback]);
  return { ref, perPage };
}
