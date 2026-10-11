import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, Archive, ArchiveRestore, Banknote, Bell, Calendar, CheckCheck, Clock, Mail, MailOpen, Trash2, UserPlus } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { listNotifications, setRead, setArchived, deleteNotifications, markAllAsRead, INBOX_CHANGED } from '../lib/api/notifications';
import { dashboardService, type HeaderAlert } from '../services/dashboardService';
import { usePaged } from '../hooks/usePaged';
import Pagination from '../components/ui/Pagination';
import { Section } from '../components/ui/kit';
import { showToast } from '../utils/toast';
import type { NotificationRow } from '../types/db';

/**
 * Notifications — the owner's and desk's own inbox. The bell only ever showed
 * live alerts (expiring members, bookings, payments), so everything written TO
 * an owner — the AI coach's limits, equipment reports, coaching requests, a
 * paid day pass, the platform's answers — had no screen in the admin app at
 * all. Two parts: what needs attention now (computed, comes back while true)
 * and the messages (the `notifications` rows: read/unread, archive, delete).
 */
type View = 'unread' | 'all' | 'archived';
const ALERT_ICONS: Record<HeaderAlert['kind'], typeof Bell> = {
  expired: AlertCircle, expiring: Clock, registration: UserPlus, booking: Calendar, payment: Banknote,
};
const PER_PAGE = 20;
const MUTED = 'var(--color-text-muted)';
const SECOND = 'var(--color-text-secondary)';

