import { Navigate } from 'react-router-dom';

// Analytics content has been merged into the Dashboard page.
// This redirect ensures any existing links still work.
export default function Analytics() {
  return <Navigate to="/dashboard" replace />;
}
