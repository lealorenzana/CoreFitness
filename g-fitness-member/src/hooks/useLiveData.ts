import { useEffect, useRef } from 'react';

/**
 * Keeps a screen current without the member doing anything.
 *
 * The app is a TWA, so the only way to force a reload used to be Chrome's
 * pull-to-refresh — which restarted the whole web app and has now been disabled
 * (`overscroll-behavior` in index.css). Screens therefore have to keep
 * themselves fresh, because the thing a member is waiting for happens on
 * somebody else's screen: the front desk approving the booking they just
 * requested.
 *
 * Three triggers, cheapest first:
 *
 *  - **Returning to the app** (`visibilitychange`). This is the one that
 *    matters. Phone locks, member opens the notification saying they were
 *    approved, app comes forward — and the list is already correct.
 *  - **Window focus**, for a desktop browser where the tab never went hidden.
 *  - **A slow poll** while the screen is actually being looked at.
 *
 * Polling stops entirely while the document is hidden. A backgrounded phone
 * that keeps a timer running is a battery complaint and a wasted Supabase quota
 * on the free tier, and nobody is reading the answer.
 *
 * Deliberately *not* Supabase Realtime. That needs the table added to the
 * `supabase_realtime` publication — another migration, on a project that is
 * already three behind — for a screen where a few seconds of staleness costs
 * nothing. Revisit if a screen ever needs sub-second updates.
 */
export function useLiveData(
  refresh: () => void | Promise<void>,
  { intervalMs = 30_000, enabled = true }: { intervalMs?: number; enabled?: boolean } = {}
): void {
  // Held in a ref so a caller passing an inline arrow does not tear the
  // listeners down and rebuild them on every render.
  const latest = useRef(refresh);
  latest.current = refresh;

  useEffect(() => {
    if (!enabled) return;

    let timer: ReturnType<typeof setInterval> | undefined;

    const run = () => { void latest.current(); };

    const start = () => {
      if (timer !== undefined || intervalMs <= 0) return;
      timer = setInterval(run, intervalMs);
    };
    const stop = () => {
      if (timer === undefined) return;
      clearInterval(timer);
      timer = undefined;
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') { run(); start(); } else { stop(); }
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', run);
    if (document.visibilityState === 'visible') start();

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', run);
      stop();
    };
  }, [intervalMs, enabled]);
}
