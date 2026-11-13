import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, KeyRound, LogOut } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { clearGymContext } from '../lib/gymContext';
import { clearAdminCaches } from '../lib/adminCaches';
import { myLogin, setMyUsername, usernameShape, type MyLogin } from '../lib/api/logins';
import UsernameField from '../components/UsernameField';

/**
 * First sign-in of a login the owner made at the desk (0236, the owner,
 * 2026-11-07): Settings → Staff accounts → Add staff, or a login the desk
 * reset. The slip's one-time password worked once; here they choose their own
 * and a username. Nothing else opens until they do (ProtectedRoute).
 */
export default function SetUpLogin() {
  const navigate = useNavigate();
  const [login, setLogin] = useState<MyLogin | null | undefined>(undefined);
  const [f, setF] = useState({ password: '', confirm: '', username: '' });
  const [shown, setShown] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate('/admin/login', { replace: true }); return; }
      if (session.user.user_metadata?.must_change_password !== true) { navigate('/dashboard', { replace: true }); return; }
      const l = await myLogin();
      setLogin(l);
      setF((x) => ({ ...x, username: l?.username ?? '' }));
    })();
  }, [navigate]);

  const signOut = async () => { await supabase.auth.signOut({ scope: 'local' }); clearGymContext(); clearAdminCaches(); navigate('/admin/login', { replace: true }); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (f.password.length < 8) { setError('Choose a password of at least 8 characters.'); return; }
    if (f.password !== f.confirm) { setError('The two passwords do not match.'); return; }
    if (login && !login.hasEmail && !f.username.trim()) { setError('Keep a username — with no email, it is how you sign in.'); return; }
    if (login && f.username.trim() && usernameShape(f.username)) { setError(`Username: ${usernameShape(f.username)}`); return; }
    setBusy(true);
    setError(null);
    try {
      // The username first: a taken one stops here while the one-time password still works.
      if (login && f.username.trim() !== (login.username ?? '')) await setMyUsername(f.username.trim() || null);
      const { error: pwError } = await supabase.auth.updateUser({ password: f.password, data: { must_change_password: false } });
      if (pwError) throw new Error(pwError.message);
      await supabase.auth.refreshSession();
      clearGymContext();
      clearAdminCaches();
      window.location.assign('/admin/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not work');
      setBusy(false);
    }
  };

  const input = 'w-full h-12 rounded-xl px-4 text-[15px] outline-none';
  const inputSt: React.CSSProperties = { background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' };
  const label = 'block text-[13px] font-semibold mb-1.5';
  const muted = { color: 'var(--color-text-secondary)' };

  return (
    <div className="min-h-screen grid place-items-center p-6" style={{ background: 'var(--color-bg)' }}>
      <form onSubmit={(e) => void submit(e)} noValidate data-set-up-login className="w-full max-w-[440px] rounded-2xl p-7"
        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-card)' }}>
        <span className="h-12 w-12 rounded-xl grid place-items-center" style={{ background: 'var(--fill-primary, var(--color-primary))', color: '#FFFFFF' }}><KeyRound size={22} /></span>
        <h1 className="mt-4 text-[21px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>Set up your login</h1>
        <p className="mt-1 text-[13.5px]" style={muted}>The one-time password on your slip worked once. Choose your own, and a username if you like.</p>
        {login === undefined ? <p className="mt-5 text-sm" style={muted}>Opening…</p> : (<>
          <div className="mt-5">
            <span className={label} style={muted}>New password</span>
            <div className="relative">
              <input className={input} style={{ ...inputSt, paddingRight: 46 }} type={shown ? 'text' : 'password'} value={f.password} autoFocus
                onChange={(e) => setF({ ...f, password: e.target.value })} placeholder="8 or more characters" autoComplete="new-password" aria-label="New password" />
              <button type="button" onClick={() => setShown((s) => !s)} aria-label={shown ? 'Hide password' : 'Show password'} className="absolute right-0 top-0 h-12 w-12 grid place-items-center" style={muted}>{shown ? <EyeOff size={17} /> : <Eye size={17} />}</button>
            </div>
            <input className={`${input} mt-2`} style={inputSt} type={shown ? 'text' : 'password'} value={f.confirm}
              onChange={(e) => setF({ ...f, confirm: e.target.value })} placeholder="Type it again" autoComplete="new-password" aria-label="Confirm password" />
          </div>
          {login && (
            <div className="mt-4">
              <UsernameField value={f.username} onChange={(v) => setF({ ...f, username: v })} required={!login.hasEmail}
                inputClass={input} inputStyle={inputSt} labelClass={label} labelStyle={muted} />
            </div>
          )}
          {error && <p className="mt-3 text-[13px]" style={{ color: 'var(--color-secondary)' }} role="alert">{error}</p>}
          <button type="submit" disabled={busy} className="mt-5 w-full h-12 rounded-xl font-semibold disabled:opacity-60"
            style={{ background: 'var(--fill-primary, var(--color-primary))', color: '#FFFFFF' }}>{busy ? 'Saving…' : 'Save and continue'}</button>
        </>)}
        <button type="button" onClick={() => void signOut()} className="mt-2 w-full h-10 text-[13px] inline-flex items-center justify-center gap-1.5" style={muted}><LogOut size={13} /> Not you? Sign out</button>
      </form>
    </div>
  );
}
