import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import Button from './Button';

/**
 * Standard admin modal:
 *   - Header with title + close X
 *   - Scrollable body
 *   - Footer with Cancel (ghost) + Confirm (primary)
 */
interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  onConfirm?: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmDisabled?: boolean;
  hideFooter?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

const SIZE = { sm: 420, md: 560, lg: 720 } as const;

const SURFACE_RAISED = 'var(--color-surface-raised)';
const BORDER         = 'var(--color-border)';
const TEXT_SECOND    = 'var(--color-text-secondary)';

export default function Modal({
  isOpen, onClose, title, subtitle, children,
  footer, onConfirm, confirmLabel = 'Confirm', cancelLabel = 'Cancel',
  confirmDisabled, hideFooter, size = 'md',
}: ModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
            onClick={onClose}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 12 }}
              animate={{ opacity: 1, scale: 1,    y: 0 }}
              exit={{    opacity: 0, scale: 0.96, y: 12 }}
              transition={{ type: 'spring', damping: 26, stiffness: 320 }}
              className="w-full rounded-2xl shadow-2xl flex flex-col overflow-hidden my-8"
              style={{
                maxWidth: SIZE[size],
                maxHeight: 'calc(100vh - 4rem)',
                background: SURFACE_RAISED,
                border: `1px solid ${BORDER}`,
                borderRadius: 'var(--radius-card)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className="px-5 py-4 flex items-start justify-between flex-shrink-0"
                style={{ borderBottom: `1px solid ${BORDER}` }}
              >
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-white truncate">{title}</h2>
                  {subtitle && <p className="text-xs mt-0.5" style={{ color: TEXT_SECOND }}>{subtitle}</p>}
                </div>
                <button
                  onClick={onClose}
                  aria-label="Close"
                  className="p-1 -m-1 rounded-md transition-colors"
                  style={{ color: TEXT_SECOND }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = '#fff')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = TEXT_SECOND)}
                >
                  <X size={18} />
                </button>
              </div>

              <div className="px-5 py-4 overflow-y-auto flex-1 scrollbar-thin scrollbar-thumb-dark-border">
                {children}
              </div>

              {!hideFooter && (
                <div
                  className="px-5 py-4 flex items-center gap-2 justify-end flex-shrink-0"
                  style={{ borderTop: `1px solid ${BORDER}` }}
                >
                  {footer ?? (
                    <>
                      <Button variant="ghost" onClick={onClose}>{cancelLabel}</Button>
                      {onConfirm && (
                        <Button variant="primary" onClick={onConfirm} disabled={confirmDisabled}>
                          {confirmLabel}
                        </Button>
                      )}
                    </>
                  )}
                </div>
              )}
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
