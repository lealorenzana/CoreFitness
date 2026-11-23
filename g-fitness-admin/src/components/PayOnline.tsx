import { useEffect, useState } from 'react';
import { CreditCard } from 'lucide-react';
import { showToast } from '../utils/toast';
import { payOnline, paymongoReady, waitForPayment, type CheckoutRow } from '../lib/api/paymongo';
import { getGymBilling } from '../lib/api/subscription';

const peso = (n: string | number) => '₱' + Number(n).toLocaleString('en-PH', { maximumFractionDigits: 2 });

/**
 * Pay Core Fitness online (0191) — GCash, Maya, card or online banking through
 * PayMongo, for the plan's month or its yearly price. The only way to pay the
 * plan since 2026-10-28 (the owner: one way, no QR-and-reference form here);
 * before Core Fitness switches PayMongo on, it says so and points to Help. Coming back from PayMongo (?paid=…), it waits for the
 * signed confirmation rather than claiming the payment went through.
 */
export default function PayOnline({ onPaid }: { onPaid: () => void }) {
  const [on, setOn] = useState<boolean | null>(null);
  /** The plan's two prices, the database's (0108's billing view). */
  const [prices, setPrices] = useState<{ m: string | null; y: string | null }>({ m: null, y: null });
  useEffect(() => { void getGymBilling().then((b) => setPrices({ m: b?.price_monthly ?? null, y: b?.price_yearly ?? null })); }, []);
  const priceMonthly = prices.m; const priceYearly = prices.y;
  const [busy, setBusy] = useState<number | null>(null);
  /** Which period the one Pay button pays (2026-11-23: rows to pick from, then one button). */
  const [period, setPeriod] = useState<1 | 12>(1);
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
  if (on === null && !paidId) return null;
  if (!on && !paidId) {
    return (
      <div className="sp-pay-off" data-pay-online-off>
        <b><CreditCard size={15} />Pay online</b>
        <p className="a-sub">Paying the plan online opens here once Core Fitness switches it on. Until then, ask Core Fitness in Help how to pay this month.</p>
      </div>
    );
  }
  // Yearly saves only when the database's yearly price is below twelve months: said as the real percentage, never typed in.
  const save = monthly && yearly && yearly < monthly * 12 ? Math.round((1 - yearly / (monthly * 12)) * 100) : 0;
  const chosen = period === 12 && yearly ? 12 : monthly ? 1 : 12;
  const rows: [1 | 12, string, number | null, string][] = [[1, 'Monthly', monthly, 'one month at a time'], [12, 'Yearly', yearly, 'twelve months, paid once']];
  return (
    <div className="sp-pay-in" data-pay-online>
      {returned === 'waiting' && <p className="a-hint" data-pay-waiting>Thanks: waiting for PayMongo to confirm. This usually takes a few seconds…</p>}
      {returned && returned !== 'waiting' && returned.status === 'paid' && (
        <p className="a-hint" data-pay-confirmed>Paid {peso(returned.amount)}{returned.method ? ` by ${returned.method}` : ''}. Your receipt is below.</p>
      )}
      {returned && returned !== 'waiting' && returned.status !== 'paid' && (
        <p className="a-hint" style={{ color: 'var(--a-a300)' }}>PayMongo has not confirmed this payment yet. If you were charged, it appears here shortly, or ask in Help.</p>
      )}
      {on && (monthly || yearly) ? (
        <>
          <div className="sp-periods" role="radiogroup" aria-label="How long to pay for">
            {rows.filter(([, , price]) => price).map(([m, label, price, hint]) => (
              <button key={m} type="button" role="radio" aria-checked={chosen === m} className={`sp-period ${chosen === m ? 'on' : ''}`} onClick={() => setPeriod(m)} data-period={m}>
                <span className="sp-radio" aria-hidden />
                <span className="sp-period-t"><b>{label}</b><small>{hint}</small></span>
                {m === 12 && save > 0 && <span className="sp-save">Save {save}%</span>}
                <b className="sp-price">{peso(price!)}</b>
              </button>
            ))}
          </div>
          <button type="button" className="sp-paybtn" disabled={busy !== null} onClick={() => void pay(chosen)} data-pay-go>
            <CreditCard size={16} />{busy !== null ? 'Opening PayMongo…' : chosen === 12 ? `Pay a year · ${peso(yearly!)}` : `Pay 1 month · ${peso(monthly!)}`}
          </button>
          <p className="a-sub sp-pay-note">GCash, Maya, card or online banking, through PayMongo. Recorded the moment it is paid: no screenshot needed.</p>
        </>
      ) : on ? <p className="a-sub">Your plan has no price to pay online yet.</p> : null}
    </div>
  );
}
