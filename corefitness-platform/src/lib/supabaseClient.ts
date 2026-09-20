import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Copy .env.example to .env.local (see supabase/README.md).'
  );
}

/**
 * The anon key, like the other two apps. This app is powerful because of *who
 * signs into it* — every function it calls checks `platform_admins` in SQL
 * (0106) — not because it holds a stronger key. The service-role key never
 * appears in a frontend (supabase/README.md).
 */
export const supabase = createClient(url, anonKey, {
  auth: { persistSession: true, autoRefreshToken: true, storage: localStorage },
});
