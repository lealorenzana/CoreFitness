/**
 * Logins (0236, 2026-11-07): usernames, the stand-in address of an account with
 * no email, signing in with either, and the sign-up photo that waits on this
 * phone until there is a session to upload it with.
 * Spec: docs/superpowers/specs/2026-11-07-usernames-login-slips-design.md
 */
import { supabase } from '../supabaseClient';
import { uploadMyAvatar } from './avatars';

/** A desk-made account with no email has `<username>@no-email.invalid` — never shown, never mailed. */
export const isStandInEmail = (email: string | null | undefined) => /@no-email\.invalid$/i.test(String(email ?? '').trim());
/** The address to show, or null when the account has none. */
export const realEmail = (email: string | null | undefined) => (email && !isStandInEmail(email) ? email : null);

export const USERNAME_HINT = '3–20 letters, numbers, dots or underscores';
/** The client's quick check (the database decides): null = fine. */
export function usernameShape(u: string): string | null {
  const v = u.trim().toLowerCase();
  if (!v) return null;
  if (v.length < 3) return 'At least 3 characters.';
  if (v.length > 20) return 'At most 20 characters.';
  if (!/^[a-z0-9][a-z0-9._]{1,18}[a-z0-9]$/.test(v)) return 'Letters, numbers, dots or underscores — starting and ending with a letter or number.';
  return null;
}
/** "Maria Santos" → "maria.santos", a first suggestion they can change. */
export const suggestUsername = (first: string, last: string) =>
  `${first} ${last}`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '').slice(0, 20).replace(/\.+$/, '');

/** Null when it is free for me (my own counts), else why not. */
export async function usernameAvailable(u: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('username_available', { p: u.trim() });
  if (error) throw new Error(error.message);
  return (data as string | null) ?? null;
}

export interface MyLogin { username: string | null; hasEmail: boolean; email: string | null }
/** Null before 0236 is pasted — the username parts then stay hidden. */
export async function myLogin(): Promise<MyLogin | null> {
  const { data, error } = await supabase.rpc('my_login');
  if (error) return null;
  const r = (Array.isArray(data) ? data[0] : data) as { username: string | null; has_email: boolean; email: string | null } | undefined;
  return r ? { username: r.username, hasEmail: r.has_email, email: r.email } : null;
}
export async function setMyUsername(u: string | null): Promise<string | null> {
  const { data, error } = await supabase.rpc('set_my_username', { p: u });
  if (error) throw new Error(error.message);
  return (data as string | null) ?? null;
}

/**
 * Sign in with an email or a username. An address goes straight to Supabase Auth;
 * a username to the sign-in-username function, which finds the address on the
 * server and returns a session — the phone never learns anyone's email.
 */
export async function signInWithLogin(login: string, password: string): Promise<{ error: string | null }> {
  const v = login.trim();
  if (v.includes('@')) {
    const { error } = await supabase.auth.signInWithPassword({ email: v, password });
    return { error: error ? error.message : null };
  }
  const { data, error } = await supabase.functions.invoke('sign-in-username', { body: { username: v, password } });
  if (error) {
    const body = await (error as { context?: Response }).context?.json?.().catch(() => null);
    return { error: body?.error ?? 'Sign-in by username is not available right now. Use your email.' };
  }
  const { error: setError } = await supabase.auth.setSession(data as { access_token: string; refresh_token: string });
  return { error: setError ? setError.message : null };
}

// ---- the sign-up photo that waits for a session --------------------------------
// Sign-up can end with no session (an email to confirm, or the desk to approve),
// so the cropped photo waits on this phone, keyed by the address it was chosen
// for, and goes up at that account's first sign-in. A one-time outbox, like
// lib/outbox.ts — removed once uploaded, never read for anything else.
const PENDING = (email: string) => `cf-pending-photo:${email.trim().toLowerCase()}`;

export async function keepPhotoForLater(email: string, file: File): Promise<void> {
  const url = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
  try { localStorage.setItem(PENDING(email), url); } catch { /* storage full or blocked: they add it in Profile */ }
}

/** At sign-in: a photo chosen at sign-up on this phone goes up now, if the profile has none. */
export async function uploadWaitingPhoto(email: string | null | undefined, hasPhoto: boolean): Promise<void> {
  if (!email) return;
  let url: string | null;
  try { url = localStorage.getItem(PENDING(email)); } catch { return; }
  if (!url) return;
  try {
    if (!hasPhoto) {
      const blob = await (await fetch(url)).blob();
      await uploadMyAvatar(new File([blob], 'photo.jpg', { type: blob.type || 'image/jpeg' }));
    }
    localStorage.removeItem(PENDING(email));
  } catch {
    /* kept for the next sign-in */
  }
}
