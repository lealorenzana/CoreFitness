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
