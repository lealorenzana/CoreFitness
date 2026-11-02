import { useEffect, useState } from 'react';
import { Ban, EyeOff, Eye, Layers, PlayCircle, Settings2 } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { listPlatformPlans, setGymPlan, setGymStatus, type PlatformGym, type PlatformPlan } from '../lib/platform';

/**
 * Every control over one gym, in one place (2026-11-02, "full control"): its
 * plan, whether it runs, and whether strangers can find it. Billing, looking
 * inside and the export stay where they were on the page; this is what the
 * owner had to go back to the Gyms list for — or could not do at all (hiding,
 * 0229, had no button until 0231). Every act is the platform's own SQL
 * function, guarded by is_platform_admin() and written to Activity.
 */
export default function ManageGym({ gym, onChanged }: { gym: PlatformGym; onChanged: () => Promise<void> | void }) {
  const [plans, setPlans] = useState<PlatformPlan[]>([]);
  const [plan, setPlan] = useState(gym.plan);
  const [hidden, setHidden] = useState<boolean | null | undefined>(undefined);
  const [reason, setReason] = useState('');
  const [asking, setAsking] = useState<'suspend' | 'archive' | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    void listPlatformPlans().then((p) => setPlans(p.filter((x) => x.is_active || x.key === gym.plan)), () => undefined);
    void supabase.rpc('platform_gym_hidden', { p_gym: gym.id }).then(({ data, error }) => setHidden(error ? null : !!data));
  }, [gym.id, gym.plan]);

  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true); setMsg(null);
    try { await fn(); setMsg(done); await onChanged(); }
    catch (e) { setMsg(e instanceof Error ? e.message : 'That did not work'); }
    finally { setBusy(false); }
  };
  const suspended = gym.lock_reason === 'suspended';
  const chosen = plans.find((p) => p.key === plan);
  const tooSmall = chosen?.max_members != null && gym.members > chosen.max_members;

  return (
    <section className="card manage" data-card="manage">
      <h2 className="section-title"><Settings2 size={14} /> Manage this gym</h2>
      <div className="manage-grid">
        <div className="manage-box">
          <span className="app-lbl"><Layers size={12} /> Plan</span>
          <div className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
            <select value={plan} onChange={(e) => setPlan(e.target.value)} aria-label="Plan">
              {plans.map((p) => <option key={p.key} value={p.key}>{p.name}{p.price_monthly != null ? ` — ₱${Number(p.price_monthly).toLocaleString('en-PH')}/mo` : ''}{p.max_members ? `, ${p.max_members} members` : ''}</option>)}
            </select>
            <button className="btn" disabled={busy || plan === gym.plan} onClick={() => void run(() => setGymPlan(gym.id, plan, gym.paid_until), `Moved to ${chosen?.name ?? plan}.`)}>Move</button>
          </div>
          <span className="app-line muted">{tooSmall
            ? `It has ${gym.members} members — over this plan's ${chosen!.max_members}. Nobody is removed, but no new member gets in until it is under.`
            : 'Its paid-until date stays as it is; the owner sees the new plan at once.'}</span>
        </div>

        <div className="manage-box">
          <span className="app-lbl">{suspended ? <PlayCircle size={12} /> : <Ban size={12} />} Running</span>
          {asking ? (
            <>
              <input value={reason} maxLength={300} placeholder="Why — the gym is told this sentence" aria-label="Reason" onChange={(e) => setReason(e.target.value)} />
              <div className="row" style={{ gap: 8 }}>
                <button className="btn" disabled={busy || reason.trim().length < 3} onClick={() => void run(async () => {
                  await setGymStatus(gym.id, asking === 'suspend' ? 'suspended' : 'archived', reason.trim()); setAsking(null); setReason('');
                }, asking === 'suspend' ? 'Suspended.' : 'Archived.')}>{asking === 'suspend' ? 'Suspend it' : 'Archive it'}</button>
                <button className="btn ghost" onClick={() => { setAsking(null); setReason(''); }}>Cancel</button>
              </div>
            </>
          ) : suspended ? (
            <button className="btn" disabled={busy} onClick={() => void run(() => setGymStatus(gym.id, 'active', ''), 'Running again.')}>Reactivate</button>
          ) : (
            <div className="row" style={{ gap: 8 }}>
              <button className="btn ghost" onClick={() => setAsking('suspend')}>Suspend</button>
              <button className="btn ghost" onClick={() => setAsking('archive')}>Archive</button>
            </div>
          )}
          <span className="app-line muted">{suspended ? 'Suspended: read-only for its owner, desk and members.' : 'Suspend makes it read-only; archive takes it off the service. Both need a reason.'}</span>
        </div>

        <div className="manage-box">
          <span className="app-lbl">{hidden ? <EyeOff size={12} /> : <Eye size={12} />} In the gym lists</span>
          {hidden === null ? <span className="app-line warn">Paste migration 0231 to hide or show a gym.</span> : (
            <button className="btn ghost" disabled={busy || hidden === undefined} onClick={() => void run(async () => {
              const { error } = await supabase.rpc('platform_set_gym_hidden', { p_gym: gym.id, p_hidden: !hidden });
              if (error) throw new Error(error.message);
              setHidden(!hidden);
            }, hidden ? 'Listed again.' : 'Hidden from the lists.')}>{hidden ? 'Show it in the lists' : 'Hide it from the lists'}</button>
          )}
          <span className="app-line muted">{hidden ? 'Hidden: not on the website or Find your gym — its link and code still work.' : 'Listed: anyone can find it on the website and in the app.'}</span>
        </div>
      </div>
      {msg && <p className="meta" style={{ margin: '8px 0 0' }} role="status">{msg}</p>}
    </section>
  );
}
