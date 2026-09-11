import { useCallback, useState } from 'react';

/**
 * How many tiles fill the space a card grid has been given — whole rows only.
 *
 * Pass `measure` as the `ref` of the element that owns the space: a `flex-1 min-h-0` box
 * whose **first child is the grid**. The box must get its height from the page
 * around it, never from its own content, or the count would chase itself.
 *
 * A fixed page size is ragged or short on almost every screen. Twelve tiles
 * on a five-column grid is 5 + 5 + 2 with a screen of nothing underneath;
 * the column count follows the window, and the room below follows its height.
 * So both are read off the real layout: columns from the grid's own template,
 * rows from the box's height divided by a tile's height plus the gap.
 *
 * - **The median tile, not the first or the tallest.** A tile with an extra
 *   chip stands taller; dividing by it loses a row on every screen. The box
 *   scrolls rather than clips when a tall row lands on a page — give it
 *   `overflow-y-auto` and a stable scrollbar gutter, so a scrollbar appearing
 *   cannot change the column count and set the count chasing itself.
 * - **Measured in a ResizeObserver on a ref callback**, not an effect: it fires
 *   on a resize and when the grid's own size changes as tiles arrive, and
 *   nothing sets state during a render. React 19 calls the returned cleanup.
 * - **`fallback` until the first measurement**, so the first paint has tiles to
 *   measure at all.
 *
 * Pair it with `usePaged`, which clamps the page number on render, so a window
 * that grows and shrinks the page count never strands anyone on a page that
 * no longer exists.
 *
 * **`tileHeight`, for tiles that stretch.** A grid whose rows share the height
 * (`repeat(rows, 1fr)`) has tiles as tall as the space allows, so measuring one
 * would only ever report the current row count back — it could lose a row and
 * never win one again. Such a grid passes the tile's *smallest* comfortable
 * height instead, and uses the returned `rows` for its template.
 */
export function useFillGrid(fallback = 12, minRows = 1, tileHeight?: number) {
  const [fit, setFit] = useState<{ cols: number; rows: number } | null>(null);

  const measure = useCallback((area: HTMLElement | null) => {
    if (!area) return;
    const measure = () => {
      const grid = area.firstElementChild as HTMLElement | null;
      if (!grid) return;
      const style = getComputedStyle(grid);
      const cols = style.gridTemplateColumns.split(' ').filter(Boolean).length;
      const gap = parseFloat(style.rowGap) || 0;
      const heights = [...grid.children]
        .map((c) => c.getBoundingClientRect().height)
        .filter((h) => h > 0)
        .sort((a, b) => a - b);
      if (!cols || (!heights.length && tileHeight == null)) return;
      const tile = tileHeight ?? heights[Math.floor(heights.length / 2)];
      const rows = Math.max(minRows, Math.floor((area.clientHeight + gap) / (tile + gap)));
      setFit((prev) => (prev && prev.cols === cols && prev.rows === rows ? prev : { cols, rows }));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(area);
    if (area.firstElementChild) observer.observe(area.firstElementChild);
    return () => observer.disconnect();
  }, [minRows, tileHeight]);

  // Named `measure`, not `ref`: the React Compiler lint treats a property
  // called `ref` as a ref object and refuses to let a render read it.
  return {
    measure,
    perPage: fit ? fit.cols * fit.rows : fallback,
    rows: fit ? fit.rows : Math.max(minRows, 1),
  };
}
