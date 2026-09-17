import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ArrowRight } from '@phosphor-icons/react';
import type { Notification } from '../../services/notificationService';
import { fullTimestamp } from '../../utils/notificationDisplay';
import { NocButton } from './noc';

/**
 * The whole message, as a bottom sheet (Nocturne redesign).
 *
 * Rows in the bell and the list clamp to two lines, which is right for scanning
 * and wrong for reading — a trainer's recommendation is several sentences.
 * A sheet rather than a route: a notification is glanced at and dismissed, and
 * pushing a page would put the bell's own overlay behind a back-navigation the
 * member did not ask for.
 *
 * **Always-mounted wrapper, the only node declaring pointer-events.** The
 * overlay used to put `pointer-events-auto` on a motion node inside
 * AnimatePresence — the shape that leaves an invisible, tap-eating layer over
 * the app when an exit animation never finishes on a non-compositing page.
 */
export default function NotificationDetail({
  notification,
  onClose,
  onToggleRead,
  onToggleArchive,
  onOpenAction,
}: {
  notification: Notification | null;
  onClose: () => void;
  onToggleRead: (n: Notification) => void;
  onToggleArchive: (n: Notification) => void;
  /** Undefined when the host has nowhere to navigate from (rare). */
  onOpenAction?: (n: Notification) => void;
}) {
  const root = typeof document !== 'undefined' ? document.getElementById('modal-root') : null;

  const body = (
    <div className="absolute inset-0 z-[250]" style={{ pointerEvents: notification ? 'auto' : 'none' }}>
      <AnimatePresence>
        {notification && (
          <motion.div
            className="absolute inset-0 flex items-end"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
          >
            <div className="absolute inset-0" style={{ background: 'rgba(8, 8, 14, 0.78)' }} />

            <motion.div
              className="relative w-full flex flex-col"
              style={{
                maxHeight: '85%',
                background: 'var(--color-surface)',
                borderRadius: '20px 20px 0 0',
                boxShadow: '0 -1px 0 rgba(233, 233, 237, 0.2), 0 -18px 44px rgba(0, 0, 0, 0.6)',
              }}
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 320 }}
              onClick={(e) => e.stopPropagation()}
              role="dialog" aria-modal="true" aria-label={notification.title}
            >
              <div aria-hidden className="mx-auto" style={{ width: 42, height: 4, borderRadius: 2, marginTop: 12, background: 'rgba(233, 233, 237, 0.25)' }} />
              <div className="flex items-start shrink-0" style={{ gap: 12, padding: '14px var(--gutter) 12px' }}>
                <div className="flex-1 min-w-0">
                  <h2 style={{ fontSize: 18, fontWeight: 500, lineHeight: 1.3, color: 'var(--color-text-primary)' }}>{notification.title}</h2>
                  <p style={{ fontSize: 12, marginTop: 4, color: 'var(--color-text-muted)' }}>{fullTimestamp(notification.timestamp)}</p>
                </div>
                <button
                  onClick={onClose}
                  className="grid place-items-center shrink-0"
                  style={{ width: 34, height: 34, borderRadius: 8, border: '1px solid rgba(233, 233, 237, 0.14)', color: 'var(--color-text-secondary)' }}
                  aria-label="Close"
                >
                  <X size={16} />
                </button>
              </div>

              {/* The body, in full. `pre-wrap` keeps a writer's line breaks;
                  `.selectable` because a message is content someone may copy. */}
              <div className="overflow-y-auto scrollbar-hide flex-1" style={{ padding: '0 var(--gutter) 16px' }}>
                <p className="whitespace-pre-wrap break-words selectable"
                  style={{ fontSize: 14.5, lineHeight: 1.6, color: 'var(--color-text-secondary)' }}>
                  {notification.message}
                </p>
                {/* Under the words, not above them: the message is what the member
                    came to read. Nothing is drawn when there is no picture. */}
                {notification.imageUrl && (
                  <img src={notification.imageUrl} alt="" loading="lazy" className="w-full object-cover"
                    style={{ marginTop: 12, borderRadius: 'var(--radius-card)', background: 'var(--color-surface-high)' }} />
                )}
              </div>

              <div className="flex flex-col shrink-0" style={{ gap: 10, padding: '12px var(--gutter) calc(20px + env(safe-area-inset-bottom))' }}>
                {notification.actionUrl && onOpenAction && (
                  <NocButton variant="action" className="w-full" onClick={() => onOpenAction(notification)}>
                    <span className="flex items-center" style={{ gap: 7 }}>Open <ArrowRight size={15} /></span>
                  </NocButton>
                )}
                <div className="flex justify-center" style={{ gap: 24, fontSize: 13 }}>
                  <button onClick={() => onToggleRead(notification)} style={{ color: 'var(--color-primary-300)' }}>
                    {notification.read ? 'Mark unread' : 'Mark read'}
                  </button>
                  <button onClick={() => onToggleArchive(notification)} style={{ color: 'var(--color-primary-300)' }}>
                    {notification.archived ? 'Restore' : 'Archive'}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

  return root ? createPortal(body, root) : body;
}
