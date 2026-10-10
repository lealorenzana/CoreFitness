import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, ClipboardList, Clock, Copy, FileCheck2, FileQuestion, Inbox, KeyRound, Layers, Link2, Mail, MapPin, MessageCircle, MessageSquare, Phone, Settings2, Sparkles, Users, XCircle } from 'lucide-react';
import {
  applicationAccounts, createGym, deleteApplicant, documentSummaries, emailApplicant, listApplications, rejectApplication,
  setGymPlan, slugFor, splitName, statusLink, type Application, type DocSummary,
} from '../lib/platform';
import ApplicationDocs from '../components/ApplicationDocs';
import ApplicationThread from '../components/ApplicationThread';
import InviteOwner from '../components/InviteOwner';
import Ask from '../components/Ask';
import GymMark from '../components/GymMark';
import Modal from '../components/Modal';
import Tiles from '../components/Tiles';
import Pagination from '../components/Pagination';
import GymSuggestions from '../components/GymSuggestions';
import MapData from '../components/MapData';
import { usePaged } from '../lib/usePaged';

const when = (iso: string) =>
  new Date(iso).toLocaleDateString('en-PH', { day: 'numeric', month: 'short', year: 'numeric' });
const daysSince = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));

type Show = 'pending' | 'approved' | 'rejected' | 'withdrawn' | 'all';
type Dialog = { kind: 'in' | 'down' | 'talk' | 'docs' | 'delete'; app: Application } | { kind: 'owner'; gymId: string; app: Application };

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
  /** 0187: each application's documents, and which have an account behind them. */
  const [docs, setDocs] = useState<Map<string, DocSummary>>(new Map());
  const [accounts, setAccounts] = useState<Set<string>>(new Set());
  const [mailNote, setMailNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [a, d, acc] = await Promise.all([listApplications(), documentSummaries(), applicationAccounts()]);
      setApps(a); setDocs(d); setAccounts(acc); setError(null);
    }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load the applications'); }
  }, []);
  useEffect(() => { void (async () => { await load(); })(); }, [load]);
  const close = useCallback(() => setDialog(null), []);

  const all = apps ?? [];
  const of = (s: Show) => (s === 'all' ? all : all.filter((a) => a.status === s));
  const waiting = of('pending');
  const oldest = waiting.reduce<Application | null>((o, a) => (!o || a.created_at < o.created_at ? a : o), null);
  const shownAll = of(show).sort((a, b) => (show === 'pending' ? a.created_at.localeCompare(b.created_at) : b.created_at.localeCompare(a.created_at)));
  const paged = usePaged(shownAll);
  const shown = paged.rows;
  const pick = (s: Show) => setShow(show === s ? 'all' : s);

  return (
    <>
      <Tiles items={[
        { icon: Inbox, value: apps ? String(waiting.length) : '…', label: 'Waiting for you', act: waiting.length > 0, onClick: () => pick('pending'), on: show === 'pending' },
        { icon: CheckCircle2, value: apps ? String(of('approved').length) : '…', label: 'Let in', onClick: () => pick('approved'), on: show === 'approved' },
        { icon: XCircle, value: apps ? String(of('rejected').length) : '…', label: 'Turned down', onClick: () => pick('rejected'), on: show === 'rejected' },
        { icon: Users, value: apps ? waiting.reduce((n, a) => n + (a.member_estimate ?? 0), 0).toLocaleString('en-PH') : '…', label: 'Members they say they have',
          tip: 'Each waiting gym\'s own answer to "Roughly how many members?" on the website, added up — the members those gyms would bring onto Core Fitness if you let them in. Their estimate, not a count.' },
        { icon: Clock, value: oldest ? `${daysSince(oldest.created_at)}d` : '—', label: oldest ? `Oldest: ${oldest.gym_name}` : 'Nobody waiting', act: !!oldest && daysSince(oldest.created_at) >= 3 },
      ]} />

      {error && <p className="err">{error}</p>}
      {mailNote && <p className="meta" data-mail-note>{mailNote}</p>}

      <div className="split">
        <section className="card split-main">
          <div className="ov-head">
            <h2 className="section-title"><ClipboardList size={14} /> {show === 'pending' ? 'Waiting for an answer' : show === 'approved' ? 'Let in' : show === 'rejected' ? 'Turned down' : show === 'withdrawn' ? 'Called off' : 'Every application'}</h2>
            <div className="filters" style={{ marginLeft: 'auto' }}>
              {([['pending', 'Waiting'], ['approved', 'Let in'], ['rejected', 'Turned down'], ['withdrawn', 'Called off'], ['all', 'All']] as [Show, string][]).map(([s, label]) => (
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
                      {app.member_estimate != null && <span data-tip="Their own estimate of how many members the gym has">about {app.member_estimate} members</span>}
                      <span className="muted">Applied {when(app.created_at)}</span>
                    </span>
                    {(app.plan_name || app.heard_from) && (
                      <span className="chips">
                        {app.plan_name && <span className="chip"><Layers size={12} /> Wants {app.plan_name}{app.billing === 'yearly' ? ', yearly' : ''}</span>}
                        {app.heard_from && <span className="chip"><Sparkles size={12} /> Heard from {app.heard_from}</span>}
                        {app.contact_pref && <span className="chip"><MessageCircle size={12} /> Prefers {CONTACT[app.contact_pref]}</span>}
                      </span>
                    )}
                    {/* 0154: which version of the gym documents they agreed to. Before 0154 the field is absent — say nothing. */}
                    {app.terms_version !== undefined && (
                      <span className="chips">
                        {app.terms_version
                          ? <span className="chip" data-tip={app.terms_accepted_at ? `Agreed ${when(app.terms_accepted_at)}` : undefined}><FileCheck2 size={12} /> Agreed to gym terms (version of {app.terms_version})</span>
                          : <span className="chip muted" data-tip="Applied before the gym documents were in effect, or the agreement did not reach us"><FileQuestion size={12} /> No agreement to the gym terms recorded</span>}
                      </span>
                    )}
                    <Reach app={app} onTalk={() => setDialog({ kind: 'talk', app })} />
                    {/* 0187: the six documents, and whether there is an account to sign in with. */}
                    {docs.has(app.id) && (
                      <span className="chips">
                        <button type="button" className={`chip${(docs.get(app.id)!.missing.length === 0) ? ' ok' : ''}`} data-docs-chip
                          onClick={() => setDialog({ kind: 'docs', app })}
                          data-tip={docs.get(app.id)!.missing.length ? `Still needed: ${docs.get(app.id)!.missing.join('; ')}` : 'All six verified and in date'}>
                          <FileCheck2 size={12} /> Documents {6 - docs.get(app.id)!.missing.length}/6 verified
                          {docs.get(app.id)!.waiting > 0 && <b className="unread">{docs.get(app.id)!.waiting} to check</b>}
                        </button>
                        <span className="chip muted">{accounts.has(app.id) ? 'Has an account' : 'No account — status link only'}</span>
                      </span>
                    )}
                    {/* 0111: the two things worth knowing before you create a gym. Neither blocks anything. */}
                    {app.already_a_gym && <span className="meta" style={{ color: 'var(--warn)' }}>This email already owns a gym here. Letting them in again makes a second one.</span>}
                    {!!app.duplicates && app.duplicates > 0 && <span className="meta" style={{ color: 'var(--warn)' }}>Applied {app.duplicates + 1} times in total, from this email or this gym name.</span>}
                    {app.message && <span className="meta">“{app.message}”</span>}
                    {app.status === 'rejected' && app.reason && <span className="meta">Turned down: {app.reason}</span>}
                  </span>
                  {app.status === 'pending' ? (
                    <span className="actions">
                      {/* Approve waits for the documents (0187) — the database refuses it too. */}
                      <button className="btn" disabled={!!docs.get(app.id)?.missing.length}
                        data-tip={docs.get(app.id)?.missing.length ? 'Verify all six documents first' : undefined}
                        onClick={() => setDialog({ kind: 'in', app })}>Let them in</button>
                      <button className="btn ghost" onClick={() => setDialog({ kind: 'down', app })}>Turn down</button>
                    </span>
                  ) : (
                    <span className="actions">
                      <span className={`pill${app.status === 'approved' ? ' ok' : ''}`}>{app.status === 'approved' ? 'Let in' : app.status === 'withdrawn' ? 'Called off' : 'Turned down'}</span>
                      {(app.status === 'rejected' || app.status === 'withdrawn') && accounts.has(app.id) && (
                        <button className="btn ghost" onClick={() => setDialog({ kind: 'delete', app })}>Delete their account</button>
                      )}
                    </span>
                  )}
                </div>
              ))}
              <Pagination page={paged.page} perPage={paged.perPage} total={paged.total} noun={paged.total === 1 ? 'application' : 'applications'} onPage={paged.setPage} />
            </div>
          )}
        </section>

        <aside className="split-side">
          <section className="card">
            <h2 className="section-title"><Sparkles size={14} /> Letting a gym in</h2>
            <ol className="steps">
              <li><Link2 size={15} /><span><b>You pick its link</b>The address its members type: …/join/its-name.</span></li>
              <li><FileCheck2 size={15} /><span><b>You verify their documents</b>Permit, DTI/SEC, BIR 2303, barangay clearance, the owner's ID and a photo of the gym's front — Let them in opens once all six are verified.</span></li>
              <li><KeyRound size={15} /><span><b>You name the owner</b>An applicant with an account becomes the owner with the password they chose; anyone else gets a temporary one, shown to you once.</span></li>
              <li><Settings2 size={15} /><span><b>They set the gym up</b>Name, logo and colours at /admin/setup — none of Core Fitness's.</span></li>
              <li><Clock size={15} /><span><b>Their free trial runs</b>It ends on its own date; reminders go before it does.</span></li>
              <li><Copy size={15} /><span><b>They pay from anywhere</b>GCash, Maya or bank, to the details on Settings → How gyms pay. They send the reference and a screenshot from Your plan; you check it and verify it on Money.</span></li>
            </ol>
          </section>
          <section className="card side-fill">
            <h2 className="section-title"><Inbox size={14} /> Where they come from</h2>
            {all.length === 0 ? (
              <p className="meta" style={{ marginTop: 0 }}>Nobody has applied yet. Applications arrive from the Register your gym form on the website.</p>
            ) : (
              <>
                <Breakdown title="How they heard of us" icon={Sparkles} rows={tally(all, (a) => a.heard_from)} total={all.length} />
                <Breakdown title="Where the gym is" icon={MapPin} rows={tally(all, (a) => place(a.address))} total={all.length} />
                <Breakdown title="Plan they asked for" icon={Layers} rows={tally(all, (a) => a.plan_name)} total={all.length} />
              </>
            )}
            <div className="mini-figs">
              <span><b>{all.length}</b>applied, ever</span>
              <span><b>{all.length ? `${Math.round((of('approved').length / all.length) * 100)}%` : '—'}</b>let in</span>
            </div>
          </section>
          <GymSuggestions />
          <MapData />
        </aside>
      </div>

      <Modal open={dialog?.kind === 'in'} onClose={close} size="sm" label="Let them in">
        {dialog?.kind === 'in' && (
          <Ask
            title={`Let ${dialog.app.gym_name} in?`}
            blurb="The link name is what their members type — …/join/…  Small letters, numbers and dashes, and it cannot be changed casually afterwards."
            fields={[
              { key: 'slug', label: 'Link name', required: true, initial: slugFor(dialog.app.gym_name) },
              ...(dialog.app.plan_key && dialog.app.plan_key !== 'trial' && dialog.app.plan_name ? [{
                key: 'start', label: 'Start them on',
                options: [TRIAL_FIRST, `${dialog.app.plan_name} straight away`],
              }] : []),
            ]}
            confirmLabel="Create the gym"
            onCancel={close}
            onConfirm={async (v) => {
              const app = dialog.app;
              const gymId = await createGym(app.gym_name, v.slug.trim(), app.id);
              // Every gym starts on the free trial (0106); the plan they asked
              // for is one more step, only if you choose it here.
              if (v.start && v.start !== TRIAL_FIRST && app.plan_key) await setGymPlan(gymId, app.plan_key, null);
              await load();
              setMailNote(await emailApplicant(app, 'application_approved', `${app.gym_name} is in`,
                `${app.gym_name} is in. Sign in at https://corefitness-admin.vercel.app with the email and password you chose when you applied, and set your gym up.`));
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
            onConfirm={async (v) => {
              const app = dialog.app;
              await rejectApplication(app.id, v.reason.trim()); setDialog(null); await load();
              setMailNote(await emailApplicant(app, 'application_rejected', 'About your application', `We cannot take ${app.gym_name} on right now: ${v.reason.trim()}`));
            }}
          />
        )}
      </Modal>

      <Modal open={dialog?.kind === 'talk'} onClose={() => { close(); void load(); }} size="md"
        title={dialog?.kind === 'talk' ? `Messages with ${dialog.app.gym_name}` : ''}
        subtitle={dialog?.kind === 'talk' ? `${dialog.app.owner_name} · ${dialog.app.email}` : undefined}>
        {dialog?.kind === 'talk' && <ApplicationThread app={dialog.app} />}
      </Modal>

      <Modal open={dialog?.kind === 'docs'} onClose={() => { close(); void load(); }} size="md"
        title={dialog?.kind === 'docs' ? `${dialog.app.gym_name}'s documents` : ''}
        subtitle={dialog?.kind === 'docs' ? `${dialog.app.owner_name} · ${dialog.app.email}` : undefined}>
        {dialog?.kind === 'docs' && <ApplicationDocs app={dialog.app} onChanged={() => void load()} />}
      </Modal>

      <Modal open={dialog?.kind === 'delete'} onClose={close} size="sm" label="Delete their account">
        {dialog?.kind === 'delete' && (
          <Ask
            title={`Delete ${dialog.app.owner_name}'s account?`}
            blurb={`They can no longer sign in, and their documents are deleted. ${dialog.app.gym_name}'s application stays in your records. This cannot be undone — they would apply again with a new account.`}
            fields={[]}
            confirmLabel="Delete the account"
            onCancel={close}
            onConfirm={async () => { await deleteApplicant(dialog.app); setDialog(null); await load(); }}
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

const TRIAL_FIRST = 'Free trial first (recommended)';
const CONTACT: Record<string, string> = { call: 'a call', sms: 'SMS', viber: 'Viber', messenger: 'Messenger', whatsapp: 'WhatsApp', email: 'email' };

/** "Purok 2, Mamburao, Occidental Mindoro" → "Occidental Mindoro": the province, or the last part they typed. */
function place(address: string | null): string | null {
  const parts = (address ?? '').split(',').map((p) => p.trim()).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : null;
}

function tally(apps: Application[], key: (a: Application) => string | null | undefined): [string, number][] {
  const m = new Map<string, number>();
  for (const a of apps) {
    const k = key(a)?.trim() || 'Not said';
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()].sort((a, b) => (a[0] === 'Not said' ? 1 : b[0] === 'Not said' ? -1 : b[1] - a[1])).slice(0, 6);
}

function Breakdown({ title, icon: Icon, rows, total }: { title: string; icon: typeof Inbox; rows: [string, number][]; total: number }) {
  return (
    <div style={{ marginTop: 12 }}>
      <div className="meta" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}><Icon size={13} /> {title}</div>
      <div className="source-list">
        {rows.map(([k, n]) => (
          <div key={k}>
            <div className="row" style={{ gap: 8 }}>
              <span className="grow" style={{ color: k === 'Not said' ? 'var(--text-3)' : undefined }}>{k}</span>
              <b>{n}</b>
            </div>
            <div className="meter"><span style={{ width: `${(n / total) * 100}%` }} /></div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Every way to reach an applicant, as they asked to be reached first. */
function Reach({ app, onTalk }: { app: Application; onTalk: () => void }) {
  const [copied, setCopied] = useState(false);
  const digits = app.phone.replace(/[^0-9+]/g, '');
  const intl = digits.startsWith('+') ? digits : digits.startsWith('0') ? `+63${digits.slice(1)}` : digits;
  const handle = app.contact_handle?.trim() || null;
  const greet = encodeURIComponent(`Hi ${app.owner_name.split(' ')[0]}, this is Core Fitness about ${app.gym_name}'s application.`);
  return (
    <span className="reach">
      <button type="button" onClick={onTalk}>
        <MessageSquare size={13} /> Messages{app.messages ? ` (${app.messages})` : ''}
        {!!app.unread && <span className="unread">{app.unread}</span>}
      </button>
      <a href={`tel:${intl}`}><Phone size={13} /> Call</a>
      <a href={`sms:${intl}?body=${greet}`}><MessageCircle size={13} /> SMS</a>
      <a href={`viber://chat?number=${encodeURIComponent(intl)}`}>Viber</a>
      <a href={`https://wa.me/${intl.replace('+', '')}?text=${greet}`} target="_blank" rel="noreferrer">WhatsApp</a>
      {app.contact_pref === 'messenger' && handle && (
        <a href={`https://m.me/${encodeURIComponent(handle.replace(/^https?:\/\/(www\.)?(m\.me|facebook\.com)\//, ''))}`} target="_blank" rel="noreferrer">Messenger</a>
      )}
      <a href={`mailto:${app.email}?subject=${encodeURIComponent(`Your Core Fitness application — ${app.gym_name}`)}&body=${encodeURIComponent(
        `Hi ${app.owner_name.split(' ')[0]},\n\n` + (app.status_token ? `You can follow your application and write to us here:\n${statusLink(app.status_token)}\n\n` : '') + '— Core Fitness')}`}>
        <Mail size={13} /> Email
      </a>
      {app.status_token && (
        <button type="button" onClick={() => void navigator.clipboard.writeText(statusLink(app.status_token!)).then(() => setCopied(true))}
          data-tip="Their private page: where the application stands, your messages, and how to pay once they are in">
          <Copy size={13} /> {copied ? 'Status link copied' : 'Status link'}
        </button>
      )}
    </span>
  );
}
