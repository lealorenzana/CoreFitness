import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowUpRight, X } from '@phosphor-icons/react';
import { EVERYTHING } from './memberNav';

/**
 * Everything — every member screen, grouped, one tap each.
 *
 * The bar holds three destinations; the app has twenty-odd. This sheet is where
 * the rest are guaranteed to be found, so a screen is never reachable only by
 * knowing which rail chip or which card leads to it.
 *
 * Portalled into `#phone-overlay-root`, which is `pointer-events: none` like
 * every portal root in the chassis — so this sets `pointer-events-auto` itself,
 * or it paints perfectly and cannot be tapped (shipped three times before).
 * `createPortal` runs only while open, so nothing sits over the app at rest.
 */
export default function EverythingSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const root = document.getElementById('phone-overlay-root');
  if (!open || !root) return null;

  const here = `${location.pathname}${location.search}`;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Everything"
      className="absolute inset-0 flex flex-col pointer-events-auto"
      style={{
        background: 'var(--color-bg)',
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <div className="flex-none flex items-center justify-between" style={{ padding: '18px var(--gutter) 6px' }}>
        <h2 className="screen-title">Everything</h2>
        <button
          onClick={onClose}
          aria-label="Close"
          className="grid place-items-center"
          style={{
            width: 34, height: 34, borderRadius: 8,
            border: '1px solid rgba(233, 233, 237, 0.14)',
            color: 'var(--color-text-secondary)',
          }}
        >
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-hide" style={{ padding: '14px var(--gutter) var(--stack)' }}>
        {EVERYTHING.map(({ group, items }) => (
          <section key={group} style={{ marginBottom: 24 }}>
            <h3 className="flex items-center" style={{ gap: 10, marginBottom: 6 }}>
              <span aria-hidden style={{
                width: 14, height: 2, borderRadius: 1,
                background: 'var(--color-primary)', boxShadow: '0 0 6px var(--color-primary)',
              }} />
              <span className="eyebrow" style={{ letterSpacing: '0.14em' }}>{group}</span>
            </h3>
            {items.map((item) => {
              const current = item.path === here;
              return (
                <button
                  key={item.path}
                  onClick={() => { onClose(); if (!current) navigate(item.path); }}
                  aria-current={current ? 'page' : undefined}
                  className="w-full flex items-center justify-between text-left"
                  style={{
                    padding: '13px 0',
                    borderBottom: '1px solid var(--color-separator)',
                    fontSize: 15,
                    color: current ? 'var(--color-primary-300)' : 'var(--color-text-primary)',
                  }}
                >
                  {item.label}
                  <ArrowUpRight size={15} style={{ color: 'var(--color-text-secondary)' }} />
                </button>
              );
            })}
          </section>
        ))}
      </div>
    </div>,
    root,
  );
}
