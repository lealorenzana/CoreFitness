import { supabase } from '../supabaseClient';

/**
 * Saved assistant conversations (migration 0046).
 *
 * The chat used to live in `useState` and nothing else — reloading, switching
 * tabs or closing the sheet threw it away. These rows are what make "keep this
 * thread", "start a new one" and "delete that" mean anything.
 *
 * **Owned by the profile, not the member**, because the trainer role runs in
 * this same app and has its own assistant. Every query here is scoped by RLS to
 * `auth.uid()`, so none of them pass a user id — passing one would be a lie
 * about where the boundary is. The database decides whose rows these are.
 */

export interface Conversation {
  id: string;
  /** NULL until the first thing the user says; the list falls back to a label. */
  title: string | null;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  body: string;
  createdAt: string;
}

interface ConversationRow {
  id: string;
  title: string | null;
  updated_at: string;
}

interface MessageRow {
  id: string;
  role: string;
  body: string;
  created_at: string;
}

/** Most recently talked to first — `updated_at` is bumped by a trigger, not here. */
export async function listConversations(): Promise<Conversation[]> {
  const { data, error } = await supabase
    .from('assistant_conversations')
    .select('id, title, updated_at')
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r: ConversationRow) => ({
    id: r.id,
    title: r.title,
    updatedAt: r.updated_at,
  }));
}

export async function listMessages(conversationId: string): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from('assistant_messages')
    .select('id, role, body, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r: MessageRow) => ({
    id: r.id,
    // Narrowed rather than cast: the column has a CHECK, but a row that somehow
    // held anything else should read as the assistant, never as the member.
    role: r.role === 'user' ? 'user' : 'assistant',
    body: r.body,
    createdAt: r.created_at,
  }));
}

/**
 * `user_id` is stated explicitly because the column has no default — the RLS
 * `with check (user_id = auth.uid())` then rejects any other value, so this is
 * checked by the database rather than trusted from here.
 */
export async function createConversation(title: string | null = null): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Your session could not be verified. Please sign in again.');

  const { data, error } = await supabase
    .from('assistant_conversations')
    .insert({ user_id: user.id, title })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

export async function appendMessage(
  conversationId: string,
  role: 'user' | 'assistant',
  body: string
): Promise<void> {
  const { error } = await supabase
    .from('assistant_messages')
    .insert({ conversation_id: conversationId, role, body });
  if (error) throw error;
}

/**
 * `.select()` so a write that matched no row is an error rather than a silent
 * success — a zero-row UPDATE is not an error in PostgreSQL, which is how this
 * codebase once threw away every experience level it collected.
 */
export async function renameConversation(id: string, title: string): Promise<void> {
  const { data, error } = await supabase
    .from('assistant_conversations')
    .update({ title })
    .eq('id', id)
    .select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('That conversation no longer exists.');
}

/** Messages cascade with it (0046). */
export async function deleteConversation(id: string): Promise<void> {
  const { data, error } = await supabase
    .from('assistant_conversations')
    .delete()
    .eq('id', id)
    .select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('That conversation no longer exists.');
}

/**
 * A readable name from the first thing the user typed.
 *
 * Trimmed to a phrase rather than stored whole: the list shows one line, and a
 * paragraph-long first message would push every other thread off the screen.
 */
export function titleFrom(firstMessage: string): string {
  const clean = firstMessage.replace(/\s+/g, ' ').trim();
  if (clean.length <= 42) return clean || 'New chat';
  return `${clean.slice(0, 41).trimEnd()}…`;
}
