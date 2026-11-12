import { useCallback, useEffect, useRef, useState } from 'react';
import {
  syncChat, chatHistory, sendChatMessage, reactToMessage, uploadChatPhoto, discardChatPhoto, newMessageId,
  type ChatMessage, type ChatState,
} from '../lib/api/gymChat';

/**
 * The open gym chat (0246): polls, merges, sends.
 *
 * **Identical in both apps** — diff before changing one.
 *
 * - **Polling, not a socket.** `gym_chat_sync` every 3 seconds while the page is
 *   visible; the answer carries only messages that changed, merged here by id
 *   (a reaction, a pin or a removal arrives as the same message, newer).
 * - **A message is on screen the moment it is sent**, marked sending. Its id is
 *   made here, so a retry after a lost reply is the same message. A refusal from
 *   the server (stopped from posting, too fast) is shown on the bubble in the
 *   server's own words; only a dropped connection is retried.
 * - **Not in the offline outbox, on purpose:** a line in a group chat that goes
 *   out hours later, when the phone finds signal, lands in the wrong conversation.
 *   With no signal the bubble says it failed and offers Retry.
 */

const POLL_MS = 3000;

export interface PendingMessage {
  id: string; body: string; replyTo: ChatMessage | null; mentions: string[];
  /** A local preview while the photo uploads. */
  photoPreview: string | null;
  status: 'sending' | 'failed';
  error: string | null;
  /** Failed for lack of a connection (Retry makes sense), not refused by the gym's rules. */
  retryable: boolean;
  createdAt: string;
}

export type ChatMeta = Omit<ChatState, 'messages'>;

export type ChatStatus =
  | { kind: 'loading' }
  | { kind: 'closed'; why: string }
  | { kind: 'error'; message: string }
  | { kind: 'open' };

const isNetwork = (msg: string) => /failed to fetch|networkerror|load failed|network request failed|timeout/i.test(msg);

