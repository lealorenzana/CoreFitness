import { useMemo, useState } from 'react';

/**
 * Twenty to a page for the platform's lists (2026-10-10), drawn with
 * components/Pagination.tsx. The page is clamped on render, never reset in an
 * effect: a filter that shrinks four pages to one shows page 1's rows.
 */
export const PER_PAGE = 20;

export function usePaged<T>(items: readonly T[] | null | undefined, perPage = PER_PAGE) {
  const [raw, setPage] = useState(1);
  const total = items?.length ?? 0;
  const pages = Math.max(1, Math.ceil(total / perPage));
  const page = Math.min(raw, pages);
  const rows = useMemo(() => (items ?? []).slice((page - 1) * perPage, page * perPage), [items, page, perPage]);
  return { rows, total, page, perPage, setPage };
}
