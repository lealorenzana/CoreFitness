import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { EnvelopeSimple, Key } from '@phosphor-icons/react';
import { supabase } from '../lib/supabaseClient';
import { Field } from '../components/ui/Field';
import { NocButton } from '../components/ui/noc';

/**
 * "Forgot password?" from Login. Supabase Auth emails a one-time link that
 * opens /reset-password signed in for that one purpose.
 *
 * It never says whether an account exists for the address — the reply is the
 * same either way, so this page cannot be used to find out who is a member.
 * A refusal it *can* explain (too many tries, no mail service) is said plainly.
 */
export default function ForgotPassword() {
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState(() => (location.state as { email?: string } | null)?.email ?? '');
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const address = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) { setError('Type the email you sign in with.'); return; }
    setBusy(true); setError(null);
    const { error: err } = await supabase.auth.resetPasswordForEmail(address, { redirectTo: `${window.location.origin}/reset-password` });
    setBusy(false);
    if (err) {
      setError(/rate|too many|seconds/i.test(err.message)
        ? 'Too many tries for now. Wait a minute, then send it again.'
        : `The email could not be sent: ${err.message}`);
      return;
    }
    setSentTo(address);
  };

  if (sentTo) {
    return (
      <div className="space-y-5 text-center pt-6">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl" style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary-300)' }}>
          <EnvelopeSimple size={28} />
        </div>
        <div>
          <h1 className="text-xl font-semibold" style={{ color: 'var(--color-text-primary)' }}>Check your email</h1>
          <p className="mt-2 text-sm" style={{ color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
            If {sentTo} has an account, a link to set a new password is on its way. Open it on this phone. It works once, and only for a short while.
          </p>
        </div>
        <ul className="text-left text-sm rounded-2xl px-4 py-3 space-y-1.5" style={{ background: 'var(--color-surface)', color: 'var(--color-text-secondary)' }}>
          <li>Not there in a few minutes? Look in Spam or Promotions.</li>
          <li>Still nothing? Ask the front desk — they can check the email on your account.</li>
        </ul>
        <div className="space-y-2.5">
          <NocButton className="w-full" onClick={() => navigate('/login', { replace: true })}>Back to sign in</NocButton>
          <button type="button" className="w-full text-sm py-2" style={{ color: 'var(--color-text-muted)' }}
            onClick={() => { setSentTo(null); setError(null); }}>Use a different email</button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={send} className="space-y-5 pt-6">
      <div className="grid h-14 w-14 place-items-center rounded-2xl" style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary-300)' }}>
        <Key size={28} />
      </div>
      <div>
        <h1 className="text-xl font-semibold" style={{ color: 'var(--color-text-primary)' }}>Forgot your password?</h1>
        <p className="mt-2 text-sm" style={{ color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
          Type the email you sign in with. We will email you a link to choose a new one.
        </p>
      </div>
      <Field label="Email">
        <input type="email" inputMode="email" autoComplete="email" value={email} autoFocus
          onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="field-input" />
      </Field>
      {error && <p role="alert" className="text-sm" style={{ color: 'var(--color-secondary)' }}>{error}</p>}
      <NocButton type="submit" variant="action" className="w-full" disabled={busy || !email.trim()}>
        {busy ? 'Sending…' : 'Email me a link'}
      </NocButton>
      <button type="button" className="w-full text-sm py-2" style={{ color: 'var(--color-text-muted)' }} onClick={() => navigate('/login')}>
        I remember it — back to sign in
      </button>
    </form>
  );
}
