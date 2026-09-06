import { useEffect, useRef, useState, type ReactNode } from 'react';
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
  /**
   * Receives the typed reason when `reason` is configured, and nothing
   * otherwise. Existing callers take no argument and are unaffected.
   */
  onConfirm: (reason?: string) => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'danger' | 'warning' | 'info';
  /**
   * Ask for a written reason before confirming.
   *
   * Set this wherever the database will demand one — suspending an account
   * (0069), freezing or cancelling a membership (0057). Those guards raise on a
   * blank reason, and a dialog that cannot collect one turns a rule into an
   * error message after the fact.
   *
   * `required` disables Confirm until something is typed, so the refusal
   * happens where the admin can still do something about it.
   */
  reason?: {
    label: string;
    placeholder?: string;
    required?: boolean;
    /** Shown under the field — what this reason will be used for, and who reads it. */
    hint?: string;
  };
  /** Anything else the confirmation needs to show — a refund quote, a summary. */
  children?: ReactNode;
}

const TONES = {
  danger:  { bg: 'var(--color-secondary)', soft: 'var(--color-secondary-light)' },
  warning: { bg: 'var(--color-secondary)', soft: 'var(--color-secondary-light)' },
  info:    { bg: 'var(--color-primary)', soft: 'var(--color-primary-light)' },
};

export default function ConfirmDialog({
  isOpen, onClose, onConfirm, title, message,
  confirmText = 'Confirm', cancelText = 'Cancel', type = 'danger',
  reason, children,
}: ConfirmDialogProps) {
  const tone = TONES[type];
  const [text, setText] = useState('');
  const fieldRef = useRef<HTMLTextAreaElement | null>(null);

  /*
   * Cleared on each open. Without it, the reason for the last suspension is
   * pre-filled into the next one and gets confirmed by muscle memory — worse
   * than no reason at all, because it reads as a deliberate statement about a
   * member it was never about.
   *
   * Adjusted **during render**, not in an effect. `setText('')` inside a
   * `useEffect` is the `set-state-in-effect` cascade this codebase keeps
   * shipping (0057-era Sidebar, useBranding, and this component on its first
   * draft — lint has caught it every time). React's documented pattern for
   * "reset state when a prop changes" is to compare against the previous value
   * during render: the re-render happens before the browser paints, so nothing
   * flashes, and no effect runs.
   */
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) setText('');
  }

  // Focus is a real side effect and belongs in one. Never gated on the entry
  // transition having run: on a non-compositing page no animation runs at all,
  // and a callback waiting for one would never fire.
  useEffect(() => {
    if (!isOpen) return;
    const id = window.setTimeout(() => fieldRef.current?.focus(), 60);
    return () => window.clearTimeout(id);
  }, [isOpen]);

  const blocked = reason?.required === true && text.trim() === '';

  const handleConfirm = () => {
    if (blocked) return;
    onConfirm(reason ? text.trim() : undefined);
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

              {(reason || children) && (
                <div className="px-5 pt-4 space-y-3" style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: '1.25rem' }}>
                  {children}
                  {reason && (
                    <div>
                      <label htmlFor="confirm-reason" className="text-xs font-semibold block mb-1.5"
                        style={{ color: 'var(--color-text-secondary)' }}>
                        {reason.label}
                        {reason.required && (
                          <span style={{ color: 'var(--color-secondary)' }}> *</span>
                        )}
                      </label>
                      <textarea
                        id="confirm-reason"
                        ref={fieldRef}
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        rows={3}
                        placeholder={reason.placeholder}
                        className="w-full rounded-lg px-3 py-2 text-sm resize-none"
                        style={{
                          background: 'var(--color-bg)',
                          border: '1px solid var(--color-border)',
                          color: '#fff',
                        }}
                      />
                      {reason.hint && (
                        <p className="text-xs mt-1.5" style={{ color: 'var(--color-text-muted)' }}>
                          {reason.hint}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Actions */}
              <div className="p-5 flex items-center gap-3">
                <Button type="button" variant="ghost" onClick={onClose} className="flex-1">
                  {cancelText}
                </Button>
                <button type="button" onClick={handleConfirm} disabled={blocked}
                  className="flex-1 py-2.5 rounded-md font-semibold text-sm text-white disabled:cursor-not-allowed"
                  style={{
                    background: blocked ? 'var(--color-bg)' : tone.bg,
                    color: blocked ? 'var(--color-text-muted)' : '#fff',
                    border: blocked ? '1px solid var(--color-border)' : 'none',
                  }}>
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
