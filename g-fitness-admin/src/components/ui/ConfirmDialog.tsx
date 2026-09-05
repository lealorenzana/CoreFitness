import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, X } from 'lucide-react';
import Button from './Button';

/**
 * The app's z-index ladder, in the one place a dialog has to know it:
 *
 *   50   dropdowns, the small page modals
 *   100  GlobalSearch
 *   150  the member / trainer detail drawers
 *   180  `DetailSheet` (a card's details — it opens modals, so it sits under them)
 *   200  the big modals — `Modal`, Events, Schedule, Notifications, RecordPayment
 *   300  Popover (it opens *inside* a modal, so it has to clear one)
 *   400  this
 *
 * A confirmation is always the last thing asked before something irreversible
 * happens, so it is always on top. It sat at 50 and was therefore **invisible**
 * behind every 200-level modal: "Review & send" on Notifications appeared to do
 * nothing, and the dialog only surfaced once you closed the modal in front of
 * it — which read as the app confirming a send you had just cancelled.
 *
 * It also **portals to `document.body`**. Pages render it inline, and `<main>`
 * scrolls while Framer transforms the route wrapper; a transformed ancestor
 * becomes the containing block for `position: fixed`, so `inset-0` stops
 * meaning "the viewport" and starts meaning "that box". Both drawers animate on
 * `x` for exactly this reason.
 */
const LAYER = 400;

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'danger' | 'warning' | 'info';
}

const TONES = {
  danger:  { bg: 'var(--color-secondary)', soft: 'var(--color-secondary-light)' },
  warning: { bg: 'var(--color-secondary)', soft: 'var(--color-secondary-light)' },
  info:    { bg: 'var(--color-primary)', soft: 'var(--color-primary-light)' },
};

export default function ConfirmDialog({
  isOpen, onClose, onConfirm, title, message,
  confirmText = 'Confirm', cancelText = 'Cancel', type = 'danger',
}: ConfirmDialogProps) {
  const tone = TONES[type];

  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose} className="fixed inset-0 bg-black/70 backdrop-blur-sm"
            style={{ zIndex: LAYER }} />

          <div className="fixed inset-0 flex items-center justify-center p-4"
            style={{ zIndex: LAYER }}>
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
              style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
              onClick={(e) => e.stopPropagation()}>

              {/* Header */}
              <div className="p-5" style={{ borderBottom: '1px solid var(--color-border)' }}>
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: tone.soft }}>
                    <AlertTriangle size={22} style={{ color: tone.bg }} />
                  </div>
                  <div className="flex-1">
                    <h2 className="text-lg font-bold text-white">{title}</h2>
                    <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>{message}</p>
                  </div>
                  <button onClick={onClose} style={{ color: 'var(--color-text-muted)' }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = '#fff')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-muted)')}>
                    <X size={20} />
                  </button>
                </div>
              </div>

              {/* Actions */}
              <div className="p-5 flex items-center gap-3">
                <Button type="button" variant="ghost" onClick={onClose} className="flex-1">
                  {cancelText}
                </Button>
                <button type="button" onClick={handleConfirm}
                  className="flex-1 py-2.5 rounded-md font-semibold text-sm text-white"
                  style={{ background: tone.bg }}>
                  {confirmText}
                </button>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}
