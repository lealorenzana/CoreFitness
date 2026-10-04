import { createClient } from '@supabase/supabase-js';

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
});
supabase.auth.onAuthStateChange((event) => { if (event === 'PASSWORD_RECOVERY') markRecovery(); });

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
