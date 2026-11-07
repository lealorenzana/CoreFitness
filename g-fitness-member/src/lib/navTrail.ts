/**
 * The screens this visit has stepped through, in history order (the owner, 2026-11-07: "when I go back it just
 * goes back to where I was, not to where it should be — it brings me to Progress, not the page for Train").
 *
 * The browser's history can't be read, so the shells record each location as it arrives (PUSH adds, REPLACE swaps
 * the last, POP — Back or Forward — trims to the entry it landed on). `PageTitle`'s Back reads the screen before
 * this one: in the same bottom-bar tab, Back returns to it exactly as before; in a different tab (Routines opened
 * from You's "Start a workout"), Back goes up to this screen's own parent in its own tab instead.
 */
type Entry = { key: string; path: string };
const trail: Entry[] = [];

export function recordLocation(key: string, path: string, how: 'PUSH' | 'POP' | 'REPLACE'): void {
  if (how === 'POP') {
    const at = trail.findIndex((e) => e.key === key);
    if (at >= 0) { trail.length = at + 1; return; }
    trail.push({ key, path });
    return;
  }
  if (how === 'REPLACE' && trail.length) { trail[trail.length - 1] = { key, path }; return; }
  if (trail[trail.length - 1]?.key === key) return;
  trail.push({ key, path });
}

/** The path of the screen before this one in this visit, or null when this is the first. */
export function previousPath(): string | null {
  return trail.length >= 2 ? trail[trail.length - 2].path : null;
}

/** Forgotten at sign-out with the other per-member memory. */
export function clearNavTrail(): void { trail.length = 0; }
