import { useEffect, useSyncExternalStore } from 'react';
import { supabase } from './supabaseClient';
import { assertWrote } from './api/mutate';
import { getCurrentMemberId } from '../services/bookingService';

/**
 * Where the assistant button sits (0213): `header` — a sparkle button beside the
 * bell on Today, Train and You (the default) — or `floating`, the bubble.
 *
 * The member's own choice, so it is on their account (`member_profiles
 * .assistant_button`), read once per session and kept in memory only; cleared
 * with every other per-member cache in `clearMemberCaches()`. A failed read —
 * 0213 not pasted yet, no signal — is the default, `header`, never a guess.
 */
export type AssistantPlacement = 'header' | 'floating';

let placement: AssistantPlacement = 'header';
let loaded = false;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

async function load(): Promise<void> {
  try {
    const id = await getCurrentMemberId();
    if (!id) return;
    const { data, error } = await supabase.from('member_profiles').select('assistant_button').eq('profile_id', id).maybeSingle();
    const v = (data as { assistant_button?: string } | null)?.assistant_button;
    if (!error && (v === 'header' || v === 'floating')) placement = v;
  } catch {
    // Keep the default.
  } finally {
    loaded = true;
    emit();
  }
}

/** Saves the member's choice; throws a sentence when it could not be saved. */
export async function saveAssistantPlacement(next: AssistantPlacement): Promise<void> {
  const id = await getCurrentMemberId();
  if (!id) throw new Error('Your choice could not be saved.');
  const { data, error } = await supabase.from('member_profiles').update({ assistant_button: next })
    .eq('profile_id', id).select('profile_id');
  if (error) throw new Error('Your choice could not be saved.');
  assertWrote(data, 'Your choice could not be saved.');
  placement = next;
  emit();
}

export function clearAssistantPlacement(): void {
  placement = 'header';
  loaded = false;
  loading = null;
  emit();
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

/** The member's placement; `header` until (and unless) their choice is read. */
export function useAssistantPlacement(): AssistantPlacement {
  const value = useSyncExternalStore(subscribe, () => placement);
  useEffect(() => {
    if (!loaded && !loading) loading = load();
  }, []);
  return value;
}
