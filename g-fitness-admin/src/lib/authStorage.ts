/**
 * Where the admin's Supabase session is kept — and therefore how long it lasts.
 *
 * The login page has had a "Remember me" checkbox since the first version. It
 * set a `useState` flag that **nothing ever read**: it was not passed to
 * `signInWithPassword`, not persisted, not consulted anywhere. Ticking it and
 * leaving it blank produced byte-identical behaviour. That is exactly the
 * "control that writes a flag nothing reads is a lie" rule in CLAUDE.md, on the
 * one screen where getting it wrong is a security question rather than a
 * cosmetic one.
 *
 * This makes it real:
 *
 *   checked (default) → `localStorage`   — survives closing the browser, the
 *                                          laptop rebooting, everything, until
 *                                          Logout is pressed.
 *   unchecked         → `sessionStorage` — dies with the tab.
 *
 * Default is **on**, because the ordinary case is the owner's own machine and
 * the expectation is Facebook-style: signed in until you sign out. Unchecking is
 * the escape hatch for the shared front-desk PC, which is a real situation here
 * — `staff` accounts sign in on a counter machine other people can reach.
 *
 * Supabase-js has no per-call persistence option, so the choice has to be made
 * by the storage adapter handed to `createClient`.
 */

/** Which store the session should live in. Kept in `localStorage` itself so the
 *  preference outlives the session it describes. */
const PREFERENCE_KEY = 'cf.admin.sessionPersistence';

type Mode = 'local' | 'session';

function readMode(): Mode {
  try {
    return localStorage.getItem(PREFERENCE_KEY) === 'session' ? 'session' : 'local';
  } catch {
    // Private mode or storage disabled. Fall back to the in-memory-ish path
    // rather than throwing during module init and taking the whole app down.
    return 'session';
  }
}

function backing(): Storage {
  return readMode() === 'session' ? sessionStorage : localStorage;
}

/**
 * Record the choice. **Must be called before `signInWithPassword`**, so the
 * token Supabase writes on success lands in the right store — the adapter is
 * consulted at write time, not at client-construction time.
 */
export function setSessionPersistence(remember: boolean): void {
  try {
    localStorage.setItem(PREFERENCE_KEY, remember ? 'local' : 'session');
  } catch {
    /* storage unavailable — the adapter's own fallback handles it */
  }
}

export function getSessionPersistence(): boolean {
  return readMode() === 'local';
}

/**
 * The adapter itself.
 *
 * `removeItem` deliberately clears **both** stores. Sign-out must not leave a
 * copy of the token behind in whichever store is not currently selected — that
 * is how a "logged out" browser silently logs itself back in after the
 * preference changes.
 */
export const authStorage = {
  getItem: (key: string): string | null => {
    try {
      // Read through both: if the preference was flipped while a session was
      // live, the token is still in the other store and the user should not be
      // thrown out for it.
      return backing().getItem(key) ?? localStorage.getItem(key) ?? sessionStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem: (key: string, value: string): void => {
    try {
      backing().setItem(key, value);
      // Keep exactly one copy, or the stale one wins on the next read.
      (readMode() === 'session' ? localStorage : sessionStorage).removeItem(key);
    } catch {
      /* ignore */
    }
  },
  removeItem: (key: string): void => {
    try { localStorage.removeItem(key); } catch { /* ignore */ }
    try { sessionStorage.removeItem(key); } catch { /* ignore */ }
  },
};
