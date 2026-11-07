import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, KeyRound, LogOut } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { getGymContext } from '../lib/gymContext';
import { myLogin, setMyUsername, suggestUsername, usernameShape, type MyLogin } from '../lib/api/logins';
import { uploadMyAvatar } from '../lib/api/avatars';
import { Field, TextInput } from '../components/ui/Field';
import { NocButton } from '../components/ui/noc';
import { PhotoPick, UsernameInput } from '../components/account/LoginPieces';
import { logout } from '../utils/auth';

const STEPS = ['Your password', 'Your username', 'Your photo'] as const;

/**
 * First sign-in of a login the desk made or reset (0236, the owner, 2026-11-07):
 * Members → Add member, Trainers → Add trainer, or Reset login. The slip's
 * one-time password worked once. Three steps: their own password, a username
 * (needed when there is no email — the desk's one is filled in), and a photo if
 * they like. Nothing else opens until the password is theirs (App's guard).
 */
export default function SetUpLogin() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [login, setLogin] = useState<MyLogin | null | undefined>(undefined);
  const [name, setName] = useState('');
  const [pw, setPw] = useState({ password: '', confirm: '' });
  const [shown, setShown] = useState(false);
  const [username, setUsername] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate('/login', { replace: true }); return; }
      const meta = session.user.user_metadata ?? {};
      const full = `${meta.first_name ?? ''} ${meta.last_name ?? ''}`.trim();
      setName(full);
      const l = await myLogin();
      setLogin(l);
      setUsername(l?.username ?? (l && !l.hasEmail ? '' : suggestUsername(meta.first_name ?? '', meta.last_name ?? '')));
      // Already set up (a refresh after the password step): straight to the username.
      if (meta.must_change_password !== true) setStep(l ? 1 : 2);
    })();
  }, [navigate]);

  const home = async () => {
    const ctx = await getGymContext(true);
    window.location.assign(ctx?.role === 'trainer' ? '/trainer/home' : '/member/home');
  };

  const next = async () => {
    setError(null);
    if (step === 0) {
      if (pw.password.length < 8) { setError('Choose a password of at least 8 characters.'); return; }
      if (pw.password !== pw.confirm) { setError('The two passwords do not match.'); return; }
      setBusy(true);
      const { error: e } = await supabase.auth.updateUser({ password: pw.password, data: { must_change_password: false } });
      setBusy(false);
      if (e) { setError(e.message); return; }
      await supabase.auth.refreshSession();
      setStep(login ? 1 : 2);   // no usernames before 0236: on to the photo
      return;
    }
    if (step === 1) {
      const u = username.trim();
      if (login && !login.hasEmail && !u) { setError('Keep a username — with no email, it is how you sign in.'); return; }
      if (u && usernameShape(u)) { setError(usernameShape(u)); return; }
      if (login && u !== (login.username ?? '')) {
        setBusy(true);
        try { await setMyUsername(u || null); } catch (e) { setBusy(false); setError(e instanceof Error ? e.message : 'That could not be saved'); return; }
        setBusy(false);
      }
      setStep(2);
      return;
    }
    // The photo: optional.
    if (photo) {
      setBusy(true);
      try { await uploadMyAvatar(photo); } catch (e) { setBusy(false); setError(e instanceof Error ? e.message : 'The photo could not be saved — add it later in Profile.'); return; }
    }
    await home();
  };

  const muted = { color: 'var(--color-text-secondary)' };
  return (
    <div className="min-h-[100dvh] flex flex-col justify-center px-5 py-8" style={{ background: 'var(--color-bg)' }} data-set-up-login>
      <div className="w-full max-w-[420px] mx-auto">
        <span className="w-12 h-12 rounded-2xl grid place-items-center" style={{ background: 'var(--fill-primary, var(--color-primary))', color: '#FFFFFF' }}><KeyRound size={22} /></span>
        <p className="mt-4 text-xs font-semibold" style={muted} data-set-up-step>Step {step + 1} of {STEPS.length} · {STEPS[step]}</p>
        <div className="flex gap-1.5 mt-2" aria-hidden>
          {STEPS.map((s, i) => (
            <span key={s} className="h-1.5 rounded-full" style={{ width: i === step ? 26 : 10, background: i <= step ? 'var(--color-primary)' : 'var(--color-border)' }} />
          ))}
        </div>

        {step === 0 && (<>
          <h1 className="mt-4 text-2xl font-extrabold" style={{ color: 'var(--color-text-primary)' }}>Choose your own password</h1>
          <p className="mt-1.5 text-sm leading-relaxed" style={muted}>The one on your slip worked once. From now on you sign in with yours.</p>
          <div className="mt-5 space-y-3">
            <Field label="New password">
              <div className="relative">
                <TextInput type={shown ? 'text' : 'password'} value={pw.password} autoFocus autoComplete="new-password" placeholder="8 or more characters"
                  aria-label="New password" style={{ paddingRight: 46 }} onChange={(e) => setPw({ ...pw, password: e.target.value })} />
                <button type="button" onClick={() => setShown((s) => !s)} aria-label={shown ? 'Hide password' : 'Show password'}
                  className="absolute right-0 top-0 h-full w-12 grid place-items-center" style={muted}>{shown ? <EyeOff size={17} /> : <Eye size={17} />}</button>
              </div>
            </Field>
            <Field label="Type it again">
              <TextInput type={shown ? 'text' : 'password'} value={pw.confirm} autoComplete="new-password" aria-label="Confirm password"
                onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />
            </Field>
          </div>
        </>)}

        {step === 1 && login && (<>
          <h1 className="mt-4 text-2xl font-extrabold" style={{ color: 'var(--color-text-primary)' }}>{login.hasEmail ? 'Want a username?' : 'Your username'}</h1>
          <p className="mt-1.5 text-sm leading-relaxed" style={muted}>
            {login.hasEmail
              ? `Sign in with it or your email (${login.email}). Skip it if you like your email.`
              : 'You have no email with us, so this is how you sign in. Keep the one the desk gave you, or choose your own.'}
          </p>
          <div className="mt-5"><UsernameInput value={username} onChange={setUsername} required={!login.hasEmail} /></div>
        </>)}

        {step === 2 && (<>
          <h1 className="mt-4 text-2xl font-extrabold" style={{ color: 'var(--color-text-primary)' }}>Add a photo</h1>
          <p className="mt-1.5 text-sm leading-relaxed" style={muted}>Optional — it goes on your member card.</p>
          <div className="mt-5"><PhotoPick file={photo} onChange={setPhoto} name={name} /></div>
        </>)}

        {error && <p className="mt-3 text-sm" style={{ color: 'var(--color-secondary-300, var(--color-secondary))' }} role="alert">{error}</p>}

        <div className="mt-6 flex gap-2">
          {step > 0 && (step === 2 || (login && login.hasEmail)) && (
            <NocButton variant="ghost" className="flex-1" disabled={busy}
              onClick={() => { setError(null); if (step === 1) { setUsername(login?.username ?? ''); setStep(2); } else void home(); }}>
              Skip
            </NocButton>
          )}
          <NocButton variant="fill" className="flex-1" disabled={busy || login === undefined} onClick={() => void next()}>
            {busy ? 'Saving…' : step === 2 ? (photo ? 'Save and start' : 'Start') : 'Next'}
          </NocButton>
        </div>
        <button type="button" onClick={() => void logout().then(() => navigate('/login', { replace: true }))}
          className="mt-4 w-full h-10 text-xs inline-flex items-center justify-center gap-1.5" style={muted}><LogOut size={13} /> Not you? Sign out</button>
      </div>
    </div>
  );
}
