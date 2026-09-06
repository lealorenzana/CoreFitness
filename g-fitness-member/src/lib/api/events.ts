import { assertWrote } from './mutate';
import { supabase } from '../supabaseClient';

export interface EventRow {
  id: string;
  title: string;
  description: string | null;
  starts_at: string;
  duration_minutes: number;
  location: string | null;
  capacity: number;
  cancelled: boolean;
  /** Who it is aimed at, in the gym's words — "Everyone, no experience needed".
   *  The line that decides whether a beginner signs up (0057). */
  who_is_it_for: string | null;
  what_to_bring: string | null;
  /** NULL = free, and the screens say "Free". 0 = deliberately priced at zero
   *  and shows as "₱0". Those are different claims, so they stay distinct. */
  fee: number | null;
  contact: string | null;
  /** Pins it to the top of the member Events screen. */
  is_featured: boolean;
  /** Optional picture the gym attached (0065). NULL is normal and draws
   *  nothing — never a stock photo standing in for one they did not choose. */
  image_url: string | null;
  created_by: string | null;
  created_at: string;
}

export interface EventRegistrationRow {
  id: string;
  event_id: string;
  member_id: string;
  registered_at: string;
}

/**
 * Derived, never stored — see migration 0014. A persisted status column goes
 * stale the moment an event's date passes, so this is computed at read time.
 */
export type EventStatus = 'Upcoming' | 'Ongoing' | 'Completed' | 'Cancelled';

export function eventStatus(event: EventRow, now = new Date()): EventStatus {
  if (event.cancelled) return 'Cancelled';
  const start = new Date(event.starts_at).getTime();
  const end = start + event.duration_minutes * 60 * 1000;
  const t = now.getTime();
  if (t < start) return 'Upcoming';
  if (t <= end) return 'Ongoing';
  return 'Completed';
}

export async function listEvents(): Promise<EventRow[]> {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .order('starts_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createEvent(
  input: Omit<EventRow, 'id' | 'created_at' | 'created_by' | 'cancelled'> & { cancelled?: boolean }
): Promise<EventRow> {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('events')
    .insert({ ...input, created_by: user?.id ?? null })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateEvent(
  id: string,
  updates: Partial<Omit<EventRow, 'id' | 'created_at' | 'created_by'>>
): Promise<void> {
  const { data, error } = await supabase
    .from('events').update(updates).eq('id', id)
    .select('id');
  if (error) throw error;
  assertWrote(data, 'That event could not be saved. Please refresh and try again.');
}

export async function deleteEvent(id: string): Promise<void> {
  const { data, error } = await supabase
    .from('events').delete().eq('id', id)
    .select('id');
  if (error) throw error;
  assertWrote(data, 'That event could not be deleted. Please refresh and try again.');
}

/** All registrations, for headcounts across the events list. */
export async function listRegistrations(): Promise<EventRegistrationRow[]> {
  const { data, error } = await supabase
    .from('event_registrations')
    .select('*')
    .order('registered_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function listEventRegistrations(eventId: string): Promise<EventRegistrationRow[]> {
  const { data, error } = await supabase
    .from('event_registrations')
    .select('*')
    .eq('event_id', eventId)
    .order('registered_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** Member self-signup, or the front desk adding someone at the counter. */
export async function registerForEvent(eventId: string, memberId: string): Promise<void> {
  const { error } = await supabase
    .from('event_registrations')
    .insert({ event_id: eventId, member_id: memberId });
  if (error) throw error;
}

export async function cancelRegistration(eventId: string, memberId: string): Promise<void> {
  const { error } = await supabase
    .from('event_registrations')
    .delete()
    .eq('event_id', eventId)
    .eq('member_id', memberId);
  if (error) throw error;
}
