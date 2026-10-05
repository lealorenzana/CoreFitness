import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * A screen's tab or filter, kept in the address (`?tab=`) rather than in state.
 *
 * State is thrown away when the member opens something and comes Back, so a
 * screen they left on "Past" came back on "Upcoming". In the URL it survives
 * Back, a reload and a shared link. Changing it *replaces* the entry, so Back
 * still leaves the screen rather than stepping through every tab tapped
 * (CLAUDE.md: Back undoes the last step). A value that is not one of `allowed`
 * — an old link, a typo — falls back to `fallback`.
 */
export function useUrlState<T extends string>(
  key: string, fallback: T, allowed: readonly T[],
): [T, (next: T) => void] {
  const [params, setParams] = useSearchParams();
  const raw = params.get(key);
  const value = raw !== null && (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback;
  const set = useCallback((next: T) => {
    setParams((old) => {
      const p = new URLSearchParams(old);
      if (next === fallback) p.delete(key); else p.set(key, next);
      return p;
    }, { replace: true });
  }, [key, fallback, setParams]);
  return [value, set];
}
