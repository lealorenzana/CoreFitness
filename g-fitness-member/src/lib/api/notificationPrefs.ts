import { supabase } from '../supabaseClient';

/**
 * Notification preferences.
 *
 * These gate **push delivery and the in-app sound only**. They never stop a
 * notification row being written: the bell is the record of what happened to
 * your membership, and silencing a channel must not erase the history. That
 * distinction is what makes these switches honest — each one changes something
 * observable, and none of them quietly drops data.
 */

export interface NotificationPrefs {
  soundEnabled: boolean;
  booking: boolean;
  payment: boolean;
  membership: boolean;
  event: boolean;
}

export const DEFAULT_PREFS: NotificationPrefs = {
  soundEnabled: true,
  booking: true,
  payment: true,
  membership: true,
  event: true,
};

/** Falls back to defaults — a member who never opened Settings still gets told. */
export async function getMyPrefs(): Promise<NotificationPrefs> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) return DEFAULT_PREFS;

  const { data, error } = await supabase
    .from('notification_prefs')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data) return DEFAULT_PREFS;

  return {
    soundEnabled: data.sound_enabled,
    booking: data.cat_booking,
    payment: data.cat_payment,
    membership: data.cat_membership,
    event: data.cat_event,
  };
}

export async function updateMyPrefs(patch: Partial<NotificationPrefs>): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) throw new Error('You need to be signed in to change this');

  // Read-modify-write rather than a bare upsert of the patch: upserting only
  // the changed column would reset every other preference to its default.
  const current = await getMyPrefs();
  const next = { ...current, ...patch };

  const { error } = await supabase.from('notification_prefs').upsert(
    {
      user_id: userId,
      sound_enabled: next.soundEnabled,
      cat_booking: next.booking,
      cat_payment: next.payment,
      cat_membership: next.membership,
      cat_event: next.event,
    },
    { onConflict: 'user_id' }
  );
  if (error) throw error;
}
