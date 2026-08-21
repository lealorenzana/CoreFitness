/**
 * The last good payload each screen rendered, kept in memory for this session.
 *
 * Every screen in this app fetches on mount from a cold start: `useState(true)`
 * for `loading`, `useState(null)` for the data, a query in `useEffect`. That is
 * correct the first time and wrong every time after it. Switching tabs unmounts
 * the page and throws its data away, so coming back to Home — a screen the
 * member has already seen, whose numbers moved by nothing — replays the whole
 * skeleton-then-content flash. On a phone on Mamburao wifi that is most of a
 * second of grey blocks to be told what you were already looking at.
 *
 * So: a screen that has been loaded once renders its previous answer
 * immediately and refetches behind it. The member sees content on the first
 * frame, and it silently corrects itself when the query lands.
 *
 * ## This is a cache, not a store
 *
 * Nothing here is authoritative and nothing is ever read *instead* of querying.
 * The refetch always runs — this only decides whether the member stares at a
 * skeleton while it does. If a value here is stale it is stale for the length of
 * one round trip.
 *
 * ## Memory only, and cleared on sign-out
 *
 * Deliberately not `localStorage`. Per-user state does not go there (the rule
 * this repo has broken before), and a cache that outlived the process would
 * hand the next person to open the app the previous member's dashboard — the
 * same shape of leak as the push subscription that survived a sign-out. It dies
 * with the tab, and `clearPageCache()` in `logout()` kills it sooner.
 */

const store = new Map<string, unknown>();

/** The last value stored under `key`, or undefined if this screen is new. */
export function readCache<T>(key: string): T | undefined {
  return store.get(key) as T | undefined;
}

/**
 * Remember `value` and hand it straight back, so a fetch can be wrapped in
 * place: `setHome(writeCache(KEY, await getMemberHome(id)))`.
 */
export function writeCache<T>(key: string, value: T): T {
  store.set(key, value);
  return value;
}

/** Drop everything. Called from `logout()` — see utils/auth.ts. */
export function clearPageCache(): void {
  store.clear();
}
