import { createClient } from '@supabase/supabase-js';
import { authStorage } from './authStorage';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Copy .env.example to .env.local and fill in your project values (see supabase/README.md).'
  );
}

/**
 * Auth options are spelled out rather than inherited.
 *
 * These happen to be supabase-js's defaults today (verified at runtime:
 * `persistSession: true`, `autoRefreshToken: true`, storage `localStorage`), but
 * "stays signed in until you press Logout" is a product requirement, not an
 * implementation detail — it should not be able to change because a dependency
 * changed its mind in a minor release.
 *
 * `storage` is the one real deviation: it routes to `localStorage` or
 * `sessionStorage` depending on the login page's "Remember me" box, which until
 * now set a flag nothing read. See lib/authStorage.ts.
 */
/**
 * A password-reset link (ForgotPassword → email → back here) arrives as
 * `#access_token=…&type=recovery`, which the client below reads and clears as it
 * starts — so it is noted *before* the client exists, and again on
 * PASSWORD_RECOVERY. The link returns to /admin/login (the one admin address on
 * Supabase Auth's redirect list, 2026-11-07), and Login sends it on to
 * /admin/reset-password. That page sets a password without the old one only
 * then — the same rule as the phone app's (`g-fitness-member/src/lib/supabaseClient.ts`).
 */
const RECOVERY = 'cf-password-recovery';
const markRecovery = () => { try { sessionStorage.setItem(RECOVERY, String(Date.now())); } catch { /* private mode */ } };
/** True only on the page load a reset link opened — Login's cue to move on. */
export const arrivedByResetLink = /type=recovery/.test(window.location.hash);
if (arrivedByResetLink) markRecovery();

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Keep the session across reloads and restarts.
    persistSession: true,
    // Silently swap an expiring access token for a fresh one. Without this the
    // session dies an hour after sign-in no matter what is persisted.
    autoRefreshToken: true,
    storage: authStorage,
  },
});
supabase.auth.onAuthStateChange((event) => { if (event === 'PASSWORD_RECOVERY') markRecovery(); });

/** This tab was opened by a reset link within the hour. */
export function openedByResetLink(): boolean {
  try {
    const at = Number(sessionStorage.getItem(RECOVERY));
    return at > 0 && Date.now() - at < 3600_000;
  } catch { return false; }
}
export function clearResetLink(): void {
  try { sessionStorage.removeItem(RECOVERY); } catch { /* private mode */ }
}
