import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Archive, Checks, Envelope, EnvelopeOpen, Trash } from '@phosphor-icons/react';

import NotificationListItem from '../components/ui/NotificationListItem';
import NotificationDetail from '../components/ui/NotificationDetail';
import { SkeletonList } from '../components/ui/Skeleton';
import { toast } from '../components/ui/Toast';
import { errorMessage } from '../utils/errorMessage';
import { bucketize } from '../utils/notificationDisplay';
import { notificationService, type Notification } from '../services/notificationService';
import { supabase } from '../lib/supabaseClient';
import { Page, PageTitle } from '../components/ui/page';
import { TextTabs } from '../components/ui/noc';
import Modal from '../components/ui/Modal';

/**
 * Every notification the user has, including the ones swiped out of the bell.
 *
 * The bell deliberately cannot delete anything (0029) — this is the only screen
 * that can, and only through an explicit multi-select. That asymmetry is the
 * point: one careless finger on a small row should never destroy a payment
 * receipt, but a member who genuinely wants rid of forty of them can select all
 * and say so once.
 *
 * Serves both roles from one component; the route decides which shell to go
 * back to, the same arrangement as ChangeEmail and Achievements.
 */

type Tab = 'inbox' | 'unread' | 'archived';

const TABS: { id: Tab; label: string }[] = [
  { id: 'inbox', label: 'Inbox' },
  { id: 'unread', label: 'Unread' },
  { id: 'archived', label: 'Archived' },
];

