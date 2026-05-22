import { Navigate } from 'react-router-dom';

/**
 * Member detail is now rendered as a modal directly from the Members page,
 * so this route just redirects there.
 */
export default function MemberDetail() {
  return <Navigate to="/members" replace />;
}
