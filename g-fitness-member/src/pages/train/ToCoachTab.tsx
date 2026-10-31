import { Navigate, useLocation } from 'react-router-dom';

/**
 * Old homes of personal training — Your coach, My bookings, Rooms — land on
 * Train → Coach (simplify, 2026-10-28). The query is kept: PayMongo comes back
 * to `/member/coach?paid=…`, and the package section confirms that payment.
 */
export default function ToCoachTab() {
  const { search } = useLocation();
  const p = new URLSearchParams(search);
  p.delete('show');
  p.set('tab', 'coach');
  return <Navigate to={`/member/book-class?${p.toString()}`} replace />;
}
