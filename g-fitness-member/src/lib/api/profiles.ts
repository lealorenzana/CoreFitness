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
export async function updateProfile(
  id: string,
  updates: Partial<Pick<ProfileRow, 'first_name' | 'last_name' | 'phone' | 'photo_url'>>
): Promise<void> {
  const { error } = await supabase.from('profiles').update(updates).eq('id', id);
  if (error) throw error;
}
