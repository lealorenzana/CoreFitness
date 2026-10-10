import { supabase } from '../supabaseClient';

/** A coach's status (0178): members see it on the coach's card; "On leave" sends them to a stand-in. */
export type Presence = 'available' | 'away' | 'on_leave';
export const PRESENCE_LABEL: Record<Presence, string> = { available: 'Available', away: 'Away', on_leave: 'On leave' };

export async function myPresence(trainerId: string): Promise<Presence> {
  const { data, error } = await supabase.from('trainer_profiles').select('presence').eq('profile_id', trainerId).maybeSingle();
  if (error || !data) return 'available';
  const p = (data as { presence?: string }).presence;
  return p === 'away' || p === 'on_leave' ? p : 'available';
}

export async function setMyPresence(p: Presence): Promise<void> {
  const { error } = await supabase.rpc('set_my_presence', { p_presence: p });
  if (error) throw new Error(error.message);
}