export function useGymChat(active: boolean) {
  const [status, setStatus] = useState<ChatStatus>({ kind: 'loading' });
  const [meta, setMeta] = useState<ChatMeta | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pending, setPending] = useState<PendingMessage[]>([]);
  const [hasOlder, setHasOlder] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);

  const since = useRef<string | null>(null);
  const typingUntil = useRef(0);
  const busy = useRef(false);
  const alive = useRef(true);
  const loaded = useRef(false);
  /** What a retry needs again: the photo not yet uploaded, or the path it reached. */
  const retryData = useRef(new Map<string, { file: File | null; photoPath: string | null }>());
  const activeRef = useRef(active);
  useEffect(() => { activeRef.current = active; }, [active]);

  const merge = useCallback((incoming: ChatMessage[]) => {
    if (!incoming.length) return;
    setMessages((prev) => {
      const map = new Map(prev.map((m) => [m.id, m]));
      for (const m of incoming) {
        const old = map.get(m.id);
        if (!old || old.updated_at <= m.updated_at) map.set(m.id, m);
      }
      return [...map.values()].sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0));
    });
    // A message that has arrived from the server is no longer pending.
    const ids = new Set(incoming.map((m) => m.id));
    setPending((p) => (p.some((x) => ids.has(x.id)) ? p.filter((x) => !ids.has(x.id)) : p));
  }, []);

  const tick = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const visible = activeRef.current && document.visibilityState === 'visible';
      const res = await syncChat(since.current, Date.now() < typingUntil.current, visible);
      if (!alive.current) return;
      if (!res.open) {
        setStatus({ kind: 'closed', why: res.why });
        setMeta(null);
        return;
      }
      const { messages: incoming, ...rest } = res;
      if (since.current === null && incoming.length < 50) setHasOlder(false);
      since.current = res.now;
      loaded.current = true;
      setMeta(rest);
      merge(incoming);
      setStatus({ kind: 'open' });
    } catch (e) {
      if (!alive.current) return;
      // A poll that fails once the chat is on screen keeps what is shown; the next one tries again.
      if (!loaded.current) setStatus({ kind: 'error', message: e instanceof Error ? e.message : 'The chat could not be loaded.' });
    } finally {
      busy.current = false;
    }
  }, [merge]);

  useEffect(() => {
    alive.current = true;
    const first = setTimeout(() => { void tick(); }, 0);
    const timer = setInterval(() => { if (document.visibilityState === 'visible') void tick(); }, POLL_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') void tick(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive.current = false;
      clearTimeout(first);
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [tick]);

  const retryLoad = useCallback(() => {
    setStatus({ kind: 'loading' });
    void tick();
  }, [tick]);

  /** Call while the person types; the next poll tells the others. */
  const typing = useCallback(() => {
    const was = typingUntil.current;
    typingUntil.current = Date.now() + 4000;
    if (Date.now() > was) void tick(); // the first keystroke goes out at once
  }, [tick]);

  const loadOlder = useCallback(async () => {
    if (loadingOlder || !hasOlder || !messages.length) return;
    setLoadingOlder(true);
    try {
      const older = await chatHistory(messages[0].created_at, 50);
      if (older.length < 50) setHasOlder(false);
      merge(older);
    } catch { /* stays as it is; scrolling up again retries */ } finally {
      setLoadingOlder(false);
    }
  }, [loadingOlder, hasOlder, messages, merge]);

  const deliver = useCallback(async (p: PendingMessage, file: File | null, photoPath: string | null) => {
    let path = photoPath;
    try {
      if (file && !path && meta) path = await uploadChatPhoto(file, meta.me);
      const sent = await sendChatMessage({ id: p.id, body: p.body, photoPath: path, replyTo: p.replyTo?.id ?? null, mentions: p.mentions });
      typingUntil.current = 0;
      merge([sent]);
      if (p.photoPreview) URL.revokeObjectURL(p.photoPreview);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'That did not send.';
      // Refused by the gym's rules: the uploaded photo has no message to belong to.
      if (path && !isNetwork(message)) discardChatPhoto(path);
      setPending((list) => list.map((x) => (x.id === p.id
        ? { ...x, status: 'failed', retryable: isNetwork(message), error: isNetwork(message) ? 'No connection. Tap to try again.' : message }
        : x)));
      if (isNetwork(message)) retryData.current.set(p.id, { file, photoPath: path });
    }
  }, [meta, merge]);

  const send = useCallback((body: string, opts: { file?: File | null; replyTo?: ChatMessage | null; mentions?: string[] } = {}) => {
    const text = body.trim();
    if (!text && !opts.file) return;
    const p: PendingMessage = {
      id: newMessageId(), body: text, replyTo: opts.replyTo ?? null, mentions: opts.mentions ?? [],
      photoPreview: opts.file ? URL.createObjectURL(opts.file) : null,
      status: 'sending', error: null, retryable: false, createdAt: new Date().toISOString(),
    };
    setPending((list) => [...list, p]);
    void deliver(p, opts.file ?? null, null);
  }, [deliver]);

  /** Try a failed message again (only one that failed for lack of a connection). */
  const retry = useCallback((id: string) => {
    const p = pending.find((x) => x.id === id);
    if (!p || !p.retryable) return;
    const d = retryData.current.get(id);
    setPending((list) => list.map((x) => (x.id === id ? { ...x, status: 'sending', error: null } : x)));
    void deliver(p, d?.file ?? null, d?.photoPath ?? null);
  }, [pending, deliver]);

  const discard = useCallback((id: string) => {
    setPending((list) => {
      const p = list.find((x) => x.id === id);
      if (p?.photoPreview) URL.revokeObjectURL(p.photoPreview);
      return list.filter((x) => x.id !== id);
    });
    const d = retryData.current.get(id);
    if (d?.photoPath) discardChatPhoto(d.photoPath);
    retryData.current.delete(id);
  }, []);

  /** A reaction, shown at once and corrected by the server's answer. */
  const react = useCallback(async (m: ChatMessage, emoji: string) => {
    const mine = m.reactions.find((r) => r.mine)?.emoji ?? null;
    const next = mine === emoji ? null : emoji;
    const optimistic: ChatMessage = {
      ...m,
      reactions: m.reactions
        .map((r) => (r.mine ? { ...r, count: r.count - 1, mine: false } : r))
        .filter((r) => r.count > 0)
        .map((r) => (next && r.emoji === next ? { ...r, count: r.count + 1, mine: true } : r)),
    };
    if (next && !optimistic.reactions.some((r) => r.emoji === next)) optimistic.reactions.push({ emoji: next, count: 1, mine: true });
    setMessages((prev) => prev.map((x) => (x.id === m.id ? optimistic : x)));
    try {
      merge([await reactToMessage(m.id, emoji)]);
    } catch (e) {
      setMessages((prev) => prev.map((x) => (x.id === m.id ? m : x)));
      throw e;
    }
  }, [merge]);

  return {
    status, meta, messages, pending, hasOlder, loadingOlder,
    retryLoad, typing, loadOlder, send, retry, discard, react,
    /** Ask for changes now (after pinning, removing, muting…) instead of waiting for the next poll. */
    refresh: tick,
  };
}

export type GymChat = ReturnType<typeof useGymChat>;
