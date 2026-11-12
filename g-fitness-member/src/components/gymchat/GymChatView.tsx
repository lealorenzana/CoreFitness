import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowDown, Bell, BellOff, Camera, Copy, CornerUpLeft, Flag, Megaphone, MoreHorizontal, Pin, PinOff, Send, Smile, Trash2, Users, X } from 'lucide-react';
import type { GymChat, PendingMessage } from '../../hooks/useGymChat';
import {
  chatPeople, chatPhotoUrls, dismissChatReport, openChatReports, pinChatMessage, removeChatMessage, reportChatMessage,
  setChatAnnounceOnly, setChatMuted, silenceChatPerson,
  type ChatMessage, type ChatPerson, type ChatReport, type ChatRole,
} from '../../lib/api/gymChat';
import './gymchat.css';

/**
 * The gym chat's screen (0246): the list, the composer and its sheets.
 *
 * **Identical in both apps** — diff before changing one. Each app only wraps it
 * (a page with its own header and back) and hands over a toast and, in the
 * phone app, its translator.
 *
 * What a person may do is never decided here: `chat.meta` carries the server's
 * answer (`can_post`, `why_not`, `can_moderate`, `role`) and every action is an
 * RPC that checks again. The buttons only follow.
 */

type Toast = (message: string, kind?: 'success' | 'error') => void;

interface Props {
  chat: GymChat;
  toast: Toast;
  /** The gym's name, for the bar. */
  title: string;
  /** Something for the left of the bar — a back button. */
  lead?: ReactNode;
  t?: (s: string) => string;
  /** Open on the reported messages (the owner's dashboard sends them here). Only for someone who may moderate. */
  startOnReports?: boolean;
}

const ROLE_WORDS: Record<ChatRole, string> = { admin: 'Owner', staff: 'Front desk', trainer: 'Coach', member: '', left: 'Left the gym' };
const same = (s: string) => s;
const initial = (name: string) => (name.trim()[0] ?? '?').toUpperCase();
const first = (name: string) => name.trim().split(/\s+/)[0] ?? '';
const dayKey = (iso: string) => new Date(iso).toDateString();
const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

