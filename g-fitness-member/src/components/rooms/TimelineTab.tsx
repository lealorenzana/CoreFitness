import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Barbell, CalendarBlank, ChatCircleText, ClipboardText, NotePencil, PaperPlaneRight } from '@phosphor-icons/react';
import { TextArea } from '../ui/Field';
import { toast } from '../ui/Toast';
import { supabase } from '../../lib/supabaseClient';
import { coachTimeline, type TimelineItem } from '../../lib/api/coachPlace';
import { listMessages, markRead, myConversations, openConversation, sendMessage, setMuted, type Conversation } from '../../lib/api/chat';
import { roomPeople, type Room } from '../../lib/api/rooms';
import { markFeedback } from '../../lib/api/trainerFeedback';
import { useGymApp } from '../../hooks/useGymApp';
import { moduleOn, word } from '../../lib/gymApp';
import { errorMessage } from '../../utils/errorMessage';

const POLL_MS = 6000;

/**
 * Together — the 1-on-1 room as the ONE place for a member and their coach
 * (2026-10-10, 0174). It used to be four: Messages, Coach notes, this room's
 * stream, and whatever routine the coach mentioned. Now, oldest to newest like
 * a chat: messages as bubbles, the coach's notes as cards that stand out,
 * routines and programs the coach wrote or edited as cards you open, and the
 * room's posts and classwork. Writing a message is still the chat's own
 * `send_message`, so its notifications, "Seen" and mute work as before.
 *
 * The gym can switch chat off (`chat`): the room still holds notes and
 * routines, and says why there is no box to type in.
 */
