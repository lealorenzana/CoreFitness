import { createClient, type Session, type User } from '@supabase/supabase-js';
import {
  configureOfflineReads, forgetOfflineSession, isOffline, keepOfflineSession, offlineFetch, offlineSessionCopy, storedSession,
} from './offlineReads';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Copy .env.example to .env.local and fill in your project values (see supabase/README.md).'
  );
}

/**
 * Stay signed in until the member presses Log out — the phone-app expectation,
 * the same as every social app they already have installed.
 *
 * Spelled out rather than inherited. These are supabase-js's current defaults
 * (verified at runtime: `persistSession: true`, `autoRefreshToken: true`,
 * storage `localStorage`), but this is a product requirement and must not be
 * able to change because a dependency changed its defaults in a minor release.
 *
 * Deliberately **no "Remember me" here.** This ships as an installed Android
 * app on someone's own phone; a checkbox offering to forget them would be
 * answering a question nobody asked. The admin dashboard does have one, because
 * that runs on a shared front-desk machine (`lib/authStorage.ts` over there).
 *
 * What actually ends a session: pressing Log out, an admin revoking the account,
 * or the refresh token being rejected. A backgrounded app does not — the access
 * token expires after an hour, and `autoRefreshToken` silently exchanges the
 * stored refresh token for a new one when the app comes back to the foreground.
 */
/**
 * A password-reset link (ForgotPassword → email → /reset-password) arrives as
 * `#access_token=…&type=recovery`, and the client below reads and clears that
 * hash as it starts. So whether this tab was opened by a reset link is noted
 * *before* the client exists, and again when Auth says PASSWORD_RECOVERY — the
 * reset page sets a password without asking for the old one only then, never
 * for an ordinary signed-in session (that is Change password, which checks it).
 * Per tab and short-lived, like the link: sessionStorage, not localStorage.
 */
const RECOVERY = 'cf-password-recovery';
const markRecovery = () => { try { sessionStorage.setItem(RECOVERY, String(Date.now())); } catch { /* private mode */ } };
if (/type=recovery/.test(window.location.hash)) markRecovery();

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storage: localStorage,
  },
  // Reads are kept on the phone and shown when there is no signal (offlineReads.ts).
  global: { fetch: offlineFetch },
});
configureOfflineReads(supabaseUrl, (supabase.auth as unknown as { storageKey: string }).storageKey);

/**
 * Offline, the signed-in account is the one saved on this phone.
 *
 * With no signal the session cannot be refreshed: an hour after the last
 * refresh `getSession()` answers "no session" and `getUser()` (which asks the
 * server) answers "no user" — so every screen bounced to Login or said it
 * could not tell who you are. When — and only when — the failure is the
 * connection and this phone still holds the session, both answer with it, so
 * the app opens on what it saved (offlineReads.ts). Nothing is sent with it:
 * offline nothing is sent at all, and online the real refresh runs first. A
 * session the server *refuses* is not the connection, and still signs out.
 */
const auth = supabase.auth;
const realGetSession = auth.getSession.bind(auth);
const realGetUser = auth.getUser.bind(auth);
let restoring: ReturnType<typeof auth.setSession> | null = null;
auth.getSession = (async () => {
  const res = await realGetSession();
  if (res.data.session) return res;
  if (isOffline(res.error)) {
    const saved = storedSession();
    if (saved) return { data: { session: saved as unknown as Session }, error: null };
    return res;
  }
  // Online, and supabase-js has no session — but this app's copy does: the
  // library dropped it while there was no signal. Sign in again with its
  // refresh token; a token the server refuses ends it, as it always did.
  const copy = offlineSessionCopy();
  if (!copy) return res;
  restoring ??= auth.setSession({ access_token: copy.access_token, refresh_token: copy.refresh_token })
    .finally(() => { restoring = null; });
  const back = await restoring;
  if (back.data.session) return { data: { session: back.data.session }, error: null };
  if (!isOffline(back.error)) forgetOfflineSession();
  return res;
}) as typeof auth.getSession;
auth.getUser = (async (jwt?: string) => {
  let res = await realGetUser(jwt);
  if (res.data.user) return res;
  if (isOffline(res.error)) {
    const saved = storedSession();
    if (saved) return { data: { user: saved.user as unknown as User }, error: null };
    return res;
  }
  // Back online after the library dropped the session: sign in again (above), then ask.
  if (!jwt && offlineSessionCopy() && (await auth.getSession()).data.session) res = await realGetUser();
  return res;
}) as typeof auth.getUser;
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'PASSWORD_RECOVERY') markRecovery();
  // The copy for offline (offlineReads.ts): kept fresh, and dropped by a
  // sign-out that happened with a signal — never by one the library made
  // because a refresh could not reach the server.
  if (session) keepOfflineSession(session);
  else if (event === 'SIGNED_OUT' && navigator.onLine) forgetOfflineSession();
});

/** True for an hour after this tab was opened by a password-reset link. */
export function openedByResetLink(): boolean {
  try {
    const at = Number(sessionStorage.getItem(RECOVERY));
    return at > 0 && Date.now() - at < 3600_000;
  } catch { return false; }
}
export function clearResetLink(): void {
  try { sessionStorage.removeItem(RECOVERY); } catch { /* private mode */ }
}
