import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

/**
 * The platform's popup — the admin app's Modal in this app's CSS: a blurred
 * backdrop, a raised panel, Esc and the backdrop close it. Decisions (plan,
 * suspend, invite, add) open here instead of unfolding inside the list, so the
 * list never jumps under the pointer.
 *
 * With no `title`, the child is its own heading (Ask, InviteOwner): `.modal-body`
 * strips a child card's chrome so those forms are reused unchanged.
 */
export default function Modal({ open, onClose, title, subtitle, size = 'md', children, label }: {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
  /** The dialog's accessible name when there is no title. */
  label?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [open, onClose]);

  if (!open) return null;
  return createPortal((
    <div className="modal-shade" onMouseDown={onClose}>
      <div className={`modal modal-${size}`} role="dialog" aria-modal="true"
        aria-label={typeof title === 'string' ? title : label} onMouseDown={(e) => e.stopPropagation()}>
        {title ? (
          <div className="modal-head">
            <div style={{ minWidth: 0 }}>
              <h2>{title}</h2>
              {subtitle && <p>{subtitle}</p>}
            </div>
            <button type="button" className="modal-x" aria-label="Close" onClick={onClose}><X size={18} /></button>
          </div>
        ) : (
          <button type="button" className="modal-x modal-x-float" aria-label="Close" onClick={onClose}><X size={18} /></button>
        )}
        <div className="modal-body">{children}</div>
      </div>
    </div>
  ), document.body);
}
