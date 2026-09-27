import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { Bell, BellSlash, PaperPlaneRight } from '@phosphor-icons/react';
import { Page, PageTitle } from '../../components/ui/page';
import { TextArea } from '../../components/ui/Field';
import { SkeletonList } from '../../components/ui/Skeleton';
import { toast } from '../../components/ui/Toast';
import { errorMessage } from '../../utils/errorMessage';
import { supabase } from '../../lib/supabaseClient';
import {
  listMessages, markRead, myConversations, sendMessage, setMuted, type Conversation as Conv, type Message,
} from '../../lib/api/chat';

const POLL_MS = 5000;

/**
 * One chat (0131). Newest at the bottom; "Seen" under your last message once
 * the other person has opened the chat since. It polls while open — there is no
 * realtime channel — and marks the chat read each time it looks.
 */
export default function Conversation() {
  const { conversationId = '' } = useParams();
  const { pathname } = useLocation();
  const base = pathname.startsWith('/trainer') ? '/trainer/messages' : '/member/messages';
  const [conv, setConv] = useState<Conv | null | undefined>(undefined);
  const [msgs, setMsgs] = useState<Message[] | null>(null);
  const [me, setMe] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const count = useRef(0);

  const load = useCallback(async () => {
    try {
      const [m, all] = await Promise.all([listMessages(conversationId), myConversations()]);
      await markRead(conversationId);
      setMsgs(m);
      setConv(all?.find((c) => c.id === conversationId) ?? null);
    } catch {
      setMsgs([]); setConv(null);
    }
  }, [conversationId]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const { data } = await supabase.auth.getUser();
      if (alive) setMe(data.user?.id ?? null);
      await load();
    })();
    const t = window.setInterval(() => { void load(); }, POLL_MS);
    return () => { alive = false; window.clearInterval(t); };
  }, [load]);

  // Scroll to the newest only when something new arrived, not on every poll.
  useEffect(() => {
    if (msgs && msgs.length !== count.current) {
      count.current = msgs.length;
      bottom.current?.scrollIntoView({ block: 'end' });
    }
  }, [msgs]);

  const send = async () => {
    const text = draft.trim();
    if (!text) return;
    setBusy(true);
    try { await sendMessage(conversationId, text); setDraft(''); await load(); }
    catch (e) { toast.error(errorMessage(e, 'The message could not be sent')); }
    finally { setBusy(false); }
  };

  const toggleMute = async () => {
    if (!conv) return;
    try { await setMuted(conversationId, !conv.muted); toast.success(conv.muted ? 'Notifications on for this chat.' : 'Muted. Messages still arrive, quietly.'); await load(); }
    catch (e) { toast.error(errorMessage(e, 'That did not work')); }
  };

  if (conv === undefined || msgs === null) return <Page><PageTitle back fallback={base} title="Messages" /><SkeletonList /></Page>;
  if (conv === null) {
    return <Page><PageTitle back fallback={base} title="Messages" /><p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>This chat is not one of yours.</p></Page>;
  }

  const lastMine = [...msgs].reverse().find((m) => m.senderId === me);
  const seen = !!(lastMine && conv.otherReadAt && new Date(conv.otherReadAt) >= new Date(lastMine.createdAt));

  return (
    <Page>
      <PageTitle back fallback={base} title={conv.otherName} subtitle="Only the two of you can read this"
        action={
          <button onClick={() => void toggleMute()} aria-label={conv.muted ? 'Unmute this chat' : 'Mute this chat'}
            style={{ color: 'var(--color-text-muted)', padding: 6 }}>
            {conv.muted ? <BellSlash size={20} /> : <Bell size={20} />}
          </button>
        } />

      <div className="flex flex-col" style={{ gap: 6 }}>
        {msgs.length === 0 && (
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Say hello — {conv.otherName.split(' ')[0]} gets a notification.</p>
        )}
        {msgs.map((m, i) => {
          const mine = m.senderId === me;
          const newDay = i === 0 || new Date(msgs[i - 1].createdAt).toDateString() !== new Date(m.createdAt).toDateString();
          return (
            <div key={m.id}>
              {newDay && (
                <p style={{ textAlign: 'center', fontSize: 12, margin: '8px 0', color: 'var(--color-text-muted)' }}>
                  {new Date(m.createdAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                </p>
              )}
              <div className="flex" style={{ justifyContent: mine ? 'flex-end' : 'flex-start' }}>
                <div style={{ maxWidth: '80%', padding: '8px 12px', borderRadius: 16, whiteSpace: 'pre-wrap', fontSize: 14,
                  background: mine ? 'var(--color-primary)' : 'var(--color-surface-raised)',
                  color: mine ? '#fff' : 'var(--color-text-primary)',
                  borderBottomRightRadius: mine ? 4 : 16, borderBottomLeftRadius: mine ? 16 : 4 }}>
                  {m.body}
                  <span style={{ display: 'block', fontSize: 12, marginTop: 2, opacity: 0.7, textAlign: 'right' }}>
                    {new Date(m.createdAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                  </span>
                </div>
              </div>
              {lastMine?.id === m.id && seen && (
                <p style={{ textAlign: 'right', fontSize: 12, marginTop: 2, color: 'var(--color-text-muted)' }}>Seen</p>
              )}
            </div>
          );
        })}
        <div ref={bottom} />
      </div>

      <div className="flex items-end" style={{ gap: 8, position: 'sticky', bottom: 0, paddingTop: 8, background: 'var(--color-bg, transparent)' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <TextArea rows={2} value={draft} aria-label="Message" placeholder="Write a message"
            onChange={(e) => setDraft(e.target.value.slice(0, 2000))}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }} />
        </div>
        <button type="button" onClick={() => void send()} disabled={busy || !draft.trim()} aria-label="Send"
          className="flex-none flex items-center justify-center"
          style={{ width: 44, height: 44, borderRadius: 22, background: 'var(--color-secondary)', color: '#000',
            opacity: busy || !draft.trim() ? 0.45 : 1 }}>
          <PaperPlaneRight size={20} weight="fill" />
        </button>
      </div>
    </Page>
  );
}
