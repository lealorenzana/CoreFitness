import { useEffect, useState } from 'react';
import { getGymApp } from '../lib/api/gymApp';

/**
 * Which parts of the system this gym runs, for the admin app (0110/0141).
 *
 * Your app promises that switching something off makes it disappear "from your
 * members' app and from this dashboard". For eleven releases only the first half
 * was true: the sidebar listed Shop, Rooms and Challenges to a gym that had
 * switched them off. This is the second half — the sidebar asks `moduleOn()`.
 *
 * The same module-level cache as `useGymWords`, for the same reason, and cleared
 * by `clearAdminCaches()` when the account changes.
 *
 * **Unknown answers TRUE**, as in the member app: a failed read or a database
 * without 0110 is never a reason to take a page away from the desk.
 */

/** Each 0141 switch and the switch it lives inside — the same pairs as platform_features.parent_key. */
export const PARENT: Record<string, string> = {
  shop: 'front_desk', requests: 'front_desk', chat: 'coaching', rooms: 'coaching',
  programs: 'progress', photos: 'progress', squads: 'engagement', points: 'engagement', seasons: 'points',
  quests: 'engagement', referrals: 'engagement',
};

type Modules = Record<string, boolean>;

let cached: Modules = {};
let inFlight: Promise<Modules> | null = null;
const listeners = new Set<(m: Modules) => void>();

async function read(): Promise<Modules> {
  try {
    cached = (await getGymApp())?.modules ?? {};
  } catch {
    cached = {};
  }
  listeners.forEach((fn) => fn(cached));
  return cached;
}

export function clearGymModulesCache(): void {
  cached = {};
  inFlight = null;
}

/** Re-read after a switch on Your app, so the sidebar changes at once. */
export function refreshGymModules(): void {
  inFlight = read();
}

export function moduleOn(modules: Modules, key: string | undefined): boolean {
  if (!key) return true;
  const own = modules[key];
  if (own !== undefined) return own;
  const parent = PARENT[key];
  return parent ? moduleOn(modules, parent) : true;
}

export function useGymModules(): Modules {
  const [modules, setModules] = useState<Modules>(cached);

  useEffect(() => {
    listeners.add(setModules);
    if (!inFlight) inFlight = read();
    void inFlight.then(setModules);
    return () => { listeners.delete(setModules); };
  }, []);

  return modules;
}
