import { logout } from '../../utils/auth';
import { NocButton } from '../ui/noc';
import SuspensionAppeal, { type Appeal } from './SuspensionAppeal';

const day = (iso: string) => new Date(iso).toLocaleDateString('en-PH', { day: 'numeric', month: 'long', year: 'numeric' });

/**
 * The account is suspended by Core Fitness (0226): nothing in any gym opens.
 * The person is shown the reason (their gym never is), and how to answer it.
 */
export default function Suspended({ reason, since, appeal }: { reason: string; since: string; appeal?: Appeal }) {
  return (
    <div className="min-h-dvh flex items-center justify-center" style={{ padding: 24, background: 'var(--color-bg)' }} data-platform-suspended>
      <div style={{ maxWidth: 380, textAlign: 'center' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-text-primary)' }}>Your account is suspended</h1>
        <p style={{ fontSize: 14, marginTop: 10, lineHeight: 1.55, color: 'var(--color-text-secondary)' }}>
          Core Fitness suspended it on {day(since)}, so it cannot be used at any gym for now.
        </p>
        <p style={{ fontSize: 14, marginTop: 10, lineHeight: 1.55, color: 'var(--color-text-primary)' }} data-suspension-reason>{reason}</p>
        <p style={{ fontSize: 13, marginTop: 10, lineHeight: 1.5, color: 'var(--color-text-muted)' }}>
          We sent this to your email too. Your gym cannot lift it; if you think it is a mistake, appeal below.
        </p>
        <SuspensionAppeal appeal={appeal} />
        <NocButton variant="ghost" className="w-full" style={{ marginTop: 18 }} onClick={() => void logout().then(() => window.location.assign('/login'))}>
          Sign out
        </NocButton>
      </div>
    </div>
  );
}
