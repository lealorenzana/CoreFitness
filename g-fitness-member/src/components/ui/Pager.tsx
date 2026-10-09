import { CaretLeft, CaretRight } from '@phosphor-icons/react';
import { useT } from '../../lib/i18n';

/**
 * Page numbers under a history (2026-10-10): "321 visits · page 1 of 17" and
 * ‹ 1 2 3 … 17 ›. Violet marks the page you are on (where you are); the
 * buttons are 40px, comfortable for a thumb. Nothing renders for one page.
 * Changing page scrolls the list back to its top.
 */
export default function Pager({ page, pages, total, noun, onPage }: {
  page: number; pages: number; total: number; noun: string; onPage: (p: number) => void;
}) {
  const t = useT();
  if (total === 0) return null;
  const list: (number | '…')[] = [];
  if (pages <= 5) for (let i = 1; i <= pages; i++) list.push(i);
  else {
    list.push(1);
    if (page > 3) list.push('…');
    for (let i = Math.max(2, page - 1); i <= Math.min(pages - 1, page + 1); i++) list.push(i);
    if (page < pages - 2) list.push('…');
    list.push(pages);
  }
  const go = (p: number) => {
    onPage(p);
    document.querySelector('main')?.scrollTo({ top: 0 });
  };
  const btn = (on: boolean): React.CSSProperties => ({
    minWidth: 40, height: 40, borderRadius: 10, fontSize: 14, fontWeight: 600,
    background: on ? 'var(--color-primary)' : 'rgba(233,233,237,0.05)',
    color: on ? '#fff' : 'var(--color-text-secondary)',
  });

  return (
    <nav aria-label={t('Pages')} data-pager style={{ marginTop: 16 }}>
      <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)', textAlign: 'center' }} data-pager-summary>
        {total} {noun}{pages > 1 ? ` · ${t('page')} ${page} ${t('of')} ${pages}` : ''}
      </p>
      {pages > 1 && (
        <div className="flex items-center justify-center" style={{ gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
          <button type="button" aria-label={t('Previous page')} disabled={page === 1} onClick={() => go(page - 1)}
            className="grid place-items-center noc-press" style={{ ...btn(false), opacity: page === 1 ? 0.35 : 1 }}>
            <CaretLeft size={16} />
          </button>
          {list.map((p, i) => p === '…'
            ? <span key={`gap${i}`} style={{ color: 'var(--color-text-muted)', padding: '0 2px' }}>…</span>
            : <button key={p} type="button" aria-current={p === page ? 'page' : undefined} onClick={() => go(p)}
                className="noc-press" style={btn(p === page)}>{p}</button>)}
          <button type="button" aria-label={t('Next page')} disabled={page === pages} onClick={() => go(page + 1)}
            className="grid place-items-center noc-press" style={{ ...btn(false), opacity: page === pages ? 0.35 : 1 }}>
            <CaretRight size={16} />
          </button>
        </div>
      )}
    </nav>
  );
}
