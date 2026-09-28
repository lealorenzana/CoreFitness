import { useCallback, useEffect, useState } from 'react';
import { Building2, Eye, Layers, Plus, Wallet } from 'lucide-react';
import Modal from '../components/Modal';
import Tiles from '../components/Tiles';
import {
  explain, listGyms, listPlanFeatures, listPlatformFeatures, listPlatformPlans, retirePlan, savePlan, setPlanFeature,
  setPlanPhotoLimit,
  type PlanFeatureCell, type PlatformFeature, type PlatformGym, type PlatformPlan,
} from '../lib/platform';

const peso = (n: string | null) =>
  n === null ? null : '₱' + Number(n).toLocaleString('en-PH', { maximumFractionDigits: 0 });

const blank = (sort: number): PlatformPlan => ({
  key: '', name: '', blurb: null, price_monthly: null, price_yearly: null, trial_days: null,
  max_members: null, max_staff: null, is_public: true, is_active: true, sort_order: sort,
});

/**
 * What Core Fitness sells.
 *
 * This screen is the reason the website has prices, the reason `gyms.plan`
 * resolves to something, and the reason a limit is a limit: every number typed
 * here is read by the database (0108). `max_members` is not a label — a trigger
 * on `gym_roles` refuses the member past it, on every road into a gym.
 *
 * On the day 0108 is pasted every tier includes everything, because what a
 * cheaper tier leaves out is a business decision this system had not been told.
 * Unticking the first box is where that decision gets made.
 */
