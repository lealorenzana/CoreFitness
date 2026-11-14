import { supabase } from '../supabaseClient';

/** Time slots (0259): the gym's rules, the slots with how full each is, booking and cancelling. */
export interface SlotRules { on: boolean; door: 'reserve' | 'required'; aheadDays: number; perDay: number; cancelMinutes: number }
export interface Slot { date: string; starts: string; ends: string; capacity: number; booked: number; walkIns: number; myBooking: string | null }

export async function slotRules(): Promise<SlotRules | null> {
  const { data, error } = await supabase.rpc('gym_slot_settings');
  if (error || !data) return null;
  const d = data as { on: boolean; door: 'reserve' | 'required'; ahead_days: number; per_day: number; cancel_minutes: number };
  return { on: d.on, door: d.door, aheadDays: d.ahead_days, perDay: d.per_day, cancelMinutes: d.cancel_minutes };
}

/** The slots from `from` for `days` more days. Null on a failed read (never an empty "no slots"). */
export async function listSlots(from: string, days: number): Promise<Slot[] | null> {
  const { data, error } = await supabase.rpc('gym_slots', { p_from: from, p_days: days });
  if (error) return null;
  return ((data ?? []) as { slot_date: string; starts: string; ends: string; capacity: number; booked: number; walk_ins: number; my_booking: string | null }[])
    .map((r) => ({ date: r.slot_date, starts: r.starts, ends: r.ends, capacity: r.capacity, booked: r.booked, walkIns: r.walk_ins, myBooking: r.my_booking }));
}

const call = async (fn: string, args: Record<string, unknown>) => {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data;
};
export const bookSlot = (date: string, starts: string) => call('book_slot', { p_date: date, p_starts: starts });
export const cancelSlot = (id: string) => call('cancel_slot', { p_id: id });
