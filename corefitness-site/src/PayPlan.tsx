import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';

const peso = (n: number) => '₱' + n.toLocaleString('en-PH');
const day = (iso: string) => new Date(iso).toLocaleDateString('en-PH', { day: 'numeric', month: 'short', year: 'numeric' });

interface Method { id: string; kind: string; label: string; account_name: string | null; account_number: string | null; qr_image: string | null; instructions: string | null }
interface PayState {
  due: boolean; plan_name: string | null; months: number | null; amount: number | null; ready: boolean; paid: boolean;
  last: { id: string; status: 'pending' | 'paid' | 'refused'; method_label: string; reference: string; amount: number; reason: string | null; created_at: string; decided_at: string | null } | null;
}

/**
 * Paying for the plan before approval (0224). Shown on the signed-in
 * application page for a paid plan only — the free trial pays nothing. It opens
 * once all six documents are verified: PayMongo (the price is the database's,
 * never this page's), or GCash / Maya / bank to the details Core Fitness
 * publishes, then the reference number for Core Fitness to find and confirm.
 */
export default function PayPlan({ applicationId, onChanged }: { applicationId: string; onChanged: () => Promise<void> | void }) {
  const [st, setSt] = useState<PayState | null>(null);
  const [methods, setMethods] = useState<Method[]>([]);
  const [online, setOnline] = useState<boolean | null>(null);
  const [method, setMethod] = useState('');
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data, error: e } = await supabase.rpc('application_payment_state', { p_application: applicationId });
    if (e) { setError(e.message); return; }
    setSt(data as PayState | null);
  }, [applicationId]);

  useEffect(() => {
    void (async () => {
      if (!supabase) return;
      await load();
      const { data } = await supabase.rpc('platform_payment_options');
      const list = ((data ?? []) as Method[]);
      setMethods(list);
      setMethod((m) => m || list[0]?.id || '');
      const probe = await supabase.functions.invoke('paymongo-checkout', { body: { probe: true } });
      setOnline(probe.data?.configured === true);
      // Back from PayMongo: ask PayMongo itself whether it was paid, so a late webhook never leaves them waiting.
      const q = new URLSearchParams(window.location.search);
      const paid = q.get('paid');
      if (q.get('cancelled')) setNote('The online payment was cancelled. Nothing was charged.');
      if (paid) {
        setNote('Checking your payment…');
        const r = await supabase.functions.invoke('paymongo-checkout', { body: { reconcile: paid } });
        setNote(r.data?.status === 'paid' ? 'Payment received. We will let you in shortly.' : 'We have not seen the payment yet. If you paid, it shows here within a few minutes.');
        window.history.replaceState(null, '', `${window.location.pathname}#account`);
        await load(); await onChanged();
      }
    })();
  }, [load, onChanged]);

  if (!st || !st.due) return null;
  const amount = Number(st.amount ?? 0);
  const term = st.months === 12 ? 'a year' : 'a month';

  const payOnline = async () => {
    if (!supabase) return;
    setBusy(true); setError(null);
    const { data, error: e } = await supabase.functions.invoke('paymongo-checkout', {
      body: { purpose: 'application', details: { application: applicationId },
              returnUrl: `${window.location.origin}${window.location.pathname}?app=${applicationId}` },
    });
    setBusy(false);
    const why = data?.error ?? (e ? 'Could not open the online payment. Try GCash, Maya or bank below.' : null);
    if (why || !data?.url) { setError(why ?? 'Could not open the online payment.'); return; }
    window.location.href = data.url;
  };

  const sendReference = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!supabase) return;
    setBusy(true); setError(null);
    const { error: e } = await supabase.rpc('claim_application_payment', {
      p_application: applicationId, p_method: method, p_reference: reference.trim(),
    });
    setBusy(false);
    if (e) { setError(e.message); return; }
    setReference('');
    setNote('Sent. We match it to the transfer and tell you here.');
    await load(); await onChanged();
  };

  const chosen = methods.find((m) => m.id === method);
  return (
    <div className="pay-plan" data-pay-plan>
      <h2 className="status-h">Pay for your plan</h2>
      {st.paid ? (
        <p className="status-sub" data-pay-state="paid">
          <strong>Paid</strong> — {st.plan_name}, {peso(amount)} for {term}
          {st.last?.method_label ? ` by ${st.last.method_label}` : ''}. Your plan starts the day we let you in.
        </p>
      ) : !st.ready ? (
        <p className="status-sub" data-pay-state="waiting">
          {st.plan_name} is {peso(amount)} for {term}. You pay here once all six documents are verified — then we let you in.
          The free trial needs no payment.
        </p>
      ) : st.last?.status === 'pending' ? (
        <p className="status-sub" data-pay-state="checking">
          We are checking your {st.last.method_label} payment (ref {st.last.reference}, sent {day(st.last.created_at)}).
          We tell you here once it is confirmed.
        </p>
      ) : (
        <>
          <p className="status-sub" data-pay-state="open">
            All six documents are verified. Pay {peso(amount)} for {st.plan_name} ({term}); we let you in once it arrives,
            and your plan starts that day.
          </p>
          {st.last?.status === 'refused' && (
            <p className="note bad" data-pay-refused>We could not find your payment (ref {st.last.reference}): {st.last.reason} Send it again below.</p>
          )}
          {online && (
            <div className="cta-row">
              <button type="button" className="cta" disabled={busy} onClick={() => void payOnline()} data-pay-online>
                {busy ? 'Opening…' : `Pay ${peso(amount)} online`}
              </button>
              <span className="note">GCash, Maya, card or online banking, through PayMongo.</span>
            </div>
          )}
          {methods.length > 0 ? (
            <form className="paid-form" onSubmit={sendReference} data-pay-reference>
              <strong>{online ? 'Or send it yourself' : 'Send it by GCash, Maya or bank'}</strong>
              <div className="paid-fields">
                <div className="field">
                  <label htmlFor="pay-method">Paid to</label>
                  <select id="pay-method" value={method} onChange={(e) => setMethod(e.target.value)}>
                    {methods.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="pay-ref">Reference number</label>
                  <input id="pay-ref" required minLength={4} maxLength={60} placeholder="From your receipt" value={reference}
                    onChange={(e) => setReference(e.target.value)} />
                </div>
              </div>
              {chosen && (
                <p className="note">
                  Send {peso(amount)} to {chosen.label}{chosen.account_name ? ` · ${chosen.account_name}` : ''}{chosen.account_number ? ` · ${chosen.account_number}` : ''}.
                  {chosen.instructions ? ` ${chosen.instructions}` : ''}
                </p>
              )}
              {chosen?.qr_image && <img className="pay-plan-qr" src={chosen.qr_image} alt={`${chosen.label} QR code`} />}
              <div className="cta-row" style={{ marginTop: 6 }}>
                <button className="cta ghost" type="submit" disabled={busy || reference.trim().length < 4}>{busy ? 'Sending…' : 'Send the reference'}</button>
              </div>
            </form>
          ) : !online && (
            <p className="note">Ask us below how to pay — we send our GCash, Maya or bank details here.</p>
          )}
        </>
      )}
      {note && <p className="note" role="status">{note}</p>}
      {error && <p className="note bad">{error}</p>}
    </div>
  );
}
