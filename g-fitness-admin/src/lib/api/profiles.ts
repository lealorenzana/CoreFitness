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
/**
 * id → display name for every member, archived ones included.
 *
 * `listMembers()` deliberately excludes archived members, which makes it the
 * wrong source for labelling *history* — a PT session run last year still
 * belongs to whoever it was run with. Admins can read all of `profiles`
 * (`profiles_select_admin`).
 */
export async function memberNameMap(): Promise<Record<string, string>> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, first_name, last_name')
    .eq('role', 'member');
  if (error) throw error;
  const map: Record<string, string> = {};
  for (const p of data ?? []) map[p.id] = `${p.first_name} ${p.last_name}`.trim();
  return map;
}

export async function updateProfile(
  id: string,
  updates: Partial<Pick<ProfileRow, 'first_name' | 'last_name' | 'phone' | 'photo_url'>>
): Promise<void> {
  const { error } = await supabase.from('profiles').update(updates).eq('id', id);
  if (error) throw error;
}
