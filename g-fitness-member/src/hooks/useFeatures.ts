import { useEffect, useState } from 'react';
import { getMyFeatures, type Feature } from '../lib/api/planFeatures';

/**
 * The member's entitlements, cached briefly rather than for the whole session.
 *
 * ## Why there is a cache at all
 *
 * Almost every gated screen needs this before it can decide what to draw, and a
 * round trip per navigation would show a flash of the wrong state on a phone —
 * exactly the "tab switches must not flash" rule `pageCache` exists for.
 *
 * ## Why it expires
 *
 * See `TTL_MS`. The original reasoning was that entitlements cannot change
 * mid-session on this device, which is true and beside the point: they change
 * on the *front desk's* machine, and this one has to notice.
 *
 * ## Why it must be cleared on logout
 *
 * It is keyed by nothing. Two members on one phone — a real scenario at a gym
 * front desk — would otherwise hand the second person the first person's
 * entitlements, which is the same bug `pageCache` and `useScrollMemory` were
 * both cleared in `logout()` to avoid. `clearFeatureCache()` is called there.
 */

let cache: Feature[] | null = null;
let cachedAt = 0;
let inFlight: Promise<Feature[]> | null = null;

/**
 * How long an entitlement answer is trusted before it is fetched again.
 *
 * The cache was kept for the whole session on the reasoning that entitlements
 * "change when the admin edits a plan or the member renews, neither of which
 * happens mid-session on this device". The second half is wrong here, and in
 * the ordinary case: this gym is **cash-only**, so a member pays at the desk
 * and the *front desk* changes their plan — server-side, on another machine,
 * while the member's phone is sitting in their bag with the app still open.
 *
 * `invalidateFeatures()` exists for exactly that and **nothing calls it**, in
 * either app. A member who upgraded at the counter kept every lock they had
 * just paid to remove until they force-quit the app, and nothing on screen
 * would ever have suggested that was the fix.
 *
 * Five minutes: long enough that navigating around costs one request, short
 * enough that walking from the desk to the gym floor is enough for the app to
 * catch up.
 */
const TTL_MS = 5 * 60_000;

const isFresh = () => cache !== null && Date.now() - cachedAt < TTL_MS;

/** Called from `logout()` — see utils/auth.ts. */
export function clearFeatureCache(): void {
  cache = null;
  cachedAt = 0;
  inFlight = null;
}

/**
 * Force the next read to hit the network. Call after anything that can change
 * what the member is entitled to — renewing, or a plan change — so the app does
 * not keep showing a lock the member has just paid to remove.
 *
 * **This only affects the next component to mount.** A component already on
 * screen keeps the answer in its own state, so clearing the cache underneath it
 * changes nothing it displays. That is fine for a gated *screen*, which is torn
 * down and rebuilt on navigation — and not fine for anything living in the
 * shell, which never remounts. `Layout` remounts its chathead gate per route
 * for exactly this reason; see the note there before adding another shell-level
 * consumer.
 */
export function invalidateFeatures(): void {
  cache = null;
  cachedAt = 0;
  inFlight = null;
}

async function load(): Promise<Feature[]> {
  if (isFresh()) return cache as Feature[];
  // Share one request between the several components that mount together.
  if (!inFlight) {
    inFlight = getMyFeatures()
      .then((f) => {
        cache = f;
        cachedAt = Date.now();
        return f;
      })
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

export interface FeaturesState {
  features: Feature[] | null;
  loading: boolean;
  /** Set when the fetch failed. Callers must say so rather than drawing a lock. */
  error: boolean;
}

export function useFeatures(): FeaturesState {
  const [state, setState] = useState<FeaturesState>(() =>
    isFresh() ? { features: cache, loading: false, error: false }
              : { features: null, loading: true, error: false }
  );

  useEffect(() => {
    if (isFresh()) return;
    let alive = true;
    load()
      .then((f) => alive && setState({ features: f, loading: false, error: false }))
      .catch(() => alive && setState({ features: null, loading: false, error: true }));
    return () => {
      alive = false;
    };
  }, []);

  return state;
}
