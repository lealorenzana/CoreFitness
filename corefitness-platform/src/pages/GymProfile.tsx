import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Activity, ArrowLeft, BarChart3, Clock, Mail, MessageSquare, NotebookPen, Phone, Pin, Receipt, Send, Sparkles, Trash2, UserCog, Users, Wallet,
} from 'lucide-react';
import MessageOwner from '../components/MessageOwner';
import { detail } from '../components/DetailLayer';
import { supabase } from '../lib/supabaseClient';
import GymMark from '../components/GymMark';
import GymStatus from '../components/GymStatus';
import './gyms.css';
import GymDetail from '../components/GymDetail';
import ExportGym from '../components/ExportGym';
import ManageGym from '../components/ManageGym';
import SupportDoor from '../components/SupportDoor';
import BillGym, { billingState } from '../components/BillGym';
import Modal from '../components/Modal';
import {
  addGymNote, billingSettings, deleteGymNote, explain, gymContacts, gymEvents, gymFeatures, gymNotes, gymWeeks, listGyms, listPayments,
  setNotePinned,
  type GymContact, type GymFeature, type GymNote, type GymPayment, type GymWeek, type PlatformEvent, type PlatformGym,
} from '../lib/platform';
import SkelRows from '../components/ui/SkelRows';

const peso = (v: string | number | null | undefined) => `₱${Number(v ?? 0).toLocaleString('en-PH', { maximumFractionDigits: 0 })}`;
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-PH', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
function ago(iso: string | null): string {
  if (!iso) return 'never';
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return d <= 0 ? 'today' : d === 1 ? 'yesterday' : d < 30 ? `${d} days ago` : `${Math.floor(d / 30)} mo ago`;
}

/**
 * One gym, on its own page (0135): who runs it and how to reach them, how its
 * use has moved week by week, which parts of the product it uses, what it has
 * paid, what the platform did to it, and the platform owner's notes.
 *
 * Counts and dates only — never a gym's rows (docs/TENANCY.md). The people are
 * its owner and desk, the platform's counterparties; never its members.
 */
type GymTab = 'overview' | 'manage' | 'money' | 'people' | 'history';

