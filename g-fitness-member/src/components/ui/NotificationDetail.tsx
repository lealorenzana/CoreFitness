import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, ArrowRight, Archive, ArchiveRestore, Mail, MailOpen,
} from 'lucide-react';
import type { Notification } from '../../services/notificationService';
import { iconFor, fullTimestamp } from '../../utils/notificationDisplay';

/**
 * The whole message.
 *
 * Rows in the bell and the list clamp to two lines, which is right for
 * scanning and wrong for actually reading — a trainer's recommendation is
 * several sentences and was simply cut off with no way to see the rest.
 *
 * Deliberately a sheet rather than a route: a notification is a thing you
 * glance at and dismiss, and pushing a page would put the bell's own overlay
 * behind a back-navigation the member did not ask for.
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
    <AnimatePresence>
      {notification && (
        <motion.div
          /* #modal-root is `pointer-events-none`; a portalled overlay has to
             turn them back on or it is decorative only. */
          className="absolute inset-0 z-[250] flex items-end pointer-events-auto"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.72)' }} />

          <motion.div
            className="relative w-full max-h-[85%] flex flex-col"
            style={{
              background: 'var(--color-surface-raised)',
              borderTop: '1px solid var(--color-border)',
              borderTopLeftRadius: 'var(--radius-panel)',
              borderTopRightRadius: 'var(--radius-panel)',
            }}
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 320 }}
            onClick={(e) => e.stopPropagation()}
            role="dialog" aria-modal="true" aria-label={notification.title}
          >
            <div className="p-5 pb-3 flex items-start gap-3 shrink-0">
              <span
                className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0"
                style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary)' }}
              >
                {(() => { const Icon = iconFor(notification.type); return <Icon size={20} />; })()}
              </span>
              <div className="flex-1 min-w-0">
                <h2 className="text-base font-bold text-white leading-snug">{notification.title}</h2>
                <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                  {fullTimestamp(notification.timestamp)}
                </p>
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                style={{ background: 'var(--color-surface-high)', color: 'var(--color-text-muted)' }}
                aria-label="Close"
              >
                <X size={15} />
              </button>
            </div>

            {/* The body, in full. `whitespace-pre-wrap` so a message written with
                line breaks keeps them instead of collapsing into a paragraph. */}
            <div className="px-5 pb-4 overflow-y-auto scrollbar-hide flex-1">
              {/* Selectable: the shell is `user-select: none`, and a message
                  body is real content someone may want to copy. */}
              <p
                className="text-sm leading-relaxed whitespace-pre-wrap break-words selectable"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                {notification.message}
              </p>
            </div>

            <div className="p-4 pb-8 flex flex-wrap gap-2 shrink-0" style={{ borderTop: '1px solid var(--color-border)' }}>
              {notification.actionUrl && onOpenAction && (
                <button
                  onClick={() => onOpenAction(notification)}
                  className="flex-1 min-w-[8rem] h-11 rounded-full font-bold text-sm text-black flex items-center justify-center gap-1.5"
                  style={{ background: 'var(--color-secondary)' }}
                >
                  Open <ArrowRight size={15} />
                </button>
              )}
              <button
                onClick={() => onToggleRead(notification)}
                className="h-11 px-4 rounded-full font-semibold text-xs flex items-center gap-1.5"
                style={{ background: 'var(--color-surface-high)', color: 'var(--color-text-secondary)' }}
              >
                {notification.read ? <Mail size={14} /> : <MailOpen size={14} />}
                {notification.read ? 'Mark unread' : 'Mark read'}
              </button>
              <button
                onClick={() => onToggleArchive(notification)}
                className="h-11 px-4 rounded-full font-semibold text-xs flex items-center gap-1.5"
                style={{ background: 'var(--color-surface-high)', color: 'var(--color-text-secondary)' }}
              >
                {notification.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
                {notification.archived ? 'Restore' : 'Archive'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return root ? createPortal(body, root) : body;
}
