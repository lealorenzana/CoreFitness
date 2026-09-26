import { supabase } from './supabaseClient';
import { clearGymContext } from './gymContext';
import { clearBrandingCache } from '../hooks/useBranding';
import { clearGymWordsCache } from '../hooks/useGymWords';

/**
 * Every in-memory cache that belongs to *one gym*, emptied — the admin twin of
 * the member app's `lib/memberCaches.ts`.
 *
 * ## The bug this exists for (2026-09-26)
 *
 * G Fitness's owner set a logo and tagline, pressed Logout, and Ana signed into
 * her own gym on the same tab. Her Settings page said "Anafitness"; the sidebar
 * beside it said G FITNESS, with G Fitness's logo and G Fitness's word for
 * trainers. No query was wrong — every read was filtered to the right gym. The
 * sidebar simply never read again: Logout is `signOut()` + `navigate()`, a
 * client-side route change, so module memory survived it, and `useBranding`
 * and `useGymWords` answered the second owner from the first owner's gym.
 *
 * ## Why a listener, not a call in Logout
 *
 * There are five ways out of an account here — the sidebar's Logout, the setup
 * wizard's, the gym picker's, the login page refusing a non-admin, and a
 * session that simply ends (expired, revoked, or signed out in another tab).
 * A clear in each is five places to forget one, which is how the member app's
 * achievement catalogue leaked (17ee93f). Supabase announces every one of them
 * through `onAuthStateChange`, so the rule is stated once: **when the account
 * changes, the last account's gym is forgotten.**
 *
 * An account changing under an *open* dashboard (another tab signed in as
 * someone else) reloads the page, because the screens on it already hold the
 * last gym's rows in React state, which no cache clear can reach.
 */
export function clearAdminCaches(): void {
  clearGymContext();
  clearBrandingCache();
  clearGymWordsCache();
}

/** `undefined` until Supabase has said who is signed in at all. */
let lastUser: string | null | undefined;

export function forgetGymWhenAccountChanges(): void {
  supabase.auth.onAuthStateChange((_event, session) => {
    const user = session?.user?.id ?? null;
    if (lastUser !== undefined && user !== lastUser) {
      clearAdminCaches();
      // One real account replaced by another without a sign-out in this tab.
      if (lastUser !== null && user !== null) window.location.reload();
    }
    lastUser = user;
  });
}
