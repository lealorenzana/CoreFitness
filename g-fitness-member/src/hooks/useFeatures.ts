import { useEffect, useState } from 'react';
import { getMyFeatures, type Feature } from '../lib/api/planFeatures';

/**
 * The member's entitlements, fetched once per session.
 *
 * ## Why there is a cache at all
 *
 * Almost every gated screen needs this before it can decide what to draw, and a
 * round trip per navigation would show a flash of the wrong state on a phone —
 * exactly the "tab switches must not flash" rule `pageCache` exists for.
 * Entitlements change when the admin edits a plan or the member renews, neither
 * of which happens mid-session on this device.
 *
 * ## Why it must be cleared on logout
 *
 * It is keyed by nothing. Two members on one phone — a real scenario at a gym
 * front desk — would otherwise hand the second person the first person's
 * entitlements, which is the same bug `pageCache` and `useScrollMemory` were
 * both cleared in `logout()` to avoid. `clearFeatureCache()` is called there.
 */

let cache: Feature[] | null = null;
let inFlight: Promise<Feature[]> | null = null;

/** Called from `logout()` — see utils/auth.ts. */
export function clearFeatureCache(): void {
  cache = null;
  inFlight = null;
}

/**
 * Force the next read to hit the network. Call after anything that can change
 * what the member is entitled to — renewing, or a plan change — so the app does
 * not keep showing a lock the member has just paid to remove.
 */
export function invalidateFeatures(): void {
  cache = null;
  inFlight = null;
}

async function load(): Promise<Feature[]> {
  if (cache) return cache;
  // Share one request between the several components that mount together.
  if (!inFlight) {
    inFlight = getMyFeatures()
      .then((f) => {
        cache = f;
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
    cache ? { features: cache, loading: false, error: false }
          : { features: null, loading: true, error: false }
  );

  useEffect(() => {
    if (cache) return;
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
