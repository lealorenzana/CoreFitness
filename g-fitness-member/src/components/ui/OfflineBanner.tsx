import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';

/**
 * The service worker caches the app shell so Core Fitness still launches with no
 * connection, but every data screen reads live from Supabase. This tells the user
 * why those screens are empty instead of leaving them looking broken.
 */
export default function OfflineBanner() {
  const [offline, setOffline] = useState(() => typeof navigator !== 'undefined' && !navigator.onLine);

  useEffect(() => {
    const goOffline = () => setOffline(true);
    const goOnline = () => setOffline(false);
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      className="flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold"
      style={{ background: 'rgba(245,158,11,0.15)', borderBottom: '1px solid rgba(245,158,11,0.35)', color: 'var(--color-secondary)' }}
    >
      <WifiOff size={12} />
      No internet connection — showing limited features
    </div>
  );
}
