import { getCurrentUser } from '../../../utils/auth';

/**
 * The signed-in member's id — the same uuid as `profiles.id` and `auth.uid()`.
 *
 * This used to return `localStorage['memberEmail']` with a hardcoded fallback of
 * `'eya.lorenzana@email.com'`, so a member whose email wasn't cached read a
 * stranger's progress data. Returning an empty string instead means the tabs
 * show their empty state, which is the honest answer when nobody is signed in.
 *
 * Stays synchronous because seven Progress tabs call it during render. It reads
 * the login-time cache that App.tsx writes, not the network.
 */
export function useMemberId(): string {
  return getCurrentUser()?.id ?? '';
}
