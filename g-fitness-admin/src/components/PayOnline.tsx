import { useEffect, useState } from 'react';
import { CreditCard } from 'lucide-react';
import Card from './ui/Card';
import { showToast } from '../utils/toast';
import { payOnline, paymongoReady, waitForPayment, type CheckoutRow } from '../lib/api/paymongo';
import { getGymBilling } from '../lib/api/subscription';

const MUTED = 'var(--color-text-muted)';
const peso = (n: string | number) => '₱' + Number(n).toLocaleString('en-PH', { maximumFractionDigits: 2 });

/**
 * Pay Core Fitness online (0191) — GCash, Maya, card or online banking through
 * PayMongo, for the plan's month or its yearly price. Shown only when Core
 * Fitness has PayMongo switched on; the reference-and-screenshot card below
 * stays either way. Coming back from PayMongo (?paid=…), it waits for the
 * signed confirmation rather than claiming the payment went through.
 */
export default function PayOnline({ onPaid }: { onPaid: () => void }) {
  const [on, setOn] = useState(false);
  /** The plan's two prices, the database's (0108's billing view). */
  const [prices, setPrices] = useState<{ m: string | null; y: string | null }>({ m: null, y: null });
  useEffect(() => { void getGymBilling().then((b) => setPrices({ m: b?.price_monthly ?? null, y: b?.price_yearly ?? null })); }, []);
  const priceMonthly = prices.m; const priceYearly = prices.y;
  const [busy, setBusy] = useState<number | null>(null);
  const back = new URLSearchParams(window.location.search);
  const paidId = back.get('paid');
  const [returned, setReturned] = useState<CheckoutRow | null | 'waiting'>(paidId ? 'waiting' : null);

  useEffect(() => { void paymongoReady().then(setOn); }, []);
  // The same wait as the other payments (lib/api/paymongo): updated the moment PayMongo confirms.
  useEffect(() => waitForPayment((state, row) => {
    if (row && row.purpose !== 'gym_subscription') return;
    if (state === 'paid') { setReturned(row); onPaid(); }
    else if (state === 'slow') setReturned(row);
  }), [onPaid]);

  const pay = async (months: number) => {
    setBusy(months);
    try { await payOnline('gym_subscription', { months }, '/subscription'); }
    catch (e) { setBusy(null); showToast(e instanceof Error ? e.message : 'Could not open the payment', 'error'); }
  };

  const monthly = priceMonthly != null && Number(priceMonthly) > 0 ? Number(priceMonthly) : null;
  const yearly = priceYearly != null && Number(priceYearly) > 0 ? Number(priceYearly) : null;
  if (!on && !paidId) return null;
  return (
    <Card className="!p-5" data-pay-online>
      <p className="text-sm font-semibold text-white flex items-center gap-2"><CreditCard size={15} /> Pay online</p>
      {returned === 'waiting' && <p className="text-xs mt-2" style={{ color: 'var(--color-text-primary)' }} data-pay-waiting>Thanks — waiting for PayMongo to confirm. This usually takes a few seconds…</p>}
      {returned && returned !== 'waiting' && returned.status === 'paid' && (
        <p className="text-xs mt-2" style={{ color: 'var(--color-text-primary)' }} data-pay-confirmed>Paid {peso(returned.amount)}{returned.method ? ` by ${returned.method}` : ''}. Your receipt is below.</p>
      )}
      {returned && returned !== 'waiting' && returned.status !== 'paid' && (
        <p className="text-xs mt-2" style={{ color: 'var(--color-secondary)' }}>PayMongo has not confirmed this payment yet. If you were charged, it appears here shortly — or ask in Support.</p>
      )}
      {on && (monthly || yearly) ? (
        <>
          <p className="text-xs mt-1" style={{ color: MUTED }}>GCash, Maya, card or online banking, through PayMongo. Recorded the moment it is paid — no screenshot needed.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {monthly && <button type="button" disabled={busy !== null} onClick={() => void pay(1)}
              className="rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-60" style={{ background: 'var(--color-secondary)', color: '#111' }}>
              {busy === 1 ? 'Opening PayMongo…' : `Pay 1 month · ${peso(monthly)}`}</button>}
            {yearly && <button type="button" disabled={busy !== null} onClick={() => void pay(12)}
              className="rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-60" style={{ background: 'var(--color-surface-high)', color: '#fff' }}>
              {busy === 12 ? 'Opening PayMongo…' : `Pay a year · ${peso(yearly)}`}</button>}
          </div>
        </>
      ) : on ? <p className="text-xs mt-1" style={{ color: MUTED }}>Your plan has no price to pay online yet.</p> : null}
    </Card>
  );
}
