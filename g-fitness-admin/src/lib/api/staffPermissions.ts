import { supabase } from '../supabaseClient';

/**
 * What each front-desk account may do (0161). The database keeps it — a
 * restrictive policy and a trigger per area — so hiding a sidebar link is the
 * convenience, not the rule. No row = the whole desk.
 */
export type StaffArea = 'checkins' | 'payments' | 'members' | 'bookings' | 'shop' | 'communications' | 'rewards';

export const STAFF_AREAS: { key: StaffArea; label: string; what: string }[] = [
  { key: 'checkins', label: 'Check-ins', what: 'Check members in at the desk and the kiosk.' },
  { key: 'payments', label: 'Payments', what: 'Take payments, renewals and the cash drawer; sees payment history.' },
  { key: 'members', label: 'Members', what: 'Approve sign-ups, edit member details, freezes and cancellations.' },
  { key: 'bookings', label: 'Bookings', what: 'Book, move and cancel classes and 1-on-1 sessions for members.' },
  { key: 'shop', label: 'Shop', what: 'Sell at the counter, void today’s sales; sees shop sales.' },
  { key: 'communications', label: 'Announcements & events', what: 'Send and recall announcements; create and edit events.' },
  { key: 'rewards', label: 'Rewards hand-over', what: 'Mark rewards and season prizes as handed over.' },
];

/** user id → areas; a person missing from the map has the whole desk. Null before 0161. */
export async function listStaffPermissions(): Promise<Map<string, StaffArea[]> | null> {
  const { data, error } = await supabase.from('staff_permissions').select('user_id, areas');
  if (error) return null;
  return new Map(((data ?? []) as { user_id: string; areas: StaffArea[] }[]).map((r) => [r.user_id, r.areas]));
}

/** null = back to the whole desk. */
export async function setStaffPermissions(userId: string, areas: StaffArea[] | null): Promise<void> {
  const { error } = await supabase.rpc('set_staff_permissions', { p_user: userId, p_areas: areas });
  if (error) throw new Error(error.message.replace(/^.*?: /, ''));
}

/** The signed-in account's own areas: null = the whole desk (or not staff, or before 0161). */
export async function myStaffPermissions(): Promise<StaffArea[] | null> {
  const { data, error } = await supabase.rpc('my_staff_permissions');
  if (error || !Array.isArray(data)) return null;
  return data as StaffArea[];
}
