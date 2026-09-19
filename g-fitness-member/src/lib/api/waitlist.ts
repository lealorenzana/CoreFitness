import { supabase } from '../supabaseClient';

/**
 * Class waitlists (migration 0096). Joining and leaving go through functions —
 * the table has no insert policy, and `join_waitlist()` refuses a class that
 * still has seats, has started, or that you are already booked into.
 */

export interface WaitlistStatus { waiting: number; myPosition: number | null }

const missingFn = (e: { code?: string } | null) => e?.code === 'PGRST202' || e?.code === '42883';

/** Waiting counts and your place, per class. Null before 0096 is pasted — the screen then says "Full" as before. */
export async function waitlistStatus(classIds: string[]): Promise<Map<string, WaitlistStatus> | null> {
  if (classIds.length === 0) return new Map();
  const { data, error } = await supabase.rpc('class_waitlist_status', { p_classes: classIds });
  if (missingFn(error)) return null;
  if (error) throw error;
  return new Map(((data ?? []) as { class_id: string; waiting: number; my_position: number | null }[])
    .map((r) => [r.class_id, { waiting: r.waiting, myPosition: r.my_position }]));
}

/** Returns your place in line. */
export async function joinWaitlist(classId: string): Promise<number> {
  const { data, error } = await supabase.rpc('join_waitlist', { p_class: classId });
  if (error) throw error;
  return Number(data);
}

export async function leaveWaitlist(classId: string): Promise<void> {
  const { error } = await supabase.rpc('leave_waitlist', { p_class: classId });
  if (error) throw error;
}
