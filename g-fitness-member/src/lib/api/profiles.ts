import { assertWrote } from './mutate';
import { supabase } from '../supabaseClient';
import { registerSender, sendOrQueue } from '../outbox';
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

// Offline (lib/outbox.ts): the same change twice is the same change.
registerSender('profile', async (p) => {
  const { data, error } = await supabase.from('profiles').update(p.updates as Record<string, unknown>).eq('id', p.userId as string).select('id');
  if (error) throw error;
  // `.select()` so a write RLS filters to nothing is told apart from success —
  // a trainer once picked a photo, saw "Photo updated", and kept a NULL photo_url.
  if (!data || data.length === 0) throw new Error('That change was not saved — your account may not have permission.');
});

/** Your own name, phone or photo — saved now, or kept on the phone with no signal. */
export async function updateMyProfile(
  updates: Partial<Pick<ProfileRow, 'first_name' | 'last_name' | 'phone' | 'photo_url'>>
): Promise<'sent' | 'queued'> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  return sendOrQueue('profile', 'Profile details', { userId: user.id, updates });
}

/** Admin-only: update another user's profile (e.g. editing a trainer's name/phone). */
export async function updateProfile(
  id: string,
  updates: Partial<Pick<ProfileRow, 'first_name' | 'last_name' | 'phone' | 'photo_url'>>
): Promise<void> {
  const { data, error } = await supabase
    .from('profiles').update(updates).eq('id', id)
    .select('id');
  if (error) throw error;
  assertWrote(data, 'Those changes were not saved — your account may not have permission.');
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
