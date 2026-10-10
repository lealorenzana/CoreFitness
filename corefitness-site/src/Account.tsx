import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import StatusPage from './Status';

interface Mine { id: string; gym_name: string; status: string; created_at: string }
const day = (iso: string) => new Date(iso).toLocaleDateString('en-PH', { day: 'numeric', month: 'short', year: 'numeric' });
const STATUS: Record<string, string> = { pending: 'Being read', approved: 'Let in', rejected: 'Not this time', withdrawn: 'Called off' };

/**
 * `#account` (0187): an applicant signs in with the account they made on the
 * apply form and sees their application — the same page as the private link,
 * plus the documents and calling it off. The admin app shows the same thing.
 */
export default function Account() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [apps, setApps] = useState<Mine[] | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) { setSession(null); return; }
    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data, error: e } = await supabase.rpc('my_applications');
    if (e) { setError(e.message); setApps([]); return; }
    setApps((data ?? []) as Mine[]);
  }, []);
  useEffect(() => { if (session) void (async () => { await load(); })(); }, [session, load]);

  const signOut = async () => { await supabase?.auth.signOut(); setApps(null); setPick(null); };

  if (session === undefined) return <div className="status-page"><p className="status-loading">Opening…</p></div>;
  if (!session) return <SignIn />;
  if (apps === null) return <div className="status-page"><p className="status-loading">Finding your application…</p></div>;

  const chosen = pick ?? (apps.length === 1 ? apps[0]!.id : null);
  if (chosen) return <StatusPage key={chosen} accountId={chosen} onSignOut={() => void signOut()} />;

  return (
    <div className="status-page">
      <div className="status-back-row">
        <a className="status-back" href="#top">← Core Fitness</a>
        <button type="button" className="link-btn" onClick={() => void signOut()}>Sign out</button>
      </div>
      <span className="eyebrow">Signed in as {session.user.email}</span>
      {apps.length === 0 ? (
        <>
          <h1 className="status-title">No application under this email</h1>
          <p className="status-lede">If you applied with another address, sign in with that one. Or register your gym now.</p>
          <a className="cta" href="#apply">Register your gym</a>
        </>
      ) : (
        <>
          <h1 className="status-title">Your applications</h1>
          <ul className="doc-list">
            {apps.map((a) => (
              <li key={a.id} className="doc">
                <div className="doc-head">
                  <button type="button" className="link-btn" onClick={() => setPick(a.id)}><strong>{a.gym_name}</strong></button>
                  <span className="doc-state">{STATUS[a.status] ?? a.status}</span>
                </div>
                <p className="doc-meta">Applied {day(a.created_at)}</p>
              </li>
            ))}
          </ul>
        </>
      )}
      {error && <p className="note bad">{error}</p>}
    </div>
  );
}

function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Applied before accounts (0187)? One made with the same, confirmed, address finds the application. */
  const [making, setMaking] = useState(false);
  const [made, setMade] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) { setError('This page cannot reach Core Fitness right now.'); return; }
    setBusy(true); setError(null);
    if (making) {
      if (password.length < 8) { setError('Use at least 8 characters.'); setBusy(false); return; }
      const { error: e3 } = await supabase.auth.signUp({ email: email.trim(), password, options: {
        data: { signup_source: 'gym_applicant' }, emailRedirectTo: `${window.location.origin}/#account` } });
      setBusy(false);
      if (e3) { setError(e3.message); return; }
      setMade(true);
      return;
    }
    const { error: e2 } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (e2) setError(/confirm/i.test(e2.message) ? 'Confirm your email first — open the link we sent when you applied.' : e2.message);
  };
  if (made) {
    return (
      <div className="status-page">
        <a className="status-back" href="#top">← Core Fitness</a>
        <h1 className="status-title">Check your email</h1>
        <p className="status-lede">Open the link we sent to {email.trim()} to confirm it, then sign in here. Your application is found by that address.</p>
        <button type="button" className="cta" onClick={() => { setMade(false); setMaking(false); }}>Sign in</button>
      </div>
    );
  }
  return (
    <div className="status-page">
      <a className="status-back" href="#top">← Core Fitness</a>
      <span className="eyebrow">Your application</span>
      <h1 className="status-title">{making ? 'Make an account' : 'Sign in'}</h1>
      <p className="status-lede">{making
        ? 'Use the email you applied with. Once you confirm it, your application appears here.'
        : 'With the email and password you chose when you registered your gym.'}</p>
      <form className="apply account-form" onSubmit={submit}>
        <div className="field">
          <label htmlFor="acc-email">Email</label>
          <input id="acc-email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="acc-password">Password</label>
          <input id="acc-password" type="password" required minLength={making ? 8 : undefined} autoComplete={making ? 'new-password' : 'current-password'}
            value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {error && <p className="note bad full" role="alert">{error}</p>}
        <div className="submit-row full">
          <button className="cta" type="submit" disabled={busy}>{busy ? 'One moment…' : making ? 'Make my account' : 'Sign in'}</button>
          <p className="note">{making
            ? <button type="button" className="link-btn" onClick={() => setMaking(false)}>I have an account — sign in</button>
            : <>Applied before accounts existed? <button type="button" className="link-btn" onClick={() => setMaking(true)}>Make one with the same email</button>.</>}</p>
        </div>
      </form>
    </div>
  );
}
