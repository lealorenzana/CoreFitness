import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Eye, EyeOff, LockKeyhole, Unlink } from 'lucide-react';
import { clearResetLink, openedByResetLink, supabase } from '../lib/supabaseClient';

type State = 'checking' | 'ready' | 'invalid' | 'done';

/**
 * Where a reset link ends up (via /admin/login). Auth has signed this tab in for
 * the reset; the old password is not asked for — forgetting it is why they are
 * here. Without a reset link (expired, used, or the address typed) it says so and
 * offers a new one, rather than becoming a way to change a password unchecked.
 */
export default function ResetPassword() {
  const navigate = useNavigate();
  const [state, setState] = useState<State>('checking');
  const [why] = useState(() => {
    const params = new URLSearchParams(window.location.hash.slice(1) || window.location.search.slice(1));
    return params.get('error_description');
  });
  const [pw, setPw] = useState('');
  const [again, setAgain] = useState('');
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const decide = async () => {
      const { data } = await supabase.auth.getSession();
      if (!alive) return;
      setState(data.session && openedByResetLink() ? 'ready' : 'invalid');
    };
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' && alive) setState('ready');
    });
    // The client may still be reading the link; give it a moment before deciding.
    const t = window.setTimeout(() => { void decide(); }, why ? 0 : 600);
    return () => { alive = false; window.clearTimeout(t); sub.subscription.unsubscribe(); };
  }, [why]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.length < 8) { setError('Use at least 8 characters.'); return; }
    if (pw !== again) { setError('The two passwords are not the same.'); return; }
    setBusy(true); setError(null);
    const { error: err } = await supabase.auth.updateUser({ password: pw, data: { must_change_password: false } });
    setBusy(false);
    if (err) {
      setError(/different from the old/i.test(err.message) ? 'That is your old password — choose a new one.' : `Could not set the new password: ${err.message}`);
      return;
    }
    clearResetLink();
    setState('done');
  };

  const input = 'w-full h-12 rounded-xl px-4 text-[15px] outline-none';
  const inputSt: React.CSSProperties = { background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' };
  const muted = { color: 'var(--color-text-secondary)' };
  const primary: React.CSSProperties = { background: 'var(--fill-primary, var(--color-primary))', color: '#FFFFFF' };
  const tile = (icon: React.ReactNode) => <span className="h-12 w-12 rounded-xl grid place-items-center" style={primary}>{icon}</span>;
  const title = (t: string) => <h1 className="mt-4 text-[21px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>{t}</h1>;

  return (
    <div className="min-h-screen grid place-items-center p-6" style={{ background: 'var(--color-bg)' }}>
      <div data-reset-password={state} className="w-full max-w-[440px] rounded-2xl p-7"
        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-card)' }}>
        {state === 'checking' && <p className="text-sm" style={muted}>Opening your reset link…</p>}

        {state === 'invalid' && (<>
          {tile(<Unlink size={22} />)}
          {title('This link does not work any more')}
          <p className="mt-1 text-[13.5px] leading-relaxed" style={muted}>Reset links work once, for a short while. {why ? `(${why}.) ` : ''}Ask for a new one — it takes a minute.</p>
          <button type="button" onClick={() => navigate('/admin/forgot-password', { replace: true })} className="mt-5 w-full h-12 rounded-xl font-semibold" style={primary}>Send a new link</button>
          <button type="button" onClick={() => navigate('/admin/login', { replace: true })} className="mt-2 w-full h-10 text-[13px]" style={muted}>Back to sign in</button>
        </>)}

        {state === 'done' && (<>
          {tile(<CheckCircle2 size={22} />)}
          {title('Your new password is set')}
          <p className="mt-1 text-[13.5px]" style={muted}>You are signed in on this computer. Use the new password next time.</p>
          <button type="button" onClick={() => window.location.assign('/admin/dashboard')} className="mt-5 w-full h-12 rounded-xl font-semibold" style={primary}>Open the dashboard</button>
        </>)}

        {state === 'ready' && (
          <form onSubmit={(e) => void save(e)} noValidate>
            {tile(<LockKeyhole size={22} />)}
            {title('Choose a new password')}
            <p className="mt-1 text-[13.5px]" style={muted}>You will stay signed in on this computer.</p>
            <span className="block text-[13px] font-semibold mt-5 mb-1.5" style={muted}>New password</span>
            <div className="relative">
              <input className={input} style={{ ...inputSt, paddingRight: 46 }} type={shown ? 'text' : 'password'} value={pw} autoFocus
                onChange={(e) => setPw(e.target.value)} placeholder="8 or more characters" autoComplete="new-password" aria-label="New password" />
              <button type="button" onClick={() => setShown((s) => !s)} aria-label={shown ? 'Hide password' : 'Show password'} className="absolute right-0 top-0 h-12 w-12 grid place-items-center" style={muted}>{shown ? <EyeOff size={17} /> : <Eye size={17} />}</button>
            </div>
            <input className={`${input} mt-2`} style={inputSt} type={shown ? 'text' : 'password'} value={again}
              onChange={(e) => setAgain(e.target.value)} placeholder="Type it again" autoComplete="new-password" aria-label="Type it again" />
            {again.length > 0 && again !== pw && <p className="mt-1.5 text-[12.5px]" style={{ color: 'var(--color-secondary)' }}>Not the same yet</p>}
            {error && <p className="mt-3 text-[13px]" style={{ color: 'var(--color-secondary)' }} role="alert">{error}</p>}
            <button type="submit" disabled={busy || pw.length < 8 || pw !== again} className="mt-5 w-full h-12 rounded-xl font-semibold disabled:opacity-60" style={primary}>
              {busy ? 'Saving…' : 'Set new password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
