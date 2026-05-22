import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

/**
 * Standard modal for the member app.
 * Structure:
 *   - Header with title and close X (top-right)
 *   - Scrollable body
 *   - Footer with Cancel + Confirm buttons (full-width primary CTA at bottom)
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
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="absolute inset-0 z-[200] pointer-events-auto">
          {/* Backdrop — constrained to phone screen */}
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Sheet */}
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0,  scale: 1 }}
            exit={{    opacity: 0, y: 16, scale: 0.96 }}
            transition={{ duration: 0.2 }}
            className="absolute left-3 right-3 top-1/2 -translate-y-1/2 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
            style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              maxHeight: 'calc(100% - 6rem)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-4 py-3 flex items-start justify-between flex-shrink-0"
              style={{ borderBottom: '1px solid var(--color-border)' }}>
              <div className="flex-1 min-w-0">
                <h2 className="text-base font-bold text-white truncate">{title}</h2>
                {subtitle && <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{subtitle}</p>}
              </div>
              <button
                onClick={onClose}
                className="p-1 -m-1 rounded-md flex-shrink-0"
                style={{ color: 'var(--color-text-muted)' }}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="px-4 py-3 overflow-y-auto flex-1 scrollbar-hide">
              {children}
            </div>

            {/* Footer */}
            {!hideFooter && (
              <div className="px-4 py-3 flex items-center gap-2 flex-shrink-0"
                style={{ borderTop: '1px solid var(--color-border)' }}>
                {footer ?? (
                  <>
                    <button
                      onClick={onClose}
                      className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
                      style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}
                    >
                      {cancelLabel}
                    </button>
                    {onConfirm && (
                      <button
                        onClick={onConfirm}
                        disabled={confirmDisabled}
                        className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-black disabled:opacity-50"
                        style={{ background: 'var(--color-secondary)' }}
                      >
                        {confirmLabel}
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
