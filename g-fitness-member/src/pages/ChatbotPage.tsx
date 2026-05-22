import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageSquare } from 'lucide-react';

// The chatbot has been moved to a floating widget accessible from all pages.
// This page redirects back to home so the floating button can be used.
export default function ChatbotPage() {
  const navigate = useNavigate();

  useEffect(() => {
    // Redirect to home — the floating chatbot button is available there
    const timer = setTimeout(() => navigate('/member/home', { replace: true }), 1500);
    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4 text-center px-4">
      <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: 'var(--color-primary)' }}>
        <MessageSquare size={28} className="text-white" />
      </div>
      <div>
        <h2 className="text-xl font-bold text-white">AI Assistant</h2>
        <p className="text-sm mt-2" style={{ color: 'var(--color-text-muted)' }}>
          The chatbot is now available as a floating button at the bottom-left of every screen.
        </p>
        <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>Redirecting you back…</p>
      </div>
    </div>
  );
}
