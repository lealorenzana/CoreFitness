import { useCallback, useEffect, useState } from 'react';
import {
  createGym, listGyms, listPlatformPlans, setGymPlan, setGymStatus, slugFor,
  type PlatformGym, type PlatformPlan,
} from '../lib/platform';
import InviteOwner from '../components/InviteOwner';
import Ask from '../components/Ask';

const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-PH', { day: 'numeric', month: 'short', year: 'numeric' }) : null;

/** "3 days ago" — a gym nobody has used in a month is the thing worth seeing. */
function since(iso: string | null): string {
  if (!iso) return 'no activity yet';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'active today';
  if (days === 1) return 'active yesterday';
  if (days < 30) return `active ${days} days ago`;
  const months = Math.floor(days / 30);
  return `quiet for ${months} month${months === 1 ? '' : 's'}`;
}

/**
 * The gyms on Core Fitness: who they are, how busy, what they pay, and the two
 * levers the platform has — suspend, and the plan they are on.
 *
 * Member and staff counts, never members: the platform is the processor of a
 * gym's data, not its controller (docs/TENANCY.md).
 */
export default function Gyms() {
  const [gyms, setGyms] = useState<PlatformGym[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', slug: '' });
  /** The gym whose owner is being named, if any. */
  const [inviting, setInviting] = useState<PlatformGym | null>(null);

  /** The tiers on offer (0108). Retired ones are not offered, but a gym on one keeps it. */
  const [plans, setPlans] = useState<PlatformPlan[]>([]);

  const load = useCallback(async () => {
    try {
      const [g, p] = await Promise.all([listGyms(), listPlatformPlans()]);
      setGyms(g);
      setPlans(p);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the gyms');
    }
  }, []);

  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  const act = async (id: string, what: () => Promise<unknown>) => {
    setBusy(id);
    setError(null);
    try {
      await what();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not work');
    } finally {
      setBusy(null);
    }
  };

  /** Which question is open on which gym's row: 'suspend' or 'plan'. */
  const [asking, setAsking] = useState<{ gym: PlatformGym; what: 'suspend' | 'plan' } | null>(null);
  const open = (gym: PlatformGym, what: 'suspend' | 'plan') =>
    setAsking(asking?.gym.id === gym.id && asking.what === what ? null : { gym, what });

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await createGym(form.name.trim(), (form.slug || slugFor(form.name)).trim());
      setForm({ name: '', slug: '' });
      setAdding(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the gym');
    }
  };

  return (
    <>
      <div className="row" style={{ marginBottom: 12 }}>
        <span className="grow muted" style={{ fontSize: 13 }}>
          {gyms ? `${gyms.length} gym${gyms.length === 1 ? '' : 's'}` : 'Loading…'}
        </span>
        <button className="btn ghost" onClick={() => setAdding((v) => !v)}>
          {adding ? 'Cancel' : 'Add a gym'}
        </button>
      </div>

      {adding && (
        <form className="card" onSubmit={add}>
          <div className="name">A gym that is not applying through the website</div>
          <div className="meta">
            It opens with Core Fitness's own plans, point rules, badges and settings, which the gym
            then edits as its own. Its name, address and logo stay blank — the owner fills those in
            when they first sign in. Name the owner on the gym's row afterwards; until you do, nobody
            can sign into it.
          </div>
          <div className="fields">
            <div>
              <label htmlFor="gym-name">Gym name</label>
              <input id="gym-name" value={form.name} required
                onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label htmlFor="gym-slug">Link name (corefitness-gym.vercel.app/join/…)</label>
              <input id="gym-slug" value={form.slug} placeholder={slugFor(form.name) || 'harbour-strength'}
                onChange={(e) => setForm({ ...form, slug: e.target.value })} />
            </div>
          </div>
          <div style={{ height: 12 }} />
          <button className="btn" type="submit">Create the gym</button>
        </form>
      )}

      {error && <p className="err">{error}</p>}

      {gyms?.length === 0 && <p className="empty">No gyms yet.</p>}

      {gyms?.map((gym) => (
        <div key={gym.id}>
          <div className="card">
            <div className="row">
              <span className="grow">
                <span className="name">{gym.name}</span>
                <span className="meta">
                  /join/{gym.slug} · {gym.members} member{gym.members === 1 ? '' : 's'} · {gym.staff} on the desk
                  {' · '}{since(gym.last_activity)}
                </span>
                <span className="meta">
                  {gym.plan_name ?? gym.plan}
                  {gym.max_members !== null && ` · ${gym.members} of ${gym.max_members} members`}
                  {gym.paid_until
                    ? ` · paid to ${day(gym.paid_until)}${
                        gym.days_left !== null && gym.days_left < 0 ? ` (${-gym.days_left} days late)`
                        : gym.days_left !== null && gym.days_left <= 14 ? ` (${gym.days_left} days left)` : ''}`
                    : ' · no paid-until date'}
                  {Number(gym.paid_total) > 0 && ` · ₱${Number(gym.paid_total).toLocaleString('en-PH')} paid in all`}
                  {/* The two states that mean "this gym is not open yet", in the
                      order they are fixed: no owner, then owner has not set up. */}
                  {gym.owners === 0
                    ? ' · nobody can sign in yet'
                    : !gym.onboarded ? ' · the owner has not set the gym up yet' : ''}
                </span>
              </span>
              {gym.lock_reason && (
                <span className="pill warn">
                  {gym.lock_reason === 'suspended' ? 'Suspended' : 'Overdue — read-only'}
                </span>
              )}
              <span className="actions">
                {gym.owners === 0 && (
                  <button className="btn" disabled={busy === gym.id}
                    onClick={() => setInviting(inviting?.id === gym.id ? null : gym)}>
                    {inviting?.id === gym.id ? 'Cancel' : 'Invite the owner'}
                  </button>
                )}
                <button className="btn ghost" disabled={busy === gym.id}
                  onClick={() => open(gym, 'plan')}>Plan</button>
                {gym.status === 'active' ? (
                  <button className="btn ghost" disabled={busy === gym.id}
                    onClick={() => open(gym, 'suspend')}>Suspend</button>
                ) : (
                  <button className="btn" disabled={busy === gym.id}
                    onClick={() => void act(gym.id, () => setGymStatus(gym.id, 'active', ''))}>
                    Reactivate
                  </button>
                )}
              </span>
            </div>
          </div>

          {asking?.gym.id === gym.id && asking.what === 'suspend' && (
            <Ask
              title={`Suspend ${gym.name}?`}
              blurb="The gym goes read-only: its desk can still look things up, but nothing can be written. Its owner is shown the reason you give, so write it for them."
              fields={[{ key: 'reason', label: 'Why', required: true,
                placeholder: 'Did not pay for three months' }]}
              confirmLabel="Suspend the gym"
              onCancel={() => setAsking(null)}
              onConfirm={async (v) => {
                await setGymStatus(gym.id, 'suspended', v.reason.trim());
                setAsking(null);
                await load();
              }}
            />
          )}

          {asking?.gym.id === gym.id && asking.what === 'plan' && (
            <Ask
              title={`What plan is ${gym.name} on?`}
              blurb="The plan decides what the gym can use and how many members it may have. The date is better moved by recording a payment on the Money screen — that leaves an amount and a reference behind it."
              fields={[
                {
                  key: 'plan', label: 'Plan', initial: gym.plan,
                  // The plans that exist, not three words typed here. A retired
                  // plan is still listed when this gym is the one on it —
                  // otherwise the picker could not show its own current value.
                  options: plans.filter((p) => p.is_active || p.key === gym.plan).map((p) => p.key),
                },
                { key: 'paid', label: 'Paid until', type: 'date', initial: gym.paid_until ?? '' },
              ]}
              confirmLabel="Save"
              onCancel={() => setAsking(null)}
              onConfirm={async (v) => {
                await setGymPlan(gym.id, v.plan, v.paid.trim() || null);
                setAsking(null);
                await load();
              }}
            />
          )}

          {inviting?.id === gym.id && (
            <InviteOwner
              gymId={gym.id}
              gymName={gym.name}
              onCancel={() => setInviting(null)}
              onDone={() => { setInviting(null); void load(); }}
            />
          )}
        </div>
      ))}
    </>
  );
}