export default function GymProfile() {
  const { gymId = '' } = useParams();
  const [gym, setGym] = useState<PlatformGym | null | undefined>(undefined);
  const [contacts, setContacts] = useState<GymContact[]>([]);
  const [weeks, setWeeks] = useState<GymWeek[]>([]);
  const [features, setFeatures] = useState<GymFeature[]>([]);
  const [events, setEvents] = useState<PlatformEvent[]>([]);
  const [payments, setPayments] = useState<GymPayment[]>([]);
  const [notes, setNotes] = useState<GymNote[]>([]);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(true);
  const [billing, setBilling] = useState(false);
  const [grace, setGrace] = useState(7);
  // Tabs (2026-11-02): one subject at a time, each with the whole height — nothing squeezed under the rest.
  const [tab, setTab] = useState<GymTab>('overview');
  /** What Core Fitness wrote to this gym's owner (0240); null = 0240 not pasted yet. */
  const [messages, setMessages] = useState<{ sent_at: string; title: string; body: string; read_by: number; recipients: number; sent_by: string | null }[] | null>([]);
  const [writing, setWriting] = useState(false);
  const loadMessages = useCallback(async () => {
    const { data, error: err } = await supabase.rpc('platform_gym_messages', { p_gym: gymId });
    setMessages(err ? null : (data ?? []));
  }, [gymId]);

  const loadNotes = useCallback(async () => { try { setNotes(await gymNotes(gymId)); } catch { /* before 0135 */ } }, [gymId]);
  const load = useCallback(async () => {
    try {
      const all = await listGyms();
      setGym(all.find((g) => g.id === gymId) ?? null);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load the gym'); setGym(null); return; }
    const results = await Promise.allSettled([gymContacts(gymId), gymWeeks(gymId, 26), gymFeatures(gymId), gymEvents(gymId, 40), listPayments(gymId)]);
    const [c, w, f, ev, p] = results;
    if (c.status === 'rejected') { setLive(false); setError(explain(c.reason, '0135')); }
    if (c.status === 'fulfilled') setContacts(c.value);
    if (w.status === 'fulfilled') setWeeks(w.value);
    if (f.status === 'fulfilled') setFeatures(f.value);
    if (ev.status === 'fulfilled') setEvents(ev.value);
    if (p.status === 'fulfilled') setPayments(p.value);
    await loadNotes();
    await loadMessages();
    void billingSettings().then((b) => { if (b) setGrace(b.grace_days); }, () => undefined);
  }, [gymId, loadNotes, loadMessages]);
  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  const act = async (fn: () => Promise<void>) => {
    try { await fn(); await loadNotes(); } catch (e) { setError(e instanceof Error ? e.message : 'That did not work'); }
  };

  if (gym === undefined) return <SkelRows shape="figs-split" label="Loading the gym…" />;
  if (gym === null) return <><Back /><p className="err">{error ?? 'That gym is not on the service.'}</p></>;

  const top = Math.max(1, ...weeks.map((w) => w.checkins));
  const last4 = weeks.slice(-4).reduce((n, w) => n + w.checkins, 0);
  const prev4 = weeks.slice(-8, -4).reduce((n, w) => n + w.checkins, 0);
  const trend = prev4 ? Math.round(((last4 - prev4) / prev4) * 100) : null;
  const used = features.filter((f) => f.ever > 0);
  const unused = features.filter((f) => f.ever === 0);
  const kpis = [
    { icon: Users, label: 'Members', value: gym.members.toLocaleString('en-PH'), foot: gym.max_members ? `of ${gym.max_members} on the plan` : 'no plan limit' },
    { icon: Activity, label: 'Check-ins, 4 weeks', value: last4.toLocaleString('en-PH'), foot: trend === null ? 'no earlier weeks to compare' : `${trend >= 0 ? '+' : ''}${trend}% vs the 4 before`, down: trend !== null && trend < 0 },
    { icon: UserCog, label: 'On the desk', value: String(gym.staff), foot: `${gym.owners} owner${gym.owners === 1 ? '' : 's'}` },
    { icon: Wallet, label: 'Paid in all', value: peso(gym.paid_total), foot: gym.paid_until ? `paid to ${day(gym.paid_until)}` : 'no paid-until date' },
  ];

  const TABS: [GymTab, string, typeof Activity][] = [
    ['overview', 'Overview', BarChart3], ['manage', 'Manage', UserCog], ['money', 'Billing and payments', Wallet],
    ['people', 'People and notes', Users], ['history', 'History', Activity],
  ];
  return (
    <>
      <header className="gx-page-head">
        <Link to="/gyms" className="gx-back"><ArrowLeft size={14} /> All gyms</Link>
        <div className="gx-page-id">
          <GymMark name={gym.name} logoUrl={gym.logo_url} accent={gym.accent} size={48} />
          <div className="gx-title">
            <h1 className="gx-name">{gym.name}</h1>
            <span className="gx-slug">/join/{gym.slug} · on Core Fitness since {day(gym.created_at)} · {gym.plan_name ?? gym.plan}</span>
          </div>
          <GymStatus gym={gym} />
          <span className="gx-page-actions">
            <button className="btn" onClick={() => setBilling(true)}><Wallet size={14} /> Bill this gym</button>
            <SupportDoor gymId={gym.id} />
            <ExportGym gymId={gym.id} gymName={gym.name} />
          </span>
        </div>
        <Modal open={billing} onClose={() => setBilling(false)} size="lg" label="Bill this gym">
          {billing && <BillGym gym={gym} onCancel={() => setBilling(false)} onDone={() => { setBilling(false); void load(); }} />}
        </Modal>
        {writing && <MessageOwner open onClose={() => setWriting(false)} gymId={gym.id} gymName={gym.name} onSent={() => void loadMessages()} />}
      </header>

      <div className="ptabs" role="tablist" aria-label="This gym">
        {TABS.map(([k, label, Icon]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)} data-gym-tab={k}>
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {error && <p className="err">{error}</p>}

      {tab === 'overview' && <>
      <div className="gx-strip">
        {kpis.map((k) => (
          <div key={k.label} className="gx-strip-cell">
            <span className="gx-strip-label">{k.label}</span>
            <b>{k.value}</b>
            <span className={`gx-strip-foot${k.down ? ' down' : ''}`}>{k.foot}</span>
          </div>
        ))}
      </div>

      {live && (
        <div className="gx-overview">
          <section className="card gx-chart">
            <h2 className="section-title"><BarChart3 size={14} /> Check-ins per week, 26 weeks</h2>
            {weeks.every((w) => w.checkins === 0) ? <p className="empty">No check-ins in the last half year.</p> : (
              <div className="bars" style={{ gap: 4 }}>
                {weeks.map((w, i) => (
                  <div key={w.week_start} className={`bar${i === weeks.length - 1 ? ' now' : ''}`}
                    data-detail={detail({ title: `Week of ${day(w.week_start)}`, value: `${w.checkins.toLocaleString('en-PH')} check-ins`, rows: [
                      ['A day, on average', (w.checkins / 7).toFixed(1)], ['New members', String(w.new_members)], ['Logged workouts', String(w.workouts)],
                      ['Taken at its desk', peso(Number(w.payments))],
                      ['Vs the week before', i ? `${w.checkins - weeks[i - 1].checkins >= 0 ? '+' : ''}${w.checkins - weeks[i - 1].checkins}` : '—'],
                    ] })}>
                    <span className="bar-fill" style={{ height: `${Math.max(1, (w.checkins / top) * 100)}%` }} />
                    <span className="bar-label">{i % 4 === 0 ? new Date(`${w.week_start}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }) : ''}</span>
                  </div>
                ))}
              </div>
            )}
            <p className="gx-chart-foot">
              {weeks.reduce((n, w) => n + w.new_members, 0)} new members and {weeks.reduce((n, w) => n + w.workouts, 0)} logged workouts in these weeks ·
              {' '}{peso(weeks.reduce((n, w) => n + Number(w.payments), 0))} taken at its desk
            </p>
          </section>

          <section className="card gx-uses">
            <h2 className="section-title"><Sparkles size={14} /> What it uses</h2>
            {used.length === 0 ? <p className="empty">Nothing used yet.</p> : (
              <div className="gx-use gx-use-head" aria-hidden="true"><span>Part of the app</span><span>30 days</span><span>All time</span></div>
            )}
            {used.map((f) => (
              <div key={f.feature} className="gx-use"
                data-detail={detail({ title: f.label, value: `${f.ever.toLocaleString('en-PH')} all time`, rows: [['Last 30 days', f.last_30.toLocaleString('en-PH')], ['Share of all time', f.ever ? `${Math.round((f.last_30 / f.ever) * 100)}% in the last 30 days` : '—']] })}>
                <span>{f.label}</span>
                <span>{f.last_30.toLocaleString('en-PH')}</span>
                <b>{f.ever.toLocaleString('en-PH')}</b>
              </div>
            ))}
            {unused.length > 0 && (
              <p className="gx-unused"><b>Not used yet</b>{unused.map((f) => f.label).join(', ')}. Worth a word with the owner.</p>
            )}
          </section>
        </div>
      )}

      </>}

      {tab === 'manage' && <div className="gx-tab2 manage-tab">
        <ManageGym gym={gym} onChanged={load} />
        <GymDetail gym={gym} onChanged={() => void load()} />
      </div>}

      {tab === 'money' && <div className="gx-tab2 money-tab">
        <section className="card" data-card="billing">
        <h2 className="section-title"><Clock size={14} /> Billing</h2>
        <div className="gx-figs four gx-bill-figs">
          <div><b>{gym.paid_until ? day(gym.paid_until) : 'None'}</b><span>covered until</span></div>
          <div><b className={gym.days_left !== null && gym.days_left < 0 ? 'warn' : undefined}>{gym.days_left === null ? '—' : gym.days_left < 0 ? `${-gym.days_left} late` : gym.days_left.toLocaleString('en-PH')}</b><span>{gym.days_left !== null && gym.days_left < 0 ? 'days' : 'days left'}</span></div>
          <div><b>{peso(gym.paid_total)}</b><span>paid in all</span></div>
          <div><b>{payments.length}</b><span>payment{payments.length === 1 ? '' : 's'}</span></div>
        </div>
        <div className="bill-state">{billingState(gym, grace).map((l) => <span key={l}>{l}</span>)}</div>
        <div className="row" style={{ gap: 8, marginTop: 10 }}>
          <button className="btn" onClick={() => setBilling(true)} data-bill-open><Wallet size={14} /> Bill this gym</button>
        </div>
      </section>

        <section className="card gx-pay">
          <h2 className="section-title"><Receipt size={14} /> Payments to Core Fitness</h2>
          {payments.length === 0 ? <p className="empty">None recorded.</p> : (
            <div className="gx-table" role="table" aria-label="Payments to Core Fitness">
              <div className="gx-tr gx-th" role="row"><span role="columnheader">Paid on</span><span role="columnheader">Covers until</span><span role="columnheader">Method</span><span role="columnheader">Amount</span></div>
              {payments.map((p) => (
                <div key={p.id} className="gx-tr" role="row">
                  <span role="cell">{day(p.paid_on)}</span><span role="cell">{day(p.covers_until)}</span>
                  <span role="cell">{p.method || '—'}</span><b role="cell">{peso(p.amount)}</b>
                </div>
              ))}
            </div>
          )}
          {payments.length > 0 && <p className="gx-table-foot">Every payment, from every gym, is on <Link to="/money">Money</Link>.</p>}
        </section>

      </div>}

      {tab === 'people' && <div className="gx-tab2 people-tab">
        <section className="card">
          <h2 className="section-title row" style={{ gap: 8 }}><UserCog size={14} /> <span className="grow">Who runs it</span>
            <button type="button" className="btn ghost sm" onClick={() => setWriting(true)} data-write-owner><Send size={13} /> Write to the owner</button>
          </h2>
          {contacts.length === 0 && <p className="empty">Nobody can sign in yet.</p>}
          {contacts.map((c) => (
            <div key={c.user_id} className="log">
              <span style={{ display: 'block', color: 'var(--text)', fontWeight: 600 }}>{c.name || '—'}
                <span className="muted" style={{ fontWeight: 400 }}> · {c.is_owner ? 'Owner' : 'Front desk'}{c.status !== 'active' ? ` · ${c.status}` : ''}</span></span>
              <span className="chips">
                {c.email && <a className="chip" href={`mailto:${c.email}`}><Mail size={12} />{c.email}</a>}
                {c.phone && <a className="chip" href={`tel:${c.phone}`}><Phone size={12} />{c.phone}</a>}
                <span className={`chip${!c.last_sign_in_at || Date.now() - new Date(c.last_sign_in_at).getTime() > 30 * 86400000 ? ' warn' : ''}`}>
                  <Clock size={12} />signed in {ago(c.last_sign_in_at)}
                </span>
              </span>
            </div>
          ))}
          <div className="section-title" style={{ marginTop: 14 }}><MessageSquare size={14} /> What Core Fitness wrote to them</div>
          {messages === null ? <p className="empty">Messages to owners need migration 0240.</p>
            : messages.length === 0 ? <p className="empty">Nothing yet. Write to the owner sends one to their bell and phone.</p>
            : messages.map((m) => (
              <div key={m.sent_at} className="owner-msg" data-owner-msg>
                <span style={{ color: 'var(--text)', fontWeight: 600 }}>{m.title}</span>
                <span className="muted" style={{ fontSize: 12 }}> · {new Date(m.sent_at).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  {m.sent_by ? ` · by ${m.sent_by}` : ''} · {m.read_by > 0 ? 'read' : 'not read yet'}</span>
                <p>{m.body}</p>
              </div>
            ))}
        </section>

        <section className="card">
          <h2 className="section-title"><NotebookPen size={14} /> Your notes</h2>
          <p className="meta" style={{ marginTop: -6, marginBottom: 10 }}>Only you see these, never the gym.</p>
          <form className="row" onSubmit={(e) => { e.preventDefault(); if (note.trim()) void act(async () => { await addGymNote(gymId, note); setNote(''); }); }}>
            <input className="grow" value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Owner prefers calls after 6pm; wants a yearly price" aria-label="New note" />
            <button className="btn" type="submit" disabled={!note.trim()}>Add note</button>
          </form>
          {notes.map((n) => (
            <div key={n.id} className="log" style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <span style={{ flex: 1, color: 'var(--text)', whiteSpace: 'pre-wrap' }}>{n.pinned && <Pin size={12} style={{ color: 'var(--warn)', marginRight: 6 }} />}{n.body}
                <span className="muted" style={{ display: 'block', fontSize: 11.5, marginTop: 2 }}>{day(n.created_at)}</span></span>
              <button className="btn ghost" style={{ height: 28, padding: '0 8px' }} aria-label={n.pinned ? 'Unpin note' : 'Pin note'}
                onClick={() => void act(() => setNotePinned(n.id, !n.pinned))}><Pin size={13} /></button>
              <button className="btn ghost" style={{ height: 28, padding: '0 8px' }} aria-label="Delete note"
                onClick={() => { if (window.confirm('Delete this note?')) void act(() => deleteGymNote(n.id)); }}><Trash2 size={13} /></button>
            </div>
          ))}
        </section>

      </div>}

      {tab === 'history' && <>
        <section className="card gx-history">
          <h2 className="section-title"><Activity size={14} /> Timeline</h2>
          <p className="gx-sub">What happened to this gym's account on Core Fitness, newest first.</p>
          {events.length === 0 && <p className="empty">Nothing yet.</p>}
          <ol className="gx-timeline">
            {events.map((e) => (
              <li key={e.id}>
                <time dateTime={e.created_at}>{day(e.created_at)}</time>
                <span>{e.summary}</span>
              </li>
            ))}
          </ol>
        </section>
      </>}
    </>
  );
}

function Back() {
  return (
    <Link to="/gyms" className="pill" style={{ textDecoration: 'none', width: 'fit-content' }}>
      <ArrowLeft size={13} /> All gyms
    </Link>
  );
}
