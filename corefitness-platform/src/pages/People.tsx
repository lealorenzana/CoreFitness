import { useCallback, useEffect, useState } from 'react';
import { Ban, Search, ShieldCheck, Users } from 'lucide-react';
import {
  emailSuspension, explain, liftSuspension, searchPeople, suspendPerson, suspendedPeople,
  type PersonRow, type SuspendedRow,
} from '../lib/platform';
import Tiles from '../components/Tiles';
import Modal from '../components/Modal';
import Ask from '../components/Ask';

const when = (iso: string) => new Date(iso).toLocaleDateString('en-PH', { day: 'numeric', month: 'short', year: 'numeric' });
const ROLE: Record<string, string> = { admin: 'Owner', staff: 'Front desk', trainer: 'Coach', member: 'Member' };

type Dialog = { kind: 'suspend' | 'lift'; person: { id: string; name: string | null; email: string } };

/**
 * People (0226): anyone with a Core Fitness account, across every gym — found
 * by name or email — and the platform's suspension. Suspending blocks the
 * account in every gym and app at once; the person is shown the reason when
 * they sign in and by email; each gym they belong to sees "Suspended by Core
 * Fitness", never the reason. Only this page lifts it.
 */
export default function People() {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<PersonRow[] | null>(null);
  const [suspended, setSuspended] = useState<SuspendedRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);

  const loadSuspended = useCallback(async () => {
    try { setSuspended(await suspendedPeople()); setError(null); } catch (e) { setError(explain(e, '0226')); setSuspended([]); }
  }, []);
  useEffect(() => { void (async () => { await loadSuspended(); })(); }, [loadSuspended]);

  const search = useCallback(async (text: string) => {
    if (text.trim().length < 2) { setRows(null); return; }
    try { setRows(await searchPeople(text.trim())); setError(null); } catch (e) { setError(explain(e, '0226')); }
  }, []);
  useEffect(() => {
    const t = window.setTimeout(() => void search(q), 250);
    return () => window.clearTimeout(t);
  }, [q, search]);

  const refresh = async () => { await loadSuspended(); await search(q); };
  const close = () => setDialog(null);

  return (
    <>
      <Tiles items={[
        { icon: Ban, value: suspended ? String(suspended.length) : '…', label: 'Suspended now', act: !!suspended?.length },
        { icon: Users, value: rows ? String(rows.length) : '—', label: rows ? 'Found' : 'Type a name or email' },
      ]} />
      {error && <p className="err">{error}</p>}
      {note && <p className="meta" data-mail-note>{note}</p>}

      <div className="grid-2" style={{ gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)' }}>
        <section className="card" data-people-search>
          <div className="card-head">
            <h2 className="section-title"><Search size={14} /> Find a person</h2>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or email — at least 2 letters" aria-label="Find a person"
              style={{ width: '100%' }} />
          </div>
          {rows === null ? <p className="empty">Search every gym's members, coaches, desks, owners and applicants.</p>
            : rows.length === 0 ? <p className="empty">Nobody matches.</p> : rows.map((p) => (
              <div key={p.id} className="fb-row" data-person={p.email}>
                <span className="grow">
                  <span className="name">{p.name ?? p.email}
                    {p.suspended_reason && <span className="pill warn" style={{ marginLeft: 8 }}>Suspended</span>}
                    {p.platform_admin && <span className="pill" style={{ marginLeft: 8 }}>Core Fitness admin</span>}
                  </span>
                  <span className="meta" style={{ display: 'block' }}>{p.email}</span>
                  <span className="meta">
                    {p.gyms.length ? p.gyms.map((g) => `${ROLE[g.role] ?? g.role} at ${g.gym}${g.status !== 'active' ? ` (${g.status})` : ''}`).join(' · ') : p.applicant ? 'Applicant — no gym yet' : 'No gym'}
                  </span>
                  {p.suspended_reason && <span className="meta" style={{ display: 'block' }}>Since {when(p.suspended_at!)}: {p.suspended_reason}</span>}
                </span>
                <span className="actions">
                  {p.platform_admin ? null : p.suspended_reason
                    ? <button type="button" className="btn ghost" onClick={() => setDialog({ kind: 'lift', person: p })}>Lift</button>
                    : <button type="button" className="btn ghost" onClick={() => setDialog({ kind: 'suspend', person: p })}>Suspend</button>}
                </span>
              </div>
            ))}
        </section>

        <section className="card" data-people-suspended>
          <h2 className="section-title"><Ban size={14} /> Suspended</h2>
          {suspended === null ? <p className="empty">Loading…</p> : suspended.length === 0 ? <p className="empty">Nobody is suspended.</p>
            : suspended.map((s) => (
              <div key={s.id} className="fb-row" data-suspended={s.email}>
                <span className="grow">
                  <span className="name">{s.name ?? s.email}</span>
                  <span className="meta" style={{ display: 'block' }}>{s.email}{s.gyms.length ? ` · ${s.gyms.join(', ')}` : ''}</span>
                  <span className="meta">Since {when(s.suspended_at)}: {s.reason}</span>
                </span>
                <span className="actions">
                  <button type="button" className="btn ghost" onClick={() => setDialog({ kind: 'lift', person: s })}>Lift</button>
                </span>
              </div>
            ))}
          <p className="meta" style={{ marginTop: 12 }}><ShieldCheck size={12} /> Their gyms see "Suspended by Core Fitness", never the reason. Their records with each gym are unchanged.</p>
        </section>
      </div>

      <Modal open={dialog?.kind === 'suspend'} onClose={close} size="sm" label="Suspend">
        {dialog?.kind === 'suspend' && (
          <Ask
            title={`Suspend ${dialog.person.name ?? dialog.person.email}?`}
            blurb="They are signed out of every app at once and cannot use any gym until you lift it. They are shown this reason, and emailed it; their gyms are told only that Core Fitness suspended them."
            fields={[{ key: 'reason', label: 'Why — they read this', required: true, placeholder: 'Payments reported as fraudulent by two gyms' }]}
            confirmLabel="Suspend the account"
            onCancel={close}
            onConfirm={async (v) => {
              const person = dialog.person;
              await suspendPerson(person.id, v.reason.trim());
              setDialog(null);
              await refresh();
              setNote(await emailSuspension(person, false, v.reason.trim()));
            }}
          />
        )}
      </Modal>
      <Modal open={dialog?.kind === 'lift'} onClose={close} size="sm" label="Lift the suspension">
        {dialog?.kind === 'lift' && (
          <Ask
            title={`Lift the suspension on ${dialog.person.name ?? dialog.person.email}?`}
            blurb="They can sign in to every app again, and their gyms are told."
            fields={[]}
            confirmLabel="Lift it"
            onCancel={close}
            onConfirm={async () => {
              const person = dialog.person;
              await liftSuspension(person.id);
              setDialog(null);
              await refresh();
              setNote(await emailSuspension(person, true));
            }}
          />
        )}
      </Modal>
    </>
  );
}
