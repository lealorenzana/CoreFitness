import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/**
 * A full-screen sheet that Back closes.
 *
 * The sheet's open state lives in the history entry (`location.state.sheet`),
 * not in component memory. Opening pushes an entry for the same URL; Android's
 * back gesture (and the browser's Back) pops it, which closes the sheet. Kept in
 * memory, Back went *under* the sheet instead — it moved the page beneath while
 * the sheet stayed on top, so every swipe looked like nothing happened
 * (2026-10-26, More).
 *
 * `replace: false` is spelled out so opening is always a new entry for Back to
 * pop, even though the URL does not change.
 *
 * - `close()` steps back only if this sheet's entry is the current one, so a
 *   double tap can never walk the member out of the app.
 * - `go(path)` leaves from inside the sheet by *replacing* its entry, so Back
 *   from the destination returns to the page the sheet was opened on, not to
 *   the sheet.
 */
export function useHistorySheet(key: string) {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as { sheet?: string } | null;
  const open = state?.sheet === key;

  const show = useCallback(() => {
    if (open) return;
    navigate(`${location.pathname}${location.search}${location.hash}`, { state: { ...(state ?? {}), sheet: key }, replace: false });
  }, [open, navigate, location.pathname, location.search, location.hash, state, key]);

  const close = useCallback(() => {
    if (open) navigate(-1);
  }, [open, navigate]);

  const go = useCallback((path: string) => {
    navigate(path, { replace: true });
  }, [navigate]);

  return { open, show, close, go };
}
