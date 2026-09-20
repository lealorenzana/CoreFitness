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
export const supabase = url && anonKey ? createClient(url, anonKey, { auth: { persistSession: false } }) : null;
