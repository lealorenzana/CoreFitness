import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

/**
 * Put each screen back where the member left it.
 *
 * Both shells used to run `main.scrollTo(0, 0)` on every pathname change, which
 * threw the position away on purpose. Scroll a third of the way down Home, tap
 * Book a Session, tap Home again — and you are back at the greeting, hunting
 * for the card you were reading. A native app does not do that to a tab you
 * have already visited, and this ships as one.
 *
 * The browser cannot do this for us. Scroll restoration only applies to the
 * *document* scroller, and nothing here scrolls the document — `<main>` is the
 * scroll container inside a `100dvh` chassis, so as far as the browser is
 * concerned the page never moves.
 *
 * ## Why restoring takes more than one write
 *
 * Every screen fetches on mount, so at the moment of navigation the container
 * holds a skeleton a fraction of the height of the real list. Setting
 * `scrollTop = 900` against a 600px-tall element silently clamps to its
 * maximum, and by the time the content arrives the offset is long gone. The
 * saved value is therefore held as a target and re-applied while the content
 * settles, rather than written once and hoped over.
 *
 * That re-application runs on `setInterval`, not `requestAnimationFrame`: rAF
 * does not tick on a page that is not compositing, which is exactly the case
 * this has to survive — the app resumed from a locked phone.
 *
 * ## What stops it
 *
 * Three things, and getting this list wrong is what makes a restore feel like a
 * fight rather than a convenience.
 *
 *  1. **Success.** The moment the offset is reached *and* the container is
 *     genuinely tall enough to hold it — `scrollHeight - clientHeight >=
 *     target`, so this is the saved position and not a clamp — there is nothing
 *     left to wait for. On a screen opened fresh the target is 0 and that is
 *     true on the first tick, so it stops almost immediately.
 *  2. **The member.** Any input that could move the scroller: touch, wheel,
 *     pointer (a scrollbar drag) or a key (space, arrows). Measuring this
 *     caught the first draft listening only for touch and wheel, which left a
 *     keyboard or scrollbar scroll being silently dragged back for over a
 *     second.
 *  3. **Time.** `SETTLE_MS`, as a floor under a screen whose content never
 *     arrives.
 *
 * Positions are recorded on every scroll event rather than on unmount, because
 * by unmount the container has already been re-rendered with the next screen's
 * content and its `scrollTop` no longer means anything.
 */

/** How long to keep re-applying while a screen's content loads in. */
const SETTLE_MS = 1200;
/** Gap between re-applications. Short enough to look instant, cheap enough to ignore. */
const SETTLE_TICK_MS = 60;

const positions = new Map<string, number>();

/** Forget every remembered position. Called from `logout()`. */
export function clearScrollMemory(): void {
  positions.clear();
}

export function useScrollMemory(ref: RefObject<HTMLElement | null>, key: string): void {
  const target = useRef(0);
  const restoring = useRef(false);

  // Layout effect, not effect: this has to land before the browser paints the
  // new screen, or the member sees the top of the page flick past.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    target.current = positions.get(key) ?? 0;
    restoring.current = true;
    el.scrollTop = target.current;

    const stopSettling = () => { restoring.current = false; };

    const timer = setInterval(() => {
      if (!restoring.current) return;
      if (el.scrollTop !== target.current) el.scrollTop = target.current;
      // Landed, with room to spare — so this is the offset, not a clamp.
      if (el.scrollHeight - el.clientHeight >= target.current
        && el.scrollTop === target.current) stopSettling();
    }, SETTLE_TICK_MS);

    const giveUp = setTimeout(stopSettling, SETTLE_MS);

    // A scroll the member started outranks anything we were trying to restore.
    // All four: a phone scrolls by touch, a desktop by wheel, a scrollbar by
    // pointer, and the space bar and arrow keys by neither.
    const INPUTS = ['touchstart', 'wheel', 'pointerdown', 'keydown'] as const;
    INPUTS.forEach((type) => el.addEventListener(type, stopSettling, { passive: true }));

    return () => {
      clearInterval(timer);
      clearTimeout(giveUp);
      INPUTS.forEach((type) => el.removeEventListener(type, stopSettling));
    };
  }, [key, ref]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Ignored while restoring: the clamped intermediate offsets a growing list
    // produces are not where the member was, and saving them would overwrite
    // the position we are in the middle of restoring to.
    const onScroll = () => {
      if (restoring.current) return;
      positions.set(key, el.scrollTop);
    };

    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [key, ref]);
}
