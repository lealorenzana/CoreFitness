import { useEffect, useSyncExternalStore } from 'react';
import type { TabId } from './memberNav';

/**
 * The part of a tab header only the page can know.
 *
 * Today's title is the date, which the shell computes. You's second line is the
 * member's plan name, and Train's title follows the week the matrix is showing
 * ("Next week / Sep 24 – 30") — both known only to the page. The header sits in
 * the shell, above `<main>`, so it cannot receive a prop from the page; this is
 * the smallest thing that lets the page hand it over.
 *
 * An external store rather than context: a context would re-render the whole
 * outlet when the value changes, and a page setting it from inside that outlet
 * would re-render itself.
 */

export interface HeaderOverride {
  title?: string;
  sub?: string;
}

const values = new Map<TabId, HeaderOverride>();
const listeners = new Set<() => void>();
let version = 0;

function emit() {
  version += 1;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useTabHeaderOverride(tab: TabId): HeaderOverride | undefined {
  useSyncExternalStore(subscribe, () => version);
  return values.get(tab);
}

/**
 * Override a tab's title lines from the page. Pass `undefined` fields to fall
 * back to the shell's own.
 *
 * Cleared on unmount, so a member who signs out and back in as someone else
 * never sees the previous plan name for a frame.
 */
export function useSetTabHeader(tab: TabId, title: string | undefined, sub: string | undefined): void {
  useEffect(() => {
    const prev = values.get(tab);
    if (title === undefined && sub === undefined) {
      if (values.delete(tab)) emit();
      return;
    }
    if (prev?.title !== title || prev?.sub !== sub) {
      values.set(tab, { title, sub });
      emit();
    }
  }, [tab, title, sub]);

  useEffect(() => () => { if (values.delete(tab)) emit(); }, [tab]);
}
