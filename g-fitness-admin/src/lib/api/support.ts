import { supabase } from '../supabaseClient';

/**
 * The gym talking to Core Fitness (0137): announcements the platform sends to
 * gyms (a banner on every screen, dismissible), and support tickets the owner
 * or desk opens and the platform answers. Between this gym and the platform
 * only — no other gym, and never the gym's members or coaches.
 */

export interface Announcement { id: string; title: string; body: string; level: 'info' | 'warning'; startsAt: string }
export interface Ticket {
  id: string; subject: string; status: 'open' | 'answered' | 'closed'; createdAt: string; updatedAt: string;
  lastFrom: 'gym' | 'platform'; unread: boolean; messages: number;
}
export interface ThreadMessage { id: string; authorName: string; fromPlatform: boolean; body: string; createdAt: string }

const clean = (m: string) => m.replace(/^.*?: /, '');

export async function myAnnouncements(): Promise<Announcement[]> {
  const { data, error } = await supabase.rpc('my_announcements');
  if (error) return [];
  return ((data ?? []) as { id: string; title: string; body: string; level: 'info' | 'warning'; starts_at: string }[])
    .map((a) => ({ id: a.id, title: a.title, body: a.body, level: a.level, startsAt: a.starts_at }));
}
export async function dismissAnnouncement(id: string): Promise<void> {
  await supabase.rpc('dismiss_announcement', { p_id: id });
}

/** undefined = 0137 not live yet. */
export async function myTickets(): Promise<Ticket[] | undefined> {
  const { data, error } = await supabase.rpc('my_support_tickets');
  if (error) return undefined;
  return ((data ?? []) as Record<string, unknown>[]).map((t) => ({
    id: t.id as string, subject: t.subject as string, status: t.status as Ticket['status'], createdAt: t.created_at as string,
    updatedAt: t.updated_at as string, lastFrom: t.last_from as Ticket['lastFrom'], unread: !!t.unread, messages: Number(t.messages),
  }));
}
export async function openTicket(subject: string, body: string): Promise<string> {
  const { data, error } = await supabase.rpc('open_support_ticket', { p_subject: subject.trim(), p_body: body.trim() });
  if (error) throw new Error(clean(error.message));
  return data as string;
}
export async function replyTicket(id: string, body: string): Promise<void> {
  const { error } = await supabase.rpc('reply_support_ticket', { p_ticket: id, p_body: body.trim(), p_close: false });
  if (error) throw new Error(clean(error.message));
}
export async function closeTicket(id: string): Promise<void> {
  const { error } = await supabase.rpc('set_ticket_status', { p_ticket: id, p_status: 'closed' });
  if (error) throw new Error(clean(error.message));
}
export async function thread(id: string): Promise<ThreadMessage[]> {
  const { data, error } = await supabase.rpc('support_thread', { p_ticket: id });
  if (error) throw new Error(clean(error.message));
  return ((data ?? []) as { id: string; author_name: string; from_platform: boolean; body: string; created_at: string }[])
    .map((m) => ({ id: m.id, authorName: m.author_name, fromPlatform: m.from_platform, body: m.body, createdAt: m.created_at }));
}

/** Where a ticket's access request stands (0162). Null before 0162 or when unreadable. */
export interface TicketAccess {
  hours: number | null; why: string | null; requested_at: string | null; answer: 'approved' | 'declined' | null;
  expires_at: string | null; live: boolean; first_used_at: string | null;
  resolution: string | null; resolved_at: string | null;
  context: { message?: string; route?: string; build?: string } | null;
}
export async function ticketAccess(id: string): Promise<TicketAccess | null> {
  const { data, error } = await supabase.rpc('ticket_access_state', { p_ticket: id });
  if (error || !data) return null;
  return data as TicketAccess;
}
export async function approveTicketAccess(id: string): Promise<void> {
  const { error } = await supabase.rpc('approve_ticket_access', { p_ticket: id });
  if (error) throw new Error(clean(error.message));
}
export async function declineTicketAccess(id: string): Promise<void> {
  const { error } = await supabase.rpc('decline_ticket_access', { p_ticket: id });
  if (error) throw new Error(clean(error.message));
}
/** A ticket opened from a crash screen: the error goes with it, nothing about members. Falls back to a plain ticket before 0162. */
export async function openTicketWithContext(subject: string, body: string, context: { message: string; route: string; build?: string }): Promise<string> {
  const { data, error } = await supabase.rpc('open_support_ticket_with_context', { p_subject: subject.trim(), p_body: body.trim(), p_context: context });
  if (error) return openTicket(subject, `${body}\n\nError: ${context.message}\nScreen: ${context.route}`);
  return data as string;
}
