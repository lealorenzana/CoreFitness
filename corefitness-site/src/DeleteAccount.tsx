import { useEffect, useState } from 'react';
import { supabase } from './supabase';

const WORD = 'DELETE';
const day = (iso: string) => new Date(iso).toLocaleDateString('en-PH', { day: 'numeric', month: 'long', year: 'numeric' });

/**
 * An applicant deletes their account (0225): locked at once, erased after 7
 * days — the application still waiting is called off and its documents erased;
 * the application itself stays as Core Fitness's record. Signing back in
 * within the 7 days offers to keep it (DeletionPending). The owner of an open
 * gym is told to ask Core Fitness to close it or hand it over first.
 */
export default function DeleteAccount({ onDeleted }: { onDeleted: () => void }) {
  const [blocked, setBlocked] = useState<string | null | undefined>(undefined);
  const [asking, setAsking] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      if (!supabase) return;
      const { data, error: e } = await supabase.rpc('my_account_deletion');
      setBlocked(e ? undefined : ((data as { blocked: string | null } | null)?.blocked ?? null));
    })();
  }, []);
  if (blocked === undefined || !supabase) return null;

  const go = async () => {
    if (!supabase) return;
    setBusy(true); setError(null);
    const { error: e } = await supabase.rpc('request_account_deletion');
    if (e) { setBusy(false); setError(e.message); return; }
    await supabase.auth.signOut();
    onDeleted();
  };

  return (
    <div className="sign-in-methods" data-delete-account>
      <h2 className="status-h">Delete my account</h2>
      <p className="status-sub">Locked straight away and erased after 7 days — sign back in before then to keep it. An application still
        waiting is called off and your documents erased; we keep the application itself as the record of what was asked and answered.</p>
      {blocked ? <p className="note bad" data-delete-blocked>{blocked}</p> : asking ? (
        <div className="cta-row" style={{ alignItems: 'center' }}>
          <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={`Type ${WORD}`} aria-label={`Type ${WORD} to confirm`}
            data-delete-type style={{ maxWidth: 200 }} />
          <button type="button" className="cta" disabled={busy || typed.trim().toUpperCase() !== WORD} onClick={() => void go()} data-delete-confirm>
            {busy ? 'Deleting…' : 'Delete my account'}
          </button>
          <button type="button" className="cta ghost" onClick={() => { setAsking(false); setTyped(''); }}>Keep it</button>
        </div>
      ) : (
        <button type="button" className="link-btn" onClick={() => setAsking(true)}>Delete my account</button>
      )}
      {error && <p className="note bad">{error}</p>}
    </div>
  );
}

/** Signed in while the account waits to be erased: keep it, or sign out and let it run. */
export function DeletionPending({ eraseAfter, onKept, onSignOut }: { eraseAfter: string; onKept: () => void; onSignOut: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const keep = async () => {
    if (!supabase) return;
    setBusy(true); setError(null);
    const { error: e } = await supabase.rpc('cancel_account_deletion');
    setBusy(false);
    if (e) { setError(e.message); return; }
    onKept();
  };
  return (
    <div className="status-page" data-deletion-pending>
      <h1 className="status-title">Your account is being deleted</h1>
      <p className="status-lede">It will be erased on {day(eraseAfter)}. Keep it, and everything stays as it was.</p>
      <div className="cta-row">
        <button type="button" className="cta" disabled={busy} onClick={() => void keep()} data-keep-account>{busy ? 'Keeping…' : 'Keep my account'}</button>
        <button type="button" className="cta ghost" onClick={onSignOut}>Sign out — let it be deleted</button>
      </div>
      {error && <p className="note bad">{error}</p>}
    </div>
  );
}
