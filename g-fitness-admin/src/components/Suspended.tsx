import { supabase } from '../lib/supabaseClient';

const day = (iso: string) => new Date(iso).toLocaleDateString('en-PH', { day: 'numeric', month: 'long', year: 'numeric' });

/** The account is suspended by Core Fitness (0226): nothing opens; the person sees why. */
export default function Suspended({ reason, since }: { reason: string; since: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 text-center" data-platform-suspended
      style={{ background: 'var(--color-bg)', color: 'var(--color-text-secondary)' }}>
      <div className="max-w-sm">
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-text-primary)' }}>Your account is suspended</h1>
        <p className="text-sm" style={{ marginTop: 8, lineHeight: 1.55 }}>
          Core Fitness suspended it on {day(since)}, so it cannot be used at any gym for now.
        </p>
        <p className="text-sm" style={{ marginTop: 8, lineHeight: 1.55, color: 'var(--color-text-primary)' }} data-suspension-reason>{reason}</p>
        <p className="text-xs" style={{ marginTop: 8, lineHeight: 1.5 }}>
          We sent this to your email too. If you think it is a mistake, reply to that email.
        </p>
        <button type="button" onClick={() => void supabase.auth.signOut({ scope: 'local' }).then(() => window.location.assign('/admin/login'))}
          style={{ marginTop: 16, padding: '10px 16px', borderRadius: 10, border: '1px solid var(--color-border)' }}>
          Sign out
        </button>
      </div>
    </div>
  );
}
