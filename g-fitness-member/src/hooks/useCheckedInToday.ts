import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { useLiveData } from './useLiveData';
import { getCurrentMemberId } from '../services/bookingService';
import { checkedInSince } from '../lib/api/attendance';

/** Local midnight, as an instant. See `checkedInSince`. */
function startOfToday(): Date {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}

/**
 * Has this member checked in today? — one answer for the whole app.
 *
 * The bar's check-in block and Today's "Now" row read this same value, so they
 * can never disagree (they did: "Not checked in yet" over a bar saying "Checked
 * in", 2026-10-26). Refreshed the way every live screen is — return to the app,
 * focus, a slow poll — and whenever a check-in sheet closes.
 *
 * `null` until the first read lands. A failed read leaves the last answer
 * standing. The bar reads "Check in" until proven otherwise, the safe default:
 * the sheet refuses a live code to someone already checked in, so a stale
 * "Check in" costs one tap, where a false "Checked in" would hide the code from
 * a member standing at the desk.
 */
let value: boolean | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

export function refreshCheckedInToday(): void {
  void (async () => {
    try {
      const id = await getCurrentMemberId();
      if (!id) return;
      value = await checkedInSince(id, startOfToday());
      emit();
    } catch {
      // Keep the last answer; the next tick covers it.
    }
  })();
}

/** Signed out or switched gym: the next person's answer is not this one. */
export function clearCheckedInToday(): void {
  value = null;
  emit();
}

export function useCheckedInToday(): [boolean | null, () => void] {
  const v = useSyncExternalStore(subscribe, () => value);
  const refresh = useCallback(() => refreshCheckedInToday(), []);
  useEffect(() => { refresh(); }, [refresh]);
  useLiveData(refresh, { intervalMs: 60_000 });
  return [v, refresh];
}
