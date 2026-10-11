import { useCallback, useEffect, useState } from 'react';
import { CreditCard, ExternalLink, ShieldCheck } from 'lucide-react';
import Card from './ui/Card';
import { showToast } from '../utils/toast';
import { connectGymPayMongo, disconnectGymPayMongo, gymOnlinePayments, gymPaymentAccount, type GymAccount, type GymOnlinePayment } from '../lib/api/paymongo';

const MUTED = 'var(--color-text-muted)';
const FIELD = { background: 'var(--color-surface-high)', border: '1px solid var(--color-border)', color: '#fff' };
const peso = (n: string | number) => '₱' + Number(n).toLocaleString('en-PH', { maximumFractionDigits: 2 });
const when = (iso: string) => new Date(iso).toLocaleString('en-PH', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

/**
 * Your app → Online payments (0192): the gym connects its OWN PayMongo account,
 * so members renew and pay for coaching in the app by GCash, Maya or card —
 * straight to the gym, recorded the moment it is paid, with a receipt number
 * like any payment. The key goes to PayMongo and the Vault and is never shown
 * again; this card shows connected, test or live, and the last four characters.
 */
export default function GymPayMongo() {
  const [acc, setAcc] = useState<GymAccount | null | undefined>(undefined);
  const [paid, setPaid] = useState<GymOnlinePayment[]>([]);
  const [secret, setSecret] = useState('');
  const [pub, setPub] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const [a, p] = await Promise.all([gymPaymentAccount(), gymOnlinePayments()]);
    setAcc(a); setPaid(p);
  }, []);
  useEffect(() => { void (async () => { await load(); })(); }, [load]);
  if (acc === undefined) return <Card className="!p-4"><p className="text-xs" style={{ color: MUTED }}>Loading…</p></Card>;

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try { await fn(); showToast(ok, 'success'); setSecret(''); setPub(''); await load(); }
    catch (e) { showToast(e instanceof Error ? e.message : 'That did not work', 'error'); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-4" data-gym-paymongo>
      <Card className="!p-5">
        <p className="text-sm font-semibold text-white flex items-center gap-2"><CreditCard size={15} /> Take payments in the app</p>
        {acc ? (
          <>
            <p className="text-xs mt-2" style={{ color: 'var(--color-text-primary)' }} data-paymongo-connected>
              <ShieldCheck size={13} className="inline mr-1" style={{ color: 'var(--color-primary)' }} />
              PayMongo is connected ({acc.live ? 'live — real money' : 'test mode — no real money'}, key ending {acc.key_last4}).
              Members can renew and pay for coaching in the app; it lands in your PayMongo account and shows in Payments with a receipt number.
            </p>
            {!acc.live && <p className="text-xs mt-1" style={{ color: 'var(--color-secondary)' }}>To take real money, verify your business with PayMongo, then connect your sk_live_ key here.</p>}
            <button type="button" disabled={busy} onClick={() => void run(() => disconnectGymPayMongo(), 'Disconnected — members pay at the desk again')}
              className="mt-3 rounded-lg px-3 py-1.5 text-xs" style={{ background: 'var(--color-surface-high)', color: 'var(--color-text-secondary)' }}>
              {busy ? 'Disconnecting…' : 'Disconnect'}
            </button>
          </>
        ) : (
          <>
            <p className="text-xs mt-1" style={{ color: MUTED }}>
              Connect your gym's own PayMongo account and members pay you in the app by GCash, Maya, card or online banking —
              straight to you; Core Fitness never holds your money. Find the keys at{' '}
              <a href="https://dashboard.paymongo.com/developers" target="_blank" rel="noreferrer" className="underline">dashboard.paymongo.com → Developers <ExternalLink size={11} className="inline" /></a>.
              Use the test keys to try it first. Your secret key is stored encrypted and never shown again.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <input type="password" autoComplete="off" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="Secret key — sk_test_… or sk_live_…"
                aria-label="PayMongo secret key" className="rounded-lg px-3 py-2 text-sm" style={FIELD} />
              <input autoComplete="off" value={pub} onChange={(e) => setPub(e.target.value)} placeholder="Public key (optional) — pk_…"
                aria-label="PayMongo public key" className="rounded-lg px-3 py-2 text-sm" style={FIELD} />
            </div>
            <button type="button" disabled={busy || !/^sk_(test|live)_/.test(secret.trim())}
              onClick={() => void run(() => connectGymPayMongo(secret.trim(), pub.trim()), 'Connected — members can pay in the app')}
              className="mt-3 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50" style={{ background: 'var(--color-secondary)', color: '#111' }}>
              {busy ? 'Checking with PayMongo…' : 'Connect PayMongo'}
            </button>
          </>
        )}
      </Card>
      {paid.length > 0 && (
        <Card className="!p-5">
          <p className="text-sm font-semibold text-white">Paid in the app</p>
          <ul className="mt-2 space-y-1">
            {paid.slice(0, 15).map((p) => (
              <li key={p.id} className="text-xs flex flex-wrap gap-2" style={{ color: MUTED }}>
                <span className="text-white">{p.member_name}</span><span>{p.description}</span><span>{peso(p.amount)}</span>
                <span>{p.method ?? ''} · {p.paid_at ? when(p.paid_at) : ''}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
