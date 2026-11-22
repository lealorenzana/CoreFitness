import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Archive, ArchiveRestore, ArrowUpRight, Banknote, Bell, Calendar, CheckCheck, Dumbbell, Gift,
  Info, ListChecks, Mail, MailOpen, MessageSquare, Reply, ShieldCheck, Trash2, Trophy, X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { listNotifications, setRead, setArchived, deleteNotifications, markAllAsRead, INBOX_CHANGED } from '../lib/api/notifications';
import { dashboardService, type HeaderAlert } from '../services/dashboardService';
import { usePaged } from '../hooks/usePaged';
import { RdHeader, RdButton, SearchField, TableFooter } from '../components/ui/rd';
import type { Tone } from '../components/ui/rdTokens';
import { localDateKey, todayKey, addDays, daysBetween } from '../utils/dates';
import { showToast } from '../utils/toast';
import type { NotificationRow } from '../types/db';

/**
 * Notifications — the owner's and desk's own inbox. The bell only ever showed
 * live alerts (expiring members, bookings, payments), so everything written TO
 * an owner — the AI coach's limits, equipment reports, coaching requests, a
 * paid day pass, the platform's answers — had no screen in the admin app at
 * all. Two parts: what needs attention now (computed, comes back while true)
 * and the messages (the `notifications` rows: read/unread, archive, delete).
 *
 * Redesigned 2026-10-11 as three boxes that hold the screen (no page scroll,
 * each box scrolls itself): live alerts · the messages, by day · a reading
 * pane. With nothing open the pane is the overview (Bklit rings, the kinds).
 *
 * Design V2 (owner's pick, 2026-11-22): a mail app. Folders (Needs attention, Unread, All, Archived, then
 * the kinds), the list, the open message. No ring, no icon tiles, status as a dot.
 */
type View = 'attention' | 'unread' | 'all' | 'archived';
/** `notifications.type` as the owner reads it — the types the migrations write. */
const KINDS: Record<string, { label: string; icon: LucideIcon; tone: Tone }> = {
  system: { label: 'Gym system', icon: Bell, tone: 'violet' },
  booking: { label: 'Bookings', icon: Calendar, tone: 'blue' },
  payment: { label: 'Payments', icon: Banknote, tone: 'green' },
  coaching: { label: 'Coaching', icon: Dumbbell, tone: 'amber' },
  program: { label: 'Programs', icon: ListChecks, tone: 'amber' },
  referral: { label: 'Referrals', icon: Gift, tone: 'violet' },
  message: { label: 'Messages', icon: MessageSquare, tone: 'blue' },
  personal_record: { label: 'Records', icon: Trophy, tone: 'amber' },
  info: { label: 'Information', icon: Info, tone: 'gray' },
  // Written to the owner by Core Fitness itself (0240) — read here, answered from Help.
  platform_message: { label: 'From Core Fitness', icon: ShieldCheck, tone: 'violet' },
};
const kindOf = (t: string) => KINDS[t] ?? { label: 'Other', icon: Bell, tone: 'gray' as Tone };
/** The sidebar's names for the pages a message can open. */
const PAGES: [string, string][] = [
  ['/members', 'Members'], ['/invitations', 'Invitations'], ['/trainers', 'Trainers'], ['/personal-training', 'Personal training'], ['/coaching', 'Personal training'],
  ['/schedule', 'Schedule'], ['/bookings/classes', 'Class bookings'], ['/bookings', 'Personal training'], ['/payments', 'Payments'], ['/shop', 'Shop'],
  ['/membership-plans', 'Plans'], ['/revenue', 'Revenue'], ['/retention', 'Retention'], ['/activity', 'Activity log'],
  ['/challenges', 'Challenges'], ['/rewards', 'Rewards'], ['/equipment', 'Equipment'], ['/rooms', 'Rooms'],
  ['/gym-app', 'Your app'], ['/settings', 'Settings'], ['/subscription', 'Your plan'], ['/help', 'Help'], ['/support', 'Help'],
  ['/feedback', 'Help'], ['/attendance', 'Attendance'], ['/dashboard', 'Dashboard'],
];
const pageName = (url: string) => PAGES.find(([p]) => url === p || url.startsWith(`${p}/`) || url.startsWith(`${p}?`))?.[1];
const PER_PAGE = 30;
const LINE = '1px solid rgb(var(--hair-rgb, 255 255 255) / 0.06)';

