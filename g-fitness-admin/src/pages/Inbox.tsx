import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle, Archive, ArchiveRestore, ArrowUpRight, Banknote, Bell, Calendar, CheckCheck, Clock, Dumbbell, Gift,
  Inbox as InboxIcon, Info, ListChecks, Mail, MailOpen, MessageSquare, Trash2, Trophy, UserPlus, X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { listNotifications, setRead, setArchived, deleteNotifications, markAllAsRead, INBOX_CHANGED } from '../lib/api/notifications';
import { dashboardService, type HeaderAlert } from '../services/dashboardService';
import { usePaged } from '../hooks/usePaged';
import { RdHeader, RdCard, IconTile, Ring, RdButton, SearchField, TableFooter, EmptyBlock, Pill } from '../components/ui/rd';
import { TONE, type Tone } from '../components/ui/rdTokens';
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
 */
type View = 'unread' | 'all' | 'archived';
const ALERT_ICONS: Record<HeaderAlert['kind'], LucideIcon> = {
  expired: AlertCircle, expiring: Clock, registration: UserPlus, booking: Calendar, payment: Banknote,
};
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
const MUTED = 'var(--color-text-muted)';
const SECOND = 'var(--color-text-secondary)';
const LINE = '1px solid rgba(255,255,255,0.06)';

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
    return v === 'all' || v === 'archived' ? v : 'unread';
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

  return (
    <div className="rd-fit" data-inbox>
      <RdHeader title="Notifications" subtitle="What needs you now, and every message sent to you."
        actions={unread > 0 && me ? (
          <RdButton variant="soft" icon={CheckCheck} onClick={() => void run(() => markAllAsRead(me), 'All marked as read')} data-mark-all>
            Mark all as read
          </RdButton>
        ) : undefined} />

      <div className="rd-inbox-grid">
        {/* ── Live alerts ── */}
        <RdCard className="flex flex-col min-h-0 overflow-hidden" data-attention>
          <div className="flex items-center gap-3 px-4 py-3.5" style={{ borderBottom: LINE }}>
            <IconTile icon={AlertCircle} tone="amber" size={38} />
            <div className="min-w-0 flex-1">
              <h2 className="text-[16px] font-semibold text-white">Needs attention</h2>
              <p className="text-[12.5px]" style={{ color: SECOND }}>Each stays while it is true</p>
            </div>
            {alerts && alerts.length > 0 && <Pill tone="amber">{alerts.length}</Pill>}
          </div>
          <div className="rd-fit-scroll p-2.5">
            {alerts === null ? <p className="text-[13.5px] p-3" style={{ color: MUTED }}>These could not be loaded. Reload the page to try again.</p>
              : alerts.length === 0 ? <EmptyBlock compact icon={CheckCheck} title="Nothing needs you" body="New sign-ups, expiring members and waiting bookings show up here." />
              : (
              <div className="flex flex-col gap-1.5" data-alerts>
                {alerts.map((a) => {
                  const Icon = ALERT_ICONS[a.kind];
                  const t = TONE[a.priority === 'high' ? 'amber' : 'violet'];
                  return (
                    <button key={a.id} type="button" onClick={() => a.actionUrl && navigate(a.actionUrl)}
                      className="w-full text-left flex items-start gap-3 p-3 rounded-xl transition-colors hover:bg-white/[0.04]"
                      style={{ borderLeft: `3px solid ${t.dot}`, background: 'rgba(255,255,255,0.015)' }}>
                      <Icon size={17} className="mt-0.5 flex-none" style={{ color: t.fg }} />
                      <span className="min-w-0">
                        <span className="block text-[14px] font-medium text-white">{a.title}</span>
                        <span className="block text-[12.5px] mt-0.5" style={{ color: SECOND }}>{a.message}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </RdCard>

        {/* ── The messages ── */}
        <RdCard className="flex flex-col min-h-0 overflow-hidden" data-messages>
          <div className="flex items-center gap-2 flex-wrap px-4 pt-3.5 pb-3" style={{ borderBottom: LINE }}>
            <div className="flex items-center gap-1 p-1 rounded-xl" role="tablist" style={{ background: 'rgba(255,255,255,0.03)', border: LINE }}>
              {(['unread', 'all', 'archived'] as View[]).map((v) => (
                <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => changeView(v)} data-inbox-tab={v}
                  className="h-8 px-3 rounded-lg text-[13px] font-semibold inline-flex items-center gap-1.5 transition-colors"
                  style={view === v ? { background: 'rgba(124,58,237,0.25)', color: '#EDE9FE' } : { color: SECOND }}>
                  {v === 'unread' ? 'Unread' : v === 'all' ? 'All' : 'Archived'}
                  <span className="text-[11.5px] tabular-nums" style={{ color: view === v ? '#C4B5FD' : MUTED }}>{viewCount(v)}</span>
                </button>
              ))}
            </div>
            <div className="flex-1 min-w-[180px]"><SearchField value={q} onChange={setQ} placeholder="Search messages" label="Search messages" /></div>
            {kind && (
              <button type="button" onClick={() => setKind(null)} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-[12.5px] font-medium"
                style={{ background: TONE[kindOf(kind).tone].bg, color: TONE[kindOf(kind).tone].fg, border: `1px solid ${TONE[kindOf(kind).tone].line}` }}
                aria-label={`Show every kind, not only ${kindOf(kind).label}`}>
                {kindOf(kind).label} <X size={13} />
              </button>
            )}
          </div>

          {picked.size > 0 && (
            <div className="flex flex-wrap items-center gap-2 px-4 py-2.5" style={{ borderBottom: LINE, background: 'rgba(124,58,237,0.08)' }} data-bulk>
              <span className="text-[13px] font-medium text-white mr-1">{picked.size} selected</span>
              <RdButton size="sm" icon={MailOpen} onClick={() => void run(() => setRead(ids, true), 'Marked as read')}>Mark read</RdButton>
              <RdButton size="sm" icon={Mail} onClick={() => void run(() => setRead(ids, false), 'Marked as unread')}>Mark unread</RdButton>
              {view === 'archived'
                ? <RdButton size="sm" icon={ArchiveRestore} onClick={() => void run(() => setArchived(ids, false), 'Moved back')}>Move back</RdButton>
                : <RdButton size="sm" icon={Archive} onClick={() => void run(() => setArchived(ids, true), 'Archived')}>Archive</RdButton>}
              <RdButton size="sm" variant="danger" icon={Trash2} onClick={() => void run(() => deleteNotifications(ids), 'Deleted')}>Delete</RdButton>
            </div>
          )}

          {failed ? <EmptyBlock compact icon={AlertCircle} title="Your messages could not be loaded" body="Reload the page to try again." />
            : rows === null ? <p className="text-[13.5px] p-5" style={{ color: MUTED }}>Loading…</p>
            : shown.length === 0 ? (
              <div data-inbox-empty>
                <EmptyBlock compact icon={view === 'archived' ? Archive : InboxIcon}
                  title={q || kind ? 'No message matches' : view === 'unread' ? 'You are all caught up' : view === 'archived' ? 'Nothing archived' : 'No messages yet'}
                  body={q || kind ? 'Clear the search or the kind to see more.' : view === 'unread' ? 'Read messages are under All.' : undefined} />
              </div>
            ) : (
              <>
                <label className="flex items-center gap-2.5 text-[12.5px] px-4 py-2" style={{ color: MUTED, borderBottom: LINE }}>
                  <input type="checkbox" checked={allOnPage} aria-label="Select this page" className="accent-violet-500"
                    onChange={(e) => setPicked(e.target.checked ? new Set([...picked, ...paged.visible.map((n) => n.id)]) : new Set([...picked].filter((x) => !paged.visible.some((n) => n.id === x))))} />
                  Select this page
                </label>
                <div className="rd-fit-scroll" data-inbox-list>
                  {paged.visible.map((n, i) => {
                    const k = kindOf(n.type);
                    const g = dayGroup(n.created_at, today);
                    const head = i === 0 || dayGroup(paged.visible[i - 1].created_at, today) !== g ? g : null;
                    const on = n.id === openId;
                    return (
                      <div key={n.id}>
                        {head && <p className="px-4 pt-3 pb-1.5 text-[12px] font-semibold sticky top-0 z-[1]" style={{ color: SECOND, background: 'var(--color-surface)' }}>{head}</p>}
                        <div className="group flex items-start gap-3 px-4 py-3 transition-colors hover:bg-white/[0.025]" data-inbox-row data-unread={!n.read || undefined}
                          style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: on ? 'rgba(124,58,237,0.12)' : undefined,
                            boxShadow: on ? 'inset 3px 0 0 #8B5CF6' : undefined }}>
                          <input type="checkbox" className="mt-2.5 accent-violet-500" checked={picked.has(n.id)} aria-label={`Select ${n.title}`}
                            onChange={(e) => { const s = new Set(picked); if (e.target.checked) s.add(n.id); else s.delete(n.id); setPicked(s); }} />
                          <span className="relative mt-0.5">
                            <IconTile icon={k.icon} tone={n.read ? 'gray' : k.tone} size={34} />
                            {!n.read && <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full" style={{ background: '#8B5CF6', boxShadow: '0 0 0 2px var(--color-surface)' }} aria-label="Unread" />}
                          </span>
                          <button type="button" onClick={() => read(n)} className="flex-1 min-w-0 text-left" aria-current={on || undefined}>
                            <span className="flex items-baseline gap-2">
                              <span className={`flex-1 min-w-0 truncate text-[14px] ${n.read ? '' : 'font-semibold'}`} style={{ color: n.read ? SECOND : '#fff' }}>{n.title}</span>
                              <span className="flex-none text-[11.5px] tabular-nums" style={{ color: MUTED }}>{when(n.created_at, now)}</span>
                            </span>
                            {n.message && <span className="block text-[12.5px] mt-0.5 truncate" style={{ color: SECOND }}>{n.message}</span>}
                          </button>
                          <button type="button" onClick={() => void run(() => setRead([n.id], !n.read))}
                            data-tip={n.read ? 'Mark as unread' : 'Mark as read'} aria-label={n.read ? 'Mark as unread' : 'Mark as read'}
                            className="p-1.5 rounded-lg hover:bg-white/[0.06]" style={{ color: MUTED }}>
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
        </RdCard>

        {/* ── The reading pane: the open message, or the overview ── */}
        <RdCard glow={!opened} className="flex flex-col min-h-0 overflow-hidden" data-reading>
          {opened ? (() => {
            const k = kindOf(opened.type);
            const dest = openable(opened.action_url) ? opened.action_url! : null;
            return (
              <>
                <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: LINE }}>
                  <Pill tone={k.tone} icon={k.icon}>{k.label}</Pill>
                  <span className="flex-1" />
                  <button type="button" onClick={() => { void run(() => setRead([opened.id], false), 'Marked as unread'); setOpenId(null); }}
                    aria-label="Mark unread" data-tip="Mark unread" className="p-1.5 rounded-lg hover:bg-white/[0.06]" style={{ color: MUTED }}><Mail size={16} /></button>
                  <button type="button" onClick={() => { void run(() => deleteNotifications([opened.id]), 'Deleted'); setOpenId(null); }}
                    aria-label="Delete this message" data-tip="Delete" className="p-1.5 rounded-lg hover:bg-white/[0.06]" style={{ color: MUTED }}><Trash2 size={16} /></button>
                  <button type="button" onClick={() => setOpenId(null)} aria-label="Close message" data-tip="Close"
                    className="p-1.5 rounded-lg hover:bg-white/[0.06]" style={{ color: MUTED }}><X size={16} /></button>
                </div>
                <div className="rd-fit-scroll px-5 py-5" data-opened>
                  <h2 className="text-[21px] leading-snug font-semibold text-white">{opened.title}</h2>
                  <p className="text-[12.5px] mt-1.5" style={{ color: MUTED }}>
                    Received {fullWhen(opened.created_at)}{opened.archived_at ? ' — archived' : ''}
                  </p>
                  {opened.message && <p className="text-[15px] leading-relaxed mt-5 whitespace-pre-line" style={{ color: 'var(--color-text-primary)' }}>{opened.message}</p>}
                  {opened.action_url && !dest && (
                    <p className="text-[12.5px] mt-5 p-3 rounded-xl" style={{ color: SECOND, border: LINE }}>
                      This one points to a screen in the members&rsquo; phone app.
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2 px-4 py-3.5" style={{ borderTop: LINE }}>
                  {dest && <RdButton size="sm" variant="primary" icon={ArrowUpRight} onClick={() => navigate(dest)} data-open-page>Open {pageName(dest) ?? 'the page'}</RdButton>}
                  {opened.archived_at
                    ? <RdButton size="sm" icon={ArchiveRestore} onClick={() => void run(() => setArchived([opened.id], false), 'Moved back')}>Move back</RdButton>
                    : <RdButton size="sm" icon={Archive} onClick={() => void run(() => setArchived([opened.id], true), 'Archived')}>Archive</RdButton>}
                </div>
              </>
            );
          })() : (
            <div className="rd-fit-scroll p-5" data-overview>
              <div className="flex items-center gap-5">
                <Ring value={live.length ? unread / live.length : null} label={unread} sub="unread" size={112} />
                <div className="min-w-0">
                  <p className="text-[22px] font-bold text-white leading-tight tabular-nums">{live.length} in your inbox</p>
                  <p className="text-[13.5px] mt-1" style={{ color: SECOND }}>
                    {unread ? `${unread} not read yet` : 'Every message read'}{archivedCount ? `, ${archivedCount} archived` : ''}.
                  </p>
                </div>
              </div>
              <h3 className="text-[14px] font-semibold text-white mt-6 mb-2">By kind</h3>
              {kinds.length === 0 ? <p className="text-[13px]" style={{ color: MUTED }}>Messages you receive are sorted here by kind.</p> : (
                <div className="flex flex-col gap-1.5" data-kinds>
                  {kinds.map(([type, c]) => {
                    const k = kindOf(type);
                    const t = TONE[k.tone];
                    const on = kind === type;
                    return (
                      <button key={type} type="button" onClick={() => setKind(on ? null : type)} aria-pressed={on} data-kind={type}
                        className="flex items-center gap-3 p-2.5 rounded-xl text-left transition-colors hover:bg-white/[0.04]"
                        style={{ border: `1px solid ${on ? t.line : 'rgba(255,255,255,0.05)'}`, background: on ? t.bg : undefined }}>
                        <IconTile icon={k.icon} tone={k.tone} size={30} />
                        <span className="flex-1 min-w-0">
                          <span className="block text-[13.5px] font-medium text-white">{k.label}</span>
                          <span className="block h-1 rounded-full mt-1.5 overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                            <span className="block h-full rounded-full" style={{ width: `${Math.round((c.total / Math.max(1, live.length)) * 100)}%`, background: t.dot }} />
                          </span>
                        </span>
                        <span className="text-[13px] tabular-nums text-white">{c.total}</span>
                        {c.unread > 0 && <span className="text-[11.5px] tabular-nums px-1.5 rounded-full" style={{ background: TONE.violet.bg, color: TONE.violet.fg }}>{c.unread} new</span>}
                      </button>
                    );
                  })}
                </div>
              )}
              <p className="text-[12.5px] mt-5" style={{ color: MUTED }}>Pick a message to read it here. A kind above narrows the list.</p>
            </div>
          )}
        </RdCard>
      </div>
    </div>
  );
}
