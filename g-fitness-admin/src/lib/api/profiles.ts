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
  const { error } = await supabase.from('profiles').update(updates).eq('id', user.id);
  if (error) throw error;
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
