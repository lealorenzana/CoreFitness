import { supabase } from '../supabaseClient';
import { assertWrote } from './mutate';

/**
 * The owner's two switches for the member app's big moments (0216):
 * celebrations (off: each moment is a small card instead of the full screen)
 * and their sounds (off: no sound for anyone at this gym). Members still get
 * every number; only how loudly it is told changes.
 */
export interface Celebrations {
  celebrations: boolean;
  sounds: boolean;
}

/** Null before 0216 — the tab then says the switches are not live yet. */
export async function getCelebrations(): Promise<Celebrations | null> {
  const { data, error } = await supabase.from('gym_settings').select('celebrations, celebration_sounds').maybeSingle();
  if (error || !data) return null;
  const r = data as { celebrations: boolean; celebration_sounds: boolean };
  return { celebrations: r.celebrations !== false, sounds: r.celebration_sounds !== false };
}

/** The owner only: gym_settings_update_admin, narrowed to this gym by tenancy. */
export async function setCelebrations(patch: Partial<Celebrations>): Promise<void> {
  const row: Record<string, boolean> = {};
  if (patch.celebrations != null) row.celebrations = patch.celebrations;
  if (patch.sounds != null) row.celebration_sounds = patch.sounds;
  const { data, error } = await supabase.from('gym_settings').update(row).eq('id', true).select('id');
  if (error) throw error;
  assertWrote(data, 'That was not saved — only the gym owner can change it.');
}
