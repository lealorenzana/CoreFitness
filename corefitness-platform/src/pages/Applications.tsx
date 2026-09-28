import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, ClipboardList, Clock, Inbox, KeyRound, Link2, Mail, Phone, Settings2, Sparkles, Users, XCircle } from 'lucide-react';
import {
  createGym, listApplications, rejectApplication, slugFor, splitName, type Application,
} from '../lib/platform';
import InviteOwner from '../components/InviteOwner';
import Ask from '../components/Ask';
import GymMark from '../components/GymMark';
import Modal from '../components/Modal';
import Tiles from '../components/Tiles';

const when = (iso: string) =>
  new Date(iso).toLocaleDateString('en-PH', { day: 'numeric', month: 'short', year: 'numeric' });
const daysSince = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));

type Show = 'pending' | 'approved' | 'rejected' | 'all';
type Dialog = { kind: 'in' | 'down'; app: Application } | { kind: 'owner'; gymId: string; app: Application };

/**
 * Gyms asking to join, from the website — in the admin app's layout
 * (2026-09-28): figures that filter, the list beside what letting a gym in
 * does, and each answer in a popup. Letting a gym in goes straight on to
 * naming its owner, in the next popup.
 */
export default function Applications() {
  const [apps, setApps] = useState<Application[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [show, setShow] = useState<Show>('pending');
  const [dialog, setDialog] = useState<Dialog | null>(null);

  const load = useCallback(async () => {
    try { setApps(await listApplications()); setError(null); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load the applications'); }
  }, []);
  useEffect(() => { void (async () => { await load(); })(); }, [load]);
  const close = useCallback(() => setDialog(null), []);

  const all = apps ?? [];
  const of = (s: Show) => (s === 'all' ? all : all.filter((a) => a.status === s));
  const waiting = of('pending');
  const oldest = waiting.reduce<Application | null>((o, a) => (!o || a.created_at < o.created_at ? a : o), null);
  const shown = of(show).sort((a, b) => (show === 'pending' ? a.created_at.localeCompare(b.created_at) : b.created_at.localeCompare(a.created_at)));
  const pick = (s: Show) => setShow(show === s ? 'all' : s);

  return (
    <>
      <Tiles items={[
        { icon: Inbox, value: apps ? String(waiting.length) : '…', label: 'Waiting for you', act: waiting.length > 0, onClick: () => pick('pending'), on: show === 'pending' },
        { icon: CheckCircle2, value: apps ? String(of('approved').length) : '…', label: 'Let in', onClick: () => pick('approved'), on: show === 'approved' },
        { icon: XCircle, value: apps ? String(of('rejected').length) : '…', label: 'Turned down', onClick: () => pick('rejected'), on: show === 'rejected' },
        { icon: Users, value: apps ? waiting.reduce((n, a) => n + (a.member_estimate ?? 0), 0).toLocaleString('en-PH') : '…', label: 'Members they would bring' },
        { icon: Clock, value: oldest ? `${daysSince(oldest.created_at)}d` : '—', label: oldest ? `Oldest: ${oldest.gym_name}` : 'Nobody waiting', act: !!oldest && daysSince(oldest.created_at) >= 3 },
      ]} />

      {error && <p className="err">{error}</p>}

      <div className="split">
        <section className="card split-main">
          <div className="ov-head">
            <h2 className="section-title"><ClipboardList size={14} /> {show === 'pending' ? 'Waiting for an answer' : show === 'approved' ? 'Let in' : show === 'rejected' ? 'Turned down' : 'Every application'}</h2>
            <div className="filters" style={{ marginLeft: 'auto' }}>
              {([['pending', 'Waiting'], ['approved', 'Let in'], ['rejected', 'Turned down'], ['all', 'All']] as [Show, string][]).map(([s, label]) => (
                <button key={s} type="button" className={show === s ? 'on' : ''} onClick={() => setShow(s)}>{label}<b>{apps ? of(s).length : ''}</b></button>
              ))}
            </div>
          </div>
          {apps === null ? <p className="empty">Loading…</p> : shown.length === 0 ? (
            <p className="empty"><Inbox size={22} className="empty-icon" />{show === 'pending' ? 'No gym is waiting for an answer.' : 'None here.'}</p>
          ) : (
            <div className="ov-scroll">
              {shown.map((app) => (
                <div key={app.id} className="app-row">
                  <GymMark name={app.gym_name} logoUrl={null} accent="violet" size={42} />
                  <span className="app-text">
                    <span className="name">{app.gym_name}
                      {app.status === 'pending' && daysSince(app.created_at) >= 3 && <span className="pill warn" style={{ marginLeft: 8 }}>{daysSince(app.created_at)} days waiting</span>}
                    </span>
                    <span className="app-facts">
                      <span><Users size={12} />{app.owner_name}</span>
                      <span><Mail size={12} />{app.email}</span>
                      {app.phone && <span><Phone size={12} />{app.phone}</span>}
                      {app.address && <span>{app.address}</span>}
                      {app.member_estimate != null && <span>about {app.member_estimate} members</span>}
                      <span className="muted">Applied {when(app.created_at)}</span>
                    </span>
                    {/* 0111: the two things worth knowing before you create a gym. Neither blocks anything. */}
                    {app.already_a_gym && <span className="meta" style={{ color: 'var(--warn)' }}>This email already owns a gym here. Letting them in again makes a second one.</span>}
                    {!!app.duplicates && app.duplicates > 0 && <span className="meta" style={{ color: 'var(--warn)' }}>Applied {app.duplicates + 1} times in total, from this email or this gym name.</span>}
                    {app.message && <span className="meta">“{app.message}”</span>}
                    {app.status === 'rejected' && app.reason && <span className="meta">Turned down: {app.reason}</span>}
                  </span>
                  {app.status === 'pending' ? (
                    <span className="actions">
                      <button className="btn" onClick={() => setDialog({ kind: 'in', app })}>Let them in</button>
                      <button className="btn ghost" onClick={() => setDialog({ kind: 'down', app })}>Turn down</button>
                    </span>
                  ) : <span className={`pill${app.status === 'approved' ? ' ok' : ''}`}>{app.status === 'approved' ? 'Let in' : 'Turned down'}</span>}
                </div>
              ))}
            </div>
          )}
        </section>

        <aside className="split-side">
          <section className="card">
            <h2 className="section-title"><Sparkles size={14} /> Letting a gym in</h2>
            <ol className="steps">
              <li><Link2 size={15} /><span><b>You pick its link</b>The address its members type: …/join/its-name.</span></li>
              <li><KeyRound size={15} /><span><b>You name the owner</b>They get a temporary password, shown to you once.</span></li>
              <li><Settings2 size={15} /><span><b>They set the gym up</b>Name, logo and colours at /admin/setup — none of Core Fitness's.</span></li>
              <li><Clock size={15} /><span><b>Their free trial runs</b>It ends on its own date; reminders go before it does.</span></li>
            </ol>
          </section>
          <section className="card side-fill">
            <h2 className="section-title"><Inbox size={14} /> Where they come from</h2>
            <p className="meta" style={{ marginTop: 0 }}>The Apply form on the Core Fitness website. Each answer is recorded — a gym turned down is shown the reason you give.</p>
            <div className="mini-figs">
              <span><b>{all.length}</b>applied, ever</span>
              <span><b>{all.length ? `${Math.round((of('approved').length / all.length) * 100)}%` : '—'}</b>let in</span>
            </div>
          </section>
        </aside>
      </div>

      <Modal open={dialog?.kind === 'in'} onClose={close} size="sm" label="Let them in">
        {dialog?.kind === 'in' && (
          <Ask
            title={`Let ${dialog.app.gym_name} in?`}
            blurb="The link name is what their members type — …/join/…  Small letters, numbers and dashes, and it cannot be changed casually afterwards."
            fields={[{ key: 'slug', label: 'Link name', required: true, initial: slugFor(dialog.app.gym_name) }]}
            confirmLabel="Create the gym"
            onCancel={close}
            onConfirm={async (v) => {
              const app = dialog.app;
              const gymId = await createGym(app.gym_name, v.slug.trim(), app.id);
              await load();
              // The gym exists; it has nobody in it. Straight on to the owner.
              setDialog({ kind: 'owner', gymId, app });
            }}
          />
        )}
      </Modal>

      <Modal open={dialog?.kind === 'down'} onClose={close} size="sm" label="Turn down">
        {dialog?.kind === 'down' && (
          <Ask
            title={`Turn ${dialog.app.gym_name} down?`}
            blurb="They are shown the reason you give, so write it for them to read."
            fields={[{ key: 'reason', label: 'Why', required: true, placeholder: 'Outside the area we can support for now' }]}
            confirmLabel="Turn them down"
            onCancel={close}
            onConfirm={async (v) => { await rejectApplication(dialog.app.id, v.reason.trim()); setDialog(null); await load(); }}
          />
        )}
      </Modal>

      <Modal open={dialog?.kind === 'owner'} onClose={close} size="md" label="Name the owner">
        {dialog?.kind === 'owner' && (
          <InviteOwner gymId={dialog.gymId} gymName={dialog.app.gym_name}
            initial={{ ...splitName(dialog.app.owner_name), email: dialog.app.email, phone: dialog.app.phone }}
            onCancel={close} onDone={close} />
        )}
      </Modal>
    </>
  );
}
