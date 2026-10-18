import { NavLink } from 'react-router-dom';
import { Sun, Footprints, History, Tablet, QrCode, Keyboard, type LucideIcon } from 'lucide-react';
import type { AttendanceRow } from '../../types/db';

/** Parts the three Attendance pages share, drawn in the mock-up's style (att.css). */

const TONES = ['v', 'a', 'g', 'p'] as const;
/** An initials circle in one of the mock-up's four tones (a photo still wins). */
export function Av({ name, photo, small }: { name: string; photo?: string | null; small?: boolean }) {
  const init = name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '?';
  let h = 0; for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    <span className={`a-av ${small ? 's' : ''} ${TONES[h % 4]}`}>
      {photo ? <img src={photo} alt="" /> : init}
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
