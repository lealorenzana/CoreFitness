import { supabase } from '../supabaseClient';

/**
 * Gym settings, read-only (migration 0013, extended by 0018).
 *
 * The member app only ever *reads* these — `gym_settings_write_admin` means a
 * write from here would be rejected by RLS anyway. The admin app has its own
 * copy of this module with the update functions; this one deliberately doesn't,
 * so nothing on the phone can even try.
 */
export interface GymSettingsRow {
  id: boolean;
  gym_name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  opening_time: string | null;
  closing_time: string | null;
  /** Check-in and workout activity choices, defined by the gym (0018). */
  activity_options: string[];
  updated_at: string;
  updated_by: string | null;
}

/** Single-row table — there is only ever id = true. */
export async function getGymSettings(): Promise<GymSettingsRow | null> {
  const { data, error } = await supabase.from('gym_settings').select('*').eq('id', true).maybeSingle();
  if (error) throw error;
  return data;
}
