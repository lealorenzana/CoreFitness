import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { showToast } from '../utils/toast';
import { arrivedByResetLink, supabase } from '../lib/supabaseClient';
import { clearGymContext, getGymContext, myGyms, usableGyms } from '../lib/gymContext';
import { myApplications } from '../lib/api/applications';
import { getSessionPersistence, setSessionPersistence } from '../lib/authStorage';
import { realEmail, signInWithLogin } from '../lib/api/logins';
import { clearAdminCaches } from '../lib/adminCaches';
import './login.css';
import LoginFloorPlan from './LoginFloorPlan';

const MEMBER_APP = 'https://corefitness-gym.vercel.app';
const SITE = 'https://corefitness-site.vercel.app';

/**
 * The gym sign-in (redesigned 2026-11-21, design/lessons/LESSONS.md): the owner picked the "quiet column"
 * (design/admin-login/mockups.html). The particles, glow orbs, light beams, mouse tilt, gradient headline and the
 * scroll story below the form are gone; every way in is kept —
 * email or username, Keep me signed in, Forgot password, Google, the from-website "already signed in"
 * question, the deleted-account note, reset links and invitations.
 */
export default function AdminLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  // Defaults to the last choice, and to ON for a first-time sign-in — the
  // expectation here is Facebook-style: signed in until you press Logout.
  const [rememberMe, setRememberMe] = useState(getSessionPersistence);

  /** What went wrong, said under the password field (never only a toast that vanishes), and a shake to point at it. */
  const [formError, setFormError] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const [capsOn, setCapsOn] = useState(false);
  /** Signed in: the button turns into a check while the dashboard opens. */
  const [signedIn, setSignedIn] = useState(false);
  const refuse = (message: string) => {
    setFormError(message);
    setShake(false);
    requestAnimationFrame(() => setShake(true));
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) { refuse('Enter your email or username, and your password.'); return; }
    setFormError(null);
    setIsLoading(true);

    // BEFORE the sign-in, not after: the storage adapter is consulted when
    // Supabase writes the token, so the choice has to be recorded first or the
    // session lands in the wrong store.
    setSessionPersistence(rememberMe);

    // 0236: an email or a username.
    const { error } = await signInWithLogin(email, password);
    if (error) {
      refuse(/invalid login credentials/i.test(error) ? 'That email or username and password don’t match.' : error);
      setIsLoading(false);
      return;
    }
    setSignedIn(true);
    await routeSignedIn();
    // Still here (no admin access, or an application): the check goes back to a button.
    setSignedIn(false);
  };

  // From the website's "Gym sign in" (?from=site, 2026-11-08) with this browser already signed in: say who, and ask —
  // continue as them, or sign out and use the account the website was signed in with. The website's sign-in is its
  // own (another site), so the two can differ; no email travels in the link.
  const fromSite = new URLSearchParams(window.location.search).get('from') === 'site';
  const [already, setAlready] = useState<{ name: string; email: string | null; gym: string | null } | null>(null);
  useEffect(() => {
    if (!fromSite) return;
    void (async () => {
      const { data } = await supabase.auth.getSession();
      const u = data.session?.user;
      if (!u) return;
      const { data: p } = await supabase.from('profiles').select('first_name, last_name, username').eq('id', u.id).maybeSingle();
      const ctx = await getGymContext().catch(() => null);
      const name = [p?.first_name, p?.last_name].filter(Boolean).join(' ') || p?.username || 'this account';
      setAlready({ name, email: realEmail(u.email) ?? (p?.username ? `@${p.username}` : null), gym: ctx?.gymName ?? null });
    })();
  }, [fromSite]);
  const switchAccount = async () => {
    await supabase.auth.signOut({ scope: 'local' });
    clearGymContext();
    clearAdminCaches();
    setAlready(null);
  };

  /** After any sign-in — a password, or Google (0190): which gym, the application, or no access. */
  const routeSignedIn = async () => {
    // An invited login's first sign-in (0202): its form comes first — the
    // account has no gym until it is finished, so nothing below would let it in.
    const { data: { user } } = await supabase.auth.getUser();
    const invite = user?.user_metadata?.invite_pending ? user.user_metadata.invite_token : null;
    if (typeof invite === 'string' && invite) {
      setIsLoading(false);
      navigate(`/admin/invite/${invite}`);
      return;
    }
    // Which gym, and what they are in it (0104). Someone who owns or works at
    // more than one picks; the front desk and owners of one land straight in.
    const ctx = await getGymContext(true);
    const gyms = usableGyms(await myGyms()).filter((g) => g.role === 'admin' || g.role === 'staff');
    if (gyms.length > 1 || (gyms.length === 1 && ctx?.gymId && gyms[0].gym_id !== ctx.gymId)) {
      showToast('Login successful!', 'success');
      navigate('/admin/choose-gym');
      setIsLoading(false);
      return;
    }
    if (!(ctx?.role === 'admin' || ctx?.role === 'staff') || ctx.status !== 'active') {
      // Applied on the website (0187) and not let in yet: their application, not a refusal.
      const apps = await myApplications().catch(() => []);
      if (apps.length > 0) {
        setIsLoading(false);
        navigate('/admin/application');
        return;
      }
      await supabase.auth.signOut({ scope: 'local' });
      clearGymContext();
      refuse('This account does not have admin access. Coaches and members sign in on the phone app.');
      setIsLoading(false);
      return;
    }

    showToast('Login successful!', 'success');
    navigate('/admin/dashboard');
  };

  // Back from Google (0190): the session is already there; route it like a password sign-in.
  // A password-reset link returns here (the admin address on Auth's redirect list): on to choosing the new one.
  // A refused link (expired or used) comes back as #error_description=… — the reset page explains it.
  useEffect(() => {
    if (arrivedByResetLink) { navigate('/admin/reset-password', { replace: true }); return; }
    if (/error_description=/.test(window.location.hash)) navigate(`/admin/reset-password${window.location.hash}`, { replace: true });
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') navigate('/admin/reset-password', { replace: true });
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has('google')) return;
    let cancelled = false;
    void (async () => {
      let session = (await supabase.auth.getSession()).data.session;
      for (let i = 0; !session && i < 20; i++) {
        await new Promise((r) => setTimeout(r, 250));
        session = (await supabase.auth.getSession()).data.session;
      }
      if (cancelled || !session) return;
      setIsLoading(true);
      await routeSignedIn();
    })();
    return () => { cancelled = true; };
    // routeSignedIn reads only setters and navigate; run once on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signInWithGoogle = async () => {
    setSessionPersistence(rememberMe);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google', options: { redirectTo: `${window.location.origin}/admin/login?google=1` },
    });
    if (error) showToast(/provider is not enabled|Unsupported provider/i.test(error.message)
      ? 'Google sign-in is not switched on yet. Use your email and password.' : error.message, 'error');
  };

  const deletedNote = new URLSearchParams(window.location.search).get('deleted') === '1';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  return (
    // A dark branded page in both modes (0234): .keep-dark keeps light mode's overrides off it.
    <div className="al keep-dark">
      <LoginFloorPlan />
      {already && (
        <div className="al-dialog" role="dialog" aria-modal="true" aria-label="Already signed in" data-already-signed-in>
          <div>
            <h2>This browser is signed in as {already.name}</h2>
            <p>{already.email ? <>{already.email}{already.gym ? ' · ' : ''}</> : null}{already.gym ?? ''}</p>
            <p>You came from the website. If you meant another account, the one you applied with there, sign out here and sign in with it.</p>
            <button type="button" className="al-btn primary" data-continue
              onClick={() => { setAlready(null); void routeSignedIn(); }}>Continue as {already.name}</button>
            <button type="button" className="al-btn ghost" data-switch onClick={() => void switchAccount()}>Sign out and use another account</button>
          </div>
        </div>
      )}

      <header className="al-edge">
        <a className="al-brand" href={SITE}><img src="/core-fitness-logo.png" alt="" width={28} height={28} />Core Fitness</a>
        <span className="al-quiet">New gym? <a href={`${SITE}/#apply`}>Register <ArrowRight size={14} aria-hidden /></a></span>
      </header>

      <main className="al-main">
        <div className="al-col">
          <p className="al-hello">{greeting}.</p>
          <h1>Sign in to your gym</h1>
          <p className="al-sub">Owners and the front desk.</p>
          {/* 0225: just asked to delete the account: what happens next. */}
          {deletedNote && (
            <p role="status" data-deleted-note className="al-note">Your account is locked and will be erased in 7 days. Sign in before then if you want to keep it.</p>
          )}

          {/* Google (0190) first: most owners sign in with the Google address their account was made with. */}
          <button type="button" className="al-btn google" onClick={() => void signInWithGoogle()} data-google-button>
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
              <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
              <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
              <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
              <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
            </svg>
            Continue with Google
          </button>
          <div className="al-or">or with your email or username</div>

          <form onSubmit={handleLogin} className={`al-form${shake ? ' shake' : ''}`} onAnimationEnd={() => setShake(false)} noValidate>
            <div className="al-field">
              <label htmlFor="al-login">Email or username</label>
              <input id="al-login" className="al-input" type="text" inputMode="email" autoCapitalize="off" autoCorrect="off" spellCheck={false} autoComplete="username"
                placeholder="name@yourgym.com or username" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="al-field">
              <label htmlFor="al-password">Password</label>
              <div className="al-pw">
                <input id="al-password" className="al-input" type={showPassword ? 'text' : 'password'} autoComplete="current-password"
                  aria-invalid={!!formError} aria-describedby="al-msg"
                  onKeyUp={(e) => setCapsOn(e.getModifierState('CapsLock'))} onBlur={() => setCapsOn(false)}
                  value={password} onChange={(e) => { setPassword(e.target.value); if (formError) setFormError(null); }} />
                <button type="button" className="al-show" onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword}>
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              {/* The space is kept, so the button below never moves when a message appears. */}
              <p id="al-msg" className={`al-msg${formError ? ' bad' : ''}`} role={formError ? 'alert' : undefined} aria-live="polite">
                {formError ?? (capsOn ? 'Caps Lock is on.' : '')}
              </p>
            </div>
            <div className="al-row">
              <label className="al-check">
                <input type="checkbox" checked={rememberMe} onChange={() => setRememberMe(!rememberMe)} />
                Keep me signed in
              </label>
              <button type="button" className="al-link" data-forgot-link onClick={() => navigate('/admin/forgot-password', { state: { email } })}>Forgot password?</button>
            </div>
            <button type="submit" className={`al-btn primary${signedIn ? ' done' : ''}`} disabled={isLoading} aria-busy={isLoading}>
              {signedIn
                ? <><svg className="al-tick" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" pathLength={1} /></svg>Signed in</>
                : isLoading ? <><span className="al-spin" aria-hidden />Signing in…</> : 'Sign in'}
            </button>
          </form>

          <p className="al-who">Coach or member? You sign in on the phone app. <a href={`${MEMBER_APP}/get-app`}>Get the app <ArrowRight size={14} aria-hidden /></a></p>
        </div>
      </main>

      <footer className="al-edge al-foot">
        <span>Made in Mamburao, Occidental Mindoro</span>
        <span className="al-links">
          <a href={`${SITE}/#legal/terms`}>Terms</a>
          <a href={`${SITE}/#legal/privacy`}>Privacy</a>
          <a href={SITE}>About Core Fitness</a>
        </span>
      </footer>
    </div>
  );
}
