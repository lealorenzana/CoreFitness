import { supabase } from '../supabaseClient';

/**
 * Coach <-> member chat (0131). A member talks to the coaches they train with,
 * a coach to their own trainees; only those two ever read a conversation — not
 * the owner, not the desk (RLS). Opening, sending, reading and muting are SQL
 * functions that check who is asking; this module asks.
 *
 * There is no realtime channel: an open conversation polls every few seconds,
 * which is plenty for coaching and costs nothing on the free tier.
 */

export interface Conversation {
  id: string; otherId: string; otherName: string; otherPhoto: string | null;
  lastMessage: string | null; lastFromMe: boolean; lastMessageAt: string | null;
  unread: number; muted: boolean; otherReadAt: string | null;
}
export interface Message { id: string; senderId: string; body: string; createdAt: string }

const clean = (m: string) => m.replace(/^.*?: /, '');

/** undefined = 0131 not live yet. */
export async function myConversations(): Promise<Conversation[] | undefined> {
  const { data, error } = await supabase.rpc('my_conversations');
  if (error) return undefined;
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: r.id as string, otherId: r.other_id as string, otherName: r.other_name as string,
    otherPhoto: r.other_photo as string | null, lastMessage: r.last_message as string | null,
    lastFromMe: !!r.last_from_me, lastMessageAt: r.last_message_at as string | null,
    unread: Number(r.unread ?? 0), muted: !!r.muted, otherReadAt: r.other_read_at as string | null,
  }));
}

export async function myCoaches(): Promise<{ id: string; name: string; photoUrl: string | null }[]> {
  const { data, error } = await supabase.rpc('my_coaches');
  if (error) return [];
  return ((data ?? []) as { trainer_id: string; name: string; photo_url: string | null }[])
    .map((c) => ({ id: c.trainer_id, name: c.name, photoUrl: c.photo_url }));
}

export async function openConversation(otherId: string): Promise<string> {
  const { data, error } = await supabase.rpc('open_conversation', { p_other: otherId });
  if (error) throw new Error(clean(error.message));
  return data as string;
}

export async function listMessages(conversationId: string): Promise<Message[]> {
  const { data, error } = await supabase.from('messages').select('id, sender_id, body, created_at')
    .eq('conversation_id', conversationId).order('created_at', { ascending: false }).limit(200);
  if (error) throw new Error(clean(error.message));
  return ((data ?? []) as { id: string; sender_id: string; body: string; created_at: string }[])
    .reverse().map((m) => ({ id: m.id, senderId: m.sender_id, body: m.body, createdAt: m.created_at }));
}

export async function sendMessage(conversationId: string, body: string): Promise<void> {
  const { error } = await supabase.rpc('send_message', { p_conversation: conversationId, p_body: body.trim() });
  if (error) throw new Error(clean(error.message));
}

export async function markRead(conversationId: string): Promise<void> {
  await supabase.rpc('mark_conversation_read', { p_conversation: conversationId }).then(() => undefined, () => undefined);
}

export async function setMuted(conversationId: string, muted: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_conversation_muted', { p_conversation: conversationId, p_muted: muted });
  if (error) throw new Error(clean(error.message));
}
