import { supabase } from './supabaseClient';
import { clearGymContext } from './gymContext';
import { clearMemberCaches } from './memberCaches';

/**
 * When the signed-in account changes, the last account's gym is forgotten.
 *
 * `logout()` already clears every cache (memberCaches.ts), and every button in
 * this app goes through it. What it cannot see is an account that changes
 * *without* the button: a session that expired or was revoked, or another tab
 * of the same browser signing in as somebody else. The admin app shipped that
 * bug on 2026-09-26 — one gym's owner logged out, the next gym's owner signed
 * in, and the sidebar still wore the first gym's name and logo — so the same
 * rule is stated here once, on the event every one of those paths raises.
 *
 * Its own file because `gymContext.ts` imports `memberCaches.ts`; putting this
 * in either would make the two import each other.
 */
let lastUser: string | null | undefined;

export function forgetGymWhenAccountChanges(): void {
  supabase.auth.onAuthStateChange((_event, session) => {
    const user = session?.user?.id ?? null;
    if (lastUser !== undefined && user !== lastUser) {
      clearGymContext();
      clearMemberCaches();
      // Another account replaced this one under an open screen, whose React
      // state still holds the last person's rows. Only a reload reaches those.
      if (lastUser !== null && user !== null) window.location.reload();
    }
    lastUser = user;
  });
}
