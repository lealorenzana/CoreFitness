import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Bell, Trash2, CheckCheck, Mail, MailOpen, Archive, ArchiveRestore, X,
} from 'lucide-react';

import NotificationListItem from '../components/ui/NotificationListItem';
import NotificationDetail from '../components/ui/NotificationDetail';
import { SkeletonList } from '../components/ui/Skeleton';
import { toast } from '../components/ui/Toast';
import { errorMessage } from '../utils/errorMessage';
import { bucketize } from '../utils/notificationDisplay';
import { notificationService, type Notification } from '../services/notificationService';
import { supabase } from '../lib/supabaseClient';

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

  useEffect(() => { load(); }, [load]);

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
    <div className="space-y-4 pb-4">
      <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3">
        <button
          onClick={() => navigate(isTrainer ? '/trainer/home' : '/member/home')}
          className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}
          aria-label="Back"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="display text-xl text-white">Notifications</h1>
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            {loading ? 'Loading…' : `${all.length} total · ${unreadCount} unread`}
          </p>
        </div>
        {!loading && all.length > 0 && (
          <button
            onClick={() => (selecting ? exitSelect() : setSelecting(true))}
            className="h-9 px-3 rounded-full text-xs font-semibold flex-shrink-0"
            style={{
              background: selecting ? 'var(--color-secondary)' : 'var(--color-surface-raised)',
              border: '1px solid var(--color-border)',
              color: selecting ? '#000' : 'var(--color-text-secondary)',
            }}
          >
            {selecting ? 'Cancel' : 'Select'}
          </button>
        )}
      </motion.div>

      {/* Tabs */}
      <div
        className="grid grid-cols-3 gap-1 p-1"
        style={{
          background: 'var(--color-surface-raised)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-btn)',
        }}
        role="tablist"
      >
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={active}
              onClick={() => { setTab(t.id); setSelected(new Set()); }}
              className="py-2 rounded-full text-xs font-semibold transition-colors"
              style={{
                background: active ? 'var(--color-primary)' : 'transparent',
                color: active ? '#fff' : 'var(--color-text-muted)',
              }}
            >
              {t.label}
              {t.id === 'unread' && unreadCount > 0 && ` (${unreadCount})`}
            </button>
          );
        })}
      </div>

      {/* Select-all bar, only while selecting. */}
      <AnimatePresence>
        {selecting && (
          <motion.div
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div
              className="p-3 flex items-center justify-between gap-3"
              style={{
                background: 'var(--color-surface-raised)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-card)',
              }}
            >
              <button
                onClick={toggleSelectAll}
                disabled={visible.length === 0}
                className="text-xs font-bold disabled:opacity-40"
                style={{ color: 'var(--color-secondary)' }}
              >
                {allSelected ? 'Clear selection' : `Select all (${visible.length})`}
              </button>
              <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                {selected.size} selected
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!selecting && unreadCount > 0 && (
        <button
          onClick={markAllRead}
          className="w-full h-10 rounded-full text-xs font-semibold flex items-center justify-center gap-1.5"
          style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', color: 'var(--color-secondary)' }}
        >
          <CheckCheck size={14} /> Mark all as read
        </button>
      )}

      {loading ? (
        <SkeletonList count={5} />
      ) : visible.length === 0 ? (
        <div className="p-10 text-center" style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-panel)' }}>
          <Bell size={36} className="mx-auto mb-3" style={{ color: 'var(--color-border)' }} />
          <p className="text-sm font-semibold text-white">
            {tab === 'archived' ? 'Nothing archived' : tab === 'unread' ? 'Nothing unread' : 'Nothing yet'}
          </p>
          <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
            {tab === 'archived'
              ? 'Swipe a notification right in the bell to file it here.'
              : 'Booking approvals, payment receipts and gym announcements land here.'}
          </p>
        </div>
      ) : (
        <div
          className="overflow-hidden"
          style={{
            background: 'var(--color-surface-raised)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-panel)',
            // Room for the action bar so the last row is never trapped under it.
            marginBottom: selecting && selected.size > 0 ? '5rem' : undefined,
          }}
        >
          {buckets.map(([label, items]) => (
            <div key={label}>
              <p className="px-4 pt-3 pb-1 text-xs font-semibold uppercase tracking-wider"
                style={{ color: 'var(--color-text-muted)' }}>
                {label}
              </p>
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

      {/* Bulk action bar. Floats above the dock while something is selected. */}
      <AnimatePresence>
        {selecting && selected.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 24 }}
            className="fixed left-3 right-3 bottom-24 z-[60] p-2 flex items-center gap-2"
            style={{
              background: 'var(--color-surface-high)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-panel)',
              boxShadow: 'var(--shadow-panel)',
            }}
          >
            <button
              onClick={() => bulkSetRead(true)}
              className="flex-1 h-10 rounded-full text-xs font-semibold flex items-center justify-center gap-1.5"
              style={{ background: 'var(--color-surface-raised)', color: 'var(--color-text-secondary)' }}
            >
              <MailOpen size={14} /> Read
            </button>
            <button
              onClick={() => bulkSetRead(false)}
              className="flex-1 h-10 rounded-full text-xs font-semibold flex items-center justify-center gap-1.5"
              style={{ background: 'var(--color-surface-raised)', color: 'var(--color-text-secondary)' }}
            >
              <Mail size={14} /> Unread
            </button>
            <button
              onClick={() => bulkArchive(tab !== 'archived')}
              className="flex-1 h-10 rounded-full text-xs font-semibold flex items-center justify-center gap-1.5"
              style={{ background: 'var(--color-surface-raised)', color: 'var(--color-text-secondary)' }}
            >
              {tab === 'archived' ? <ArchiveRestore size={14} /> : <Archive size={14} />}
              {tab === 'archived' ? 'Restore' : 'Archive'}
            </button>
            <button
              onClick={() => setConfirmDelete(true)}
              className="w-11 h-10 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(239,68,68,0.15)', color: '#EF4444' }}
              aria-label={`Delete ${selected.size} notifications`}
            >
              <Trash2 size={15} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete is the one irreversible action in the whole feature, so it asks. */}
      <AnimatePresence>
        {confirmDelete && (
          <motion.div
            className="fixed inset-0 z-[260] flex items-center justify-center p-6"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setConfirmDelete(false)}
          >
            <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.75)' }} />
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.92, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-sm p-5"
              style={{
                background: 'var(--color-surface-raised)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-panel)',
              }}
            >
              <div className="flex items-start gap-3">
                <span className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(239,68,68,0.15)', color: '#EF4444' }}>
                  <Trash2 size={18} />
                </span>
                <div className="flex-1 min-w-0">
                  <h2 className="text-sm font-bold text-white">
                    Delete {selected.size} notification{selected.size === 1 ? '' : 's'}?
                  </h2>
                  <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
                    This cannot be undone. Archiving keeps them out of the way without removing the
                    record.
                  </p>
                </div>
                <button onClick={() => setConfirmDelete(false)} aria-label="Cancel"
                  className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: 'var(--color-surface-high)', color: 'var(--color-text-muted)' }}>
                  <X size={15} />
                </button>
              </div>
              <div className="flex gap-2 mt-4">
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="flex-1 h-11 rounded-full text-sm font-semibold"
                  style={{ background: 'var(--color-surface-high)', color: 'var(--color-text-secondary)' }}
                >
                  Keep them
                </button>
                <button
                  onClick={bulkDelete}
                  className="flex-1 h-11 rounded-full text-sm font-bold text-white"
                  style={{ background: '#EF4444' }}
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <NotificationDetail
        notification={detail}
        onClose={() => setDetail(null)}
        onToggleRead={toggleRead}
        onToggleArchive={toggleArchive}
        onOpenAction={(n) => { setDetail(null); if (n.actionUrl) navigate(n.actionUrl); }}
      />
    </div>
  );
}
