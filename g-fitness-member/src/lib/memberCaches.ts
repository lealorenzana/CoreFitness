import { clearPageCache } from './pageCache';
import { clearScrollMemory } from '../hooks/useScrollMemory';
import { clearFeatureCache } from '../hooks/useFeatures';
import { clearGymApp } from './gymApp';
import { clearAchievementCache } from './api/achievements';

/**
 * Every in-memory cache that belongs to *this member in this gym*, emptied.
 *
 * ## Why this exists as one function
 *
 * Two lists that must agree, kept in two places, drift. They had:
 *
 *   * **`logout()` cleared five caches and missed one.** The achievement
 *     catalogue had no clearer anywhere — see `clearAchievementCache`. Logout
 *     is followed by `navigate('/login')`, a client-side route change with no
 *     reload, so module state survives it: the next person to sign in on that
 *     phone inherited the previous account's gym's achievement rules.
 *
 *   * **`switchGym()` cleared one.** That one is not a live bug today, and it
 *     is worth being exact about why: `switchGym` ends in
 *     `window.location.assign()`, a real navigation, which tears every module
 *     down regardless. It calls this now so that stops being load-bearing D
 *     the day somebody makes that switch client-side to avoid the white flash,
 *     the caches are already handled instead of becoming a bug that wears the
 *     wrong gym's logo (0116) and speaks its words (0114).
 *
 * So: one list, called from both, and a new cache is added here once rather
 * than in two places that will disagree again.
 *
 * ## What is deliberately NOT here
 *
 * - **`clearGymContext()`**. Not because it should not run — both callers do
 *   run it — but because importing it here would make a cycle: `switchGym`
 *   lives in `gymContext.ts` and would be importing a module that imports it
 *   back. The two callers each clear it themselves, next to this call.
 * - **`localStorage` keys, push subscriptions, the language.** Those belong to
 *   the *person*, not to the gym. A switch keeps the same person signed in, so
 *   clearing them would sign them out of their own preferences sideways.
 *   `logout()` handles those, and only `logout()` should.
 * - **`lib/offlineSets.ts`**. The one per-member store that is deliberately
 *   durable (CLAUDE.md): sets logged with no signal, waiting to go up. Clearing
 *   it on a gym switch would throw away a workout somebody actually did.
 */
export function clearMemberCaches(): void {
  clearPageCache();
  clearScrollMemory();
  // Entitlements are per-member *and* per-gym: the same person can be on
  // Premium at one gym and the free tier at another.
  clearFeatureCache();
  // The gym's words, colours, logo and modules.
  clearGymApp();
  // The achievement catalogue is a per-gym table (0098 tags it), and this one
  // had no clearer at all — not even on logout, so it also survived one person
  // signing out and another signing in on the same phone.
  clearAchievementCache();
}
