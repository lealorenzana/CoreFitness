import { supabase } from '../supabaseClient';
import { currentGymId } from '../gymContext';

/**
 * The gym chat (0246): one group chat for the whole gym.
 *
 * **Identical in both apps** — diff before changing one. Every read and write
 * is an RPC: the tables have no policy a screen could lean on, so who is in the
 * chat, who may post and who may moderate are all decided in SQL and handed
 * back in `ChatState`. This file only carries the calls.
 *
 * No realtime channel (the project uses none): the open chat calls `syncChat`
 * every few seconds, and the answer holds only what changed since the last one.
 * Photos are private — read through signed addresses, cached here for an hour.
 */

export type ChatRole = 'admin' | 'staff' | 'trainer' | 'member' | 'left';

export interface ChatReaction { emoji: string; count: number; mine: boolean }

export interface ChatMessage {
  id: string;
  sender_id: string;
  name: string;
  photo: string | null;
  role: ChatRole;
  body: string | null;
  photo_path: string | null;
  mentions: string[];
  created_at: string;
  updated_at: string;
  removed: boolean;
  removed_by_gym: boolean;
  pinned: boolean;
  mine: boolean;
  reply: { id: string; name: string; body: string | null; photo: boolean; removed: boolean } | null;
  reactions: ChatReaction[];
}

export interface ChatSeen { message_id: string | null; count: number; people: { name: string; photo: string | null }[] }

/** What `gym_chat_sync` answers while the chat is the caller's to open. */
export interface ChatState {
  open: true;
  now: string;
  me: string;
  role: ChatRole;
  can_post: boolean;
  why_not: string | null;
  can_moderate: boolean;
  announce_only: boolean;
  muted: boolean;
  emojis: string[];
  messages: ChatMessage[];
  pinned: ChatMessage[];
  typing: string[];
  seen: ChatSeen;
  unread: number;
}
/** …and when it is not (switched off, or the caller is not an active member or staff). */
export interface ChatClosed { open: false; why: string }

export interface ChatPerson {
  user_id: string; name: string; photo: string | null; role: ChatRole;
  silenced: boolean; silenced_reason: string | null;
}

export interface ChatReport {
  report_id: string; message_id: string; reported_at: string; reason: string; reporter: string;
  sender_id: string; sender: string; body: string | null; has_photo: boolean; sent_at: string; reports: number;
}

const fail = (e: { message: string } | null): void => { if (e) throw new Error(e.message); };

export async function syncChat(since: string | null, typing: boolean, seen: boolean): Promise<ChatState | ChatClosed> {
  const { data, error } = await supabase.rpc('gym_chat_sync', { p_since: since, p_typing: typing, p_seen: seen });
  fail(error);
  return data as ChatState | ChatClosed;
}

export async function chatHistory(before: string, limit = 50): Promise<ChatMessage[]> {
  const { data, error } = await supabase.rpc('gym_chat_history', { p_before: before, p_limit: limit });
  fail(error);
  return (data ?? []) as ChatMessage[];
}

/** The badge. 0 when the chat is off or not the caller's — and 0, not an error, when the read fails. */
export async function chatUnread(): Promise<number> {
  try {
    const { data, error } = await supabase.rpc('gym_chat_unread');
    return error ? 0 : Number(data ?? 0);
  } catch { return 0; }
}

export async function chatPeople(): Promise<ChatPerson[]> {
  const { data, error } = await supabase.rpc('gym_chat_members');
  fail(error);
  return (data ?? []) as ChatPerson[];
}

export const newMessageId = (): string =>
  crypto.randomUUID?.() ?? '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) =>
    (Number(c) ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (Number(c) / 4)))).toString(16));

export interface OutgoingMessage { id: string; body: string; photoPath?: string | null; replyTo?: string | null; mentions?: string[] }

/** Send. The id is made on this device, so sending the same one again is the same message. */
export async function sendChatMessage(m: OutgoingMessage): Promise<ChatMessage> {
  const { data, error } = await supabase.rpc('gym_chat_send', {
    p_id: m.id, p_body: m.body, p_photo_path: m.photoPath ?? null, p_reply_to: m.replyTo ?? null, p_mentions: m.mentions ?? [],
  });
  fail(error);
  return data as ChatMessage;
}

