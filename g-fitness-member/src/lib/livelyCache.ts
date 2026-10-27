/**
 * The points balance the chip last showed (components/ui/lively.tsx), so it
 * counts up only when the number changed. Memory only; cleared with the
 * member caches (memberCaches.ts) — this account's, never the next person's.
 */
let lastShown: { uid: string; value: number } | null = null;

export function lastBalance(uid: string | null): number | null {
  return lastShown && lastShown.uid === uid ? lastShown.value : null;
}
export function rememberBalance(uid: string, value: number): void {
  lastShown = { uid, value };
}
export function clearLivelyCache(): void {
  lastShown = null;
}
