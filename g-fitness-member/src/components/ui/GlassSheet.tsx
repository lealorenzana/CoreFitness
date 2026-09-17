import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from '@phosphor-icons/react';
import { GLASS, SCRIM } from './glass';

/**
 * A bottom sheet in the app's dark glass — the trainer screens' detail and
 * form sheets, drawn like the member app's (Nocturne).
 *
 * Portalled into `#phone-overlay-root`, which is `pointer-events: none` like
 * every portal root in the chassis, so the sheet sets `pointer-events-auto`
 * itself — and it only mounts while open, so nothing sits over the app at rest.
 * Never `fixed` inside `<main>`: an overlay there scrolls with the page.
 */
export default function GlassSheet({
  open,
  onClose,
  title,
  subtitle,
  leading,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Beside the title — an avatar, usually. */
  leading?: ReactNode;
  children: ReactNode;
  /** Pinned under the scrolling body — a form's submit. */
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const root = document.getElementById('phone-overlay-root');
  if (!open || !root) return null;

  return createPortal(
    <div className="absolute inset-0 flex flex-col justify-end pointer-events-auto" style={{ zIndex: 120 }}>
      <div aria-hidden className="absolute inset-0" style={SCRIM} onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className="relative flex flex-col noc-sheet"
        style={{
          ...GLASS,
          maxHeight: '86%',
          borderRadius: '20px 20px 0 0',
          borderBottom: 'none',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        <span aria-hidden className="self-center" style={{
          width: 36, height: 4, borderRadius: 2, marginTop: 8, background: 'rgba(233, 233, 237, 0.18)',
        }} />
        <div className="flex-none flex items-center" style={{ gap: 12, padding: '12px var(--gutter) 12px' }}>
          {leading}
          <div className="flex-1 min-w-0">
            <h2 className="truncate" style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-text-primary)' }}>{title}</h2>
            {subtitle && (
              <p className="truncate" style={{ fontSize: 12.5, marginTop: 2, color: 'var(--color-text-muted)' }}>{subtitle}</p>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex-none grid place-items-center noc-press"
            style={{
              width: 34, height: 34, borderRadius: 8,
              border: '1px solid rgba(233, 233, 237, 0.14)',
              color: 'var(--color-text-secondary)',
            }}
          >
            <X size={16} />
          </button>
        </div>
        <div aria-hidden style={{
          height: 1, margin: '0 var(--gutter)',
          background: 'linear-gradient(90deg, transparent, #7c3aed 25%, #c4b5fd 55%, #f59e0b 85%, transparent)', opacity: 0.55,
        }} />
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide" style={{ padding: '14px var(--gutter) 18px' }}>
          {children}
        </div>
        {footer && (
          <div className="flex-none" style={{ padding: '10px var(--gutter) 16px', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
            {footer}
          </div>
        )}
      </div>
    </div>,
    root,
  );
}
