/**
 * Logins (0236, 2026-11-07): usernames, the stand-in address of an account with
 * no email, the desk's view of a person's login and the reset that hands out a
 * new slip. Spec: docs/superpowers/specs/2026-11-07-usernames-login-slips-design.md
 */
import { supabase } from '../supabaseClient';

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
/** A first suggestion from a name: "Maria Santos" → "maria.santos". The desk can change it. */
export const suggestUsername = (first: string, last: string) =>
  `${first} ${last}`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '').slice(0, 20).replace(/\.+$/, '');

/** Null when the username is free for me (my own counts), else why not. Throws before 0236. */
export async function usernameAvailable(u: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('username_available', { p: u.trim() });
  if (error) throw new Error(error.message);
  return (data as string | null) ?? null;
}

export interface MyLogin { username: string | null; hasEmail: boolean; email: string | null }
/** The signed-in account's login. Null before 0236 is pasted — the username parts then stay hidden. */
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

export interface LoginInfo { username: string | null; hasEmail: boolean; setUp: boolean; canReset: boolean }
/** A person's login, for the drawer. Null when unavailable (before 0236, or not this gym's). */
export async function loginInfoFor(userId: string): Promise<LoginInfo | null> {
  const { data, error } = await supabase.rpc('login_info_for', { p_user: userId });
  if (error) return null;
  const r = (Array.isArray(data) ? data[0] : data) as { username: string | null; has_email: boolean; set_up: boolean; can_reset: boolean } | undefined;
  return r ? { username: r.username, hasEmail: r.has_email, setUp: r.set_up, canReset: r.can_reset } : null;
}

export interface SlipLogin { password: string; username: string | null; email: string | null }
/** A new one-time password for the slip; their next sign-in asks for a new password. SQL decides who may. */
export async function resetLogin(userId: string): Promise<SlipLogin> {
  const { data, error } = await supabase.functions.invoke('reset-login', { body: { userId } });
  if (error) {
    const body = await (error as { context?: Response }).context?.json?.().catch(() => null);
    throw new Error(body?.error ?? 'The login could not be reset. Try again in a moment.');
  }
  return data as SlipLogin;
}

/**
 * Sign in with an email or a username (0236). An address goes straight to Supabase
 * Auth; a username goes to the sign-in-username function, which finds the address
 * on the server and returns a session — the client never learns anyone's email.
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
  const s = data as { access_token: string; refresh_token: string };
  const { error: setError } = await supabase.auth.setSession(s);
  return { error: setError ? setError.message : null };
}
