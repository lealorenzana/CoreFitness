import { motion, AnimatePresence } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { Bell, X, CheckCheck, Archive, ArrowRight } from 'lucide-react';
import { notificationService, type Notification } from '../services/notificationService';
import { supabase } from '../lib/supabaseClient';
import { getMyPrefs } from '../lib/api/notificationPrefs';
import { playNotificationSound } from '../utils/notificationSound';
import { bucketize } from '../utils/notificationDisplay';
import NotificationListItem from './ui/NotificationListItem';
import NotificationDetail from './ui/NotificationDetail';
import SwipeRow from './ui/SwipeRow';

/**
 * The notification bell — a worktray, not the archive.
 *
 * It shows only rows that are neither cleared nor archived (0029). The two
 * swipes mean different things and neither destroys anything:
 *
 *   swipe LEFT  → clear. Out of the bell, still in the full list.
 *   swipe RIGHT → archive. Out of the bell and out of the inbox, into Archived.
 *
 * The X button used to **delete**, so a payment receipt tidied away in a hurry
 * was gone for good. It now does the same thing as swipe-left, because a
 * gesture nobody discovers cannot be the only way to keep a record safe — and
 * because swiping is unavailable to anyone using a keyboard. Deleting now lives
 * on the full-list screen behind a multi-select.
 *
 * Tapping a row opens the whole message rather than navigating: the rows clamp
 * to two lines, and a trainer's recommendation is longer than that.
 */

function getOverlayRoot(): HTMLElement | null {
  return document.getElementById('phone-overlay-root') ?? document.getElementById('phone-screen');
}

