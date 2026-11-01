import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { toTier, type PublicPlanRow, type Tier } from './pricing';

const peso = (n: number) => '₱' + n.toLocaleString('en-PH');
/** What a tier costs, in words — never a number that is not there. */
const describePrice = (t: Tier) => t.monthly == null ? 'Talk to us' : t.monthly === 0 ? 'Free' : `${peso(t.monthly)} a month${t.yearly ? ` or ${peso(t.yearly)} a year` : ''}`;

/**
 * Change plan (0228), in the application page's Plan card: any plan on the
 * price list, monthly or yearly where a yearly price exists. Open until a
 * payment is sent — then the database refuses and the card says why. The price
 * list is read, never typed in.
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
  const save = async () => {
    if (!supabase || !pick) return;
    setBusy(true); setError(null);
    const { error: e } = await supabase.rpc('change_application_plan', {
      p_application: applicationId, p_plan: pick, p_billing: yearly && chosen?.yearly ? 'yearly' : 'monthly',
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
          <label className="field" htmlFor="cp-plan">
            <span>Plan</span>
            <select id="cp-plan" value={pick} onChange={(e) => setPick(e.target.value)}>
              {plans.map((p) => <option key={p.key} value={p.key}>{p.name} — {describePrice(p)}</option>)}
            </select>
          </label>
          {chosen?.yearly != null && chosen.yearly > 0 && (
            <label className="note" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="checkbox" checked={yearly} onChange={(e) => setYearly(e.target.checked)} /> Pay yearly
            </label>
          )}
          <div className="cta-row" style={{ marginTop: 8 }}>
            <button type="button" className="cta" disabled={busy || !pick || (pick === current && (yearly ? 'yearly' : 'monthly') === (billing ?? 'monthly'))}
              onClick={() => void save()}>{busy ? 'Saving…' : 'Save'}</button>
            <button type="button" className="cta ghost" onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </>
      )}
      {error && <p className="note bad">{error}</p>}
    </div>
  );
}
