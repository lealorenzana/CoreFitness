import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, KeyRound, MailCheck } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

/**
 * "Forgot password?" on the admin sign-in (it was a button with no handler until
 * 2026-11-07). Supabase Auth emails a one-time link; it returns to /admin/login —
 * the admin address on Auth's redirect list — which sends it to /admin/reset-password.
 *
 * It never says whether an account exists for the address: the reply is the same
 * either way. A username has no email to send to (0236) — the owner resets it.
 */
export default function ForgotPassword() {
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState(() => {
    const typed = (location.state as { email?: string } | null)?.email ?? '';
    return typed.includes('@') ? typed : '';
  });
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const address = email.trim().toLowerCase();
    if (address && !address.includes('@')) {
      setError('A username has no email to send a link to. Ask the gym owner to reset your login — they hand you a new one-time password.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) { setError('Type the email you sign in with.'); return; }
    setBusy(true); setError(null);
    const { error: err } = await supabase.auth.resetPasswordForEmail(address, { redirectTo: `${window.location.origin}/admin/login` });
    setBusy(false);
    if (err) {
      setError(/rate|too many|seconds/i.test(err.message)
        ? 'Too many tries for now. Wait a minute, then send it again.'
        : `The email could not be sent: ${err.message}`);
      return;
    }
    setSentTo(address);
  };

  const input = 'w-full h-12 rounded-xl px-4 text-[15px] outline-none';
  const inputSt: React.CSSProperties = { background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' };
  const muted = { color: 'var(--color-text-secondary)' };
  const tile = (icon: React.ReactNode) => (
    <span className="h-12 w-12 rounded-xl grid place-items-center" style={{ background: 'var(--fill-primary, var(--color-primary))', color: '#FFFFFF' }}>{icon}</span>
  );
  const back = (
    <button type="button" onClick={() => navigate('/admin/login', { replace: true })} className="mt-2 w-full h-10 text-[13px] inline-flex items-center justify-center gap-1.5" style={muted}>
      <ArrowLeft size={13} /> Back to sign in
    </button>
  );

  return (
    <div className="min-h-screen grid place-items-center p-6" style={{ background: 'var(--color-bg)' }}>
      <div data-forgot-password className="w-full max-w-[440px] rounded-2xl p-7"
        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-card)' }}>
        {sentTo ? (<>
          {tile(<MailCheck size={22} />)}
          <h1 className="mt-4 text-[21px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>Check your email</h1>
          <p className="mt-1 text-[13.5px] leading-relaxed" style={muted}>
            If {sentTo} has an account, a link to choose a new password is on its way. Open it on this computer. It works once, and only for a short while.
          </p>
          <ul className="mt-4 rounded-xl px-4 py-3 text-[13px] space-y-1.5" style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
            <li>Not there in a few minutes? Look in Spam or Promotions.</li>
            <li>Front desk with no email on the account? The gym owner resets your login.</li>
          </ul>
          <button type="button" onClick={() => { setSentTo(null); setError(null); }} className="mt-5 w-full h-12 rounded-xl font-semibold"
            style={{ background: 'var(--fill-primary, var(--color-primary))', color: '#FFFFFF' }}>Use a different email</button>
          {back}
        </>) : (
          <form onSubmit={(e) => void send(e)} noValidate>
            {tile(<KeyRound size={22} />)}
            <h1 className="mt-4 text-[21px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>Forgot your password?</h1>
            <p className="mt-1 text-[13.5px]" style={muted}>Type the email you sign in with. We will email you a link to choose a new one.</p>
            <label className="block text-[13px] font-semibold mt-5 mb-1.5" style={muted} htmlFor="fp-email">Email</label>
            <input id="fp-email" className={input} style={inputSt} type="email" inputMode="email" autoComplete="email" autoFocus
              value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@yourgym.com" />
            {error && <p className="mt-3 text-[13px]" style={{ color: 'var(--color-secondary)' }} role="alert">{error}</p>}
            <button type="submit" disabled={busy || !email.trim()} className="mt-5 w-full h-12 rounded-xl font-semibold disabled:opacity-60"
              style={{ background: 'var(--fill-primary, var(--color-primary))', color: '#FFFFFF' }}>{busy ? 'Sending…' : 'Email me a link'}</button>
            {back}
          </form>
        )}
      </div>
    </div>
  );
}
