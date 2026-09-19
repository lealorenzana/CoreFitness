import { lazy, type ComponentType } from 'react';

const RELOADED = 'cf:chunk-reload';

/**
 * A screen loaded when it is first opened, not at launch (2026-09-19). The app
 * was one 1.6 MB bundle, all of it downloaded before the first screen on a
 * budget phone over mobile data.
 *
 * After a deploy the old screen files are gone, and a phone still running the
 * previous build asks for one that no longer exists. That failure reloads the
 * page once — onto the new build, which lib/appUpdate.ts would have done
 * shortly anyway — instead of breaking the screen. A second failure in the same
 * session is a real error and is thrown (the ErrorBoundary reports it).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyPage<T extends ComponentType<any>>(load: () => Promise<{ default: T }>) {
  return lazy(async () => {
    try {
      const mod = await load();
      try { sessionStorage.removeItem(RELOADED); } catch { /* private mode */ }
      return mod;
    } catch (err) {
      let already = false;
      try { already = sessionStorage.getItem(RELOADED) === '1'; sessionStorage.setItem(RELOADED, '1'); } catch { /* private mode */ }
      if (!already) {
        window.location.reload();
        return new Promise<{ default: T }>(() => {});   // the reload replaces the page
      }
      throw err;
    }
  });
}
