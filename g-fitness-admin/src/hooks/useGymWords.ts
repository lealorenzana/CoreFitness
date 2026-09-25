import { useEffect, useState } from 'react';
import { getGymApp, type GymVocabulary } from '../lib/api/gymApp';

/**
 * What this gym calls its people and its sessions, for the admin app (0114).
 *
 * The owner sets these on **Your app** to change what their *members* read, and
 * a gym that renamed members to "athletes" then finding "Members" in its own
 * sidebar reads as the setting half-working. CLAUDE.md's standing rule says the
 * same thing from the other end: a member feature is not done until admin and
 * trainer see it too.
 *
 * ## Why a module-level cache and not a context
 *
 * Four or five components want this, they mount at different times, and the
 * answer changes about once a year. A provider would mean threading one more
 * wrapper through `App.tsx` for a value that is constant for the session;
 * `useBranding` already established the lighter pattern here.
 *
 * The read happens once per launch. `refreshGymWords()` is what the Your app
 * screen calls after a save, so the sidebar renames itself without a reload —
 * saving a new word and watching the old one stay in the corner is how an
 * admin concludes the save did not work (the reason `publishBranding` exists).
 */

export const DEFAULT_WORDS: GymVocabulary = {
  member: 'member', members: 'members',
  trainer: 'coach', trainers: 'coaches',
  class: 'class', classes: 'classes',
};

let cached: GymVocabulary = DEFAULT_WORDS;
let inFlight: Promise<GymVocabulary> | null = null;
const listeners = new Set<(w: GymVocabulary) => void>();

async function read(): Promise<GymVocabulary> {
  try {
    const app = await getGymApp();
    // Merged over the defaults rather than replacing them: a database without
    // 0114 returns no `vocabulary` at all, and a half-filled object would put
    // an empty string where a noun belongs.
    cached = { ...DEFAULT_WORDS, ...(app?.vocabulary ?? {}) };
  } catch {
    // A failed read is never a reason to rename anything. Unknown keeps the
    // English word, the same answer as a gym that renamed nothing.
    cached = DEFAULT_WORDS;
  }
  listeners.forEach((fn) => fn(cached));
  return cached;
}

/** Re-read after a save on Your app, so every open screen renames at once. */
export function refreshGymWords(): void {
  inFlight = read();
}

export function useGymWords(): GymVocabulary {
  const [words, setWords] = useState<GymVocabulary>(cached);

  useEffect(() => {
    listeners.add(setWords);
    if (!inFlight) inFlight = read();
    void inFlight.then(setWords);
    return () => { listeners.delete(setWords); };
  }, []);

  return words;
}

/**
 * One word, capitalised for a label.
 *
 * First letter only — a gym that typed "PTs" keeps its capitals, and one that
 * typed "coaches" gets "Coaches". `toUpperCase()` on the rest would turn "PTs"
 * into "PTS".
 */
export function title(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}