export default function Notifications() {
  const navigate = useNavigate();
  const location = useLocation();
  const isTrainer = location.pathname.startsWith('/trainer');
  const allRoute = isTrainer ? '/trainer/notifications' : '/member/notifications';

  const [isOpen, setIsOpen] = useState(false);
  const [overlayRoot, setOverlayRoot] = useState<HTMLElement | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [detail, setDetail] = useState<Notification | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [soundOn, setSoundOn] = useState(false);

  const seenIds = useRef<Set<string> | null>(null);

  useEffect(() => { setOverlayRoot(getOverlayRoot()); }, []);

  // Real auth, not the legacy localStorage cache.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (cancelled) return;
      setUserId(data.user?.id ?? null);
      if (!data.user) setLoading(false);
      setSoundOn((await getMyPrefs().catch(() => null))?.soundEnabled ?? false);
    })();
    return () => { cancelled = true; };
  }, []);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const data = await notificationService.getBellNotifications(userId);
      setNotifications(data);

      // Chime only for arrivals after this component started watching, or
      // opening the app would replay a sound for everything already waiting.
      const ids = new Set(data.map((n) => n.id));
      if (seenIds.current) {
        const isNew = data.some((n) => !seenIds.current!.has(n.id) && !n.read);
        if (isNew && soundOn) playNotificationSound();
      }
      seenIds.current = ids;
    } catch (err) {
      console.error('Failed to load notifications:', err);
    } finally {
      setLoading(false);
    }
  }, [userId, soundOn]);

  useEffect(() => { if (userId) load(); }, [userId, load]);

  // Poll in the foreground; stops entirely when the tab is hidden. Deliberately
  // not Supabase realtime — that needs the table in the `supabase_realtime`
  // publication, and a missing publication looks exactly like "nothing new".
  useEffect(() => {
    if (!userId) return;
    const tick = () => { if (!document.hidden) load(); };
    const id = setInterval(tick, 25_000);
    document.addEventListener('visibilitychange', tick);
    window.addEventListener('focus', tick);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
      window.removeEventListener('focus', tick);
    };
  }, [userId, load]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAllRead = useCallback(async () => {
    if (!userId || unreadCount === 0) return;
    setNotifications((list) => list.map((n) => ({ ...n, read: true })));
    await notificationService.markAllAsRead(userId).catch(() => load());
  }, [userId, unreadCount, load]);

  // Closing does NOT mark everything read: peeking once should not wipe the
  // only signal that something arrived.
  const close = () => setIsOpen(false);
  const open = () => { setIsOpen(true); void load(); };

  /** Swipe left / X button. The row survives in the full list. */
  const clearFromBell = (n: Notification) => {
    setNotifications((list) => list.filter((x) => x.id !== n.id));
    void notificationService.setCleared([n.id], true).catch(() => load());
  };

  /** Swipe right. Archiving marks read too — you have dealt with it. */
  const archive = (n: Notification) => {
    setNotifications((list) => list.filter((x) => x.id !== n.id));
    void notificationService.setArchived([n.id], true).catch(() => load());
  };

  const openDetail = (n: Notification) => {
    setDetail(n);
    if (!n.read) {
      setNotifications((list) => list.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      void notificationService.setRead([n.id], true);
    }
  };

  const toggleRead = (n: Notification) => {
    const next = !n.read;
    setNotifications((list) => list.map((x) => (x.id === n.id ? { ...x, read: next } : x)));
    setDetail((d) => (d && d.id === n.id ? { ...d, read: next } : d));
    void notificationService.setRead([n.id], next).catch(() => load());
  };

  const toggleArchive = (n: Notification) => {
    setDetail(null);
    if (n.archived) {
      void notificationService.setArchived([n.id], false).catch(() => load());
    } else {
      archive(n);
    }
  };

  const buckets = bucketize(notifications);

  const panel = (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={close}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm z-[10] pointer-events-auto"
          />
          <motion.div
            initial={{ opacity: 0, y: -16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -16, scale: 0.97 }}
            transition={{ type: 'spring', damping: 26, stiffness: 320 }}
            role="dialog" aria-modal="true" aria-label="Notifications"
            className="absolute top-14 left-3 right-3 z-[20] overflow-hidden pointer-events-auto max-h-[72%] flex flex-col"
            style={{
              background: 'var(--color-surface-raised)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-panel)',
              boxShadow: 'var(--shadow-panel)',
            }}
          >
            <div className="p-4 flex items-center justify-between gap-3 shrink-0"
              style={{ borderBottom: '1px solid var(--color-border)' }}>
              <div className="min-w-0">
                <h3 className="display text-lg text-white">Notifications</h3>
                <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
                </p>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {unreadCount > 0 && (
                  <button onClick={markAllRead} aria-label="Mark all as read"
                    className="h-9 px-3 rounded-full text-xs font-semibold flex items-center gap-1.5"
                    style={{ background: 'var(--color-surface-high)', color: 'var(--color-secondary)' }}>
                    <CheckCheck size={14} /> Read all
                  </button>
                )}
                <button onClick={close} aria-label="Close"
                  className="w-9 h-9 rounded-full flex items-center justify-center"
                  style={{ background: 'var(--color-surface-high)', color: 'var(--color-text-secondary)' }}>
                  <X size={17} />
                </button>
              </div>
            </div>

            <div className="overflow-y-auto scrollbar-hide flex-1">
              {loading ? (
                <div className="p-4 space-y-2">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="h-16 rounded-xl animate-pulse"
                      style={{ background: 'var(--color-surface-high)' }} />
                  ))}
                </div>
              ) : notifications.length === 0 ? (
                <div className="p-10 text-center">
                  <Bell size={36} className="mx-auto mb-3" style={{ color: 'var(--color-border)' }} />
                  <p className="text-sm font-semibold text-white">Nothing waiting</p>
                  <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
                    Anything you swiped away is still in your full list.
                  </p>
                </div>
              ) : (
                <>
                  {/* Says what the gestures do. A swipe nobody knows about is
                      the same as no swipe, and the hint costs one line. */}
                  <p className="px-4 py-2 text-xs leading-snug" style={{ color: 'var(--color-text-muted)' }}>
                    Swipe right to archive · swipe left to clear · tap to read
                  </p>

                  {buckets.map(([label, items]) => (
                    <div key={label}>
                      <p className="px-4 pt-3 pb-1 text-xs font-semibold uppercase tracking-wider"
                        style={{ color: 'var(--color-text-muted)' }}>
                        {label}
                      </p>
                      <AnimatePresence initial={false}>
                        {items.map((n) => (
                          <motion.div
                            key={n.id}
                            layout
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.18 }}
                          >
                            <SwipeRow
                              onSwipeRight={() => archive(n)}
                              onSwipeLeft={() => clearFromBell(n)}
                              rightAction={{
                                icon: <Archive size={16} className="text-black" />,
                                label: 'Archive',
                                color: 'var(--color-secondary)',
                              }}
                              leftAction={{
                                icon: <X size={16} className="text-white" />,
                                label: 'Clear',
                                color: 'var(--color-primary)',
                              }}
                            >
                              <div style={{ background: 'var(--color-surface-raised)' }}>
                                <NotificationListItem
                                  notification={n}
                                  onClick={() => openDetail(n)}
                                  trailing={
                                    <button
                                      onClick={(e) => { e.stopPropagation(); clearFromBell(n); }}
                                      aria-label={`Clear ${n.title} from the bell`}
                                      className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                                      style={{ color: 'var(--color-text-muted)' }}>
                                      <X size={15} />
                                    </button>
                                  }
                                />
                              </div>
                            </SwipeRow>
                          </motion.div>
                        ))}
                      </AnimatePresence>
                    </div>
                  ))}
                </>
              )}
            </div>

            <button
              onClick={() => { close(); navigate(allRoute); }}
              className="p-3.5 flex items-center justify-center gap-1.5 text-xs font-bold shrink-0"
              style={{
                borderTop: '1px solid var(--color-border)',
                background: 'var(--color-surface-high)',
                color: 'var(--color-secondary)',
              }}
            >
              See all notifications <ArrowRight size={14} />
            </button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  return (
    <div className="relative">
      <button
        onClick={() => (isOpen ? close() : open())}
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        className="relative w-11 h-11 rounded-full flex items-center justify-center transition-colors"
        style={{
          background: 'var(--color-surface-raised)',
          border: '1px solid var(--color-border)',
          color: unreadCount > 0 ? 'var(--color-secondary)' : 'var(--color-text-secondary)',
        }}
      >
        <Bell size={19} />
        {unreadCount > 0 && (
          <motion.span
            initial={{ scale: 0 }} animate={{ scale: 1 }}
            className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center text-xs font-bold text-black"
            style={{ background: 'var(--color-secondary)' }}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </motion.span>
        )}
      </button>

      {overlayRoot && isOpen ? createPortal(panel, overlayRoot) : null}

      <NotificationDetail
        notification={detail}
        onClose={() => setDetail(null)}
        onToggleRead={toggleRead}
        onToggleArchive={toggleArchive}
        onOpenAction={(n) => {
          setDetail(null);
          setIsOpen(false);
          if (n.actionUrl) navigate(n.actionUrl);
        }}
      />
    </div>
  );
}
