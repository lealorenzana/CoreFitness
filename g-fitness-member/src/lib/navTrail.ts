import { tabForPath } from '../components/layout/memberNav';
import { trainerAreaFor } from '../components/layout/trainerNav';

/**
 * Where Back goes (the owner, 2026-11-07 and again 2026-11-14: "then i clicked the back button … that should
 * redirect me into Train → Workout but didn't and directs me back to Today").
 *
 * The way the best phone apps do it (Instagram, Spotify, iOS tab bars): **each bottom-bar tab keeps its own
 * stack of screens.** Leaving a tab and coming back restores where you were in it, and Back there steps back
 * through THAT tab's screens — never into whichever tab you happened to visit in between.
 *
 * So the shells record every location twice: in the visit's trail (browser order, as before), and in the stack of
 * the tab the screen belongs to (`areaOf`). A PUSH adds to the tab's stack — or, if that screen is already in it,
 * cuts back to it, so A → B → A never leaves a Back to B; a REPLACE swaps its top; a POP (the phone's own Back or
 * Forward) cuts back to where it landed. `backTarget()` is what PageTitle's Back uses.
 *
 * Both are kept in sessionStorage for this browser tab only — navigation, not anyone's data — so an app update's
 * reload or a refresh no longer forgets them (that is how Back used to fall through to a stale default).
 * Cleared at sign-out with the other per-member memory.
 */
type Entry = { key: string; path: string };
const KEY = 'cf-nav-trail-v2';

type Saved = { trail: Entry[]; stacks: Record<string, string[]> };
const load = (): Saved => {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw) {
      const v = JSON.parse(raw) as Saved;
      if (Array.isArray(v.trail) && v.stacks && typeof v.stacks === 'object') return v;
    }
  } catch { /* private mode, or a bad copy: start fresh */ }
  return { trail: [], stacks: {} };
};
const state = load();
const save = () => { try { sessionStorage.setItem(KEY, JSON.stringify(state)); } catch { /* full or blocked: memory only */ } };

const pathOnly = (p: string) => p.split('?')[0].split('#')[0];

/** The tab a screen belongs to: a member bottom-bar tab, a coach area, or '_' for screens outside any tab. */
export function areaOf(path: string): string {
  const p = pathOnly(path);
  if (p.startsWith('/trainer')) { const a = trainerAreaFor(p); return a ? `t:${a}` : '_'; }
  const a = tabForPath(p);
  return a ? `m:${a}` : '_';
}

/** Set by Back just before it navigates, so the recorder treats that navigation as a step back. */
let pendingBack: string | null = null;
export function markBack(path: string): void { pendingBack = path; }

export function recordLocation(key: string, path: string, how: 'PUSH' | 'POP' | 'REPLACE'): void {
  // The visit's trail, in browser order.
  const trail = state.trail;
  if (how === 'POP') {
    const at = trail.findIndex((e) => e.key === key);
    if (at >= 0) trail.length = at + 1; else trail.push({ key, path });
  } else if (how === 'REPLACE' && trail.length) {
    trail[trail.length - 1] = { key, path };
  } else if (trail[trail.length - 1]?.key !== key) {
    trail.push({ key, path });
  }
  if (trail.length > 200) trail.splice(0, trail.length - 200);

  // The tab's own stack.
  const area = areaOf(path);
  const stack = (state.stacks[area] ??= []);
  const cutTo = (target: string) => {
    // The last screen in this tab that is the same page (query aside) — back to it, with this exact address.
    for (let i = stack.length - 1; i >= 0; i--) {
      if (pathOnly(stack[i]) === pathOnly(target)) { stack.length = i + 1; stack[i] = target; return true; }
    }
    return false;
  };
  if (pendingBack !== null) {
    if (!cutTo(path)) { stack.length = 0; stack.push(path); }
    pendingBack = null;
  } else if (how === 'REPLACE' && stack.length) {
    stack[stack.length - 1] = path;
  } else if (!cutTo(path)) {
    stack.push(path);
  }
  if (stack.length > 50) stack.splice(0, stack.length - 50);
  save();
}

/** The path of the screen before this one in this visit (browser order), or null when this is the first. */
export function previousPath(): string | null {
  return state.trail.length >= 2 ? state.trail[state.trail.length - 2].path : null;
}

/** Where Back goes from `path`: the screen before it in its own tab, or null when it is the first one there. */
export function backTarget(path: string): string | null {
  const stack = state.stacks[areaOf(path)] ?? [];
  const at = stack.length - 1;
  if (at < 1 || pathOnly(stack[at]) !== pathOnly(path)) {
    // Not on top of its stack (a fresh start): the newest earlier screen in that tab, if any.
    for (let i = stack.length - 1; i >= 0; i--) if (pathOnly(stack[i]) !== pathOnly(path)) return stack[i];
    return null;
  }
  return stack[at - 1];
}

/** Forgotten at sign-out with the other per-member memory. */
export function clearNavTrail(): void {
  state.trail.length = 0;
  state.stacks = {};
  try { sessionStorage.removeItem(KEY); } catch { /* nothing kept */ }
}