function dayWord(iso: string, t: (s: string) => string): string {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date(); y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return t('Today');
  if (d.toDateString() === y.toDateString()) return t('Yesterday');
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

function Avatar({ name, photo, ghost, tiny }: { name: string; photo: string | null; ghost?: boolean; tiny?: boolean }) {
  const [broken, setBroken] = useState(false);
  return photo && !broken
    ? <img className={`gc-avatar${ghost ? ' ghost' : ''}`} src={photo} alt="" loading="lazy" onError={() => setBroken(true)} />
    : <span className={`gc-avatar${ghost ? ' ghost' : ''}`} aria-hidden>{tiny ? '' : initial(name)}</span>;
}

/** The words of a message, with @mentions marked. */
function Body({ text, marked }: { text: string; marked: boolean }) {
  if (!marked) return <>{text}</>;
  const parts = text.split(/(@[\p{L}\p{N}_.-]+)/gu);
  return <>{parts.map((p, i) => (p.startsWith('@') ? <span key={i} className="gc-at">{p}</span> : p))}</>;
}

function Photo({ path, urls, onOpen }: { path: string; urls: Record<string, string>; onOpen: (url: string) => void }) {
  const url = urls[path];
  if (!url) return <span className="gc-photo wait" role="img" aria-label="Photo loading" />;
  return (
    <img className="gc-photo" src={url} alt="Photo" loading="lazy"
      onClick={(e) => { e.stopPropagation(); onOpen(url); }} />
  );
}

interface Reason { title: string; hint: string; cta: string; min: number; run: (why: string) => Promise<void> }

export default function GymChatView({ chat, toast, title, lead, t = same, startOnReports = false }: Props) {
  const { status, meta, messages, pending } = chat;
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const atBottom = useRef(true);
  const keepFrom = useRef<{ height: number; top: number } | null>(null);
  const [fresh, setFresh] = useState(0);
  const [text, setText] = useState('');
  const [file, setFile] = useState<{ file: File; preview: string } | null>(null);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [picked, setPicked] = useState<ChatPerson[]>([]);
  const [people, setPeople] = useState<ChatPerson[] | null>(null);
  const [menu, setMenu] = useState<ChatMessage | null>(null);
  const [sheet, setSheet] = useState<'people' | 'reports' | null>(null);
  const [reports, setReports] = useState<ChatReport[] | null>(null);
  const [reason, setReason] = useState<Reason | null>(null);
  const [why, setWhy] = useState('');
  const [working, setWorking] = useState(false);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [viewer, setViewer] = useState<string | null>(null);
  const [pinAt, setPinAt] = useState(0);
  /** Like Messenger: a tap picks a bubble (its react button and time show), a hold opens the full menu. */
  const [tapped, setTapped] = useState<string | null>(null);
  /** The message whose quick row of reactions is open, from its react button. */
  const [quick, setQuick] = useState<string | null>(null);

  const say = useCallback((e: unknown) => toast(e instanceof Error ? e.message : t('That did not work. Try again.'), 'error'), [toast, t]);

  // ---- photos: sign what is on screen ----
  const paths = useMemo(() => messages.map((m) => m.photo_path).filter((p): p is string => !!p), [messages]);
  useEffect(() => {
    const need = paths.filter((p) => !urls[p]);
    if (!need.length) return;
    let alive = true;
    void (async () => {
      try {
        const got = await chatPhotoUrls(need);
        if (alive && Object.keys(got).length) setUrls((u) => ({ ...u, ...got }));
      } catch { /* the grey box stays; the next message load tries again */ }
    })();
    return () => { alive = false; };
  }, [paths, urls]);

  // ---- people: for @mentions and the list ----
  const loadPeople = useCallback(async () => {
    try { setPeople(await chatPeople()); } catch (e) { say(e); }
  }, [say]);

  // ---- scrolling: stay at the bottom unless the person scrolled up ----
  const lastId = messages.length ? messages[messages.length - 1].id : null;
  const count = messages.length + pending.length;
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (keepFrom.current) {
      // Older messages were added above: keep what was on screen where it was.
      el.scrollTop = el.scrollHeight - keepFrom.current.height + keepFrom.current.top;
      keepFrom.current = null;
    } else if (atBottom.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [count, lastId, status.kind]);

  const seenLast = useRef<string | null>(null);
  useEffect(() => {
    if (!lastId || seenLast.current === lastId) return;
    const wasFirst = seenLast.current === null;
    seenLast.current = lastId;
    if (!wasFirst && !atBottom.current && !messages[messages.length - 1].mine) {
      const bump = setTimeout(() => setFresh((n) => n + 1), 0);
      return () => clearTimeout(bump);
    }
  }, [lastId, messages]);

  const onScroll = () => {
    const el = listRef.current;
    if (!el) return;
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (atBottom.current && fresh) setFresh(0);
    if (el.scrollTop < 60 && chat.hasOlder && !chat.loadingOlder && messages.length) {
      keepFrom.current = { height: el.scrollHeight, top: el.scrollTop };
      void chat.loadOlder();
    }
  };
  const toBottom = () => {
    const el = listRef.current;
    if (el) { el.scrollTop = el.scrollHeight; atBottom.current = true; }
    setFresh(0);
  };
  const jumpTo = (id: string) => {
    const el = listRef.current?.querySelector(`[data-mid="${id}"]`);
    if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    else toast(t('That message is further up. Scroll up to load it.'));
  };

  // ---- composing ----
  const mentionQuery = useMemo(() => {
    const m = /(^|\s)@([\p{L}\p{N}_.-]*)$/u.exec(text);
    return m ? m[2].toLowerCase() : null;
  }, [text]);
  const suggestions = useMemo(() => {
    if (mentionQuery === null || !people || !meta) return [];
    return people.filter((p) => p.user_id !== meta.me && p.name.toLowerCase().includes(mentionQuery)).slice(0, 6);
  }, [mentionQuery, people, meta]);

  const onType = (value: string) => {
    setText(value);
    if (value.trim()) chat.typing();
    if (people === null && /(^|\s)@/.test(value)) void loadPeople();
  };
  const pickMention = (p: ChatPerson) => {
    setText((v) => v.replace(/(^|\s)@([\p{L}\p{N}_.-]*)$/u, `$1@${first(p.name)} `));
    setPicked((list) => (list.some((x) => x.user_id === p.user_id) ? list : [...list, p]));
    inputRef.current?.focus();
  };
  const onFile = (f: File | undefined) => {
    if (!f) return;
    if (!f.type.startsWith('image/')) { toast(t('Choose a photo.'), 'error'); return; }
    setFile((old) => { if (old) URL.revokeObjectURL(old.preview); return { file: f, preview: URL.createObjectURL(f) }; });
  };
  const clearFile = () => setFile((old) => { if (old) URL.revokeObjectURL(old.preview); return null; });
  const submit = () => {
    const body = text.trim();
    if (!body && !file) return;
    // Only people still named in the words are mentioned.
    const mentions = picked.filter((p) => body.includes(`@${first(p.name)}`)).map((p) => p.user_id);
    chat.send(body, { file: file?.file ?? null, replyTo, mentions });
    if (file) URL.revokeObjectURL(file.preview);
    setText(''); setFile(null); setReplyTo(null); setPicked([]);
    atBottom.current = true;
    if (inputRef.current) inputRef.current.style.height = 'auto';
  };
  const grow = (el: HTMLTextAreaElement) => { el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight, 120)}px`; };

  // ---- actions on a message ----
  const act = async (run: () => Promise<void>, done?: string) => {
    setWorking(true);
    try { await run(); if (done) toast(done, 'success'); await chat.refresh(); }
    catch (e) { say(e); }
    finally { setWorking(false); }
  };
  const askReason = (r: Reason) => { setWhy(''); setReason(r); };
  const onRemove = (m: ChatMessage) => {
    setMenu(null);
    if (m.mine) { void act(() => removeChatMessage(m.id), t('Message removed')); return; }
    askReason({
      title: t('Remove this message'), hint: t('Say in a few words why. The person who wrote it is told.'), cta: t('Remove it'), min: 1,
      run: (r) => removeChatMessage(m.id, r),
    });
  };
  const onReport = (m: ChatMessage) => {
    setMenu(null);
    askReason({
      title: t('Report this message'), hint: t('Say what is wrong with it. The gym’s owner and front desk see your report.'), cta: t('Send the report'), min: 3,
      run: (r) => reportChatMessage(m.id, r),
    });
  };
  const onCopy = async (m: ChatMessage) => {
    setMenu(null);
    try { await navigator.clipboard.writeText(m.body ?? ''); toast(t('Copied'), 'success'); } catch { toast(t('Could not copy that.'), 'error'); }
  };
  const openReports = async () => {
    setSheet('reports'); setReports(null);
    try { setReports(await openChatReports()); } catch (e) { say(e); setSheet(null); }
  };
  const openPeople = () => { setSheet('people'); void loadPeople(); };
  const openedReports = useRef(false);
  const mayModerate = meta?.can_moderate === true;
  useEffect(() => {
    if (!startOnReports || !mayModerate || openedReports.current) return;
    openedReports.current = true;
    const later = setTimeout(() => { void openReports(); }, 0);
    return () => clearTimeout(later);
    // openReports only sets state and reads; it does not need to re-run this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startOnReports, mayModerate]);

  // ---- states before the chat ----
  if (status.kind === 'loading') {
    return <div className="gc" data-gym-chat="loading"><div className="gc-state"><span>{t('Opening the chat…')}</span></div></div>;
  }
  if (status.kind === 'error') {
    return (
      <div className="gc" data-gym-chat="error">
        <div className="gc-state"><div><b>{t('The chat did not load')}</b>{status.message}
          <div style={{ marginTop: 14 }}><button type="button" className="gc-btn fill on-fill" onClick={chat.retryLoad}>{t('Try again')}</button></div></div></div>
      </div>
    );
  }
  if (status.kind === 'closed' || !meta) {
    return (
      <div className="gc" data-gym-chat="closed">
        {lead && <div className="gc-bar">{lead}<div className="gc-bar-title"><b>{title}</b></div></div>}
        <div className="gc-state"><div><b>{t('The gym chat is not open for you')}</b>{status.kind === 'closed' ? status.why : ''}</div></div>
      </div>
    );
  }

  const pins = meta.pinned;
  const pin = pins.length ? pins[pinAt % pins.length] : null;
  const typingLine = meta.typing.length === 0 ? ''
    : meta.typing.length === 1 ? `${meta.typing[0]} ${t('is typing…')}`
    : meta.typing.length === 2 ? `${meta.typing[0]} ${t('and')} ${meta.typing[1]} ${t('are typing…')}`
    : t('Several people are typing…');
  const lastMine = messages.length > 0 && messages[messages.length - 1].mine;

  return (
    <div className="gc" data-gym-chat="open" data-role={meta.role}>
      <div className="gc-bar">
        {lead}
        <div className="gc-bar-title">
          <b>{title}</b>
          <small>{meta.announce_only ? t('Announcements only — the gym posts, everyone reads') : t('Everyone at the gym')}</small>
        </div>
        <button type="button" className="gc-icon" data-on={meta.muted} aria-label={meta.muted ? t('Turn alerts back on') : t('Mute alerts')} data-chat-mute
          onClick={() => void act(() => setChatMuted(!meta.muted), meta.muted ? t('Alerts are back on') : t('Muted — a mention still reaches you'))}>
          {meta.muted ? <BellOff size={19} /> : <Bell size={19} />}
        </button>
        {meta.can_moderate && (
          <button type="button" className="gc-icon" aria-label={t('Reports')} data-chat-reports onClick={() => void openReports()}><Flag size={19} /></button>
        )}
        <button type="button" className="gc-icon" aria-label={t('People in the chat')} data-chat-people onClick={openPeople}><Users size={19} /></button>
      </div>

      {pin && (
        <button type="button" className="gc-pin" data-chat-pin onClick={() => { jumpTo(pin.id); setPinAt((n) => n + 1); }}>
          <Pin size={14} />
          <span><b>{first(pin.name)}: </b>{pin.body ?? t('Photo')}</span>
          {pins.length > 1 && <b>{(pinAt % pins.length) + 1}/{pins.length}</b>}
        </button>
      )}

      <div className="gc-list" ref={listRef} onScroll={onScroll} data-chat-list>
        {chat.loadingOlder && <div className="gc-note">{t('Loading earlier messages…')}</div>}
        {!chat.hasOlder && messages.length > 0 && <div className="gc-note">{t('This is the start of the chat.')}</div>}
        {messages.length === 0 && pending.length === 0 && (
          <div className="gc-state"><div><b>{t('No messages yet')}</b>{meta.can_post ? t('Say hello to your gym.') : ''}</div></div>
        )}
        {messages.map((m, i) => {
          const prev = messages[i - 1];
          const newDay = !prev || dayKey(prev.created_at) !== dayKey(m.created_at);
          const firstOfRun = newDay || prev.sender_id !== m.sender_id
            || new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() > 5 * 60_000;
          const next = messages[i + 1];
          const lastOfRun = !next || next.sender_id !== m.sender_id || dayKey(next.created_at) !== dayKey(m.created_at)
            || new Date(next.created_at).getTime() - new Date(m.created_at).getTime() > 5 * 60_000;
          return (
            <MessageRow key={m.id} m={m} newDay={newDay} firstOfRun={firstOfRun} lastOfRun={lastOfRun} urls={urls} t={t}
              onMenu={(x) => { setQuick(null); setMenu(x); }} onJump={jumpTo} onOpenPhoto={setViewer}
              onReact={(emoji) => { setQuick(null); chat.react(m, emoji).catch(say); }}
              picked={tapped === m.id} onPick={() => { setQuick(null); setTapped((p) => (p === m.id ? null : m.id)); }}
              quick={quick === m.id} onQuick={() => setQuick((q) => (q === m.id ? null : m.id))} emojis={meta.emojis} />
          );
        })}
        {pending.map((p) => <PendingRow key={p.id} p={p} t={t} onRetry={chat.retry} onDiscard={chat.discard} />)}
        {lastMine && pending.length === 0 && meta.seen.count > 0 && meta.seen.message_id === messages[messages.length - 1].id && (
          <div className="gc-seen" data-chat-seen>
            {t('Seen by')}
            {meta.seen.people.slice(0, 4).map((p, i) => <Avatar key={i} name={p.name} photo={p.photo} tiny />)}
            <span>{meta.seen.count === 1 ? first(meta.seen.people[0]?.name ?? '') : `${meta.seen.count}`}</span>
          </div>
        )}
      </div>

      {fresh > 0 && (
        <button type="button" className="gc-new on-fill" onClick={toBottom}><ArrowDown size={14} style={{ display: 'inline', verticalAlign: '-2px' }} /> {t('New messages')}</button>
      )}
      <div className="gc-typing" aria-live="polite" data-chat-typing>{typingLine}</div>

      {meta.can_post ? (
        <div className="gc-compose">
          {suggestions.length > 0 && (
            <div className="gc-mentions" data-chat-mentions>
              {suggestions.map((p) => (
                <button key={p.user_id} type="button" onClick={() => pickMention(p)}>
                  <Avatar name={p.name} photo={p.photo} /><span>{p.name}</span>{ROLE_WORDS[p.role] && <small>{t(ROLE_WORDS[p.role])}</small>}
                </button>
              ))}
            </div>
          )}
          {replyTo && (
            <div className="gc-strip" data-chat-replying>
              <CornerUpLeft size={14} />
              <span><b>{t('Replying to')} {first(replyTo.name)}: </b>{replyTo.body ?? t('Photo')}</span>
              <button type="button" className="gc-icon" style={{ width: 28, height: 28 }} aria-label={t('Cancel the reply')} onClick={() => setReplyTo(null)}><X size={15} /></button>
            </div>
          )}
          {file && (
            <div className="gc-strip">
              <img src={file.preview} alt="" />
              <span>{t('Photo ready to send')}</span>
              <button type="button" className="gc-icon" style={{ width: 28, height: 28 }} aria-label={t('Remove the photo')} onClick={clearFile}><X size={15} /></button>
            </div>
          )}
          <div className="gc-compose-row">
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
            <button type="button" className="gc-icon" aria-label={t('Add a photo')} onClick={() => fileRef.current?.click()}><Camera size={20} /></button>
            <textarea ref={inputRef} className="gc-input" rows={1} value={text} maxLength={2000} placeholder={t('Message your gym')} aria-label={t('Message')}
              onChange={(e) => { onType(e.target.value); grow(e.target); }}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !('ontouchstart' in window)) { e.preventDefault(); submit(); } }} />
            <button type="button" className="gc-send on-fill" aria-label={t('Send')} data-chat-send disabled={!text.trim() && !file} onClick={submit}><Send size={18} /></button>
          </div>
        </div>
      ) : (
        <div className="gc-closed" data-chat-cannot-post>{meta.why_not}</div>
      )}

      {menu && (
        <div className="gc-layer" onClick={() => setMenu(null)} data-chat-menu>
          <div className="gc-sheet" role="dialog" aria-label={t('Message options')} onClick={(e) => e.stopPropagation()}>
            <div className="gc-emojis">
              {meta.emojis.map((e) => (
                <button key={e} type="button" data-mine={menu.reactions.some((r) => r.mine && r.emoji === e)}
                  onClick={() => { const m = menu; setMenu(null); chat.react(m, e).catch(say); }}>{e}</button>
              ))}
            </div>
            <div className="gc-menu">
              {meta.can_post && <button type="button" onClick={() => { setReplyTo(menu); setMenu(null); inputRef.current?.focus(); }}><CornerUpLeft size={18} />{t('Reply')}</button>}
              {menu.body && <button type="button" onClick={() => void onCopy(menu)}><Copy size={18} />{t('Copy the words')}</button>}
              {meta.can_moderate && (
                <button type="button" onClick={() => { const m = menu; setMenu(null); void act(() => pinChatMessage(m.id, !m.pinned), m.pinned ? t('Unpinned') : t('Pinned for everyone')); }}>
                  {menu.pinned ? <PinOff size={18} /> : <Pin size={18} />}{menu.pinned ? t('Unpin') : t('Pin for everyone')}
                </button>
              )}
              {!menu.mine && <button type="button" onClick={() => onReport(menu)}><Flag size={18} />{t('Report to the gym')}</button>}
              {(menu.mine || meta.can_moderate) && <button type="button" data-warn="true" onClick={() => onRemove(menu)}><Trash2 size={18} />{menu.mine ? t('Remove my message') : t('Remove this message')}</button>}
            </div>
          </div>
        </div>
      )}

      {sheet === 'people' && (
        <div className="gc-layer" onClick={() => setSheet(null)} data-chat-people-sheet>
          <div className="gc-sheet" role="dialog" aria-label={t('People in the chat')} onClick={(e) => e.stopPropagation()}>
            <h3>{t('People in the chat')}{people ? ` · ${people.length}` : ''}</h3>
            <p>{t('Active members, coaches, the front desk and the owner.')}</p>
            {meta.role === 'admin' && (
              <div className="gc-switch">
                <Megaphone size={18} />
                <div><b>{t('Announcements only')}</b><small>{t('Only you, the front desk and coaches post. Members read and react.')}</small></div>
                <button type="button" role="switch" aria-checked={meta.announce_only} aria-label={t('Announcements only')} className="gc-toggle" disabled={working} data-chat-announce
                  onClick={() => void act(() => setChatAnnounceOnly(!meta.announce_only), meta.announce_only ? t('Everyone may post again') : t('Announcements only is on'))} />
              </div>
            )}
            {people === null ? <p>{t('Loading…')}</p> : people.map((p) => (
              <div className="gc-person" key={p.user_id}>
                <Avatar name={p.name} photo={p.photo} />
                <div>
                  <b>{p.name}{p.user_id === meta.me ? ` (${t('you')})` : ''}</b>
                  <small>{[t(ROLE_WORDS[p.role] || 'Member'), p.silenced ? `${t('Stopped from posting')}: ${p.silenced_reason ?? ''}` : ''].filter(Boolean).join(' · ')}</small>
                </div>
                {meta.can_moderate && (p.role === 'member' || p.role === 'trainer') && (p.silenced ? (
                  <button type="button" className="gc-btn" disabled={working}
                    onClick={() => void act(async () => { await silenceChatPerson(p.user_id, false); await loadPeople(); }, t('They can post again'))}>{t('Let them post')}</button>
                ) : (
                  <button type="button" className="gc-btn" disabled={working} data-chat-silence
                    onClick={() => askReason({
                      title: `${t('Stop')} ${first(p.name)} ${t('from posting')}`, hint: t('They can still read the chat. Say why — they are told.'), cta: t('Stop them posting'), min: 1,
                      run: async (r) => { await silenceChatPerson(p.user_id, true, r); await loadPeople(); },
                    })}>{t('Stop posting')}</button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {sheet === 'reports' && (
        <div className="gc-layer" onClick={() => setSheet(null)} data-chat-reports-sheet>
          <div className="gc-sheet" role="dialog" aria-label={t('Reports')} onClick={(e) => e.stopPropagation()}>
            <h3>{t('Reported messages')}</h3>
            {reports === null ? <p>{t('Loading…')}</p> : reports.length === 0 ? <p>{t('No open reports.')}</p> : reports.map((r) => (
              <div className="gc-report" key={r.report_id}>
                <small>{r.reporter} {t('reported')} {r.sender}{r.reports > 1 ? ` · ${r.reports} ${t('reports')}` : ''}</small>
                <blockquote>{r.body ?? (r.has_photo ? t('A photo') : '')}</blockquote>
                <small>{t('They said')}: {r.reason}</small>
                <div>
                  <button type="button" className="gc-btn" disabled={working}
                    onClick={() => void act(async () => { await dismissChatReport(r.report_id); setReports(await openChatReports()); }, t('Report closed'))}>{t('Keep the message')}</button>
                  <button type="button" className="gc-btn fill on-fill" disabled={working}
                    onClick={() => askReason({
                      title: t('Remove this message'), hint: t('Say in a few words why. The person who wrote it is told.'), cta: t('Remove it'), min: 1,
                      run: async (why2) => { await removeChatMessage(r.message_id, why2); setReports(await openChatReports()); },
                    })}>{t('Remove the message')}</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {reason && (
        <div className="gc-layer" onClick={() => !working && setReason(null)} data-chat-reason>
          <div className="gc-sheet" role="dialog" aria-label={reason.title} onClick={(e) => e.stopPropagation()}>
            <h3>{reason.title}</h3>
            <p>{reason.hint}</p>
            <textarea className="gc-field" rows={2} maxLength={200} autoFocus value={why} aria-label={t('Reason')} onChange={(e) => setWhy(e.target.value)} />
            <button type="button" className="gc-btn fill wide on-fill" disabled={working || why.trim().length < reason.min}
              onClick={() => { const r = reason; void act(async () => { await r.run(why.trim()); setReason(null); }, t('Done')); }}>{reason.cta}</button>
          </div>
        </div>
      )}

      {viewer && (
        <div className="gc-viewer" role="dialog" aria-label={t('Photo')} onClick={() => setViewer(null)}><img src={viewer} alt="" /></div>
      )}
    </div>
  );
}

interface RowProps {
  m: ChatMessage; newDay: boolean; firstOfRun: boolean; lastOfRun: boolean; urls: Record<string, string>;
  t: (s: string) => string;
  onMenu: (m: ChatMessage) => void; onJump: (id: string) => void; onOpenPhoto: (url: string) => void; onReact: (emoji: string) => void;
  picked: boolean; onPick: () => void; quick: boolean; onQuick: () => void; emojis: string[];
}

/** How long a press must last to count as a hold (Messenger's is about half a second). */
const HOLD_MS = 450;

function MessageRow({ m, newDay, firstOfRun, lastOfRun, urls, t, onMenu, onJump, onOpenPhoto, onReact, picked, onPick, quick, onQuick, emojis }: RowProps) {
  const role = ROLE_WORDS[m.role];
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const cancel = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; start.current = null; };
  useEffect(() => cancel, []);
  // Hold: the full menu (reactions, reply, copy, pin, report, remove). A finger that moves is scrolling, not holding.
  const onDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    held.current = false;
    start.current = { x: e.clientX, y: e.clientY };
    timer.current = setTimeout(() => {
      held.current = true;
      timer.current = null;
      if ('vibrate' in navigator) navigator.vibrate?.(12);
      onMenu(m);
    }, HOLD_MS);
  };
  const onMove = (e: React.PointerEvent) => {
    if (start.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 10) cancel();
  };
  const react = (
    <button type="button" className="gc-react-btn" data-picked={picked} aria-label={t('React')} aria-expanded={quick} data-chat-react-btn onClick={onQuick}>
      <Smile size={17} />
    </button>
  );
  return (
    <>
      {newDay && <div className="gc-day">{dayWord(m.created_at, t)}</div>}
      <div className="gc-row" data-mine={m.mine} data-first={firstOfRun} data-mid={m.id} data-picked={picked} data-chat-message>
        {!m.mine && <Avatar name={m.name} photo={m.photo} ghost={!lastOfRun} />}
        <div className="gc-col">
          {quick && !m.removed && (
            <div className="gc-quick" role="group" aria-label={t('React')} data-chat-quick>
              {emojis.map((e) => (
                <button key={e} type="button" data-mine={m.reactions.some((r) => r.mine && r.emoji === e)} onClick={() => onReact(e)}>{e}</button>
              ))}
              <button type="button" className="gc-quick-more" aria-label={t('More')} onClick={() => onMenu(m)}><MoreHorizontal size={18} /></button>
            </div>
          )}
          {firstOfRun && !m.mine && (
            <div className="gc-who"><span>{m.name || t('Someone')}</span>{role && <span className="gc-badge">{t(role)}</span>}</div>
          )}
          {m.removed ? (
            <div className="gc-bubble" data-removed="true">{m.removed_by_gym ? t('Removed by the gym') : t('Message removed')}</div>
          ) : (
            <div className="gc-bubble-line">
            <button type="button" className="gc-bubble" aria-label={t('Message — hold for options')}
              onPointerDown={onDown} onPointerMove={onMove} onPointerUp={cancel} onPointerLeave={cancel} onPointerCancel={cancel}
              onContextMenu={(e) => { e.preventDefault(); cancel(); onMenu(m); }}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onMenu(m); } }}
              onClick={(e) => { if (held.current) { held.current = false; e.preventDefault(); return; } onPick(); }}>
              {m.reply && (
                <span className="gc-quote" role="link" tabIndex={0} onClick={(e) => { e.stopPropagation(); onJump(m.reply!.id); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onJump(m.reply!.id); } }}>
                  <b>{m.reply.name}</b>{m.reply.removed ? t('Message removed') : (m.reply.body || (m.reply.photo ? t('Photo') : ''))}
                </span>
              )}
              {m.photo_path && <Photo path={m.photo_path} urls={urls} onOpen={onOpenPhoto} />}
              {m.body && <Body text={m.body} marked={m.mentions.length > 0} />}
            </button>
            {react}
            </div>
          )}
          {m.reactions.length > 0 && (
            <div className="gc-reacts">
              {m.reactions.map((r) => (
                <button key={r.emoji} type="button" className="gc-react" data-mine={r.mine} aria-label={`${r.emoji} ${r.count}`} onClick={() => onReact(r.emoji)}>
                  <span>{r.emoji}</span>{r.count}
                </button>
              ))}
            </div>
          )}
          {(lastOfRun || picked) && <div className="gc-meta">{clock(m.created_at)}{m.pinned ? ` · ${t('Pinned')}` : ''}</div>}
        </div>
      </div>
    </>
  );
}

function PendingRow({ p, t, onRetry, onDiscard }: { p: PendingMessage; t: (s: string) => string; onRetry: (id: string) => void; onDiscard: (id: string) => void }) {
  return (
    <div className="gc-row" data-mine="true" data-first="true" data-chat-pending={p.status}>
      <div className="gc-col">
        <div className="gc-bubble on-fill" data-state={p.status}>
          {p.replyTo && <span className="gc-quote"><b>{p.replyTo.name}</b>{p.replyTo.body ?? t('Photo')}</span>}
          {p.photoPreview && <img className="gc-photo" src={p.photoPreview} alt="" />}
          {p.body}
        </div>
        <div className="gc-meta">
          {p.status === 'sending' ? t('Sending…') : (p.error ?? t('That did not send.'))}
          {p.status === 'failed' && p.retryable && <button type="button" onClick={() => onRetry(p.id)}>{t('Try again')}</button>}
          {p.status === 'failed' && <button type="button" onClick={() => onDiscard(p.id)}>{t('Discard')}</button>}
        </div>
      </div>
    </div>
  );
}
