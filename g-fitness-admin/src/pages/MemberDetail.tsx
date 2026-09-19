import { Navigate, useParams } from 'react-router-dom';

/**
 * Member detail is a drawer on the Members page, so this route redirects there
 * — **carrying the id**, so the drawer opens on that member. It used to drop
 * it: the header search and the Activity feed link to /members/:id, and both
 * landed on the plain list with nobody open (found 2026-09-19).
 */
export default function MemberDetail() {
  const { memberId } = useParams();
  return <Navigate to={memberId ? `/members?open=${encodeURIComponent(memberId)}` : '/members'} replace />;
}
