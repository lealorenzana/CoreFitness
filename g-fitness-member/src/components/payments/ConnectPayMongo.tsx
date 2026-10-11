import { useCallback, useEffect, useState } from 'react';
import { NocButton, SectionHead } from '../ui/noc';
import { Field, TextInput } from '../ui/Field';
import { toast } from '../ui/Toast';
import { connectPayMongo, disconnectPayMongo, myPaymentAccount, type PaymentAccount } from '../../lib/api/paymongo';

/**
 * A coach paid directly connects their own PayMongo account (0192), so members
 * pay them online and it is recorded at once. The key goes to PayMongo and the
 * Vault, never back to this screen — it shows connected, test or live, and the
 * key's last four characters.
 */
export default function ConnectPayMongo() {
  const [acc, setAcc] = useState<PaymentAccount | null | undefined>(undefined);
  const [secret, setSecret] = useState('');
  const [pub, setPub] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => setAcc(await myPaymentAccount('trainer')), []);
  useEffect(() => { void (async () => { await load(); })(); }, [load]);
  if (acc === undefined) return null;

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try { await fn(); toast.success(ok); setSecret(''); setPub(''); await load(); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'That did not work'); }
    finally { setBusy(false); }
  };

  return (
    <div data-connect-paymongo style={{ marginTop: 18 }}>
      <SectionHead title="Get paid online" meta={acc ? (acc.live ? 'Live' : 'Test mode') : undefined} />
      {acc ? (
        <>
          <p style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
            Your PayMongo account is connected (key ending {acc.key_last4}). Members can pay you by GCash, Maya or card in the app,
            and their coaching starts the moment it is paid.
          </p>
          <div style={{ marginTop: 8 }}>
            <NocButton variant="ghost" disabled={busy} onClick={() => void run(() => disconnectPayMongo('trainer'), 'Disconnected')}>
              {busy ? 'Disconnecting…' : 'Disconnect'}
            </NocButton>
          </div>
        </>
      ) : (
        <>
          <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>
            Optional. Connect your own PayMongo account (dashboard.paymongo.com → Developers → API keys) and members pay you online —
            straight to you. Your key is stored encrypted and never shown again.
          </p>
          <div className="flex flex-col" style={{ gap: 8, marginTop: 8 }}>
            <Field label="Secret key"><TextInput type="password" autoComplete="off" placeholder="sk_test_… or sk_live_…" value={secret} onChange={(e) => setSecret(e.target.value)} /></Field>
            <Field label="Public key (optional)"><TextInput autoComplete="off" placeholder="pk_test_… or pk_live_…" value={pub} onChange={(e) => setPub(e.target.value)} /></Field>
            <NocButton variant="fill" disabled={busy || !/^sk_(test|live)_/.test(secret.trim())}
              onClick={() => void run(() => connectPayMongo('trainer', secret.trim(), pub.trim()), 'Connected — members can pay you online')}>
              {busy ? 'Connecting…' : 'Connect PayMongo'}
            </NocButton>
          </div>
        </>
      )}
    </div>
  );
}
