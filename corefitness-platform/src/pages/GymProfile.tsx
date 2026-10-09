import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Activity, ArrowLeft, BarChart3, Clock, Mail, NotebookPen, Phone, Pin, Receipt, Sparkles, Trash2, UserCog, Users, Wallet,
} from 'lucide-react';
import GymMark from '../components/GymMark';
import GymDetail from '../components/GymDetail';
import ExportGym from '../components/ExportGym';
import SupportDoor from '../components/SupportDoor';
import DatePicker from '../components/DatePicker';
import {
  addGymNote, deleteGymNote, explain, gymContacts, gymEvents, gymFeatures, gymNotes, gymWeeks, listGyms, listPayments,
  setGymBilling, setNotePinned,
  type GymContact, type GymFeature, type GymNote, type GymPayment, type GymWeek, type PlatformEvent, type PlatformGym,
} from '../lib/platform';

const peso = (v: string | number | null | undefined) => `₱${Number(v ?? 0).toLocaleString('en-PH', { maximumFractionDigits: 0 })}`;
/** A Manila calendar date n days from today, as YYYY-MM-DD (UTC+8, never the UTC date). */
const manilaDay = (n = 0) => new Date(Date.now() + 8 * 3_600_000 + n * 86_400_000).toISOString().slice(0, 10);
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
  const [billing, setBilling] = useState<{ until: string; note: string } | null>(null);
  const [billBusy, setBillBusy] = useState(false);

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
  }, [gymId, loadNotes]);
  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  const act = async (fn: () => Promise<void>) => {
    try { await fn(); await loadNotes(); } catch (e) { setError(e instanceof Error ? e.message : 'That did not work'); }
  };

  if (gym === undefined) return <p className="empty">Loading the gym…</p>;
  if (gym === null) return <><Back /><p className="err">{error ?? 'That gym is not on the service.'}</p></>;

  const top = Math.max(1, ...weeks.map((w) => w.checkins));
  const last4 = weeks.slice(-4).reduce((n, w) => n + w.checkins, 0);
  const prev4 = weeks.slice(-8, -4).reduce((n, w) => n + w.checkins, 0);
  const trend = prev4 ? Math.round(((last4 - prev4) / prev4) * 100) : null;
  const used = features.filter((f) => f.ever > 0);
  const unused = features.filter((f) => f.ever === 0);
  const kpis = [
    { icon: Users, label: 'Members', value: gym.members.toLocaleString('en-PH'), foot: gym.max_members ? `of ${gym.max_members} on the plan` : 'no plan limit' },
    { icon: Activity, label: 'Check-ins, 4 weeks', value: last4.toLocaleString('en-PH'), foot: trend === null ? 'no earlier weeks to compare' : `${trend >= 0 ? '+' : ''}${trend}% vs the 4 before` },
    { icon: UserCog, label: 'On the desk', value: String(gym.staff), foot: `${gym.owners} owner${gym.owners === 1 ? '' : 's'}` },
    { icon: Wallet, label: 'Paid in all', value: peso(gym.paid_total), foot: gym.paid_until ? `paid to ${day(gym.paid_until)}` : 'no paid-until date' },
  ];

  return (
    <>
      <Back />
      <section className="card" style={{ marginTop: 12 }}>
        <div className="row" style={{ gap: 18 }}>
          <GymMark name={gym.name} logoUrl={gym.logo_url} accent={gym.accent} size={72} />
          <span className="grow">
            <span className="name" style={{ fontSize: 22 }}>{gym.name}</span>
            <span className="meta">/join/{gym.slug} · on Core Fitness since {day(gym.created_at)} · {gym.plan_name ?? gym.plan}</span>
          </span>
          {gym.lock_reason
            ? <span className="pill warn"><span className="dot" />{gym.lock_reason === 'suspended' ? 'Suspended' : 'Overdue — read-only'}</span>
            : <span className="pill ok"><span className="dot" />{gym.owners === 0 || !gym.onboarded ? 'Setting up' : 'Live'}</span>}
          <SupportDoor gymId={gym.id} />
          <ExportGym gymId={gym.id} gymName={gym.name} />
        </div>
      </section>

      {error && <p className="err">{error}</p>}

      <div className="kpis" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', marginTop: 16 }}>
        {kpis.map((k) => {
          const Icon = k.icon;
          return (
            <div key={k.label} className="kpi">
              <span className="kpi-icon"><Icon size={18} /></span>
              <span className="kpi-label">{k.label}</span>
              <span className="kpi-value">{k.value}</span>
              <span className="kpi-foot">{k.foot}</span>
            </div>
          );
        })}
      </div>

      <section className="card" style={{ marginTop: 16 }} data-card="billing">
        <h2 className="section-title"><Clock size={14} /> Billing</h2>
        <p className="meta">
          {gym.paid_until
            ? <>Covered until {day(gym.paid_until)}. After that and the grace days, the gym goes read-only until a payment is verified.</>
            : <>No billing — this gym has no covered-until date, so nothing is ever due and it never locks. Start billing to give it a date; its owner is told, and reminded before it.</>}
        </p>
        {billing ? (
          <div className="row" style={{ gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <label htmlFor="bill-until" className="meta">Covered until</label>
            <span style={{ width: 190 }}><DatePicker id="bill-until" mode="future" value={billing.until}
              onChange={(v) => setBilling({ ...billing, until: v })} /></span>
            <input className="grow" value={billing.note} maxLength={300} placeholder="A note for the owner (optional)"
              onChange={(e) => setBilling({ ...billing, note: e.target.value })} aria-label="Note" />
            <button className="btn" disabled={billBusy || !billing.until} onClick={() => void (async () => {
              setBillBusy(true);
              try { await setGymBilling(gym.id, billing.until, billing.note.trim() || null); setBilling(null); await load(); }
              catch (e) { setError(e instanceof Error ? e.message : 'Billing could not be set'); }
              finally { setBillBusy(false); }
            })()}>{gym.paid_until ? 'Save the date' : 'Start billing'}</button>
            <button className="btn ghost" onClick={() => setBilling(null)}>Cancel</button>
          </div>
        ) : (
          <div className="row" style={{ gap: 8, marginTop: 10 }}>
            <button className="btn" onClick={() => setBilling({ until: gym.paid_until ?? manilaDay(30), note: '' })}>
              {gym.paid_until ? 'Change the date' : 'Start billing'}
            </button>
            {gym.paid_until && (
              <button className="btn ghost" disabled={billBusy} onClick={() => void (async () => {
                if (!window.confirm(`Stop billing ${gym.name}? It will have no covered-until date, so it never locks.`)) return;
                setBillBusy(true);
                try { await setGymBilling(gym.id, null, null); await load(); }
                catch (e) { setError(e instanceof Error ? e.message : 'Billing could not be cleared'); }
                finally { setBillBusy(false); }
              })()}>No billing</button>
            )}
          </div>
        )}
      </section>

      {live && (
        <div className="grid-2">
          <section className="card">
            <h2 className="section-title"><BarChart3 size={14} /> Check-ins per week, 26 weeks</h2>
            {weeks.every((w) => w.checkins === 0) ? <p className="empty">No check-ins in the last half year.</p> : (
              <div className="bars" style={{ gap: 4 }}>
                {weeks.map((w, i) => (
                  <div key={w.week_start} className={`bar${i === weeks.length - 1 ? ' now' : ''}`}
                    title={`Week of ${day(w.week_start)}: ${w.checkins} check-ins, ${w.new_members} new members, ${w.workouts} workouts`}>
                    <span className="bar-fill" style={{ height: `${Math.max(2, (w.checkins / top) * 160)}px`, maxWidth: 22 }} />
                    <span className="bar-label">{i % 4 === 0 ? new Date(`${w.week_start}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }) : ''}</span>
                  </div>
                ))}
              </div>
            )}
            <p className="meta" style={{ marginTop: 10 }}>
              {weeks.reduce((n, w) => n + w.new_members, 0)} new members and {weeks.reduce((n, w) => n + w.workouts, 0)} logged workouts in these weeks ·
              {' '}{peso(weeks.reduce((n, w) => n + Number(w.payments), 0))} taken at its desk
            </p>
          </section>

          <section className="card">
            <h2 className="section-title"><Sparkles size={14} /> What it uses</h2>
            {used.length === 0 && <p className="empty">Nothing used yet.</p>}
            {used.map((f) => (
              <div key={f.feature} className="log" style={{ display: 'flex', gap: 10 }}>
                <span style={{ flex: 1, color: 'var(--text)' }}>{f.label}</span>
                <span className="muted" style={{ fontSize: 12 }}>{f.last_30.toLocaleString('en-PH')} in 30 days</span>
                <span style={{ fontSize: 12, fontWeight: 700, width: 60, textAlign: 'right' }}>{f.ever.toLocaleString('en-PH')}</span>
              </div>
            ))}
            {unused.length > 0 && (
              <p className="meta" style={{ marginTop: 10 }}>Not used yet: {unused.map((f) => f.label).join(', ')} — worth a word with the owner.</p>
            )}
          </section>
        </div>
      )}

      <div className="grid-3">
        <section className="card">
          <h2 className="section-title"><UserCog size={14} /> Who runs it</h2>
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
        </section>

        <section className="card">
          <h2 className="section-title"><Receipt size={14} /> Payments to Core Fitness</h2>
          {payments.length === 0 && <p className="empty">None recorded.</p>}
          {payments.slice(0, 8).map((p) => (
            <div key={p.id} className="log" style={{ display: 'flex', gap: 10 }}>
              <span style={{ flex: 1 }}>{day(p.paid_on)}<span className="muted"> · covers to {day(p.covers_until)}{p.method ? ` · ${p.method}` : ''}</span></span>
              <span style={{ fontWeight: 700, color: 'var(--text)' }}>{peso(p.amount)}</span>
            </div>
          ))}
          {payments.length > 8 && <p className="meta"><Link to="/money">All {payments.length} on Money</Link></p>}
        </section>

        <section className="card">
          <h2 className="section-title"><Activity size={14} /> Timeline</h2>
          {events.length === 0 && <p className="empty">Nothing yet.</p>}
          {events.slice(0, 10).map((e) => (
            <div key={e.id} className="log" style={{ display: 'flex', gap: 10 }}>
              <span style={{ flex: 1, color: 'var(--text)' }}>{e.summary}</span>
              <span className="muted" style={{ whiteSpace: 'nowrap', fontSize: 11.5 }}>{day(e.created_at)}</span>
            </div>
          ))}
        </section>
      </div>

      <div className="grid-2">
        <section className="card">
          <h2 className="section-title"><NotebookPen size={14} /> Your notes</h2>
          <p className="meta" style={{ marginTop: -6, marginBottom: 10 }}>Only you see these — never the gym.</p>
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

        <div>
          <GymDetail gym={gym} onChanged={() => void load()} />
        </div>
      </div>
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
