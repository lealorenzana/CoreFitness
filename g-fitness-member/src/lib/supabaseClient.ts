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
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storage: localStorage,
  },
});
