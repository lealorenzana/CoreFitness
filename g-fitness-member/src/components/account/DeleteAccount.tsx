import { useEffect, useState } from 'react';
import { Trash } from '@phosphor-icons/react';
import { supabase } from '../../lib/supabaseClient';
import { logout } from '../../utils/auth';
import { NocButton, SectionHead } from '../ui/noc';
import Modal from '../ui/Modal';

const WORD = 'DELETE';
const day = (iso: string) => new Date(iso).toLocaleDateString('en-PH', { day: 'numeric', month: 'long', year: 'numeric' });

/**
 * Delete my account (0225), for members and coaches. Asks first whether it can
 * go ahead (the only owner of an open gym and a coach with a package running
 * are told why not), then a typed confirmation. The account is locked at once —
 * every device signed out — and erased after 7 days; signing back in within
 * them offers to keep it (DeletionPending).
 */
export default function DeleteAccount({ who }: { who: 'member' | 'coach' }) {
  const [blocked, setBlocked] = useState<string | null | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const { data, error: e } = await supabase.rpc('my_account_deletion');
      // Before 0225 the function is missing: say nothing rather than offer what cannot run.
      setBlocked(e ? undefined : ((data as { blocked: string | null } | null)?.blocked ?? null));
    })();
  }, []);
  if (blocked === undefined) return null;

  const go = async () => {
    setBusy(true); setError(null);
    const { error: e } = await supabase.rpc('request_account_deletion');
    if (e) { setBusy(false); setError(e.message); return; }
    await logout();
    window.location.assign('/login?deleted=1');
  };

  return (
    <section data-delete-account>
      <SectionHead title="Delete my account" />
      <p style={{ fontSize: 13, marginTop: 8, lineHeight: 1.55, color: 'var(--color-text-secondary)' }}>
        Your account is locked straight away and erased after 7 days. Sign back in before then to keep it.
        Erased means your name, contact details, photo, workouts, {who === 'coach' ? 'chats with members, credentials' : 'measurements, progress photos, chats, assistant conversations, health answers'} and
        badges are gone. Your payments and visits stay in the gym's records as "Deleted member", as the law asks of a business.
        {who === 'coach' ? ' Your future single sessions are cancelled and each member is told.' : ' Your future bookings are cancelled.'}
      </p>
      {blocked ? (
        <p className="noc-note" style={{ fontSize: 13, marginTop: 10, lineHeight: 1.5, color: 'var(--color-secondary)' }} data-delete-blocked>{blocked}</p>
      ) : (
        <NocButton variant="ghost" className="w-full" style={{ marginTop: 12 }} icon={<Trash size={16} />} onClick={() => setOpen(true)}>
          Delete my account
        </NocButton>
      )}
      <Modal isOpen={open} onClose={() => { setOpen(false); setTyped(''); setError(null); }} title="Delete my account"
        subtitle="Locked now, erased in 7 days unless you sign back in." confirmLabel={busy ? 'Deleting…' : 'Delete my account'}
        cancelLabel="Keep my account" confirmDisabled={busy || typed.trim().toUpperCase() !== WORD} onConfirm={() => void go()}>
        <label style={{ display: 'block', fontSize: 13, color: 'var(--color-text-secondary)' }}>
          Type {WORD} to confirm
          <input value={typed} onChange={(e) => setTyped(e.target.value)} autoCapitalize="characters" aria-label={`Type ${WORD} to confirm`}
            data-delete-type
            style={{ display: 'block', width: '100%', marginTop: 6, padding: '10px 12px', borderRadius: 10,
              background: 'var(--color-surface-raised)', border: '1px solid var(--color-hairline)', color: 'var(--color-text-primary)', fontSize: 15 }} />
        </label>
        {error && <p style={{ fontSize: 13, marginTop: 10, color: 'var(--color-secondary)' }}>{error}</p>}
      </Modal>
    </section>
  );
}

/**
 * Signed in while the account is waiting to be erased (0225): nothing else
 * opens until they choose. Keep my account cancels it; Sign out leaves it to run.
 */
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
    <div className="min-h-dvh flex items-center justify-center" style={{ padding: 24, background: 'var(--color-bg)' }} data-deletion-pending>
      <div style={{ maxWidth: 380, textAlign: 'center' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-text-primary)' }}>Your account is being deleted</h1>
        <p style={{ fontSize: 14, marginTop: 10, lineHeight: 1.55, color: 'var(--color-text-secondary)' }}>
          It will be erased on {day(eraseAfter)}. Keep it, and everything stays as it was — the bookings that were cancelled stay cancelled.
        </p>
        <NocButton variant="action" className="w-full" style={{ marginTop: 18 }} disabled={busy} onClick={() => void keep()}>
          {busy ? 'Keeping…' : 'Keep my account'}
        </NocButton>
        <NocButton variant="ghost" className="w-full" style={{ marginTop: 8 }} onClick={() => void logout().then(() => window.location.assign('/login'))}>
          Sign out — let it be deleted
        </NocButton>
        {error && <p style={{ fontSize: 13, marginTop: 10, color: 'var(--color-secondary)' }}>{error}</p>}
      </div>
    </div>
  );
}
