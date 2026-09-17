import * as React from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from '@phosphor-icons/react';
import { NocButton } from './noc';

/**
 * Standard modal for the member app.
 * Structure:
 *   - Header with title and close X (top-right)
 *   - Scrollable body
 *   - Footer with Cancel + Confirm buttons (full-width primary CTA at bottom)
 *
 * **Portalled to `#modal-root`, and that is not cosmetic.**
 *
 * It used to render inline, wherever `<Modal>` happened to sit in the page's
 * JSX — which is inside `<main>`, the scrolling container, which is
 * `position: relative`. So `absolute inset-0` resolved against main's *content
 * box*, not the viewport: the modal was pinned to the top of the entire
 * scrollable page. Tap Book on a class near the bottom of the schedule and the
 * dialog opened somewhere far above you, and you had to scroll up to find the
 * thing you had just opened. Reported from a real phone.
 *
 * `#modal-root` is a sibling of `#phone-screen` (see PhoneChassis), so it does
 * not move with the scroll. It is also `pointer-events: none`, which is why the
 * wrapper below sets `pointer-events-auto` — forget that and the modal paints
 * perfectly and cannot be tapped.
 */
interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  /** Optional footer content (defaults to Cancel + Confirm buttons if onConfirm is set). */
  footer?: React.ReactNode;
  onConfirm?: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmDisabled?: boolean;
  /** Hide the default footer entirely. */
  hideFooter?: boolean;
}

export default function Modal({
  isOpen, onClose, title, subtitle, children,
  footer, onConfirm, confirmLabel = 'Confirm', cancelLabel = 'Cancel',
  confirmDisabled, hideFooter,
}: ModalProps) {
  // Falls back to `document.body` only so a stray render outside the phone
  // shell cannot crash the page; in the app the root is always there.
  const host = typeof document === 'undefined'
    ? null
    : document.getElementById('modal-root') ?? document.body;
  if (!host) return null;

  return createPortal(
    // Always mounted, and the only thing here that declares pointer-events.
    //
    // `#modal-root` is `pointer-events: none`, so a portalled dialog has to opt
    // back in — and that used to happen on a node *inside* `{isOpen && …}`.
    // **AnimatePresence keeps an exiting subtree mounted until its animation
    // finishes**, and on a page that is not compositing the animation never
    // finishes. Measured after Close: 14 descendants still reporting
    // `pointer-events: auto`, invisible, over the whole screen.
    //
    // Deriving it inside the conditional does not work either — an exiting
    // child is re-rendered with its *last* props, so `isOpen ? … : …` stays
    // frozen at true. Only a node that never unmounts observes the change.
    <div
      className="absolute inset-0 z-[200]"
      style={{ pointerEvents: isOpen ? 'auto' : 'none' }}
    >
    <AnimatePresence>
      {isOpen && (
        <div className="absolute inset-0">
          {/* Backdrop — constrained to phone screen */}
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0"
            style={{ background: 'rgba(8, 8, 14, 0.78)' }}
            onClick={onClose}
          />

          {/* Sheet */}
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0,  scale: 1 }}
            exit={{    opacity: 0, y: 16, scale: 0.96 }}
            transition={{ duration: 0.2 }}
            className="absolute left-3 right-3 top-1/2 -translate-y-1/2 flex flex-col overflow-hidden"
            style={{
              // Nocturne: on a dark ground elevation is an edge, not a shadow
              // — the hairline carries it, the drop shadow only lifts it off
              // the scrim.
              background: 'var(--color-surface)',
              borderRadius: 'var(--radius-card)',
              boxShadow: '0 0 0 1px rgba(233, 233, 237, 0.16), 0 16px 40px rgba(0, 0, 0, 0.65)',
              maxHeight: 'calc(100% - 6rem)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start justify-between flex-shrink-0" style={{ gap: 12, padding: '16px 16px 12px' }}>
              <div className="flex-1 min-w-0">
                <h2 style={{ fontSize: 17, fontWeight: 500, color: 'var(--color-text-primary)' }}>{title}</h2>
                {subtitle && (
                  <p style={{ fontSize: 12.5, marginTop: 3, lineHeight: 1.45, color: 'var(--color-text-muted)' }}>{subtitle}</p>
                )}
              </div>
              <button
                onClick={onClose}
                className="grid place-items-center flex-shrink-0"
                style={{ width: 34, height: 34, borderRadius: 8, border: '1px solid rgba(233, 233, 237, 0.14)', color: 'var(--color-text-secondary)' }}
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>
            <div className="rule" style={{ margin: '0 16px' }} />

            {/* Body */}
            <div className="overflow-y-auto flex-1 scrollbar-hide" style={{ padding: '12px 16px' }}>
              {children}
            </div>

            {/* Footer */}
            {!hideFooter && (
              <div className="flex items-center flex-shrink-0" style={{ gap: 9, padding: '12px 16px 16px' }}>
                {footer ?? (
                  <>
                    <NocButton variant="ghost" className="flex-1" onClick={onClose}>{cancelLabel}</NocButton>
                    {onConfirm && (
                      <NocButton variant="action" className="flex-1" onClick={onConfirm} disabled={confirmDisabled}>
                        {confirmLabel}
                      </NocButton>
                    )}
                  </>
                )}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
    </div>,
    host
  );
}
