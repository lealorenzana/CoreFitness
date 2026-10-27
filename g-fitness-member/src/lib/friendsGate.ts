/**
 * Whether this gym has Friends switched on (0217), remembered for the session
 * so every screen asks once. Memory only; cleared with the member caches
 * (memberCaches.ts) — a gym switch or another account asks again.
 */
let on: boolean | null = null;

export function cachedFriendsOn(): boolean | null {
  return on;
}
export function rememberFriendsOn(v: boolean): void {
  on = v;
}
export function clearFriendsGate(): void {
  on = null;
}
