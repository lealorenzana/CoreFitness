import { useCallback, useEffect, useState } from 'react';
import { Ban, FileText, Gavel, Search, ShieldCheck, Users } from 'lucide-react';
import {
  appealFileUrl, appealsList, decideAppeal, emailSuspension, explain, liftSuspension, searchPeople, suspendPerson, suspendedPeople,
  type AppealRow, type PersonRow, type SuspendedRow,
} from '../lib/platform';
import Modal from '../components/Modal';
import Ask from '../components/Ask';
import SkelRows from '../components/ui/SkelRows';

const when = (iso: string) => new Date(iso).toLocaleDateString('en-PH', { day: 'numeric', month: 'short', year: 'numeric' });
const ROLE: Record<string, string> = { admin: 'Owner', staff: 'Front desk', trainer: 'Coach', member: 'Member' };

type Dialog = { kind: 'suspend' | 'lift'; person: { id: string; name: string | null; email: string } }
  | { kind: 'appeal'; appeal: AppealRow; lift: boolean };

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
  const [appeals, setAppeals] = useState<AppealRow[] | null>(null);
  const [appealsError, setAppealsError] = useState<string | null>(null);

  const loadSuspended = useCallback(async () => {
    try { setSuspended(await suspendedPeople()); setError(null); } catch (e) { setError(explain(e, '0226')); setSuspended([]); }
    // 0265: appeals. Before it is pasted the section says so, and the rest of the page works as before.
    try { setAppeals(await appealsList()); setAppealsError(null); } catch (e) { setAppealsError(explain(e, '0265')); setAppeals([]); }
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
      {/* The page is a search (2026-11-22): the box to type in leads, wide, with what it found beside it; the
          suspended list is the rail. A "—" figure that only said "type something" is gone. */}
      <label className="ppl-find">
        <Search size={18} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find anyone by name or email, at least 2 letters" aria-label="Find a person" autoFocus />
        <span className="meta">{rows ? `${rows.length} found` : 'Members, coaches, desks, owners and applicants, every gym'}</span>
      </label>
      {error && <p className="err">{error}</p>}
      {note && <p className="meta" data-mail-note>{note}</p>}

      <div className="ppl">
        <section className="card" data-people-search>
          <h2 className="section-title"><Users size={14} /> {rows ? `Found, ${rows.length}` : 'Results'}</h2>
          {rows === null ? <p className="empty">Type in the box above. Every gym is searched at once.</p>
            : rows.length === 0 ? <p className="empty">Nobody matches.</p> : rows.map((p) => (
              <div key={p.id} className="fb-row" data-person={p.email}>
                <span className="grow">
                  <span className="name">{p.name ?? p.email}
                    {p.suspended_reason && <span className="pill warn" style={{ marginLeft: 8 }}>Suspended</span>}
                    {p.platform_admin && <span className="pill" style={{ marginLeft: 8 }}>Core Fitness admin</span>}
                  </span>
                  <span className="meta" style={{ display: 'block' }}>{p.email}</span>
                  <span className="meta">
                    {p.gyms.length ? p.gyms.map((g) => `${ROLE[g.role] ?? g.role} at ${g.gym}${g.status !== 'active' ? ` (${g.status})` : ''}`).join(' · ') : p.applicant ? 'Applicant, no gym yet' : 'No gym'}
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

        {/* Appeals (0265, owner 2026-11-23): once per suspension; any platform admin decides, with a note the person
            reads. Their gyms are not told an appeal exists, only the outcome (a lift tells them as 0226 does). */}
        <section className="card" data-people-appeals>
          <h2 className="section-title"><Gavel size={14} /> Appeals{appeals ? `, ${appeals.filter((a) => a.status === 'pending').length} waiting` : ''}</h2>
          {appealsError && <p className="err">{appealsError}</p>}
          {appeals === null ? <SkelRows label="Loading…" /> : appeals.length === 0 ? <p className="empty">No appeals. A suspended person can appeal once, from the app.</p>
            : appeals.map((a) => (
              <div key={a.id} className="fb-row" data-appeal={a.email ?? a.id} style={{ alignItems: 'flex-start' }}>
                <span className="grow">
                  <span className="name">{a.name ?? a.email}
                    <span className={`pill ${a.status === 'pending' ? 'warn' : ''}`} style={{ marginLeft: 8 }}>
                      {a.status === 'pending' ? 'Waiting' : a.status === 'lifted' ? 'Lifted' : 'Kept'}</span>
                  </span>
                  <span className="meta" style={{ display: 'block' }}>{a.email} · sent {when(a.created_at)}</span>
                  <span className="meta" style={{ display: 'block', marginTop: 6 }}>Suspended {when(a.suspended_at)}: {a.reason}</span>
                  <span style={{ display: 'block', marginTop: 8, whiteSpace: 'pre-wrap', lineHeight: 1.55 }} data-appeal-statement>{a.statement}</span>
                  {a.attachment && (
                    <button type="button" className="btn ghost" style={{ marginTop: 8 }}
                      onClick={() => void appealFileUrl(a.attachment!).then((u) => (u ? window.open(u, '_blank', 'noopener') : setNote('The file could not be opened.')))}>
                      <FileText size={13} /> Open their file</button>
                  )}
                  {a.decision_note && <span className="meta" style={{ display: 'block', marginTop: 8 }}>Decided {a.decided_at ? when(a.decided_at) : ''}: {a.decision_note}</span>}
                </span>
                {a.status === 'pending' && (
                  <span className="actions" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                    <button type="button" className="btn" onClick={() => setDialog({ kind: 'appeal', appeal: a, lift: true })} data-appeal-lift>Lift it</button>
                    <button type="button" className="btn ghost" onClick={() => setDialog({ kind: 'appeal', appeal: a, lift: false })} data-appeal-keep>Keep suspended</button>
                  </span>
                )}
              </div>
            ))}
        </section>

        <section className="card" data-people-suspended>
          <h2 className="section-title"><Ban size={14} /> Suspended{suspended ? `, ${suspended.length}` : ''}</h2>
          {suspended === null ? <SkelRows label="Loading…" /> : suspended.length === 0 ? <p className="empty">Nobody is suspended.</p>
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
            fields={[{ key: 'reason', label: 'Why, they read this', required: true, placeholder: 'Payments reported as fraudulent by two gyms' }]}
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
      <Modal open={dialog?.kind === 'appeal'} onClose={close} size="sm" label="Decide the appeal">
        {dialog?.kind === 'appeal' && (
          <Ask
            title={dialog.lift ? `Lift ${dialog.appeal.name ?? dialog.appeal.email}'s suspension?` : `Keep ${dialog.appeal.name ?? dialog.appeal.email} suspended?`}
            blurb={dialog.lift
              ? 'Their appeal is accepted: they can sign in to every app again, and their gyms are told the suspension was lifted.'
              : 'Their appeal is turned down and the suspension stays. They read your note on their suspended screen. Each suspension is appealed once.'}
            fields={[{ key: 'note', label: 'Your decision, they read this', required: true,
              placeholder: dialog.lift ? 'A one-off, and the password was changed.' : 'Three gyms reported the same messages.' }]}
            confirmLabel={dialog.lift ? 'Lift the suspension' : 'Keep it'}
            onCancel={close}
            onConfirm={async (v) => {
              const { appeal, lift } = dialog;
              await decideAppeal(appeal.id, lift, v.note.trim());
              setDialog(null);
              await refresh();
              if (lift && appeal.email) setNote(await emailSuspension({ email: appeal.email, name: appeal.name }, true));
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
