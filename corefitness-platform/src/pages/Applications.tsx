import { useCallback, useEffect, useState } from 'react';
import {
  createGym, listApplications, rejectApplication, slugFor, splitName, type Application,
} from '../lib/platform';
import InviteOwner from '../components/InviteOwner';
import Ask from '../components/Ask';

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

  /** Which answer is being given to which application. */
  const [answering, setAnswering] = useState<{ app: Application; what: 'in' | 'down' } | null>(null);
  const open = (app: Application, what: 'in' | 'down') =>
    setAnswering(answering?.app.id === app.id && answering.what === what ? null : { app, what });

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
        <div key={app.id}>
          <div className="card">
            <div className="row">
            <span className="grow">
              <span className="name">{app.gym_name}</span>
              <span className="meta">
                {app.owner_name} · {app.email} · {app.phone}
                {app.address ? ` · ${app.address}` : ''}
                {app.member_estimate != null ? ` · about ${app.member_estimate} members` : ''}
              </span>
              <span className="meta muted">Applied {when(app.created_at)}</span>
              {/* 0111: the same gym filling the form five times used to be five
                  unrelated rows. Neither of these blocks anything — they are
                  the two things worth knowing before you create a gym. */}
              {app.already_a_gym && (
                <span className="meta" style={{ color: 'var(--warn)' }}>
                  This email already owns a gym here. Letting them in again makes a second one —
                  they may have meant to ask for something else.
                </span>
              )}
              {!!app.duplicates && app.duplicates > 0 && (
                <span className="meta" style={{ color: 'var(--warn)' }}>
                  Applied {app.duplicates + 1} times in total, from this email or this gym name.
                </span>
              )}
              {app.message && <span className="meta">“{app.message}”</span>}
              {app.status === 'rejected' && app.reason && (
                <span className="meta">Turned down: {app.reason}</span>
              )}
            </span>
            {app.status === 'pending' ? (
              <span className="actions">
                <button className="btn" onClick={() => open(app, 'in')}>
                  Let them in
                </button>
                <button className="btn ghost" onClick={() => open(app, 'down')}>
                  Turn down
                </button>
              </span>
            ) : (
              <span className="pill">{app.status === 'approved' ? 'Let in' : 'Turned down'}</span>
            )}
            </div>
          </div>

          {answering?.app.id === app.id && answering.what === 'in' && (
            <Ask
              title={`Let ${app.gym_name} in?`}
              blurb="The link name is what their members type — corefitness-gym.vercel.app/join/…  Small letters, numbers and dashes, and it cannot be changed casually afterwards."
              fields={[{ key: 'slug', label: 'Link name', required: true, initial: slugFor(app.gym_name) }]}
              confirmLabel="Create the gym"
              onCancel={() => setAnswering(null)}
              onConfirm={async (v) => {
                const gymId = await createGym(app.gym_name, v.slug.trim(), app.id);
                setAnswering(null);
                await load();
                // The gym exists; it has nobody in it. Straight on to the owner.
                setNaming({ gymId, app });
              }}
            />
          )}

          {answering?.app.id === app.id && answering.what === 'down' && (
            <Ask
              title={`Turn ${app.gym_name} down?`}
              blurb="They are shown the reason you give, so write it for them to read."
              fields={[{ key: 'reason', label: 'Why', required: true,
                placeholder: 'Outside the area we can support for now' }]}
              confirmLabel="Turn them down"
              onCancel={() => setAnswering(null)}
              onConfirm={async (v) => {
                await rejectApplication(app.id, v.reason.trim());
                setAnswering(null);
                await load();
              }}
            />
          )}
        </div>
      ))}
    </>
  );
}
