import { useEffect, useState } from 'react';
import type { UserIdentity } from '@supabase/supabase-js';
import { supabase } from './supabase';

/**
 * How this account signs in (plan Part A, 2026-10-31). The account a gym owner
 * applies with becomes their login to the gym app once the gym is let in, so it
 * shows both ways in: the email and password, and Google — with Connect Google
 * when an email account has not linked it yet. Either way reaches the same
 * application and, later, the same gym.
 */
export default function SignInMethods() {
  const [ids, setIds] = useState<UserIdentity[] | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    void (async () => {
      const { data } = await supabase.auth.getUserIdentities();
      setIds(data?.identities ?? []);
      setEmail((await supabase.auth.getUser()).data.user?.email ?? null);
    })();
    // Back from Google after linking: say so once and clean the address.
    if (window.location.hash.includes('linked=google')) {
      setNote('Google is connected — you can sign in with it from now on.');
      window.history.replaceState(null, '', `${window.location.pathname}#account`);
    }
  }, []);

  if (!supabase || !ids) return null;
  const google = ids.find((i) => i.provider === 'google') ?? null;
  const password = ids.some((i) => i.provider === 'email');
  const googleEmail = (google?.identity_data as { email?: string } | undefined)?.email ?? null;

  const link = async () => {
    if (!supabase) return;
    setBusy(true); setNote(null);
    const { error } = await supabase.auth.linkIdentity({
      provider: 'google', options: { redirectTo: `${window.location.origin}${window.location.pathname}#account?linked=google` },
    });
    if (error) { setBusy(false); setNote(/manual linking|disabled/i.test(error.message) ? 'Connecting Google is not switched on yet — write to us below.' : error.message); }
  };

  return (
    <div className="card" data-signin-methods>
      <h2 className="status-h">How you sign in</h2>
      <p className="status-sub">This account is your login to the gym app once your gym is let in — no second password.</p>
      <ul className="doc-list">
        {password && (
          <li className="doc"><div className="doc-head"><strong>Email and password</strong><span className="doc-state">{email}</span></div></li>
        )}
        <li className="doc" data-google={google ? 'linked' : 'not-linked'}>
          <div className="doc-head">
            <strong>Google</strong>
            <span className="doc-state">{google ? `Connected${googleEmail ? ` · ${googleEmail}` : ''}` : 'Not connected'}</span>
          </div>
          {!google && (
            <button type="button" className="cta" style={{ marginTop: 10 }} disabled={busy} onClick={() => void link()} data-connect-google>
              {busy ? 'Opening Google…' : 'Connect Google'}
            </button>
          )}
        </li>
      </ul>
      {note && <p className="note">{note}</p>}
    </div>
  );
}
