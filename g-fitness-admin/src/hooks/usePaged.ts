import { useMemo, useState } from 'react';

/**
 * Slices a list for display and keeps the page number honest.
 *
 * The page is **clamped on render**, not reset in an effect: filtering a
 * four-page list down to one page while you are standing on page 3 must show
 * page 1's rows, and doing that with `useEffect(() => setPage(1), [items])` is
 * the `set-state-in-effect` mistake this codebase keeps shipping.
 *
 * It lives outside `kit.tsx` because a module that exports both components and
 * a hook breaks React Fast Refresh — the whole module remounts on every edit.
 */
export function usePaged<T>(items: T[], perPage: number) {
  const [rawPage, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / perPage));
  const page = Math.min(rawPage, totalPages);
  const visible = useMemo(
    () => items.slice((page - 1) * perPage, page * perPage),
    [items, page, perPage]
  );
  return { page, setPage, visible, total: items.length, perPage, totalPages };
}
