import { supabase } from '../supabaseClient';

/**
 * A holding place for onboarding answers that have nowhere to land yet.
 *
 * **This replaces localStorage, and the difference is the whole point.**
 *
 * Onboarding runs while a self-registered member is still `pending_approval`.
 * Before migration 0036 they had no `member_profiles` row at that moment, so
 * every answer was written into nothing — a zero-row UPDATE, which PostgreSQL
 * reports as success. The client noticed and parked the answers in
 * `localStorage` to replay later.
 *
 * That parking spot is per-browser. The replay therefore only ever happened on
 * the exact device they registered on. Sign in on a phone instead of the laptop
 * and the answers were simply gone — so `onboarding_completed_at` stayed NULL
 * forever and **the entire onboarding flow repeated on every device, every
 * time**. It is the same per-device bug 0033 was written to remove, reintroduced
 * one layer down.
 *
 * `auth.users.raw_user_meta_data` is per *user*, lives on the server, and exists
 * from the moment of sign-up. Parking here survives a new phone, a private
 * window, a reinstall and a cleared cache.
 *
 * The database columns remain the source of truth. This is only ever a staging
 * area, and each value is cleared the moment it reaches its real column.
 */
export interface ParkedAnswers {
  onboarding_completed_at?: string;
  experience_level?: string;
  interests?: string[];
}

const KEYS: (keyof ParkedAnswers)[] = ['onboarding_completed_at', 'experience_level', 'interests'];

/**
 * Reads from the **cached session**, not `auth.getUser()`.
 *
 * `getUser()` is a network round trip, and this is called on every Book a
 * Session load and every login. The session already carries `user_metadata` and
 * supabase-js refreshes it after `updateUser`, so the local copy is current
 * without asking the server each time.
 */
export async function readParkedAnswers(): Promise<ParkedAnswers> {
  const { data } = await supabase.auth.getSession();
  const meta = (data.session?.user.user_metadata ?? {}) as Record<string, unknown>;
  const out: ParkedAnswers = {};
  if (typeof meta.onboarding_completed_at === 'string') out.onboarding_completed_at = meta.onboarding_completed_at;
  if (typeof meta.experience_level === 'string') out.experience_level = meta.experience_level;
  if (Array.isArray(meta.interests)) out.interests = meta.interests.filter((v): v is string => typeof v === 'string');
  return out;
}

/** True when any of `keys` is actually parked — so callers can skip a pointless write. */
export async function hasParked(keys: (keyof ParkedAnswers)[]): Promise<boolean> {
  const parked = await readParkedAnswers();
  return keys.some((k) => {
    const v = parked[k];
    return Array.isArray(v) ? v.length > 0 : v != null;
  });
}

/**
 * `updateUser({ data })` merges at the top level, so the sign-up trigger's own
 * keys (`signup_source`, `first_name`, …) are left alone. Never allowed to
 * throw: failing to park an answer must not strand somebody on the onboarding
 * screen with no way forward.
 */
export async function parkAnswers(patch: ParkedAnswers): Promise<void> {
  await supabase.auth.updateUser({ data: patch }).catch(() => undefined);
}

/**
 * Clears only if there is something to clear.
 *
 * Without the check this fired an `updateUser` request on every read that found
 * a value in the database — which is every Book a Session load, for every
 * member, forever, to write nulls over nulls.
 */
export async function clearParkedAnswers(keys: (keyof ParkedAnswers)[] = KEYS): Promise<void> {
  if (!(await hasParked(keys))) return;
  const patch: Record<string, null> = {};
  for (const k of keys) patch[k] = null;
  await supabase.auth.updateUser({ data: patch }).catch(() => undefined);
}
