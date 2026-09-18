import { useId, useState, type ReactNode } from 'react';
import { CaretDown } from '@phosphor-icons/react';

/**
 * A section that opens and closes — a titled row with a caret, and its content
 * sliding open beneath (Nocturne).
 *
 * The height animates through `grid-template-rows: 0fr → 1fr` rather than a
 * measured pixel height: no layout read, no JS animation loop, and content
 * that changes size while open (a loaded list) just grows. Closed content stays
 * mounted but `inert`, so it is neither tabbable nor read out.
 */
export default function Disclosure({
  title, meta, icon, defaultOpen = false, children,
}: {
  title: ReactNode;
  /** A quiet count or date on the right, before the caret. */
  meta?: ReactNode;
  icon?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();

  return (
    <section className="orb-cell" style={{ borderRadius: 16 }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={bodyId}
        className="w-full flex items-center text-left noc-press-soft"
        style={{ gap: 12, padding: '14px 16px', minHeight: 56 }}
      >
        {icon && (
          <span aria-hidden className="flex-none grid place-items-center" style={{
            width: 32, height: 32, borderRadius: 10, color: 'var(--color-primary-300)',
            background: 'rgba(124, 58, 237, 0.16)',
          }}>
            {icon}
          </span>
        )}
        <span className="flex-1 min-w-0 truncate" style={{ fontSize: 15.5, fontWeight: 700, color: 'var(--color-text-primary)' }}>
          {title}
        </span>
        {meta != null && (
          <span className="flex-none" style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>{meta}</span>
        )}
        <CaretDown aria-hidden size={16} className="flex-none" style={{
          color: 'var(--color-text-secondary)',
          transform: open ? 'rotate(180deg)' : 'none',
          transition: 'transform 0.28s var(--ease-out-soft, ease)',
        }} />
      </button>
      <div
        id={bodyId}
        className="grid"
        style={{
          gridTemplateRows: open ? '1fr' : '0fr',
          transition: 'grid-template-rows 0.32s var(--ease-out-soft, ease)',
        }}
        inert={!open}
      >
        <div className="min-h-0 overflow-hidden">
          <div style={{ padding: '2px 16px 16px' }}>{children}</div>
        </div>
      </div>
    </section>
  );
}
