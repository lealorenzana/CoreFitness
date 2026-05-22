import { Navigate } from 'react-router-dom';

/**
 * The chatbot is now a floating bottom-right widget — see <FloatingChatbot />.
 * This route just redirects to the dashboard.
 */
export default function Chatbot() {
  return <Navigate to="/dashboard" replace />;
}
