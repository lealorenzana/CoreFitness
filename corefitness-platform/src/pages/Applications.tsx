import { useCallback, useEffect, useState } from 'react';
import {
  createGym, listApplications, rejectApplication, slugFor, splitName, type Application,
} from '../lib/platform';
import InviteOwner from '../components/InviteOwner';

const when = (iso: string) =>
  new Date(iso).toLocaleDateString('en-PH', { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * Gyms asking to join, from the website's form.
 *
 * Approving creates the gym, seeded with Core Fitness's plans, rules and badges
 * so it opens working, and then — in the same breath, because a gym nobody can
 * sign into is not really let in — names its owner from what they told us on
 * the website (approve-gym).
 *
 * Nothing here emails them. The owner's sign-in is shown once, to hand over.
 */
export default function Applications() {
  const [apps, setApps] = useState<Application[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [show, setShow] = useState<'pending' | 'all'>('pending');
  /** Set the moment a gym is created: its owner is named next, from the application. */
  const [naming, setNaming] = useState<{ gymId: string; app: Application } | null>(null);

  const load = useCallback(async () => {
    try {
      setApps(await listApplications(show === 'pending' ? 'pending' : undefined));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the applications');
    }
  }, [show]);

  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  const approve = async (app: Application) => {
    const slug = window.prompt(
      `Link name for ${app.gym_name} — members will use corefitness-gym.vercel.app/join/<name>`,
      slugFor(app.gym_name)
    );
    if (slug === null) return;
    setBusy(app.id);
    setError(null);
    try {
      const gymId = await createGym(app.gym_name, slug.trim(), app.id);
      await load();
      // The gym exists; it has nobody in it. Straight on to the owner.
      setNaming({ gymId, app });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the gym');
    } finally {
      setBusy(null);
    }
  };

  const reject = async (app: Application) => {
    const reason = window.prompt(`Why is ${app.gym_name} being turned down? They are told.`);
    if (reason === null) return;
    setBusy(app.id);
    setError(null);
    try {
      await rejectApplication(app.id, reason);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not answer the application');
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <div className="row" style={{ marginBottom: 12 }}>
        <span className="grow muted" style={{ fontSize: 13 }}>
          {apps ? `${apps.length} ${show === 'pending' ? 'waiting' : 'in total'}` : 'Loading…'}
        </span>
        <button className="btn ghost" onClick={() => setShow(show === 'pending' ? 'all' : 'pending')}>
          {show === 'pending' ? 'Show answered too' : 'Waiting only'}
        </button>
      </div>

      {error && <p className="err">{error}</p>}

      {naming && (
        <InviteOwner
          gymId={naming.gymId}
          gymName={naming.app.gym_name}
          initial={{ ...splitName(naming.app.owner_name), email: naming.app.email, phone: naming.app.phone }}
          onCancel={() => setNaming(null)}
          onDone={() => setNaming(null)}
        />
      )}

      {apps?.length === 0 && (
        <p className="empty">
          {show === 'pending' ? 'No gym is waiting for an answer.' : 'Nobody has applied yet.'}
        </p>
      )}

      {apps?.map((app) => (
        <div className="card" key={app.id}>
          <div className="row">
            <span className="grow">
              <span className="name">{app.gym_name}</span>
              <span className="meta">
                {app.owner_name} · {app.email} · {app.phone}
                {app.address ? ` · ${app.address}` : ''}
                {app.member_estimate != null ? ` · about ${app.member_estimate} members` : ''}
              </span>
              <span className="meta muted">Applied {when(app.created_at)}</span>
              {app.message && <span className="meta">“{app.message}”</span>}
              {app.status === 'rejected' && app.reason && (
                <span className="meta">Turned down: {app.reason}</span>
              )}
            </span>
            {app.status === 'pending' ? (
              <>
                <button className="btn" disabled={busy === app.id} onClick={() => void approve(app)}>
                  Let them in
                </button>
                <button className="btn ghost" disabled={busy === app.id} onClick={() => void reject(app)}>
                  Turn down
                </button>
              </>
            ) : (
              <span className="pill">{app.status === 'approved' ? 'Let in' : 'Turned down'}</span>
            )}
          </div>
        </div>
      ))}
    </>
  );
}
