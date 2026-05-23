import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  currentPage: number;
  totalItems: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
}

const SURFACE       = 'var(--color-surface-raised)';
const BORDER        = 'var(--color-border)';
const TEXT_MUTED    = 'var(--color-text-muted)';
const TEXT_SECOND   = 'var(--color-text-secondary)';
const PRIMARY       = 'var(--color-primary)';

/** Standard pagination — pill buttons, violet for active. */
export default function Pagination({ currentPage, totalItems, itemsPerPage, onPageChange }: PaginationProps) {
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  if (totalPages <= 1) return null;

  const start = (currentPage - 1) * itemsPerPage + 1;
  const end   = Math.min(currentPage * itemsPerPage, totalItems);

  const pages: (number | '...')[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (currentPage > 3) pages.push('...');
    for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) pages.push(i);
    if (currentPage < totalPages - 2) pages.push('...');
    pages.push(totalPages);
  }

  const navStyle = (disabled: boolean): React.CSSProperties => ({
    background: SURFACE,
    border: `1px solid ${BORDER}`,
    color: disabled ? TEXT_MUTED : TEXT_SECOND,
    opacity: disabled ? 0.4 : 1,
    cursor: disabled ? 'not-allowed' : 'pointer',
  });

  return (
    <div className="flex items-center justify-end pt-2 mt-2" style={{ borderTop: `1px solid ${BORDER}` }}>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="w-8 h-8 rounded-full flex items-center justify-center transition-colors"
          style={navStyle(currentPage === 1)}
        >
          <ChevronLeft size={14} />
        </button>

        {pages.map((page, idx) =>
          page === '...' ? (
            <span key={`ellipsis-${idx}`} className="w-8 h-8 flex items-center justify-center text-sm" style={{ color: TEXT_MUTED }}>…</span>
          ) : (
            <button
              key={page}
              onClick={() => onPageChange(page as number)}
              className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors"
              style={{
                background: currentPage === page ? PRIMARY : SURFACE,
                border: `1px solid ${currentPage === page ? PRIMARY : BORDER}`,
                color: currentPage === page ? '#fff' : TEXT_SECOND,
              }}
            >
              {page}
            </button>
          ),
        )}

        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="w-8 h-8 rounded-full flex items-center justify-center transition-colors"
          style={navStyle(currentPage === totalPages)}
        >
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}
