import * as React from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

/**
 * A floating panel for "I clicked a card and want to see the rest of it".
 *
 * The pattern it replaces: a details block that unfolds *inside* the list, so
 * everything below it jumps down the page and the row you clicked is no longer
 * where your eye left it. Worse when two are open. This slides in over the
 * page, leaves the list exactly where it was, and closes on Escape or a click
 * outside — the two things people try first.
 *
 * It portals to `document.body` for the same reason `ConfirmDialog` does: a
 * transformed ancestor becomes the containing block for `position: fixed`, and
 * Framer transforms the route wrapper on every navigation.
 *
 * Layer 180 — above the detail drawers at 150, and deliberately **below** the
 * modals at 200, because a sheet opens a modal and never the other way round.
 * Putting it above would reproduce exactly the bug that made "Review & send"
 * look broken: the dialog opens behind the thing that opened it.
 */
const LAYER = 180;

const SURFACE = 'var(--color-surface)';
const BORDER  = 'var(--color-border)';
const TEXT_SECOND = 'var(--color-text-secondary)';

interface DetailSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: React.ReactNode;
  /** Sits under the header and stays put while the body scrolls. */
  banner?: React.ReactNode;
  /** Pinned to the bottom — the actions, so they never scroll out of reach. */
  footer?: React.ReactNode;
  children: React.ReactNode;
  width?: number;
}

export default function DetailSheet({
  open, onClose, title, subtitle, banner, footer, children, width = 460,
}: DetailSheetProps) {
  // Escape closes. Bound while open only, so it cannot swallow the key from a
  // dialog opened on top of this one.
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            style={{ zIndex: LAYER }}
          />
          <motion.aside
            initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed top-0 right-0 bottom-0 flex flex-col shadow-2xl"
            style={{
              zIndex: LAYER,
              width: '100%',
              maxWidth: width,
              background: SURFACE,
              borderLeft: `1px solid ${BORDER}`,
            }}
            role="dialog"
            aria-label={title}
          >
            <div className="px-4 py-3.5 flex items-start justify-between gap-3 flex-shrink-0"
              style={{ borderBottom: `1px solid ${BORDER}` }}>
              <div className="min-w-0">
                <h2 className="text-sm font-bold text-white truncate">{title}</h2>
                {subtitle && (
                  <div className="text-[11px] mt-0.5" style={{ color: TEXT_SECOND }}>{subtitle}</div>
                )}
              </div>
              <button onClick={onClose} aria-label="Close"
                className="p-1 -m-1 rounded-md flex-shrink-0" style={{ color: TEXT_SECOND }}>
                <X size={17} />
              </button>
            </div>

            {banner && <div className="flex-shrink-0">{banner}</div>}

            <div className="flex-1 overflow-y-auto px-4 py-4 scrollbar-thin scrollbar-thumb-dark-border">
              {children}
            </div>

            {footer && (
              <div className="px-4 py-3 flex-shrink-0 flex items-center gap-2"
                style={{ borderTop: `1px solid ${BORDER}` }}>
                {footer}
              </div>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}

/** A labelled value inside a sheet. Two columns, so a run of them lines up. */
export function SheetRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-3 py-1.5" style={{ borderBottom: `1px solid ${BORDER}` }}>
      <span className="text-[10px] uppercase tracking-wider flex-shrink-0"
        style={{ color: 'var(--color-text-muted)', width: 104 }}>
        {label}
      </span>
      <span className="text-[12px] text-white min-w-0 flex-1">{children}</span>
    </div>
  );
}
