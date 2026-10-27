import { useEffect, useSyncExternalStore } from 'react';
import { WifiOff } from 'lucide-react';
import { refreshScreens, savedAsOf, subscribeSaved } from '../../lib/offlineReads';
import { flushOutbox, onRefused, pendingCount, subscribeOutbox } from '../../lib/outbox';
import { toast } from './Toast';

const online = () => typeof navigator === 'undefined' || navigator.onLine;
const time = (at: number) => new Date(at).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
const sameDay = (at: number) => new Date(at).toDateString() === new Date().toDateString();
const day = (at: number) => (sameDay(at) ? time(at)
  : `${new Date(at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}, ${time(at)}`);

/**
 * Says when the screen is showing what this phone saved rather than live data
 * (offlineReads.ts), and what is waiting to send (outbox.ts) — never leaves
 * saved numbers looking live, or a queued message looking sent.
 *
 * - Offline: "Offline · showing what was saved at 3:40 PM · 2 waiting to send".
 * - Back online, saved data still on screen because someone was typing:
 *   "Back online" and Refresh.
 * - Online with something still waiting (it is sending, or the last try
 *   failed): the count and Send now.
 */
export default function OfflineBanner() {
  const asOf = useSyncExternalStore(subscribeSaved, savedAsOf, () => null);
  const isOnline = useSyncExternalStore(subscribeSaved, online, () => true);
  const waiting = useSyncExternalStore(subscribeOutbox, pendingCount, () => 0);

  // A job the server refused when it finally went: the person is told which, and why.
  useEffect(() => {
    onRefused((label, reason) => toast.error(`${label} could not be sent: ${reason}`));
  }, []);

  if (isOnline && asOf == null && waiting === 0) return null;

  const queued = waiting > 0 ? `${waiting} waiting to send` : null;
  return (
    <div
      role="status"
      data-offline-banner
      className="flex items-center justify-center flex-wrap gap-x-2 gap-y-1 px-3 py-2 text-xs font-semibold"
      style={{ background: 'color-mix(in srgb, var(--color-secondary) 15%, transparent)', borderBottom: '1px solid color-mix(in srgb, var(--color-secondary) 35%, transparent)', color: 'var(--color-secondary)' }}
    >
      <WifiOff size={12} />
      {!isOnline ? (
        <span>
          {asOf != null ? `Offline · showing what was saved ${sameDay(asOf) ? 'at' : 'on'} ${day(asOf)}` : 'Offline · screens you have opened before still show'}
          {queued && <span data-waiting> · {queued}</span>}
        </span>
      ) : asOf != null ? (
        <>
          <span>Back online · this screen is from {day(asOf)}</span>
          <button type="button" onClick={refreshScreens} className="underline">Refresh</button>
        </>
      ) : (
        <>
          <span data-waiting>{queued}</span>
          <button type="button" onClick={() => void flushOutbox()} className="underline">Send now</button>
        </>
      )}
    </div>
  );
}
