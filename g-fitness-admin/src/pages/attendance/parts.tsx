import { NavLink } from 'react-router-dom';
import { Sun, Footprints, History, Tablet, QrCode, Keyboard, ChevronLeft, ChevronRight, type LucideIcon } from 'lucide-react';
import type { AttendanceRow } from '../../types/db';
import { openPhoto } from '../../components/ui/PhotoViewer';

/** Parts the three Attendance pages share, drawn in the mock-up's style (att.css). */

const TONES = ['v', 'a', 'g', 'p'] as const;
/** An initials circle in one of the mock-up's four tones (a photo still wins). */
export function Av({ name, photo, small }: { name: string; photo?: string | null; small?: boolean }) {
  const init = name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '?';
  let h = 0; for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    <span className={`a-av ${small ? 's' : ''} ${TONES[h % 4]}`}
      // A real photo opens big on click (guides G1); the click stops here so the row does not open too.
      {...(photo ? { role: 'button', tabIndex: 0, 'aria-label': `${name}'s photo — click to see it big`, 'data-avatar-zoom': '', style: { cursor: 'zoom-in' },
        onClick: (e: { stopPropagation: () => void }) => { e.stopPropagation(); openPhoto(photo, `${name}'s photo`); } } : {})}>
      {photo ? <img src={photo} alt="" /> : init}
    </span>
  );
}

/**
 * A table's pages (2026-10-20): back, first, the pages beside this one, last, forward —
 * so 3 pages and 300 pages take the same room in the footer and never push the table.
 */
export function Pager({ page, pages, onPage }: { page: number; pages: number; onPage: (n: number) => void }) {
  if (pages <= 1) return null;
  const nums = [...new Set([1, page - 1, page, page + 1, pages])].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  const pad = { padding: '3px 9px' };
  return (
    <span style={{ display: 'flex', gap: 4, flexShrink: 0 }} data-pager>
      <button type="button" className="a-chip" style={pad} disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page"><ChevronLeft size={13} /></button>
      {nums.map((n, i) => (
        <span key={n} style={{ display: 'flex', gap: 4 }}>
          {i > 0 && n - nums[i - 1] > 1 && <span className="a-sub" style={{ alignSelf: 'center' }}>…</span>}
          <button type="button" className={`a-chip ${n === page ? 'v' : ''}`} style={pad} onClick={() => onPage(n)} aria-current={n === page ? 'page' : undefined}>{n}</button>
        </span>
      ))}
      <button type="button" className="a-chip" style={pad} disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page"><ChevronRight size={13} /></button>
    </span>
  );
}

/** Where and how a check-in was taken: Kiosk / Desk scan / Typed (older rows: Scanned). */
export function HowPill({ row }: { row: Pick<AttendanceRow, 'source' | 'method'> }) {
  const [Icon, label]: [LucideIcon, string] = row.source === 'kiosk' ? [Tablet, 'Kiosk']
    : row.method === 'qr' ? [QrCode, row.source === 'desk' ? 'Desk scan' : 'Scanned'] : [Keyboard, 'Typed'];
  return <span className="a-pill"><Icon size={12} />{label}</span>;
}

/** The page head: title, a line under it, the three views as one pill bar with counts, and the page's own actions. */
export function AttHead({ sub, counts, actions }: { sub: React.ReactNode; counts: { today: number | null; walkIns: number | null }; actions?: React.ReactNode }) {
  const tab = (to: string, Icon: LucideIcon, label: string, n?: number | null, end?: boolean) => (
    <NavLink to={to} end={end} className={({ isActive }) => (isActive ? 'on' : '')}>
      <Icon size={14} />{label}{n != null && <em>{n}</em>}
    </NavLink>
  );
  return (
    <div className="a-head">
      <div className="min-w-0">
        <h1>Attendance</h1>
        <p>{sub}</p>
      </div>
      <nav className="a-tabs" data-rd-tabs aria-label="Attendance views">
        {tab('/attendance', Sun, 'Today', counts.today, true)}
        {tab('/attendance/walk-ins', Footprints, 'Walk-ins', counts.walkIns)}
        {tab('/attendance-history', History, 'History')}
      </nav>
      {actions}
    </div>
  );
}
