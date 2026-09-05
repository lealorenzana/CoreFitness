import { supabase } from '../supabaseClient';
import type { ProfileRow, ProfileStatus } from '../../types/db';

export interface GymSettingsRow {
  id: boolean;
  gym_name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  opening_time: string | null;
  closing_time: string | null;
  /** Check-in activity choices, editable by the gym (0018). Pre-defined at the
   *  point of check-in so the data aggregates, but the list is the gym's own. */
  activity_options: string[];
  /** Branding (0067). All three NULL until an admin sets them; the shell then
   *  renders its bundled defaults rather than a blank corner. */
  logo_url: string | null;
  short_name: string | null;
  tagline: string | null;
  updated_at: string;
  updated_by: string | null;
}

/** Single-row table (migration 0013) — there is only ever id = true. */
export async function getGymSettings(): Promise<GymSettingsRow | null> {
  const { data, error } = await supabase.from('gym_settings').select('*').eq('id', true).maybeSingle();
  if (error) throw error;
  return data;
}

/** Admin only per RLS (gym_settings_update_admin). */
export async function updateGymSettings(
  updates: Partial<Omit<GymSettingsRow, 'id' | 'updated_at' | 'updated_by'>>
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase
    .from('gym_settings')
    .update({ ...updates, updated_at: new Date().toISOString(), updated_by: user?.id ?? null })
    .eq('id', true);
  if (error) throw error;
}

/**
 * Changes the signed-in user's real Supabase Auth password.
 *
 * The old Settings page did `localStorage.setItem('admin_password', next)` — it
 * stored the new password in plaintext and never touched the actual credential,
 * so an admin who "rotated" their password had in fact changed nothing.
 *
 * Supabase has no "verify current password" endpoint, so we re-authenticate with
 * it first. Without that check, anyone who walked up to an unlocked browser could
 * silently take over the account.
 */
export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) throw new Error('No signed-in user');

  const { error: reauthError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  });
  if (reauthError) throw new Error('Current password is incorrect');

  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

/** Staff/admin accounts, for the Settings account list. */
export async function listStaffAccounts(): Promise<ProfileRow[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .in('role', ['admin', 'staff'])
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/**
 * Suspend, reactivate or archive a staff account.
 *
 * The page could create front-desk staff and never do anything else with them,
 * so somebody who left the gym kept a working login — and a front-desk login
 * takes payments and checks members in. Same gap the trainer roster had.
 *
 * `.select()` so a write that matched nothing throws instead of reporting
 * success: an admin cannot demote themselves through this path, and a silent
 * no-op would look identical to a change that worked.
 */
export async function setStaffStatus(id: string, status: ProfileStatus): Promise<void> {
  const { data, error } = await supabase
    .from('profiles')
    .update({ status })
    .eq('id', id)
    .select('id');
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error('That account was not changed — you may not have permission to alter it.');
  }
}

/**
 * Admin-only: creates a real front-desk staff account via the create-staff Edge
 * Function, so the admin's own session is never swapped.
 *
 * `supabase.functions.invoke` does not surface an Edge Function's JSON error body
 * on a non-2xx — the real message is on `error.context`, so unwrap it.
 */
export async function createStaffAccount(input: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
}): Promise<{ id: string; email: string }> {
  const { data, error } = await supabase.functions.invoke('create-staff', { body: input });
  if (error) {
    const context = (error as { context?: Response }).context;
    let serverMessage: string | undefined;
    if (context && typeof context.json === 'function') {
      try {
        const body = await context.json();
        serverMessage = body?.error;
      } catch {
        /* body wasn't JSON */
      }
    }
    throw new Error(serverMessage ?? error.message);
  }
  return data as { id: string; email: string };
}
