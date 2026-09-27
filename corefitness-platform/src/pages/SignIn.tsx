import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { isPlatformAdmin } from '../lib/platform';

/**
 * The door. Signing in is not the same as being let in: an account that is not
 * in `platform_admins` is signed straight back out, and told plainly — rather
 * than landing on empty screens and wondering what broke.
 */
export default function SignIn({ onSignedIn }: { onSignedIn: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (signInError) {
      setError(signInError.message);
      setBusy(false);
      return;
    }
    if (!(await isPlatformAdmin())) {
      await supabase.auth.signOut();
      setError('That account does not run Core Fitness. Gym owners use the admin app.');
      setBusy(false);
      return;
    }
    setBusy(false);
    onSignedIn();
  };

  return (
    <div className="door">
      <div className="door-art">
        <div className="brand" style={{ padding: 0 }}>
          <img className="brand-logo" src="/core-fitness-logo.png" alt="Core Fitness" />
          <span><span className="brand-name">Core Fitness</span><span className="brand-sub">Platform</span></span>
        </div>
        <div>
          <img src="/core-fitness-logo.png" alt="" className="door-logo" />
          <h2>Every gym on the service, <em>in one place.</em></h2>
          <p>Let gyms in, set their plans, record what they pay, and keep the whole service healthy — from this computer only.</p>
        </div>
        <p className="muted" style={{ fontSize: 12 }}>Gym owners and their staff sign in to the admin app, not here.</p>
      </div>
      <div className="door-form">
      <form onSubmit={submit}>
        <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 6px' }}>Sign in</h1>
        <p className="sub" style={{ marginBottom: 26 }}>The platform owner's account.</p>
        <label htmlFor="email">Email</label>
        <input id="email" type="email" autoComplete="username" value={email}
          onChange={(e) => setEmail(e.target.value)} required />
        <div style={{ height: 12 }} />
        <label htmlFor="password">Password</label>
        <input id="password" type="password" autoComplete="current-password" value={password}
          onChange={(e) => setPassword(e.target.value)} required />
        {error && <p className="err">{error}</p>}
        <div style={{ height: 14 }} />
        <button className="btn" type="submit" disabled={busy} style={{ width: '100%', height: 42 }}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      </div>
    </div>
  );
}
