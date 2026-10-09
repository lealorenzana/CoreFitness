import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Page numbers for every history in the app (2026-10-10).
 *
 * "See all visits" was 321 rows in one scroll. A history is now pages of 20
 * with numbers (components/ui/Pager.tsx). The page lives in the address
 * (`?page=3`), replaced rather than pushed, so Back leaves the list — and
 * coming back from a row's detail lands on the same page (CLAUDE.md: Back
 * undoes the last step).
 */
export const PER_PAGE = 20;

export function usePageParam(): [number, (p: number) => void] {
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get('page')) || 1);
  const set = useCallback((p: number) => {
    setParams((old) => {
      const next = new URLSearchParams(old);
      if (p <= 1) next.delete('page'); else next.set('page', String(p));
      return next;
    }, { replace: true });
  }, [setParams]);
  return [page, set];
}

/**
 * A list already in memory, shown 20 at a time. The page is clamped on render,
 * never in an effect. `resetOn` (a tab, a filter) sends the list back to page 1
 * when it changes — after the change has reached the address, because two
 * search-param writes in one tick overwrite each other.
 */
export function usePaged<T>(items: readonly T[] | null | undefined, perPage = PER_PAGE, resetOn?: string) {
  const [raw, setPage] = usePageParam();
  const seen = useRef(resetOn);
  useEffect(() => {
    if (seen.current === resetOn) return;
    seen.current = resetOn;
    setPage(1);
  }, [resetOn, setPage]);
  const total = items?.length ?? 0;
  const pages = Math.max(1, Math.ceil(total / perPage));
  const page = Math.min(raw, pages);
  const rows = useMemo(() => (items ?? []).slice((page - 1) * perPage, page * perPage), [items, page, perPage]);
  return { rows, total, page, pages, setPage };
}

/**
 * A history too long to load whole: fetches one page with `range()` and an
 * exact count. `fetchPage(from, to)` is inclusive, as PostgREST's range is.
 * A slow answer for page 2 that arrives after page 3 was asked for is dropped.
 */
export function usePagedQuery<T>(
  fetchPage: (from: number, to: number) => Promise<{ rows: T[]; total: number }>,
  perPage = PER_PAGE,
) {
  const [page, setPage] = usePageParam();
  const [state, setState] = useState<{ rows: T[] | null; total: number; error: unknown }>({ rows: null, total: 0, error: null });
  const ask = useRef(0);

  useEffect(() => {
    const n = ++ask.current;
    void (async () => {
      try {
        const from = (page - 1) * perPage;
        const r = await fetchPage(from, from + perPage - 1);
        if (n === ask.current) setState({ rows: r.rows, total: r.total, error: null });
      } catch (error) {
        if (n === ask.current) setState({ rows: [], total: 0, error });
      }
    })();
  }, [fetchPage, page, perPage]);

  const pages = Math.max(1, Math.ceil(state.total / perPage));
  return { rows: state.rows, total: state.total, error: state.error, page: Math.min(page, pages), pages, setPage };
}