/** A link the admin app can open; member/trainer paths belong to the phone app. */
const openable = (url: string | null) => !!url && url.startsWith('/') && !/^\/(member|trainer)\b/.test(url);
const when = (iso: string) => {
  const d = new Date(iso);
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  if (mins < 24 * 60) return `${Math.round(mins / 60)} h ago`;
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
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
  const [picked, setPicked] = useState<Set<string>>(new Set());

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

  const shown = useMemo(() => (rows ?? []).filter((n) =>
    view === 'archived' ? n.archived_at : !n.archived_at && (view === 'all' || !n.read)), [rows, view]);
  const paged = usePaged(shown, PER_PAGE);
  const unread = (rows ?? []).filter((n) => !n.read && !n.archived_at).length;

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
  const open = (n: NotificationRow) => {
    if (!n.read) void run(() => setRead([n.id], true));
    if (openable(n.action_url)) navigate(n.action_url!);
  };
  const ids = [...picked];
  const allOnPage = paged.visible.length > 0 && paged.visible.every((n) => picked.has(n.id));
  const tab = (v: View, label: string) => (
    <button type="button" onClick={() => changeView(v)} data-inbox-tab={v}
      className="h-8 px-3 rounded-full text-xs font-semibold"
      style={view === v ? { background: 'var(--color-primary)', color: '#fff' } : { color: SECOND, border: '1px solid var(--color-border)' }}>
      {label}
    </button>
  );
  const act = (label: string, Icon: typeof Bell, fn: () => Promise<void>, done: string, danger = false) => (
    <button type="button" onClick={() => void run(fn, done)}
      className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium"
      style={{ border: '1px solid var(--color-border)', color: danger ? 'var(--color-secondary)' : 'var(--color-text-primary)' }}>
      <Icon size={13} /> {label}
    </button>
  );

  return (
    <div className="space-y-5" data-inbox>
      <div>
        <h1 className="text-xl font-bold text-white">Notifications</h1>
        <p className="text-[11px] mt-0.5" style={{ color: MUTED }}>What needs you now, and every message sent to you.</p>
      </div>

      <Section title="Needs attention" icon={AlertCircle} count={alerts?.length ?? undefined}
        hint="Live: each stays here while it is true">
        {alerts === null ? <p className="text-sm" style={{ color: MUTED }}>Could not load these right now.</p>
          : alerts.length === 0 ? <p className="text-sm" style={{ color: MUTED }} data-no-alerts>Nothing needs you right now.</p> : (
          <div className="divide-y" style={{ borderColor: 'var(--color-border)' }} data-alerts>
            {alerts.map((a) => {
              const Icon = ALERT_ICONS[a.kind];
              return (
                <button key={a.id} type="button" onClick={() => a.actionUrl && navigate(a.actionUrl)}
                  className="w-full text-left flex items-start gap-3 py-2.5">
                  <Icon size={16} className="mt-0.5 flex-shrink-0" style={{ color: a.priority === 'high' ? 'var(--color-secondary)' : 'var(--color-primary)' }} />
                  <span className="min-w-0">
                    <span className="block text-sm text-white">{a.title}</span>
                    <span className="block text-xs mt-0.5" style={{ color: SECOND }}>{a.message}</span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </Section>

      <Section title="Messages" icon={Mail} count={unread || undefined} hint={unread ? `${unread} unread` : 'All read'}
        actions={unread > 0 && me ? (
          <button type="button" onClick={() => void run(() => markAllAsRead(me), 'All marked as read')} data-mark-all
            className="inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color: 'var(--color-primary-300, #A78BFA)' }}>
            <CheckCheck size={14} /> Mark all as read
          </button>
        ) : undefined}>
        <div className="flex flex-wrap items-center gap-2 mb-3">
          {tab('unread', `Unread${unread ? ` · ${unread}` : ''}`)}
          {tab('all', 'All')}
          {tab('archived', 'Archived')}
        </div>

        {picked.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 mb-3" data-bulk>
            <span className="text-xs" style={{ color: SECOND }}>{picked.size} selected</span>
            {act('Mark read', MailOpen, () => setRead(ids, true), 'Marked as read')}
            {act('Mark unread', Mail, () => setRead(ids, false), 'Marked as unread')}
            {view === 'archived'
              ? act('Move back', ArchiveRestore, () => setArchived(ids, false), 'Moved back')
              : act('Archive', Archive, () => setArchived(ids, true), 'Archived')}
            {act('Delete', Trash2, () => deleteNotifications(ids), 'Deleted', true)}
          </div>
        )}

        {failed ? <p className="text-sm" style={{ color: MUTED }}>Your messages could not be loaded. Try again in a moment.</p>
          : rows === null ? <p className="text-sm" style={{ color: MUTED }}>Loading…</p>
          : shown.length === 0 ? (
            <p className="text-sm py-6 text-center" style={{ color: MUTED }} data-inbox-empty>
              {view === 'unread' ? 'No unread messages.' : view === 'archived' ? 'Nothing archived.' : 'No messages yet.'}
            </p>
          ) : (
            <>
              <label className="flex items-center gap-2 text-xs mb-1" style={{ color: MUTED }}>
                <input type="checkbox" checked={allOnPage} aria-label="Select this page"
                  onChange={(e) => setPicked(e.target.checked ? new Set([...picked, ...paged.visible.map((n) => n.id)]) : new Set([...picked].filter((x) => !paged.visible.some((n) => n.id === x))))} />
                Select this page
              </label>
              <div className="divide-y" style={{ borderColor: 'var(--color-border)' }} data-inbox-list>
                {paged.visible.map((n) => (
                  <div key={n.id} className="flex items-start gap-3 py-3" data-inbox-row data-unread={!n.read || undefined}>
                    <input type="checkbox" className="mt-1" checked={picked.has(n.id)} aria-label={`Select ${n.title}`}
                      onChange={(e) => { const s = new Set(picked); if (e.target.checked) s.add(n.id); else s.delete(n.id); setPicked(s); }} />
                    <span className="mt-1.5 w-2 h-2 rounded-full flex-shrink-0" style={{ background: n.read ? 'transparent' : 'var(--color-primary)' }}
                      aria-label={n.read ? undefined : 'Unread'} />
                    <button type="button" onClick={() => open(n)} className="flex-1 min-w-0 text-left">
                      <span className={`block text-sm ${n.read ? '' : 'font-semibold'}`} style={{ color: n.read ? SECOND : '#fff' }}>{n.title}</span>
                      {n.message && <span className="block text-xs mt-0.5" style={{ color: SECOND }}>{n.message}</span>}
                      <span className="block text-[11px] mt-1" style={{ color: MUTED }}>
                        {when(n.created_at)}{openable(n.action_url) ? ' · Open' : ''}
                      </span>
                    </button>
                    <button type="button" onClick={() => void run(() => setRead([n.id], !n.read))}
                      data-tip={n.read ? 'Mark as unread' : 'Mark as read'} aria-label={n.read ? 'Mark as unread' : 'Mark as read'}
                      className="p-1.5 rounded-lg" style={{ color: MUTED }}>
                      {n.read ? <Mail size={15} /> : <MailOpen size={15} />}
                    </button>
                  </div>
                ))}
              </div>
              <div className="mt-3">
                <Pagination currentPage={paged.page} totalItems={paged.total} itemsPerPage={PER_PAGE} onPageChange={paged.setPage} />
              </div>
            </>
          )}
      </Section>
    </div>
  );
}