export default function NotificationsAll() {
  const navigate = useNavigate();
  const location = useLocation();
  const isTrainer = location.pathname.startsWith('/trainer');

  const [all, setAll] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('inbox');
  const [detail, setDetail] = useState<Notification | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [userId, setUserId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id ?? null;
      setUserId(uid);
      if (!uid) return;
      setAll(await notificationService.getNotifications(uid));
    } catch (err) {
      toast.error(errorMessage(err, 'Could not load your notifications'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  // Archived rows are excluded from Inbox — that is what archiving is for.
  // Cleared rows are *not*: swiping out of the bell is not the same as filing
  // something away, and the whole promise of the left swipe is that the row is
  // still here.
  const visible = useMemo(() => {
    if (tab === 'archived') return all.filter((n) => n.archived);
    const inbox = all.filter((n) => !n.archived);
    return tab === 'unread' ? inbox.filter((n) => !n.read) : inbox;
  }, [all, tab]);

  const buckets = bucketize(visible);
  const unreadCount = all.filter((n) => !n.archived && !n.read).length;
  const allSelected = visible.length > 0 && visible.every((n) => selected.has(n.id));

  // Leaving select mode must also drop the selection, or reopening it restores
  // ticks the member cannot see against a list that may have changed.
  const exitSelect = () => { setSelecting(false); setSelected(new Set()); };

  const toggleSelect = (id: string) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelected(allSelected ? new Set() : new Set(visible.map((n) => n.id)));
  };

  const patch = (ids: Set<string> | string[], change: Partial<Notification>) => {
    const set = ids instanceof Set ? ids : new Set(ids);
    setAll((list) => list.map((n) => (set.has(n.id) ? { ...n, ...change } : n)));
  };

  const bulkSetRead = async (read: boolean) => {
    const ids = [...selected];
    if (ids.length === 0) return;
    patch(selected, { read });
    exitSelect();
    await notificationService.setRead(ids, read).catch(() => load());
  };

  const bulkArchive = async (archived: boolean) => {
    const ids = [...selected];
    if (ids.length === 0) return;
    patch(selected, archived ? { archived: true, cleared: true, read: true } : { archived: false });
    exitSelect();
    await notificationService.setArchived(ids, archived).catch(() => load());
  };

  const bulkDelete = async () => {
    const ids = [...selected];
    if (ids.length === 0) return;
    setConfirmDelete(false);
    setAll((list) => list.filter((n) => !selected.has(n.id)));
    exitSelect();
    try {
      await notificationService.deleteMany(ids);
      toast.success(`${ids.length} notification${ids.length === 1 ? '' : 's'} deleted`);
    } catch (err) {
      toast.error(errorMessage(err, 'Could not delete those'));
      void load();
    }
  };

  const openDetail = (n: Notification) => {
    setDetail(n);
    if (!n.read) {
      patch([n.id], { read: true });
      void notificationService.setRead([n.id], true);
    }
  };

  const toggleRead = (n: Notification) => {
    const next = !n.read;
    patch([n.id], { read: next });
    setDetail((d) => (d && d.id === n.id ? { ...d, read: next } : d));
    void notificationService.setRead([n.id], next).catch(() => load());
  };

  const toggleArchive = (n: Notification) => {
    const next = !n.archived;
    patch([n.id], next ? { archived: true, cleared: true, read: true } : { archived: false });
    setDetail(null);
    void notificationService.setArchived([n.id], next).catch(() => load());
  };

  const markAllRead = async () => {
    if (!userId || unreadCount === 0) return;
    setAll((list) => list.map((n) => (n.archived ? n : { ...n, read: true })));
    await notificationService.markAllAsRead(userId).catch(() => load());
  };

  return (
    <Page>
      {/* Back undoes the last step. It hardcoded Home — the rule in CLAUDE.md,
          broken here — so opening Updates from Train and pressing back landed
          somewhere the member had not been. A trainer falls back to theirs. */}
      <PageTitle
        back
        fallback={isTrainer ? '/trainer/home' : '/member/home'}
        title="Updates"
        subtitle={loading ? undefined : `${all.length} total · ${unreadCount} unread`}
        action={!loading && all.length > 0 ? (
          <button onClick={() => (selecting ? exitSelect() : setSelecting(true))}
            style={{ fontSize: 13, color: selecting ? 'var(--color-secondary)' : 'var(--color-primary-300)' }}>
            {selecting ? 'Done' : 'Select'}
          </button>
        ) : undefined}
      />

      <TextTabs<Tab>
        label="Notifications"
        tabs={TABS.map((t) => ({ id: t.id, label: t.id === 'unread' && unreadCount > 0 ? `Unread · ${unreadCount}` : t.label }))}
        active={tab}
        onChange={(id) => { setTab(id); setSelected(new Set()); }}
      />

      {/* Announcements and events are the other half of "what has the gym told
          me". Hidden for a trainer: /member/events is not on their nav, and a
          link to somewhere they cannot use is worse than none. */}
      {!isTrainer && !selecting && (
        <div className="flex items-center justify-between" style={{ gap: 12, marginTop: -8, fontSize: 13 }}>
          <button onClick={() => navigate('/member/events')} style={{ color: 'var(--color-primary-300)' }}>
            Events and announcements
          </button>
          {unreadCount > 0 && (
            <button onClick={markAllRead} className="flex items-center" style={{ gap: 6, color: 'var(--color-secondary)' }}>
              <Checks size={15} /> Mark all as read
            </button>
          )}
        </div>
      )}

      {selecting && (
        <div className="flex items-center justify-between" style={{ gap: 12, marginTop: -8, fontSize: 13 }}>
          <button onClick={toggleSelectAll} disabled={visible.length === 0} className="disabled:opacity-40"
            style={{ color: 'var(--color-secondary)' }}>
            {allSelected ? 'Clear selection' : `Select all · ${visible.length}`}
          </button>
          <span style={{ color: 'var(--color-text-muted)' }}>{selected.size} selected</span>
        </div>
      )}

      {loading ? (
        <SkeletonList count={5} />
      ) : visible.length === 0 ? (
        <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--color-text-muted)' }}>
          {tab === 'archived'
            ? 'Nothing archived. Swipe a notification right in the bell to file it here.'
            : tab === 'unread'
              ? 'Nothing unread.'
              : 'Nothing yet. Booking decisions, payment receipts and gym announcements land here.'}
        </p>
      ) : (
        <div style={{
          margin: '0 calc(var(--card-pad) * -1)',
          // Room for the action bar so the last row is never trapped under it.
          marginBottom: selecting && selected.size > 0 ? '5rem' : undefined,
        }}>
          {buckets.map(([label, items]) => (
            <div key={label}>
              <p className="eyebrow" style={{ padding: '14px var(--card-pad) 4px' }}>{label}</p>
              {items.map((n) => (
                <NotificationListItem
                  key={n.id}
                  notification={n}
                  selectable={selecting}
                  selected={selected.has(n.id)}
                  onToggleSelect={() => toggleSelect(n.id)}
                  onClick={() => openDetail(n)}
                />
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Bulk actions, above the bar while something is selected. Fixed, and
          measured from the bar's own height rather than a guess at the dock. */}
      {selecting && selected.size > 0 && (
        <div
          className="fixed z-[60] flex items-center"
          style={{
            left: 'var(--gutter)', right: 'var(--gutter)',
            bottom: 'calc(var(--bar-height) + env(safe-area-inset-bottom) + 12px)',
            gap: 6, padding: 6, borderRadius: 12,
            background: 'var(--color-surface)',
            boxShadow: '0 0 0 1px rgba(233, 233, 237, 0.18), 0 10px 30px rgba(0, 0, 0, 0.6)',
          }}
        >
          <button onClick={() => bulkSetRead(true)} className="flex-1 flex items-center justify-center"
            style={{ gap: 6, height: 40, fontSize: 13, color: 'var(--color-text-secondary)' }}>
            <EnvelopeOpen size={15} /> Read
          </button>
          <button onClick={() => bulkSetRead(false)} className="flex-1 flex items-center justify-center"
            style={{ gap: 6, height: 40, fontSize: 13, color: 'var(--color-text-secondary)' }}>
            <Envelope size={15} /> Unread
          </button>
          <button onClick={() => bulkArchive(tab !== 'archived')} className="flex-1 flex items-center justify-center"
            style={{ gap: 6, height: 40, fontSize: 13, color: 'var(--color-text-secondary)' }}>
            <Archive size={15} /> {tab === 'archived' ? 'Restore' : 'Archive'}
          </button>
          <button onClick={() => setConfirmDelete(true)} className="grid place-items-center flex-none"
            style={{ width: 44, height: 40, borderRadius: 8, color: 'var(--color-secondary)', border: '1px solid color-mix(in srgb, var(--color-secondary) 55%, transparent)' }}
            aria-label={`Delete ${selected.size} notifications`}>
            <Trash size={16} />
          </button>
        </div>
      )}

      {/* Delete is the one irreversible action in the feature, so it asks —
          through Modal, which portals and releases pointer events correctly.
          This was an inline `fixed` overlay inside the scroller. */}
      <Modal
        isOpen={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={`Delete ${selected.size} notification${selected.size === 1 ? '' : 's'}`}
        subtitle="This cannot be undone. Archiving keeps them out of the way without removing the record."
        cancelLabel="Keep them"
        confirmLabel="Delete"
        onConfirm={bulkDelete}
      >
        <span />
      </Modal>

      <NotificationDetail
        notification={detail}
        onClose={() => setDetail(null)}
        onToggleRead={toggleRead}
        onToggleArchive={toggleArchive}
        onOpenAction={(n) => { setDetail(null); if (n.actionUrl) navigate(n.actionUrl); }}
      />
    </Page>
  );
}
