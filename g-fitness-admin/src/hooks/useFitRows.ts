import { useCallback, useState } from 'react';

/** The width from which the "fit" pages hold the screen (rd-fit in index.css). */
export const FIT_MIN_WIDTH = 1280;

/**
 * As many table rows as the box has room for — the owner asked for pages that
 * fit the screen with no page scroll (2026-10-11), so a table's page size is
 * the height of its scroll box (less the header row) over a row's height.
 *
 * A callback ref, observed by one ResizeObserver (no state set during render);
 * the **median** row height, so one taller row does not shrink the page. Below
 * FIT_MIN_WIDTH the page flows normally, the box has no fixed height, and the
 * page size stays at `fallback` (measuring there would feed back on itself).
 */
export function useFitRows(fallback = 10, min = 3) {
  const [perPage, setPerPage] = useState(fallback);
  /** Each row's height so the rows fill the box exactly — no strip of dead space under the last one. */
  const [rowHeight, setRowHeight] = useState<number | undefined>(undefined);
  const ref = useCallback((el: HTMLElement | null) => {
    if (!el) return;
    const measure = () => {
      if (window.innerWidth < FIT_MIN_WIDTH) { setPerPage((p) => (p === fallback ? p : fallback)); setRowHeight(undefined); return; }
      const head = el.querySelector('thead');
      const hh = head ? head.getBoundingClientRect().height : 0;
      const heights = [...el.querySelectorAll('tbody tr')].map((r) => r.getBoundingClientRect().height).filter((x) => x > 20).sort((a, b) => a - b);
      // The natural height (the median of the rows before any stretching was applied).
      const natural = Number(el.dataset.naturalRow) || (heights.length ? heights[Math.floor(heights.length / 2)] : 64);
      if (!el.dataset.naturalRow && heights.length) el.dataset.naturalRow = String(natural);
      const room = el.clientHeight - hh;
      const n = Math.max(min, Math.floor(room / natural));
      setPerPage((p) => (p === n ? p : n));
      const h = Math.floor(room / n);
      setRowHeight((r) => (r === h ? r : h));
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    const body = el.querySelector('tbody');
    if (body) ro.observe(body);
    window.addEventListener('resize', measure);
    measure();
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); };
  }, [fallback, min]);
  return { ref, perPage, rowHeight };
}
