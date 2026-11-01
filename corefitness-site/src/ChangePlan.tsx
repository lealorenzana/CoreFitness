import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { toTier, type PublicPlanRow, type Tier } from './pricing';

const peso = (n: number) => '₱' + n.toLocaleString('en-PH');
/** What a tier costs a month, in words — never a number that is not there. */
const monthly = (t: Tier) => t.monthly == null ? 'Talk to us' : t.monthly === 0 ? 'Free' : `${peso(t.monthly)} a month`;

/**
 * Change plan (0228), in the application page's Plan card: each plan on the
 * price list as a row to tap (its whole price shown, never cut off), then
 * Monthly or Yearly where a yearly price exists. Open until a payment is sent —
 * then the database refuses and the card says why. The price list is read,
 * never typed in.
 */
export default function ChangePlan({ applicationId, current, billing, locked, onChanged }: {
  applicationId: string; current: string | null; billing: 'monthly' | 'yearly' | null; locked: boolean;
  onChanged: () => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const [plans, setPlans] = useState<Tier[] | null>(null);
  const [pick, setPick] = useState(current ?? '');
  const [yearly, setYearly] = useState(billing === 'yearly');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || plans || !supabase) return;
    void (async () => {
      const { data } = await supabase!.rpc('platform_price_list');
      setPlans(((data ?? []) as PublicPlanRow[]).map(toTier));
    })();
  }, [open, plans]);

  if (locked) return <p className="note" data-plan-locked>Your payment is for this plan, so it is fixed now. Ask us in Messages to change it.</p>;
  if (!open) return <button type="button" className="link-btn" onClick={() => setOpen(true)} data-change-plan>Change plan</button>;

  const chosen = plans?.find((p) => p.key === pick) ?? null;
  const hasYearly = !!chosen?.yearly && chosen.yearly > 0;
  const wantYearly = yearly && hasYearly;
  const unchanged = pick === current && (wantYearly ? 'yearly' : 'monthly') === (billing ?? 'monthly');
  const save = async () => {
    if (!supabase || !pick) return;
    setBusy(true); setError(null);
    const { error: e } = await supabase.rpc('change_application_plan', {
      p_application: applicationId, p_plan: pick, p_billing: wantYearly ? 'yearly' : 'monthly',
    });
    setBusy(false);
    if (e) { setError(e.message); return; }
    setOpen(false);
    await onChanged();
  };

  return (
    <div className="change-plan" data-change-plan-form>
      {plans === null ? <p className="note">Reading the price list…</p> : (
        <>
          <div className="cp-opts" role="radiogroup" aria-label="Plan">
            {plans.map((p) => (
              <button key={p.key} type="button" role="radio" aria-checked={pick === p.key} data-plan-opt={p.key}
                className={`cp-opt${pick === p.key ? ' on' : ''}`} onClick={() => setPick(p.key)}>
                <span className="cp-opt-name">{p.name}{p.key === current ? <span className="cp-opt-now">now</span> : null}</span>
                <span className="cp-opt-price">{monthly(p)}</span>
              </button>
            ))}
          </div>
          {hasYearly && (
            <div className="cp-seg" role="radiogroup" aria-label="How you pay">
              <button type="button" role="radio" aria-checked={!wantYearly} className={`cp-seg-opt${!wantYearly ? ' on' : ''}`} onClick={() => setYearly(false)} data-billing="monthly">
                Monthly<small>{peso(chosen!.monthly ?? 0)}</small>
              </button>
              <button type="button" role="radio" aria-checked={wantYearly} className={`cp-seg-opt${wantYearly ? ' on' : ''}`} onClick={() => setYearly(true)} data-billing="yearly">
                Yearly<small>{peso(chosen!.yearly!)}</small>
              </button>
            </div>
          )}
          <div className="change-plan-actions">
            <button type="button" className="cta cta-sm" disabled={busy || !pick || unchanged} onClick={() => void save()}>{busy ? 'Saving…' : 'Save'}</button>
            <button type="button" className="cta ghost cta-sm" onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </>
      )}
      {error && <p className="note bad">{error}</p>}
    </div>
  );
}
