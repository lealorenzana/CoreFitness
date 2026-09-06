import { supabase } from '../supabaseClient';
import type { ProfileRow } from '../../types/db';

export async function getMyProfile(): Promise<ProfileRow | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  if (error) throw error;
  return data;
}

export async function getProfile(id: string): Promise<ProfileRow | null> {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function updateMyProfile(
  updates: Partial<Pick<ProfileRow, 'first_name' | 'last_name' | 'phone' | 'photo_url'>>
): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  // `.select()` so this becomes `UPDATE … RETURNING` and a zero-row result can
  // be told apart from success.
  //
  // Without it, a write that RLS silently filters reports success: PostgREST
  // returns no error for an UPDATE that matched nothing. That is how a trainer
  // can pick a photo, see "Photo updated", and end up with `photo_url` still
  // NULL — the same failure mode that made onboarding write nothing in 0033,
  // and that admin "Recall" and "Undo check-in" both had until they were given
  // this same treatment.
  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', user.id)
    .select('id');
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error('That change was not saved — your account may not have permission.');
  }
}

/** Admin-only: update another user's profile (e.g. editing a trainer's name/phone). */
export async function updateProfile(
  id: string,
  updates: Partial<Pick<ProfileRow, 'first_name' | 'last_name' | 'phone' | 'photo_url'>>
): Promise<void> {
  const { error } = await supabase.from('profiles').update(updates).eq('id', id);
  if (error) throw error;
}


/**
 * Why this email cannot sign in, or NULL (migration 0069).
 *
 * Called from the login screen *after* a refusal, with no session — so it
 * cannot go through `account_status_events` RLS, and goes through a
 * SECURITY DEFINER function that returns nothing but the sentence.
 *
 * Returns NULL for an active account, an unknown one, and a suspension
 * recorded before 0069 alike. That is deliberate on two counts: it cannot be
 * used to find out whether an email is registered, and NULL genuinely means
 * "no reason on file" — the screen says so rather than inventing one.
 */
export async function accountLockoutReason(email: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('account_lockout_reason', { p_email: email });
  // A failure here must never replace the refusal the member already needs to
  // see, so it degrades to "no reason on file" rather than throwing.
  if (error) return null;
  return (data as string | null) ?? null;
}
