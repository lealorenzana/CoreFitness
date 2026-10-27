import { useEffect } from 'react';
import { checkForMoments } from '../../lib/momentWatch';

/**
 * Looks for new moments (lib/momentWatch.ts) when the member app opens and
 * whenever it comes back to the front — a check-in at the kiosk, a target the
 * database settled overnight. At most once a minute; renders nothing.
 */
export default function MomentWatcher() {
  useEffect(() => {
    void checkForMoments(true);
    const back = () => { if (document.visibilityState === 'visible') void checkForMoments(); };
    document.addEventListener('visibilitychange', back);
    return () => document.removeEventListener('visibilitychange', back);
  }, []);
  return null;
}