export default function TimelineTab({ room, mode }: { room: Room; mode: 'trainer' | 'member' }) {
  const navigate = useNavigate();
  const app = useGymApp();
  const chatOn = moduleOn(app, 'chat');
  const coachWord = word(app, 'trainer', true);
  const [items, setItems] = useState<TimelineItem[] | null | undefined>(undefined);
  const [older, setOlder] = useState<TimelineItem[]>([]);
  const [more, setMore] = useState(true);
  const [me, setMe] = useState<string | null>(null);
  const [other, setOther] = useState<{ id: string; name: string } | null>(null);
  const [draft, setDraft] = useState('');
  // The chat's own state (0131): read receipts, "Seen", mute — kept from the old Messages screen.
  const [conv, setConv] = useState<Conversation | null>(null);
  const [busy, setBusy] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const newest = useRef<string | null>(null);
  const marked = useRef(new Set<string>());
  const [doneNow, setDoneNow] = useState<Record<string, boolean>>({});

  const otherForLoad = useRef<string | null>(null);
  const load = useCallback(async () => {
    const page = await coachTimeline(room.id);
    if (page) {
      setItems(page);
      if (page.length < 30) setMore(false);
      return;
    }
    // Before 0174 there is no timeline: show the chat on its own rather than
    // nothing, so a member is never cut off from their coach in between.
    const withId = otherForLoad.current;
    const c = withId ? (await myConversations())?.find((x) => x.otherId === withId) : undefined;
    if (!c) { setItems(withId ? [] : null); setMore(false); return; }
    const msgs = await listMessages(c.id).catch(() => []);
    setItems([...msgs].reverse().map((m) => ({ kind: 'message' as const, id: m.id, at: m.createdAt, authorId: m.senderId, body: m.body, refId: c.id, extra: {} })));
    setMore(false);
  }, [room.id]);

  // The conversation with the other person, marked read whenever the room is looked at.
  const otherId = other?.id ?? null;
  const loadConv = useCallback(async () => {
    if (!otherId) return;
    const c = (await myConversations())?.find((x) => x.otherId === otherId) ?? null;
    setConv(c);
    if (c && c.unread > 0) void markRead(c.id).catch(() => { /* next look tries again */ });
  }, [otherId]);
  useEffect(() => {
    void (async () => { await loadConv(); })();
    const t = window.setInterval(() => { void loadConv(); }, POLL_MS);
    return () => window.clearInterval(t);
  }, [loadConv]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id ?? null;
      // Who is on the other side: the coach for a member; for the coach, the member.
      let o: { id: string; name: string } | null = null;
      if (mode === 'member') o = { id: room.trainerId, name: room.trainerName };
      else {
        const people = await roomPeople(room.id).catch(() => []);
        const m = people.find((p) => !p.isTrainer);
        if (m) o = { id: m.memberId, name: m.name };
      }
      if (!alive) return;
      otherForLoad.current = o?.id ?? null;
      setMe(uid); setOther(o);
      await load();
    })();
    const t = window.setInterval(() => { void load(); }, POLL_MS);
    return () => { alive = false; window.clearInterval(t); };
  }, [load, mode, room.id, room.trainerId, room.trainerName]);

  // Oldest first on screen; scroll to the bottom only when something new arrived.
  const shown = [...older, ...[...(items ?? [])].reverse()]
    .filter((x, i, all) => all.findIndex((y) => y.kind === x.kind && y.id === x.id) === i);
  const latest = items?.[0] ? `${items[0].kind}:${items[0].id}` : null;
  useEffect(() => {
    if (latest && latest !== newest.current) {
      newest.current = latest;
      bottom.current?.scrollIntoView({ block: 'end' });
    }
  }, [latest]);

  // A note the member has now seen is marked seen for the coach (as Coach notes did).
  useEffect(() => {
    if (mode !== 'member' || !items) return;
    for (const n of items) {
      if (n.kind === 'note' && n.extra.seen !== true && !marked.current.has(n.id)) {
        marked.current.add(n.id);
        void markFeedback(n.id).catch(() => { /* the next load shows the truth */ });
      }
    }
  }, [items, mode]);

  const toggleDone = async (id: string, next: boolean) => {
    setDoneNow((d) => ({ ...d, [id]: next }));
    try {
      await markFeedback(id, next);
      if (next) toast.success(`Done — ${room.trainerName.split(' ')[0]} will see it.`);
    } catch (err) {
      setDoneNow((d) => ({ ...d, [id]: !next }));
      toast.error(errorMessage(err, 'Could not save that'));
    }
  };

  const loadEarlier = async () => {
    const first = shown[0];
    if (!first) return;
    const page = await coachTimeline(room.id, first.at);
    if (!page) return;
    setOlder((prev) => [...[...page].reverse(), ...prev]);
    if (page.length < 30) setMore(false);
  };

  const send = async () => {
    const text = draft.trim();
    if (!text || !other || busy) return;
    setBusy(true);
    try {
      const conv = await openConversation(other.id);
      await sendMessage(conv, text);
      setDraft('');
      await Promise.all([load(), loadConv()]);
    } catch (err) {
      toast.error(errorMessage(err, 'Your message could not be sent'));
    } finally {
      setBusy(false);
    }
  };

  if (items === undefined) return <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Loading…</p>;
  if (items === null) {
    return <p style={{ fontSize: 13, color: 'var(--color-secondary)' }}>This room's timeline could not be loaded. Pull to refresh, or try again later.</p>;
  }

  const coachName = mode === 'member' ? room.trainerName.split(' ')[0] : 'You';
  // "Seen" under your last message once the other person has opened the chat since.
  const lastMine = [...shown].reverse().find((x) => x.kind === 'message' && x.authorId === me) ?? null;
  const seen = !!(lastMine && conv?.otherReadAt && conv.otherReadAt >= lastMine.at);
  const toggleMute = async () => {
    if (!conv) return;
    try { await setMuted(conv.id, !conv.muted); setConv({ ...conv, muted: !conv.muted }); }
    catch (err) { toast.error(errorMessage(err, 'Could not change that')); }
  };
  const card = (icon: React.ReactNode, eyebrow: string, title: string, onOpen?: () => void, accent = false) => (
    <button type="button" onClick={onOpen} disabled={!onOpen} className="w-full text-left flex items-start noc-press"
      style={{ gap: 10, padding: 12, borderRadius: 14, border: `1px solid ${accent ? 'var(--color-primary)' : 'var(--color-border)'}`,
        background: accent ? 'color-mix(in srgb, var(--color-primary) 10%, transparent)' : 'var(--color-surface)' }}>
      <span className="flex-none" style={{ color: 'var(--color-primary-300)', marginTop: 1 }}>{icon}</span>
      <span className="min-w-0">
        <span className="block" style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{eyebrow}</span>
        <span className="block" style={{ fontSize: 14, marginTop: 2, whiteSpace: 'pre-wrap', color: 'var(--color-text-primary)' }}>{title}</span>
      </span>
    </button>
  );
  const when = (iso: string) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

  return (
    <div className="flex flex-col" style={{ gap: 8 }} data-timeline>
      {more && shown.length >= 30 && (
        <button type="button" onClick={() => void loadEarlier()} style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-primary-300)', padding: '6px 0' }}>
          Earlier
        </button>
      )}
      {shown.length === 0 && (
        <p style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--color-text-muted)' }}>
          {mode === 'member'
            ? `Everything between you and ${coachName} lands here — messages, their notes, and routines they write for you.`
            : `Everything between you and ${other?.name.split(' ')[0] ?? 'this member'} lands here — messages, your notes, and routines you write for them.`}
        </p>
      )}
      {shown.map((it) => {
        const mineMsg = it.authorId === me;
        if (it.kind === 'message') {
          return (
            <div key={`m${it.id}`} className="flex relative" data-timeline-kind="message"
              style={{ justifyContent: mineMsg ? 'flex-end' : 'flex-start', marginBottom: lastMine?.id === it.id && seen ? 18 : 0 }}>
              <div style={{ maxWidth: '80%', padding: '8px 12px', borderRadius: 16, whiteSpace: 'pre-wrap', fontSize: 14,
                background: mineMsg ? 'var(--color-primary)' : 'var(--color-surface-raised)',
                color: mineMsg ? '#fff' : 'var(--color-text-primary)',
                borderBottomRightRadius: mineMsg ? 4 : 16, borderBottomLeftRadius: mineMsg ? 16 : 4 }}>
                {it.body}
                <span style={{ display: 'block', fontSize: 12, marginTop: 2, opacity: 0.7, textAlign: 'right' }}>{when(it.at)}</span>
              </div>
              {lastMine?.id === it.id && seen && (
                <p data-seen style={{ position: 'absolute', right: 0, marginTop: 2, fontSize: 12, color: 'var(--color-text-muted)' }}>Seen</p>
              )}
            </div>
          );
        }
        if (it.kind === 'note') {
          const done = doneNow[it.id] ?? it.extra.done === true;
          return (
            <div key={`n${it.id}`} data-timeline-kind="note">
              {card(<NotePencil size={18} />, `Note from ${mode === 'member' ? `${coachWord} ${coachName}` : 'you'} · ${when(it.at)}`, it.body, undefined, true)}
              {/* The coach's next step: the member ticks it, the coach sees it (0088). */}
              {mode === 'member' ? (
                <button type="button" onClick={() => void toggleDone(it.id, !done)} data-note-done={done}
                  style={{ marginTop: 6, fontSize: 13, fontWeight: 600, padding: '4px 0',
                    color: done ? 'var(--color-primary-300)' : 'var(--color-secondary)' }}>
                  {done ? '✓ Done' : 'Mark as done'}
                </button>
              ) : done ? <p style={{ marginTop: 6, fontSize: 12.5, color: 'var(--color-primary-300)' }}>✓ They marked it done</p> : null}
            </div>
          );
        }
        if (it.kind === 'routine') {
          const edited = it.extra.edited === true;
          const verb = edited ? 'edited' : 'wrote';
          const who = mode === 'member' ? `${coachWord} ${coachName}` : 'You';
          return <div key={`r${it.id}`} data-timeline-kind="routine">{card(<Barbell size={18} />, `${who} ${verb} a routine · ${when(it.at)}`, it.body,
            mode === 'member' ? () => navigate(`/member/track/routine/${it.refId}`) : undefined)}</div>;
        }
        if (it.kind === 'program') {
          return <div key={`p${it.id}`} data-timeline-kind="program">{card(<CalendarBlank size={18} />, `A program for ${mode === 'member' ? 'you' : other?.name.split(' ')[0] ?? 'them'} · ${when(it.at)}`, it.body,
            mode === 'member' ? () => navigate(`/member/program/${it.refId}`) : undefined)}</div>;
        }
        if (it.kind === 'assignment') {
          return <div key={`a${it.id}`} data-timeline-kind="assignment">{card(<ClipboardText size={18} />, `Classwork · ${when(it.at)}`, it.body,
            () => navigate(`?tab=classwork`))}</div>;
        }
        return <div key={`s${it.id}`} data-timeline-kind="post">{card(<ChatCircleText size={18} />, `Posted · ${when(it.at)}`, it.body)}</div>;
      })}
      <div ref={bottom} />

      {chatOn && conv && (
        <button type="button" onClick={() => void toggleMute()} data-mute={conv.muted}
          style={{ alignSelf: 'flex-end', fontSize: 12.5, fontWeight: 600, color: 'var(--color-text-muted)', padding: '2px 0' }}>
          {conv.muted ? 'Muted — turn alerts back on' : 'Mute alerts from this chat'}
        </button>
      )}
      {chatOn ? (
        <div className="flex items-end" style={{ gap: 8, position: 'sticky', bottom: 0, paddingTop: 8, background: 'var(--color-bg, transparent)' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <TextArea rows={2} value={draft} aria-label="Message" placeholder={other ? `Message ${other.name.split(' ')[0]}` : 'Write a message'}
              onChange={(e) => setDraft(e.target.value.slice(0, 2000))}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }} />
          </div>
          <button type="button" onClick={() => void send()} disabled={busy || !draft.trim() || !other} aria-label="Send"
            className="flex-none flex items-center justify-center"
            style={{ width: 44, height: 44, borderRadius: 22, background: 'var(--color-secondary)', color: '#000',
              opacity: busy || !draft.trim() ? 0.45 : 1 }}>
            <PaperPlaneRight size={20} weight="fill" />
          </button>
        </div>
      ) : (
        <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>Messaging is off at this gym — notes and routines still arrive here.</p>
      )}
    </div>
  );
}
