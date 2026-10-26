import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { CaretRight, MagnifyingGlass, X } from '@phosphor-icons/react';
import { EVERYTHING, MORE_TILES, visibleDestinations, type Destination } from './memberNav';
import { useGymApp } from '../../hooks/useGymApp';
import { GLASS } from '../ui/glass';
import { useT } from '../../lib/i18n';

/**
 * Everything — every member screen, findable (redesign, 2026-10-26).
 *
 * The bar holds three destinations; the app has thirty-odd. This sheet is where
 * the rest are guaranteed to be found: a search box, the four places members
 * open most as tiles, then every screen grouped, each with an icon and a line
 * saying what it is for — so nothing has to be guessed from a name.
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
  const [query, setQuery] = useState('');
  // A fresh search each time the sheet opens (compared during render, not in an effect).
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) { setWasOpen(open); if (open) setQuery(''); }

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
  const tiles = visibleDestinations(MORE_TILES, gymApp);

  // Word starts, so "pay" finds Payments and "in" does not find every "training".
  const q = query.trim().toLowerCase();
  const hits = q
    ? groups.flatMap(({ group, items }) => items
      .filter((d) => `${t(d.label)} ${d.blurb ? t(d.blurb) : ''} ${t(group)}`.toLowerCase().split(/[\s—–,’'-]+/).some((w) => w.startsWith(q)))
      .map((d) => ({ d, group })))
    : [];

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
      aria-label="Everything"
      className="absolute inset-0 flex flex-col pointer-events-auto noc-sheet"
      style={{
        // Full-screen glass: the screen you came from stays, blurred, behind it.
        ...GLASS,
        border: 'none',
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <div className="flex-none" style={{ padding: '18px var(--gutter) 10px' }}>
        <div className="flex items-center justify-between">
          <h2 className="screen-title">{t('Everything')}</h2>
          <button onClick={onClose} aria-label="Close" className="grid place-items-center" style={{
            width: 34, height: 34, borderRadius: 8, border: '1px solid rgba(233, 233, 237, 0.14)', color: 'var(--color-text-secondary)',
          }}>
            <X size={16} />
          </button>
        </div>
        <label className="flex items-center" style={{
          gap: 10, marginTop: 14, height: 44, padding: '0 14px', borderRadius: 12,
          border: '1px solid var(--color-hairline)', background: 'var(--color-surface)',
        }}>
          <MagnifyingGlass size={16} aria-hidden style={{ color: 'var(--color-text-muted)', flex: 'none' }} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('Search the app')} aria-label={t('Search the app')}
            className="flex-1 min-w-0 bg-transparent outline-none" style={{ fontSize: 15, color: 'var(--color-text-primary)' }} />
          {query && (
            <button onClick={() => setQuery('')} aria-label="Clear the search" style={{ color: 'var(--color-text-muted)' }}><X size={14} /></button>
          )}
        </label>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-hide" style={{ padding: '4px var(--gutter) var(--stack)' }}>
        {q ? (
          hits.length > 0 ? (
            <section aria-label="Results">{hits.map(({ d }) => row(d, `hit:${d.path}`))}</section>
          ) : (
            <p style={{ padding: '18px 0', fontSize: 13, color: 'var(--color-text-muted)' }}>
              {t('Nothing called that here.')} {t('Every screen this gym runs is listed below once you clear the search.')}
            </p>
          )
        ) : (
          <>
            {tiles.length > 0 && (
              <div className="grid" style={{ gridTemplateColumns: `repeat(${tiles.length}, minmax(0, 1fr))`, gap: 8, marginBottom: 6 }}>
                {tiles.map((d) => {
                  const Icon = d.icon;
                  return (
                    <button key={d.path} onClick={() => go(d)} data-more-tile className="noc-press grid place-items-center"
                      style={{ gap: 5, padding: '11px 4px', borderRadius: 14, border: '1px solid var(--color-hairline)', background: 'var(--color-surface)' }}>
                      {Icon && <Icon size={20} aria-hidden style={{ color: 'var(--color-primary-300)' }} />}
                      <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{t(d.label)}</span>
                    </button>
                  );
                })}
              </div>
            )}
            {groups.map(({ group, items }) => (
              <section key={group} style={{ marginTop: 18 }}>
                <h3 className="flex items-center" style={{ gap: 10, marginBottom: 2 }}>
                  <span aria-hidden style={{
                    width: 14, height: 2, borderRadius: 1,
                    background: 'var(--color-primary)', boxShadow: '0 0 6px var(--color-primary)',
                  }} />
                  <span className="eyebrow" style={{ letterSpacing: '0.14em' }}>{t(group)}</span>
                </h3>
                {items.map((d) => row(d, d.path))}
              </section>
            ))}
          </>
        )}
      </div>
    </div>,
    root,
  );
}