/** A link the admin app can open; member/trainer paths belong to the phone app. */
const openable = (url: string | null) => !!url && url.startsWith('/') && !/^\/(member|trainer)\b/.test(url);
const when = (iso: string, now: number) => {
  const d = new Date(iso);
  const mins = Math.round((now - d.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  if (mins < 24 * 60) return `${Math.round(mins / 60)} h ago`;
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: d.getFullYear() === new Date(now).getFullYear() ? undefined : 'numeric' });
};
const fullWhen = (iso: string) => new Date(iso).toLocaleString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' });
/** Manila days (utils/dates), never the UTC date. */
const dayGroup = (iso: string, today: string) => {
  const k = localDateKey(iso);
  if (k === today) return 'Today';
  if (k === addDays(today, -1)) return 'Yesterday';
  if (daysBetween(k, today) < 7) return 'This week';
  return 'Earlier';
};

export default function Inbox() {
  const navigate = useNavigate();
  const [me, setMe] = useState<string | null>(null);
  const [rows, setRows] = useState<NotificationRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [alerts, setAlerts] = useState<HeaderAlert[] | null>(null);
  const [view, setView] = useState<View>(() => {
    const v = new URLSearchParams(window.location.search).get('show');
    return v === 'all' || v === 'archived' || v === 'attention' ? v : 'unread';
  });
  const [kind, setKind] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [now] = useState(() => Date.now());
  const today = todayKey();

  const load = useCallback(async (uid: string) => {
    try { setRows(await listNotifications(uid)); setFailed(false); } catch { setFailed(true); }
  }, []);
  useEffect(() => {
    void (async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id ?? null;
      setMe(uid);
      if (uid) await load(uid);
      setAlerts(await dashboardService.getHeaderAlerts().catch(() => null));
    })();
  }, [load]);

  const inView = useMemo(() => (rows ?? []).filter((n) =>
    view === 'archived' ? n.archived_at : !n.archived_at && (view === 'all' || !n.read)), [rows, view]);
  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return inView.filter((n) => (!kind || n.type === kind)
      && (!term || `${n.title} ${n.message ?? ''}`.toLowerCase().includes(term)));
  }, [inView, kind, q]);
  const paged = usePaged(shown, PER_PAGE);
  const live = (rows ?? []).filter((n) => !n.archived_at);
  const unread = live.filter((n) => !n.read).length;
  const archivedCount = (rows ?? []).length - live.length;
  const kinds = useMemo(() => {
    const m = new Map<string, { total: number; unread: number }>();
    for (const n of live) { const c = m.get(n.type) ?? { total: 0, unread: 0 }; c.total++; if (!n.read) c.unread++; m.set(n.type, c); }
    return [...m.entries()].sort((a, b) => b[1].unread - a[1].unread || b[1].total - a[1].total);
  }, [live]);
  const opened = openId ? (rows ?? []).find((n) => n.id === openId) ?? null : null;

  const changeView = (v: View) => {
    setView(v); setPicked(new Set());
    const u = new URL(window.location.href); u.searchParams.set('show', v); window.history.replaceState(null, '', u);
  };
  /** Every change goes to the database first, then the list is read again — never a local guess. */
  const run = async (fn: () => Promise<void>, done?: string) => {
    try {
      await fn();
      if (done) showToast(done, 'success');
      setPicked(new Set());
      window.dispatchEvent(new Event(INBOX_CHANGED));
      if (me) await load(me);
    } catch (e) { showToast(e instanceof Error ? e.message : 'That did not work', 'error'); }
  };
  /** Reading a message marks it read; its page opens from the pane. */
  const read = (n: NotificationRow) => {
    setOpenId(n.id);
    if (!n.read) void run(() => setRead([n.id], true));
  };
  const ids = [...picked];
  const allOnPage = paged.visible.length > 0 && paged.visible.every((n) => picked.has(n.id));
  const viewCount = (v: View) => v === 'unread' ? unread : v === 'archived' ? archivedCount : live.length;

  const FOLDERS: [View, string][] = [['attention', 'Needs attention'], ['unread', 'Unread'], ['all', 'All'], ['archived', 'Archived']];

  return (
    <div className="rd-fit" data-inbox>
      <RdHeader title="Notifications" subtitle="What needs you now, and every message sent to you."
        actions={unread > 0 && me ? (
          <RdButton size="sm" icon={CheckCheck} onClick={() => void run(() => markAllAsRead(me), 'All marked as read')} data-mark-all>
            Mark all as read
          </RdButton>
        ) : undefined} />

      {/* Design V2 (owner's pick, 2026-11-22): a mail app. Folders, the list, the open message. */}
      <div className="ib2" data-inbox-v2>
        {/* ── Folders ── */}
        <nav className="ib2-fold" aria-label="Folders">
          {FOLDERS.map(([v, label]) => {
            const n = v === 'attention' ? (alerts?.length ?? null) : viewCount(v);
            return (
              <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => changeView(v)} data-inbox-tab={v}>
                {label}
                {n != null && <span className={v === 'attention' && n > 0 ? 'warn' : ''}>{n}</span>}
              </button>
            );
          })}
          {kinds.length > 0 && (
            <>
              <h4>Kinds</h4>
              <div data-kinds>
                {kinds.map(([type, c]) => (
                  <button key={type} type="button" aria-pressed={kind === type} data-kind={type}
                    onClick={() => { if (view === 'attention') changeView('all'); setKind(kind === type ? null : type); }}>
                    {kindOf(type).label}
                    <span>{c.unread > 0 ? `${c.unread} new` : c.total}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </nav>

        {/* ── The list ── */}
        <section className="ib2-list" data-messages={view === 'attention' ? undefined : ''} data-attention={view === 'attention' ? '' : undefined}>
          {view === 'attention' ? (
            <>
              <div className="ib2-bar"><span className="ib2-note">Each stays here while it is true, and leaves on its own.</span></div>
              <div className="rd-fit-scroll">
                {alerts === null ? <p className="ib2-empty">These could not be loaded. Reload the page to try again.</p>
                  : alerts.length === 0 ? <div className="ib2-empty"><b>Nothing needs you</b><span>New sign-ups, expiring members and waiting bookings show up here.</span></div>
                  : (
                    <div data-alerts>
                      {alerts.map((a) => (
                        <button key={a.id} type="button" className="ib2-row" onClick={() => a.actionUrl && navigate(a.actionUrl)}>
                          <span className={`ib2-dot ${a.priority === 'high' ? 'warn' : 'on'}`} />
                          <span className="ib2-t"><b>{a.title}</b><span>{a.message}</span></span>
                          <ArrowUpRight size={14} className="ib2-go" />
                        </button>
                      ))}
                    </div>
                  )}
              </div>
            </>
          ) : (
            <>
              <div className="ib2-bar">
                {shown.length > 0 && (
                  <input type="checkbox" checked={allOnPage} aria-label="Select this page" className="accent-violet-500"
                    onChange={(e) => setPicked(e.target.checked ? new Set([...picked, ...paged.visible.map((n) => n.id)]) : new Set([...picked].filter((x) => !paged.visible.some((n) => n.id === x))))} />
                )}
                <div className="flex-1 min-w-0"><SearchField value={q} onChange={setQ} placeholder="Search messages" label="Search messages" /></div>
                {kind && (
                  <button type="button" onClick={() => setKind(null)} className="ib2-chip" aria-label={`Show every kind, not only ${kindOf(kind).label}`}>
                    {kindOf(kind).label} <X size={13} />
                  </button>
                )}
              </div>

              {picked.size > 0 && (
                <div className="ib2-bulk" data-bulk>
                  <span>{picked.size} selected</span>
                  <RdButton size="sm" icon={MailOpen} onClick={() => void run(() => setRead(ids, true), 'Marked as read')}>Mark read</RdButton>
                  <RdButton size="sm" icon={Mail} onClick={() => void run(() => setRead(ids, false), 'Marked as unread')}>Mark unread</RdButton>
                  {view === 'archived'
                    ? <RdButton size="sm" icon={ArchiveRestore} onClick={() => void run(() => setArchived(ids, false), 'Moved back')}>Move back</RdButton>
                    : <RdButton size="sm" icon={Archive} onClick={() => void run(() => setArchived(ids, true), 'Archived')}>Archive</RdButton>}
                  <RdButton size="sm" variant="danger" icon={Trash2} onClick={() => void run(() => deleteNotifications(ids), 'Deleted')}>Delete</RdButton>
                </div>
              )}

              {failed ? <p className="ib2-empty">Your messages could not be loaded. Reload the page to try again.</p>
                : rows === null ? <p className="ib2-empty">Loading…</p>
                : shown.length === 0 ? (
                  <div className="ib2-empty" data-inbox-empty>
                    <b>{q || kind ? 'No message matches' : view === 'unread' ? 'You are all caught up' : view === 'archived' ? 'Nothing archived' : 'No messages yet'}</b>
                    {(q || kind || view === 'unread') && <span>{q || kind ? 'Clear the search or the kind to see more.' : 'Read messages are under All.'}</span>}
                  </div>
                ) : (
                  <>
                    <div className="rd-fit-scroll" data-inbox-list>
                      {paged.visible.map((n, i) => {
                        const g = dayGroup(n.created_at, today);
                        const head = i === 0 || dayGroup(paged.visible[i - 1].created_at, today) !== g ? g : null;
                        const on = n.id === openId;
                        return (
                          <div key={n.id}>
                            {head && <p className="ib2-day">{head}</p>}
                            <div className={`ib2-msg${on ? ' on' : ''}`} data-inbox-row data-unread={!n.read || undefined}>
                              <input type="checkbox" className="accent-violet-500" checked={picked.has(n.id)} aria-label={`Select ${n.title}`}
                                onChange={(e) => { const s = new Set(picked); if (e.target.checked) s.add(n.id); else s.delete(n.id); setPicked(s); }} />
                              <span className={`ib2-dot ${n.read ? '' : 'on'}`} aria-label={n.read ? undefined : 'Unread'} />
                              <button type="button" onClick={() => read(n)} className="ib2-t" aria-current={on || undefined}>
                                <span className="ib2-h">
                                  <b className={n.read ? 'read' : ''}>{n.title}</b>
                                  <time>{when(n.created_at, now)}</time>
                                </span>
                                {n.message && <span>{n.message}</span>}
                              </button>
                              <button type="button" onClick={() => void run(() => setRead([n.id], !n.read))} className="ib2-icon"
                                data-tip={n.read ? 'Mark as unread' : 'Mark as read'} aria-label={n.read ? 'Mark as unread' : 'Mark as read'}>
                                {n.read ? <Mail size={15} /> : <MailOpen size={15} />}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div style={{ borderTop: LINE }}>
                      <TableFooter page={paged.page} perPage={PER_PAGE} total={paged.total} noun="messages" onPage={paged.setPage} />
                    </div>
                  </>
                )}
            </>
          )}
        </section>

        {/* ── The open message ── */}
        <section className="ib2-read" data-reading>
          {opened ? (() => {
            const k = kindOf(opened.type);
            const fromCF = opened.type === 'platform_message';
            const dest = !fromCF && openable(opened.action_url) ? opened.action_url! : null;
            return (
              <>
                <div className="ib2-bar">
                  <span className="ib2-kind"><k.icon size={14} />{k.label}</span>
                  <span className="flex-1" />
                  <button type="button" onClick={() => { void run(() => setRead([opened.id], false), 'Marked as unread'); setOpenId(null); }}
                    aria-label="Mark unread" data-tip="Mark unread" className="ib2-icon"><Mail size={16} /></button>
                  <button type="button" onClick={() => { void run(() => deleteNotifications([opened.id]), 'Deleted'); setOpenId(null); }}
                    aria-label="Delete this message" data-tip="Delete" className="ib2-icon"><Trash2 size={16} /></button>
                  <button type="button" onClick={() => setOpenId(null)} aria-label="Close message" data-tip="Close" className="ib2-icon"><X size={16} /></button>
                </div>
                <div className="rd-fit-scroll ib2-body" data-opened>
                  <h2>{opened.title}</h2>
                  <p className="ib2-when">Received {fullWhen(opened.created_at)}{opened.archived_at ? ', archived' : ''}</p>
                  {opened.message && <p className="ib2-text">{opened.message}</p>}
                  {opened.action_url && !dest && (
                    <p className="ib2-aside">This one points to a screen in the members&rsquo; phone app.</p>
                  )}
                </div>
                <div className="ib2-act">
                  {dest && <button type="button" className="ib2-go-btn" onClick={() => navigate(dest)} data-open-page><ArrowUpRight size={15} />Open {pageName(dest) ?? 'the page'}</button>}
                  {fromCF && <button type="button" className="ib2-go-btn" onClick={() => navigate(`/help?tab=questions&subject=${encodeURIComponent(`Re: ${opened.title}`.slice(0, 120))}`)} data-reply-core-fitness><Reply size={15} />Reply to Core Fitness</button>}
                  {opened.archived_at
                    ? <RdButton size="sm" icon={ArchiveRestore} onClick={() => void run(() => setArchived([opened.id], false), 'Moved back')}>Move back</RdButton>
                    : <RdButton size="sm" icon={Archive} onClick={() => void run(() => setArchived([opened.id], true), 'Archived')}>Archive</RdButton>}
                </div>
              </>
            );
          })() : (
            <div className="ib2-empty ib2-center" data-overview>
              <b>{live.length} in your inbox</b>
              <span>{unread ? `${unread} not read yet` : 'Every message read'}{archivedCount ? `, ${archivedCount} archived` : ''}. Pick a message to read it here.</span>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
