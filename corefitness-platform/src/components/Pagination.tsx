import { ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * The admin app's pagination: round pill buttons, violet for the page you are
 * on, an ellipsis past seven pages — and a "1–9 of 42" summary, so a paged list
 * never looks like the whole list.
 */
export default function Pagination({ page, perPage, total, noun, onPage }: {
  page: number; perPage: number; total: number; noun: string; onPage: (p: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / perPage));
  if (total === 0) return null;
  const from = (page - 1) * perPage + 1;
  const to = Math.min(page * perPage, total);

  const list: (number | '…')[] = [];
  if (pages <= 7) for (let i = 1; i <= pages; i++) list.push(i);
  else {
    list.push(1);
    if (page > 3) list.push('…');
    for (let i = Math.max(2, page - 1); i <= Math.min(pages - 1, page + 1); i++) list.push(i);
    if (page < pages - 2) list.push('…');
    list.push(pages);
  }

  return (
    <nav className="pager" aria-label="Pages">
      <span className="pager-sum">{total <= perPage ? `${total} ${noun}` : `${from}–${to} of ${total} ${noun}`}</span>
      {pages > 1 && (
        <span className="pager-btns">
          <button type="button" aria-label="Previous page" disabled={page === 1} onClick={() => onPage(page - 1)}><ChevronLeft size={15} /></button>
          {list.map((p, i) => p === '…'
            ? <span key={`e${i}`} className="pager-gap">…</span>
            : <button type="button" key={p} className={p === page ? 'on' : ''} aria-current={p === page ? 'page' : undefined}
                onClick={() => onPage(p)}>{p}</button>)}
          <button type="button" aria-label="Next page" disabled={page === pages} onClick={() => onPage(page + 1)}><ChevronRight size={15} /></button>
        </span>
      )}
    </nav>
  );
}