/** A reaction on, changed, or (the same one again, or null) off. */
export async function reactToMessage(id: string, emoji: string | null): Promise<ChatMessage> {
  const { data, error } = await supabase.rpc('gym_chat_react', { p_message: id, p_emoji: emoji });
  fail(error);
  return data as ChatMessage;
}

/** Remove a message (your own; or, the owner and desk, anyone's — with a reason). Its photo file goes too. */
export async function removeChatMessage(id: string, reason?: string): Promise<void> {
  const { data, error } = await supabase.rpc('gym_chat_remove', { p_message: id, p_reason: reason ?? null });
  fail(error);
  if (typeof data === 'string' && data) void supabase.storage.from(BUCKET).remove([data]);
}

export async function pinChatMessage(id: string, pinned: boolean): Promise<void> {
  fail((await supabase.rpc('gym_chat_pin', { p_message: id, p_pinned: pinned })).error);
}

export async function setChatMuted(muted: boolean): Promise<void> {
  fail((await supabase.rpc('gym_chat_set_muted', { p_muted: muted })).error);
}

export async function reportChatMessage(id: string, reason: string): Promise<void> {
  fail((await supabase.rpc('gym_chat_report', { p_message: id, p_reason: reason })).error);
}

/** Owner and desk: stop a person posting (with a reason they are told), or let them post again. */
export async function silenceChatPerson(userId: string, silenced: boolean, reason?: string): Promise<void> {
  fail((await supabase.rpc('gym_chat_silence', { p_user: userId, p_silenced: silenced, p_reason: reason ?? null })).error);
}

/** Owner only. */
export async function setChatAnnounceOnly(on: boolean): Promise<void> {
  fail((await supabase.rpc('set_gym_chat_announce_only', { p_on: on })).error);
}

export async function openChatReports(): Promise<ChatReport[]> {
  const { data, error } = await supabase.rpc('gym_chat_open_reports');
  fail(error);
  return (data ?? []) as ChatReport[];
}

export async function dismissChatReport(reportId: string): Promise<void> {
  fail((await supabase.rpc('gym_chat_dismiss_report', { p_report: reportId })).error);
}

// ---- photos ---------------------------------------------------------------------------------

const BUCKET = 'chat';
const MAX_EDGE = 1280;

async function shrink(file: Blob): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bitmap.width * scale); c.height = Math.round(bitmap.height * scale);
    c.getContext('2d')?.drawImage(bitmap, 0, 0, c.width, c.height);
    const out = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/jpeg', 0.82));
    return out ?? file;
  } catch { return file; }
}

/** Put a photo in the caller's own chat folder (shrunk to a phone-sized JPEG). Returns its path, to send. */
export async function uploadChatPhoto(file: File, userId: string): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Choose a photo.');
  const gym = await currentGymId();
  if (!gym) throw new Error('You are not in a gym.');
  const small = await shrink(file);
  if (small.size > 3 * 1024 * 1024) throw new Error('That photo is too large, even shrunk. Try another.');
  const path = `gyms/${gym}/chat/${userId}/${newMessageId()}.jpg`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, small, { contentType: 'image/jpeg', cacheControl: '3600' });
  // The file rules refuse a photo when the person may not post, or when the gym is at its plan's storage (0247).
  if (error) throw new Error(/row-level security|policy/i.test(error.message) ? 'That photo could not be added. Your gym may be out of storage — tell the front desk.' : error.message);
  return path;
}

/** A photo that was uploaded but never sent (the send was refused). */
export function discardChatPhoto(path: string): void {
  void supabase.storage.from(BUCKET).remove([path]);
}

const signed = new Map<string, { url: string; until: number }>();

/** Signed addresses for chat photos, an hour each, remembered so a poll does not re-sign what is on screen. */
export async function chatPhotoUrls(paths: string[]): Promise<Record<string, string>> {
  const now = Date.now();
  const out: Record<string, string> = {};
  const need: string[] = [];
  for (const p of new Set(paths)) {
    const hit = signed.get(p);
    if (hit && hit.until > now + 60_000) out[p] = hit.url; else need.push(p);
  }
  if (need.length) {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrls(need, 3600);
    for (const row of data ?? []) {
      if (row.path && row.signedUrl) {
        signed.set(row.path, { url: row.signedUrl, until: now + 3600_000 });
        out[row.path] = row.signedUrl;
      }
    }
  }
  return out;
}

/** Per-account: called when the account or the gym changes. */
export function clearChatCache(): void {
  signed.clear();
}
