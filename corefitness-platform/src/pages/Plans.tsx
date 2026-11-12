import { useCallback, useEffect, useState } from 'react';
import { Building2, Check, Eye, Layers, Lock, Minus, Plus, Wallet } from 'lucide-react';
import Modal from '../components/Modal';
import Tiles from '../components/Tiles';
import {
  explain, listGyms, listPlanFeatures, listPlatformFeatures, listPlatformPlans, retirePlan, savePlan, setPlanFeature,
  setPlanAiCaps, setPlanPhotoLimit, setPlanStorage, storageWords,
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
  // Two tabs (2026-11-02): the plans as cards, and one table to tick what each unlocks.
  const [tab, setTab] = useState<'plans' | 'unlocks'>('plans');
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
      // 0247's storage, likewise only once the column exists.
      if (editing.storage_mb !== undefined) {
        await setPlanStorage(editing.key, editing.storage_mb ?? null);
      }
      // 0163's AI coach ceiling, likewise only once the columns exist.
      if (editing.ai_daily_cap !== undefined) {
        await setPlanAiCaps(editing.key, editing.ai_daily_cap ?? null, editing.ai_monthly_cap ?? null);
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

  /**
   * A starting split, offered only while every plan is identical: the trial
   * and Premium get everything; Standard keeps running the gym (desk, check-in,
   * classes, progress, announcements) and leaves out the coaching side and the
   * extras — what 0108's own Premium blurb promises ("the coaching side too").
   * Asked first, every box stays editable afterwards.
   */
  const suggest = async () => {
    const standard = plans?.find((p) => p.key === 'standard');
    if (!standard) return;
    const off = features.filter((f) => !STANDARD_KEEPS.includes(f.key));
    if (!window.confirm(`Standard would no longer include: ${off.map((f) => f.label).join(', ')}.\n\nFree trial and Premium keep everything. Gyms on Standard lose those parts straight away. Go ahead?`)) return;
    for (const f of off) await toggle('standard', f.key);
  };

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
        <div className="ptabs" role="tablist" aria-label="Plans">
          <button type="button" role="tab" aria-selected={tab === 'plans'} className={tab === 'plans' ? 'on' : ''} onClick={() => setTab('plans')}>
            <Wallet size={14} /> Plans <em>{plans?.filter((p) => p.is_active).length ?? 0}</em></button>
          <button type="button" role="tab" aria-selected={tab === 'unlocks'} className={tab === 'unlocks' ? 'on' : ''} onClick={() => setTab('unlocks')}>
            <Layers size={14} /> What each plan unlocks</button>
        </div>
        <span className="spacer" />
        <button className="btn" onClick={() => setEditing(blank((plans?.length ?? 0) + 1))}>
          <Plus size={15} /> Add a plan
        </button>
      </div>

      {error && <p className="err">{error}</p>}

      {tab === 'unlocks' && (
        <ComparePlans plans={(plans ?? []).filter((p) => p.is_active)} features={features} on={on}
          onToggle={(plan, f) => void toggle(plan, f)} onSuggest={allSame ? () => void suggest() : undefined} />
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
            {editing.storage_mb !== undefined && (
              <div>
                <label htmlFor="pl-st">Storage (GB)</label>
                <input id="pl-st" type="number" min={0.1} step={0.5} value={editing.storage_mb == null ? '' : Math.round((editing.storage_mb / 1024) * 100) / 100}
                  placeholder="no limit" data-plan-storage
                  onChange={(e) => setEditing({ ...editing, storage_mb: e.target.value === '' ? null : Math.max(100, Math.round(Number(e.target.value) * 1024)) })} />
              </div>
            )}
            {editing.ai_daily_cap !== undefined && (
              <>
                <div>
                  <label htmlFor="pl-aid">AI coach: most a member a day</label>
                  <input id="pl-aid" type="number" min={1} max={500} value={editing.ai_daily_cap ?? ''}
                    placeholder="no ceiling (500)"
                    onChange={(e) => setEditing({ ...editing, ai_daily_cap: e.target.value === '' ? null : Number(e.target.value) })} />
                </div>
                <div>
                  <label htmlFor="pl-aim">AI coach: most a gym a month</label>
                  <input id="pl-aim" type="number" min={1} max={100000} value={editing.ai_monthly_cap ?? ''}
                    placeholder="no ceiling (100,000)"
                    onChange={(e) => setEditing({ ...editing, ai_monthly_cap: e.target.value === '' ? null : Number(e.target.value) })} />
                </div>
              </>
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
          {editing.ai_daily_cap !== undefined && (editing.ai_daily_cap !== null || editing.ai_monthly_cap !== null) && (
            <p className="meta" style={{ marginTop: 10 }}>
              A gym on this plan can set its AI coach limits up to these and no higher; a gym already above
              them is brought down to them when you save, and its owner sees the ceiling on Your app.
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

      {tab === 'plans' && <div className="plan-grid">
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
            {plan.ai_daily_cap != null && <span className="chip">AI coach {plan.ai_daily_cap}/day{plan.ai_monthly_cap != null ? ` · ${plan.ai_monthly_cap.toLocaleString('en-PH')}/month` : ''}</span>}
            <span className="chip">{plan.max_staff === null ? 'Any number on the desk' : `Up to ${plan.max_staff} on the desk`}</span>
            {plan.storage_mb !== undefined && <span className="chip" data-plan-storage-chip>{plan.storage_mb === null ? 'No storage limit' : `${storageWords(plan.storage_mb)} storage`}</span>}
            {plan.max_photos !== undefined && <span className="chip">{plan.max_photos === null ? 'Any number of photos' : `Up to ${plan.max_photos} photos`}</span>}
          </div>
          <div className="plan-unlocks">
            <div className="row" style={{ gap: 8 }}>
              <span className="section-title grow" style={{ margin: 0 }}>Unlocks {unlocked} of {features.length}</span>
              <button type="button" className="app-link" onClick={() => setTab('unlocks')}>Change</button>
            </div>
            <span className="app-meter" aria-hidden="true"><i style={{ width: `${features.length ? (unlocked / features.length) * 100 : 0}%` }} /></span>
            {unlocked < features.length && (
              <p className="plan-locked"><Lock size={12} /> Not included: {features.filter((f) => !on(plan.key, f.key)).map((f) => f.label).join(', ')}</p>
            )}
          </div>
          <div className="plan-foot">
            <button className="btn ghost" onClick={() => setEditing(plan)}>Edit the plan</button>
            {plan.is_active && <button className="btn ghost" onClick={() => void retire(plan)}>Retire</button>}
          </div>
        </div>
        );
      })}
      </div>}

      {plans?.length === 0 && (
        <p className="empty">
          Nothing is on sale. A gym cannot be created until at least one plan exists.
        </p>
      )}
    </>
  );
}

/** What Standard keeps under the suggested split: running the gym day to day. */
const STANDARD_KEEPS = ['front_desk', 'checkin', 'classes', 'progress', 'push', 'requests', 'shop'];

/**
 * Every active plan side by side: price, limits, and each feature ticked or
 * not, with the rows that differ marked — the answer to "what is the
 * difference between them?" in one look.
 */
function ComparePlans({ plans, features, on, onToggle, onSuggest }: {
  plans: PlatformPlan[]; features: PlatformFeature[]; on: (plan: string, feature: string) => boolean;
  onToggle: (plan: string, feature: string) => void; onSuggest?: () => void;
}) {
  if (plans.length < 2) return null;
  const differs = (f: string) => new Set(plans.map((p) => on(p.key, f))).size > 1;
  const money = (p: PlatformPlan) => (p.price_monthly === null ? 'No price yet' : Number(p.price_monthly) === 0 ? 'Free' : `${peso(p.price_monthly)}/mo`);
  const nDiff = features.filter((f) => differs(f.key)).length;
  return (
    <section className="card" style={{ marginBottom: 16 }}>
      <div className="row" style={{ gap: 10 }}>
        <h2 className="section-title grow" style={{ margin: 0 }}><Layers size={14} /> What each plan gets</h2>
        <span className="muted" style={{ fontSize: 12.5 }}>{nDiff === 0 ? 'No feature differs between plans yet' : `${nDiff} feature${nDiff === 1 ? ' differs' : 's differ'}`} · click a cell to include or take out — gyms on that plan follow at once</span>
        {onSuggest && <button className="btn ghost" onClick={onSuggest}>Use a suggested split</button>}
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="compare" style={{ marginTop: 10 }}>
          <thead>
            <tr><th></th>{plans.map((p) => <th key={p.key}>{p.name}</th>)}</tr>
          </thead>
          <tbody>
            <tr><td>Price</td>{plans.map((p) => <td key={p.key}>{money(p)}</td>)}</tr>
            <tr><td>Free days</td>{plans.map((p) => <td key={p.key}>{p.trial_days ?? '—'}</td>)}</tr>
            <tr><td>Members</td>{plans.map((p) => <td key={p.key}>{p.max_members ?? 'Any'}</td>)}</tr>
            <tr><td>Desk accounts</td>{plans.map((p) => <td key={p.key}>{p.max_staff ?? 'Any'}</td>)}</tr>
            {plans.some((p) => p.storage_mb !== undefined) && (
              <tr><td>Storage for videos and photos</td>{plans.map((p) => <td key={p.key}>{storageWords(p.storage_mb)}</td>)}</tr>
            )}
            {features.map((f) => (
              <tr key={f.key} className={differs(f.key) ? 'diff' : ''}>
                <td title={f.description}>{f.label}</td>
                {plans.map((p) => {
                  const yes = on(p.key, f.key);
                  return (
                    <td key={p.key} className={yes ? 'yes' : 'no'}>
                      <button type="button" className={`cell-tick${yes ? ' on' : ''}`} aria-pressed={yes}
                        aria-label={`${f.label} on ${p.name}: ${yes ? 'included' : 'not included'}`} onClick={() => onToggle(p.key, f.key)}>
                        {yes ? <Check size={14} /> : <Minus size={14} />}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
