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
    <div className="shell" style={{ maxWidth: 380, paddingTop: 90 }}>
      <div className="head"><h1>Core Fitness</h1></div>
      <p className="sub">The platform. Sign in to run the service.</p>
      <form className="card" onSubmit={submit}>
        <label htmlFor="email">Email</label>
        <input id="email" type="email" autoComplete="username" value={email}
          onChange={(e) => setEmail(e.target.value)} required />
        <div style={{ height: 12 }} />
        <label htmlFor="password">Password</label>
        <input id="password" type="password" autoComplete="current-password" value={password}
          onChange={(e) => setPassword(e.target.value)} required />
        {error && <p className="err">{error}</p>}
        <div style={{ height: 14 }} />
        <button className="btn" type="submit" disabled={busy} style={{ width: '100%' }}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
