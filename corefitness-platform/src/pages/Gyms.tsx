import { useCallback, useEffect, useState } from 'react';
import {
  createGym, listGyms, setGymPlan, setGymStatus, slugFor, type PlatformGym,
} from '../lib/platform';

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

  const load = useCallback(async () => {
    try {
      setGyms(await listGyms());
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

  const suspend = (gym: PlatformGym) => {
    // A suspension stops a gym trading, so it is never done without a reason —
    // 0106 refuses a blank one, and the gym's owner is told this sentence.
    const reason = window.prompt(`Why is ${gym.name} being suspended? The gym is told.`);
    if (reason === null) return;
    void act(gym.id, () => setGymStatus(gym.id, 'suspended', reason));
  };

  const plan = (gym: PlatformGym) => {
    const next = window.prompt(`Plan for ${gym.name} — trial, standard or premium`, gym.plan);
    if (next === null) return;
    const paid = window.prompt('Paid until (YYYY-MM-DD), or leave blank for none', gym.paid_until ?? '');
    if (paid === null) return;
    void act(gym.id, () => setGymPlan(gym.id, next.trim(), paid.trim() || null));
  };

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
            then edits as its own. Name its owner from the Applications screen, or invite them in the
            admin app once they have an account.
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
        <div className="card" key={gym.id}>
          <div className="row">
            <span className="grow">
              <span className="name">{gym.name}</span>
              <span className="meta">
                /join/{gym.slug} · {gym.members} member{gym.members === 1 ? '' : 's'} · {gym.staff} on the desk
                {' · '}{since(gym.last_activity)}
              </span>
              <span className="meta">
                {gym.plan}{gym.paid_until ? ` · paid to ${day(gym.paid_until)}` : ' · no paid-until date'}
              </span>
            </span>
            {gym.lock_reason && (
              <span className="pill warn">
                {gym.lock_reason === 'suspended' ? 'Suspended' : 'Overdue — read-only'}
              </span>
            )}
            <button className="btn ghost" disabled={busy === gym.id} onClick={() => plan(gym)}>Plan</button>
            {gym.status === 'active' ? (
              <button className="btn ghost" disabled={busy === gym.id} onClick={() => suspend(gym)}>Suspend</button>
            ) : (
              <button className="btn" disabled={busy === gym.id}
                onClick={() => void act(gym.id, () => setGymStatus(gym.id, 'active', ''))}>
                Reactivate
              </button>
            )}
          </div>
        </div>
      ))}
    </>
  );
}
