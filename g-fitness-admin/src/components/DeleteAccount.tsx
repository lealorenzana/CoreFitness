import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

const WORD = 'DELETE';
const day = (iso: string) => new Date(iso).toLocaleDateString('en-PH', { day: 'numeric', month: 'long', year: 'numeric' });

/**
 * Delete my account (0225), for a gym's owner, under Settings →
 * My profile. The only owner of an open gym is told to ask Core Fitness to
 * close it or hand it over (the database refuses it too). Typed confirmation;
 * locked at once, erased after 7 days unless they sign back in and keep it.
 */
export default function DeleteAccount() {
  const [blocked, setBlocked] = useState<string | null | undefined>(undefined);
  const [asking, setAsking] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const { data, error: e } = await supabase.rpc('my_account_deletion');
      setBlocked(e ? undefined : ((data as { blocked: string | null } | null)?.blocked ?? null));
    })();
  }, []);
  if (blocked === undefined) return null;

  const go = async () => {
    setBusy(true); setError(null);
    const { error: e } = await supabase.rpc('request_account_deletion');
    if (e) { setBusy(false); setError(e.message); return; }
    await supabase.auth.signOut();
    window.location.assign('/admin/login?deleted=1');
  };

  return (
    <div data-delete-account style={{ marginTop: 22, paddingTop: 14, borderTop: '1px solid var(--a-line)' }}>
      <p className="a-h" style={{ fontSize: 14 }}>Delete my account</p>
      <p className="a-sub" style={{ marginTop: 4, lineHeight: 1.5 }}>
        Locked straight away, erased after 7 days — sign back in before then to keep it. Your name, contact details and photo
        are erased; what you recorded for the gym (payments, check-ins) stays in its books.
      </p>
      {blocked ? (
        <p className="a-sub" style={{ marginTop: 8, color: 'var(--a-a300)' }} data-delete-blocked>{blocked}</p>
      ) : asking ? (
        <div className="flex items-center gap-2" style={{ marginTop: 10, flexWrap: 'wrap' }}>
          <input className="a-in" style={{ maxWidth: 200 }} value={typed} onChange={(e) => setTyped(e.target.value)}
            placeholder={`Type ${WORD}`} aria-label={`Type ${WORD} to confirm`} data-delete-type />
          <button type="button" className="a-btn" disabled={busy || typed.trim().toUpperCase() !== WORD} onClick={() => void go()} data-delete-confirm>
            <Trash2 size={12} />{busy ? 'Deleting…' : 'Delete my account'}
          </button>
          <button type="button" className="a-btn ghost" onClick={() => { setAsking(false); setTyped(''); }}>Keep it</button>
        </div>
      ) : (
        <button type="button" className="a-btn ghost sm" style={{ marginTop: 10 }} onClick={() => setAsking(true)}>
          <Trash2 size={12} />Delete my account
        </button>
      )}
      {error && <p className="a-sub" style={{ marginTop: 6, color: 'var(--a-a300)' }}>{error}</p>}
    </div>
  );
}

/** Signed in while the account waits to be erased: keep it, or sign out and let it run. */
export function DeletionPending({ eraseAfter, onKept }: { eraseAfter: string; onKept: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const keep = async () => {
    setBusy(true); setError(null);
    const { error: e } = await supabase.rpc('cancel_account_deletion');
    setBusy(false);
    if (e) { setError(e.message); return; }
    onKept();
  };
  return (
    <div className="min-h-screen flex items-center justify-center p-6 text-center" data-deletion-pending
      style={{ background: 'var(--color-bg)', color: 'var(--color-text-secondary)' }}>
      <div className="max-w-sm">
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-text-primary)' }}>Your account is being deleted</h1>
        <p className="text-sm" style={{ marginTop: 8, lineHeight: 1.55 }}>
          It will be erased on {day(eraseAfter)}. Keep it, and everything stays as it was.
        </p>
        <div className="flex flex-col gap-2" style={{ marginTop: 16 }}>
          <button type="button" className="btn-primary" disabled={busy} onClick={() => void keep()} data-keep-account
            style={{ padding: '10px 16px', borderRadius: 10, background: 'var(--color-primary)', color: '#fff', fontWeight: 600 }}>
            {busy ? 'Keeping…' : 'Keep my account'}
          </button>
          <button type="button" onClick={() => void supabase.auth.signOut().then(() => window.location.assign('/admin/login'))}
            style={{ padding: '10px 16px', borderRadius: 10, border: '1px solid var(--color-border)' }}>
            Sign out — let it be deleted
          </button>
        </div>
        {error && <p className="text-sm" style={{ marginTop: 8 }}>{error}</p>}
      </div>
    </div>
  );
}