export default function Plans() {
  const [plans, setPlans] = useState<PlatformPlan[] | null>(null);
  const [features, setFeatures] = useState<PlatformFeature[]>([]);
  const [cells, setCells] = useState<PlanFeatureCell[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<PlatformPlan | null>(null);
  const [busy, setBusy] = useState(false);
  /** Which gyms are on which plan — counts on the cards, never a gym's rows. */
  const [gyms, setGyms] = useState<PlatformGym[]>([]);

  const load = useCallback(async () => {
    try {
      const [p, f, c] = await Promise.all([listPlatformPlans(), listPlatformFeatures(), listPlanFeatures()]);
      setPlans(p); setFeatures(f); setCells(c); setError(null);
      setGyms(await listGyms().catch(() => []));
    } catch (e) {
      // Not null: null means "still loading", and leaving it there would spin
      // for ever behind an error that has already arrived.
      setPlans([]);
      setError(explain(e, '0108'));
    }
  }, []);

  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  const on = (plan: string, feature: string) =>
    cells.find((c) => c.plan_key === plan && c.feature_key === feature)?.enabled ?? true;

  const toggle = async (plan: string, feature: string) => {
    const next = !on(plan, feature);
    // Optimistic: the box is the whole interaction, and a round trip per tick
    // makes a nine-row grid feel broken.
    setCells((cs) => {
      const i = cs.findIndex((c) => c.plan_key === plan && c.feature_key === feature);
      if (i < 0) return [...cs, { plan_key: plan, feature_key: feature, enabled: next }];
      const copy = [...cs];
      copy[i] = { ...copy[i], enabled: next };
      return copy;
    });
    try {
      await setPlanFeature(plan, feature, next);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That could not be saved');
      await load();
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setBusy(true);
    setError(null);
    try {
      // Prices arrive from Postgres as strings (numeric has no JS equivalent
      // that keeps its precision) and leave as numbers. Empty stays null —
      // "not decided" must never round-trip into zero.
      await savePlan({
        ...editing,
        price_monthly: editing.price_monthly === null || editing.price_monthly === ''
          ? null : Number(editing.price_monthly),
        price_yearly: editing.price_yearly === null || editing.price_yearly === ''
          ? null : Number(editing.price_yearly),
      });
      // 0121's photo limit, only when the database has the column (it arrives
      // as a key on every plan row once 0121 is pasted).
      if (editing.max_photos !== undefined) {
        await setPlanPhotoLimit(editing.key, editing.max_photos);
      }
      setEditing(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the plan');
    } finally {
      setBusy(false);
    }
  };

  const retire = async (plan: PlatformPlan) => {
    try {
      const gyms = await retirePlan(plan.key);
      await load();
      setError(gyms > 0
        ? `${plan.name} is retired. ${gyms} gym${gyms === 1 ? '' : 's'} stay on it and keep what they have — it is simply no longer offered.`
        : `${plan.name} is retired. No gym was on it.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not retire the plan');
    }
  };

  const undecided = plans?.filter((p) => p.price_monthly === null && p.is_active) ?? [];
  const allSame = plans !== null && plans.length > 1 && features.length > 0
    && features.every((f) => plans.every((p) => on(p.key, f.key) === on(plans[0].key, f.key)));

  return (
    <>
      <Tiles items={[
        { icon: Layers, value: plans ? String(plans.filter((p) => p.is_active).length) : '…', label: 'Plans on sale' },
        { icon: Eye, value: plans ? String(plans.filter((p) => p.is_active && p.is_public).length) : '…', label: 'Shown on the website' },
        { icon: Building2, value: String(gyms.filter((g) => Number(plans?.find((p) => p.key === g.plan)?.price_monthly ?? 0) > 0).length), label: 'Gyms on a paid plan' },
        { icon: Wallet, value: peso(String(gyms.reduce((n, g) => n + Number(plans?.find((p) => p.key === g.plan)?.price_monthly ?? 0), 0))) ?? '₱0', label: 'A month, at list price' },
      ]} />
      <div className="toolbar">
        <span className="muted" style={{ fontSize: 13 }}>
          {plans ? `${plans.length} plan${plans.length === 1 ? '' : 's'} · tick what each one unlocks` : 'Loading…'}
        </span>
        <span className="spacer" />
        <button className="btn" onClick={() => setEditing(blank((plans?.length ?? 0) + 1))}>
          <Plus size={15} /> Add a plan
        </button>
      </div>

      {error && <p className="err">{error}</p>}

      {(undecided.length > 0 || allSame) && (
        <div className="notices">
        {undecided.length > 0 && (
        <div className="card notice">
          <div className="name">
            {undecided.length === 1 ? 'One plan has no price' : `${undecided.length} plans have no price`}
          </div>
          <div className="meta">
            {undecided.map((p) => p.name).join(', ')} — the website says “Talk to us” for these rather
            than printing a number nobody decided. Set one and it appears there.
          </div>
        </div>
      )}

        {allSame && (
        <div className="card notice">
          <div className="name">Every plan currently includes exactly the same things</div>
          <div className="meta">
            That is the honest starting state, not a mistake: pasting 0108 took nothing away from any
            gym. Untick what a cheaper tier does not get, and the website and the gyms both follow.
          </div>
        </div>
      )}

        </div>
      )}

      <Modal open={!!editing} onClose={() => setEditing(null)} size="lg" label="Plan">
      {editing && (
        <form className="card ask" onSubmit={save}>
          <div className="name">{editing.key && plans?.some((p) => p.key === editing.key) ? `Edit ${editing.name}` : 'A new plan'}</div>
          <div className="meta">
            Leave a price empty if you have not decided — the website says “Talk to us”, which is
            true, instead of a number that is not. Leave a limit empty for no limit.
          </div>
          <div className="fields">
            <div>
              <label htmlFor="pl-key">Key</label>
              <input id="pl-key" required value={editing.key}
                disabled={!!plans?.some((p) => p.key === editing.key)}
                placeholder="starter"
                onChange={(e) => setEditing({ ...editing, key: e.target.value })} />
            </div>
            <div>
              <label htmlFor="pl-name">Name</label>
              <input id="pl-name" required value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label htmlFor="pl-blurb">One line, for the website</label>
              <input id="pl-blurb" value={editing.blurb ?? ''}
                onChange={(e) => setEditing({ ...editing, blurb: e.target.value || null })} />
            </div>
            <div>
              <label htmlFor="pl-pm">₱ a month</label>
              <input id="pl-pm" type="number" min={0} value={editing.price_monthly ?? ''}
                placeholder="not decided"
                onChange={(e) => setEditing({ ...editing, price_monthly: e.target.value === '' ? null : e.target.value })} />
            </div>
            <div>
              <label htmlFor="pl-py">₱ a year</label>
              <input id="pl-py" type="number" min={0} value={editing.price_yearly ?? ''}
                placeholder="not offered"
                onChange={(e) => setEditing({ ...editing, price_yearly: e.target.value === '' ? null : e.target.value })} />
            </div>
            <div>
              <label htmlFor="pl-trial">Free days at the start</label>
              <input id="pl-trial" type="number" min={1} max={365} value={editing.trial_days ?? ''}
                placeholder="none"
                onChange={(e) => setEditing({ ...editing, trial_days: e.target.value === '' ? null : Number(e.target.value) })} />
            </div>
            <div>
              <label htmlFor="pl-mm">Most members</label>
              <input id="pl-mm" type="number" min={1} value={editing.max_members ?? ''}
                placeholder="no limit"
                onChange={(e) => setEditing({ ...editing, max_members: e.target.value === '' ? null : Number(e.target.value) })} />
            </div>
            <div>
              <label htmlFor="pl-ms">Most behind the desk</label>
              <input id="pl-ms" type="number" min={1} value={editing.max_staff ?? ''}
                placeholder="no limit"
                onChange={(e) => setEditing({ ...editing, max_staff: e.target.value === '' ? null : Number(e.target.value) })} />
            </div>
            {editing.max_photos !== undefined && (
              <div>
                <label htmlFor="pl-ph">Most photos</label>
                <input id="pl-ph" type="number" min={1} value={editing.max_photos ?? ''}
                  placeholder="no limit"
                  onChange={(e) => setEditing({ ...editing, max_photos: e.target.value === '' ? null : Number(e.target.value) })} />
              </div>
            )}
            <div>
              <label htmlFor="pl-pub">On the website</label>
              <select id="pl-pub" value={editing.is_public ? 'yes' : 'no'}
                onChange={(e) => setEditing({ ...editing, is_public: e.target.value === 'yes' })}>
                <option value="yes">Shown</option>
                <option value="no">Hidden — for gyms you place on it yourself</option>
              </select>
            </div>
          </div>
          {editing.max_members !== null && (
            <p className="meta" style={{ marginTop: 10 }}>
              A gym on this plan will be refused its {editing.max_members + 1}th active member — by the
              database, at the desk, with that sentence. Existing members are never touched.
            </p>
          )}
          <div style={{ height: 12 }} />
          <div className="row">
            <button className="btn" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save the plan'}</button>
            <button className="btn ghost" type="button" onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </form>
      )}
      </Modal>

      <div className="plan-grid">
      {plans?.map((plan) => {
        const onIt = gyms.filter((g) => g.plan === plan.key).length;
        const unlocked = features.filter((f) => on(plan.key, f.key)).length;
        return (
        <div className={`card plan-card${plan.is_active ? '' : ' retired'}`} key={plan.key}>
          <div className="plan-top">
            <span className="plan-name">{plan.name}</span>
            {!plan.is_active && <span className="pill">Retired</span>}
            {plan.is_active && !plan.is_public && <span className="pill">Not on the website</span>}
            <span className="plan-gyms"><Building2 size={13} />{onIt} gym{onIt === 1 ? '' : 's'} on it</span>
          </div>
          <div className="plan-price">
            {peso(plan.price_monthly)
              ? <><b>{peso(plan.price_monthly)}</b><span>a month{plan.price_yearly !== null ? ` · ${peso(plan.price_yearly)} a year` : ''}</span></>
              : <><b className="undecided">Talk to us</b><span>no price decided — the website says so</span></>}
          </div>
          {plan.blurb && <p className="plan-blurb">“{plan.blurb}”</p>}
          <div className="plan-facts">
            {plan.trial_days ? <span className="chip">{plan.trial_days} free days</span> : null}
            <span className="chip">{plan.max_members === null ? 'Any number of members' : `Up to ${plan.max_members} members`}</span>
            <span className="chip">{plan.max_staff === null ? 'Any number on the desk' : `Up to ${plan.max_staff} on the desk`}</span>
            {plan.max_photos !== undefined && <span className="chip">{plan.max_photos === null ? 'Any number of photos' : `Up to ${plan.max_photos} photos`}</span>}
          </div>
          <div className="plan-unlocks">
            <span className="section-title" style={{ margin: 0 }}>Unlocks {unlocked} of {features.length}</span>
            <div className="ticks">
              {features.map((f) => (
                <label className="tick" key={f.key} title={f.description}>
                  <input type="checkbox" checked={on(plan.key, f.key)}
                    onChange={() => void toggle(plan.key, f.key)} />
                  <span>{f.label}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="plan-foot">
            <button className="btn ghost" onClick={() => setEditing(plan)}>Edit the plan</button>
            {plan.is_active && <button className="btn ghost" onClick={() => void retire(plan)}>Retire</button>}
          </div>
        </div>
        );
      })}
      </div>

      {plans?.length === 0 && (
        <p className="empty">
          Nothing is on sale. A gym cannot be created until at least one plan exists.
        </p>
      )}
    </>
  );
}
