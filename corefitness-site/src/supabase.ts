import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * The site reads one thing and writes one thing, both as a stranger: the list
 * of gyms (`list_gyms`, 0098) and an application (`gym_applications`, 0097).
 * Anonymous inserts are allowed there and nowhere else, and the row may only
 * arrive as 'pending' — the rule is in SQL, not in this form.
 *
 * Missing keys are not fatal here: the page is mostly words, and a gym reading
 * about the service should still see it. The form says it cannot send instead.
 */
// Signed in only for an applicant's own page (#account, 0187); everything else is read as a stranger.
export const supabase = url && anonKey
  // PKCE (0190): Google returns ?code=…, which leaves this site's #apply / #account addresses alone.
  ? createClient(url, anonKey, { auth: { persistSession: true, storageKey: 'cf-site-applicant', flowType: 'pkce' } })
  : null;
