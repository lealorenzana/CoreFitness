import { createPortal } from 'react-dom';
import { X, type LucideIcon } from 'lucide-react';
import { useEscapeToClose } from '../../hooks/useEscapeToClose';
import { TONE } from './rdTokens';

/**
 * A large window floating over the page (the owner's ask, 2026-10-18): a
 * whole list at once — today's check-ins, past walk-ins — with its own
 * filters, and no page change. Escape, the X or the scrim closes it. The body
 * scrolls itself; a table inside keeps its header (`rd-fit-scroll`).
 */
export default function FloatingWindow({ open, onClose, title, icon: Icon, count, tools, children, footer, ...rest }: {
  open: boolean; onClose: () => void; title: string; icon: LucideIcon; count?: number;
  tools?: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode;
} & { [k: `data-${string}`]: string | boolean | undefined }) {
  useEscapeToClose(open, onClose);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-6" onClick={onClose}
      style={{ background: 'rgba(5,4,10,0.72)', backdropFilter: 'blur(6px)' }}>
      <div role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()} {...rest}
        className="w-full flex flex-col rounded-2xl overflow-hidden"
        style={{ maxWidth: 1240, height: 'min(88vh, 980px)', background: 'var(--color-surface)', border: '1px solid rgba(139,92,246,0.35)',
          boxShadow: '0 40px 120px -30px rgba(124,58,237,0.6)' }}>
        <div className="flex items-center justify-between gap-3 flex-wrap px-5 py-3.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="flex items-center gap-3">
            <Icon size={22} style={{ color: '#A78BFA' }} />
            <h2 className="text-[19px] font-semibold text-white">{title}</h2>
            {count !== undefined && (
              <span className="text-[13px] px-2.5 py-0.5 rounded-full tabular-nums" style={{ background: TONE.violet.bg, color: TONE.violet.fg }}>{count}</span>
            )}
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {tools}
            <button type="button" onClick={onClose} aria-label="Close" className="w-11 h-11 rounded-xl grid place-items-center hover:bg-white/[0.06]"
              style={{ border: '1px solid rgba(255,255,255,0.1)', color: 'var(--color-text-secondary)' }}><X size={18} /></button>
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto rd-fit-scroll" data-window-body>{children}</div>
        {footer && <div className="px-5 py-3 flex items-center justify-between gap-3 flex-wrap" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
