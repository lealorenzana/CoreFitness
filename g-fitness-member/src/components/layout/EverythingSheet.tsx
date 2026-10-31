import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { CaretRight, X } from '@phosphor-icons/react';
import { EVERYTHING, visibleDestinations, type Destination } from './memberNav';
import { useGymApp } from '../../hooks/useGymApp';
import { GLASS } from '../ui/glass';
import { useT } from '../../lib/i18n';

/**
 * More — ten entries, each with an icon and a line saying what it is for
 * (simplify, 2026-10-28; it was every screen, grouped, with a search box and
 * tiles — about thirty-five rows). Everything else lives on a tab.
 *
 * Portalled into `#phone-overlay-root`, which is `pointer-events: none` like
 * every portal root in the chassis — so this sets `pointer-events-auto` itself,
 * or it paints perfectly and cannot be tapped (shipped three times before).
 * `createPortal` runs only while open, so nothing sits over the app at rest.
 * Opening and closing live in history (`useHistorySheet`): Back closes it.
 */
export default function EverythingSheet({ open, onClose, onGo }: { open: boolean; onClose: () => void; onGo: (path: string) => void }) {
  const gymApp = useGymApp();
  const t = useT();
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
  const go = (item: Destination) => { if (item.path === here) onClose(); else onGo(item.path); };
  // A group whose every item belongs to something this gym does not run
  // disappears with them, rather than leaving an empty heading.
  const groups = EVERYTHING
    .map(({ group, items }) => ({ group, items: visibleDestinations(items, gymApp) }))
    .filter(({ items }) => items.length > 0);
  const row = (d: Destination, key: string) => {
    const Icon = d.icon;
    const current = d.path === here;
    return (
      <button key={key} onClick={() => go(d)} aria-current={current ? 'page' : undefined} data-more-row
        className="w-full flex items-center text-left noc-row"
        style={{ gap: 12, padding: '10px 0', borderBottom: '1px solid var(--color-separator)' }}>
        {Icon && (
          <span aria-hidden className="flex-none grid place-items-center" style={{
            width: 36, height: 36, borderRadius: 11, background: 'var(--color-surface-raised)',
            border: '1px solid var(--color-hairline)', color: current ? 'var(--color-primary-300)' : 'var(--color-text-secondary)',
          }}>
            <Icon size={17} />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate" style={{ fontSize: 15, fontWeight: 600, color: current ? 'var(--color-primary-300)' : 'var(--color-text-primary)' }}>
            {t(d.label)}
          </span>
          {d.blurb && <span className="block truncate" style={{ fontSize: 12, marginTop: 1, color: 'var(--color-text-muted)' }}>{t(d.blurb)}</span>}
        </span>
        <CaretRight size={14} aria-hidden style={{ color: 'var(--color-text-muted)', flex: 'none' }} />
      </button>
    );
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="More"
      className="absolute inset-0 flex flex-col pointer-events-auto noc-sheet"
      style={{
        // Full-screen glass: the screen you came from stays, blurred, behind it.
        ...GLASS,
        // Above anything resting on the screen (What's new sits at 5).
        zIndex: 30,
        border: 'none',
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <div className="flex-none" style={{ padding: '18px var(--gutter) 10px' }}>
        <div className="flex items-center justify-between">
          <h2 className="screen-title">{t('More')}</h2>
          <button onClick={onClose} aria-label="Close" className="grid place-items-center" style={{
            width: 34, height: 34, borderRadius: 8, border: '1px solid rgba(233, 233, 237, 0.14)', color: 'var(--color-text-secondary)',
          }}>
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-hide" style={{ padding: '4px var(--gutter) var(--stack)' }}>
        {groups.map(({ group, items }) => (
          <section key={group} aria-label={t(group)}>
            {items.map((d) => row(d, d.path))}
          </section>
        ))}
      </div>
    </div>,
    root,
  );
}
