import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle, LinkBreak, LockKey } from '@phosphor-icons/react';
import { clearResetLink, openedByResetLink, supabase } from '../lib/supabaseClient';
import { Field } from '../components/ui/Field';
import { NocButton } from '../components/ui/noc';
import { PasswordInput, PasswordStrength } from '../components/auth/PasswordFields';
import { errorMessage } from '../utils/errorMessage';

type State = 'checking' | 'ready' | 'invalid' | 'done';

/**
 * Where the reset email's link lands. Supabase Auth has already signed this tab
 * in for the reset; this page lets them choose the new password — the old one
 * is not asked for, because forgetting it is why they are here. Without a reset
 * link (an expired or used one, or typing the address) it says so and offers a
 * new link, rather than becoming a way to change a password with no check.
 */
export default function ResetPassword() {
  const navigate = useNavigate();
  const [state, setState] = useState<State>('checking');
  const [why, setWhy] = useState<string | null>(null);
  const [pw, setPw] = useState('');
  const [again, setAgain] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Supabase puts a refused link's reason in the address: "Email link is invalid or has expired".
    const params = new URLSearchParams(window.location.hash.slice(1) || window.location.search.slice(1));
    const refused = params.get('error_description');
    let alive = true;
    const decide = async () => {
      const { data } = await supabase.auth.getSession();
      if (!alive) return;
      if (data.session && openedByResetLink()) setState('ready');
      else { setWhy(refused); setState('invalid'); }
    };
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' && alive) setState('ready');
    });
    // The client may still be reading the link; give it a moment before deciding.
    const t = window.setTimeout(() => { void decide(); }, refused ? 0 : 600);
    return () => { alive = false; window.clearTimeout(t); sub.subscription.unsubscribe(); };
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.length < 8) { setError('Use at least 8 characters.'); return; }
    if (pw !== again) { setError('The two passwords are not the same.'); return; }
    setBusy(true); setError(null);
    const { error: err } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (err) {
      setError(/different from the old/i.test(err.message) ? 'That is your old password — choose a new one.' : errorMessage(err, 'Could not set the new password'));
      return;
    }
    clearResetLink();
    setState('done');
  };

  if (state === 'checking') return <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Opening your reset link…</p>;

  if (state === 'invalid') {
    return (
      <div className="space-y-5 text-center pt-6">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl" style={{ background: 'var(--color-secondary-light)', color: 'var(--color-secondary)' }}>
          <LinkBreak size={28} />
        </div>
        <div>
          <h1 className="text-xl font-semibold" style={{ color: 'var(--color-text-primary)' }}>This link does not work any more</h1>
          <p className="mt-2 text-sm" style={{ color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
            Reset links work once, for a short while. {why ? `(${why}.) ` : ''}Ask for a new one — it takes a minute.
          </p>
        </div>
        <NocButton variant="action" className="w-full" onClick={() => navigate('/forgot-password', { replace: true })}>Send a new link</NocButton>
        <button type="button" className="w-full text-sm py-2" style={{ color: 'var(--color-text-muted)' }} onClick={() => navigate('/login', { replace: true })}>Back to sign in</button>
      </div>
    );
  }

  if (state === 'done') {
    return (
      <div className="space-y-5 text-center pt-6">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl" style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary-300)' }}>
          <CheckCircle size={28} />
        </div>
        <div>
          <h1 className="text-xl font-semibold" style={{ color: 'var(--color-text-primary)' }}>Your new password is set</h1>
          <p className="mt-2 text-sm" style={{ color: 'var(--color-text-muted)', lineHeight: 1.6 }}>You are signed in on this phone. Use the new password next time.</p>
        </div>
        <NocButton variant="action" className="w-full" onClick={() => navigate('/login', { replace: true })}>Open the app</NocButton>
      </div>
    );
  }

  return (
    <form onSubmit={save} className="space-y-5 pt-6">
      <div className="grid h-14 w-14 place-items-center rounded-2xl" style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary-300)' }}>
        <LockKey size={28} />
      </div>
      <div>
        <h1 className="text-xl font-semibold" style={{ color: 'var(--color-text-primary)' }}>Choose a new password</h1>
        <p className="mt-2 text-sm" style={{ color: 'var(--color-text-muted)', lineHeight: 1.6 }}>You will stay signed in on this phone.</p>
      </div>
      <Field label="New password" hint="At least 8 characters." as="div">
        <PasswordInput value={pw} onChange={setPw} shown={show} onToggle={() => setShow((v) => !v)} placeholder="Choose a new one" autoComplete="new-password" label="New password" />
      </Field>
      <PasswordStrength password={pw} />
      <Field label="Type it again" as="div">
        <PasswordInput value={again} onChange={setAgain} shown={show} onToggle={() => setShow((v) => !v)} placeholder="The same again" autoComplete="new-password" label="Type it again" />
        {again.length > 0 && again !== pw && <span className="block" role="alert" style={{ fontSize: 12.5, marginTop: 6, color: 'var(--color-secondary)' }}>Not the same yet</span>}
      </Field>
      {error && <p role="alert" className="text-sm" style={{ color: 'var(--color-secondary)' }}>{error}</p>}
      <NocButton type="submit" variant="action" className="w-full" disabled={busy || pw.length < 8 || pw !== again}>
        {busy ? 'Saving…' : 'Set new password'}
      </NocButton>
    </form>
  );
}
