import { Link } from 'react-router-dom';
import { Info } from 'lucide-react';
import { usePointsOn } from '../hooks/usePointsOn';

/**
 * Where an owner still types a point amount while the gym's Points switch is off: says plainly that nothing is
 * paid (the 0186 guard drops every points row), so the number is kept for the day they switch points back on.
 * Renders nothing while points are on.
 */
export default function PointsOffNote({ what }: { what: string }) {
  const on = usePointsOn();
  if (on) return null;
  return (
    <div className="a-hint" data-points-off style={{ marginTop: 8 }}>
      <Info size={14} />
      <span>Your gym runs no points, so {what} — nothing is paid and members are not told about it. The number is kept for when you{' '}
        <Link to="/gym-app?tab=runs" style={{ textDecoration: 'underline' }}>switch Points on</Link>.</span>
    </div>
  );
}
