import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowUp, CalendarClock, Check, FileDown, FileText, ListChecks, Lock, Receipt, ShieldCheck, Wallet } from 'lucide-react';
import './attendance/att.css';
import GymReceiptSheet from '../components/GymReceiptSheet';
import PayOnline from '../components/PayOnline';
import ApplicationDocuments from '../components/ApplicationDocuments';
import { myGymApplication, type GymApplication } from '../lib/api/applications';
import { showToast } from '../utils/toast';
import { getGymContext } from '../lib/gymContext';
import {
  getGymFeatures, getSubscription, gymReceipt, myGymPayments,
  type GymFeature, type GymReceipt, type GymReceiptRow, type GymSubscription,
} from '../lib/api/subscription';

const peso = (n: string | number) => '₱' + Number(n).toLocaleString('en-PH', { maximumFractionDigits: 2 });
const day = (d: string) => new Date(d + 'T00:00:00+08:00').toLocaleDateString('en-PH', { day: 'numeric', month: 'short', year: 'numeric' });

type State = { tone: 'good' | 'soon' | 'bad' | 'none'; title: string; lines: string[] };

/** Every state the page can be in, said in words — including the ones with no date at all. */
function explain(sub: GymSubscription): State {
  if (sub.lock_reason === 'trial_ended') return { tone: 'bad', title: 'The free trial has ended', lines: [
    `It ended on ${sub.paid_until ? day(sub.paid_until) : 'its last day'}. The app is paused for everyone at the gym until a plan is paid.`,
    'Pay online below and it opens again in about a minute, or send a reference and it opens once Core Fitness confirms it. Nothing is deleted.'] };
  if (sub.lock_reason === 'suspended') return { tone: 'bad', title: 'Suspended by Core Fitness', lines: ['Everything is read-only until Core Fitness reactivates the gym. Nothing is deleted. Ask in Help why.'] };
  if (sub.lock_reason === 'overdue') return { tone: 'bad', title: 'Read-only until it is paid', lines: [`The plan ran out on ${sub.paid_until ? day(sub.paid_until) : 'its due date'} and the ${sub.grace_days}-day grace has passed.`, 'Members and staff can still sign in and look; nothing can change until a payment is confirmed. Nothing is deleted.'] };
  if (!sub.paid_until) {
    return { tone: 'none', title: 'No billing for this gym', lines: [
      'Core Fitness has not given this gym a covered-until date, so nothing is due and nothing locks — usually because it is a founding or partner gym.',
      'If that changes, Core Fitness sets a date here first and you are told, with reminders before anything is due.'] };
  }
  const d = sub.days_left ?? 0;
  if (sub.on_trial) {
    return d >= 0
      ? { tone: d <= 7 ? 'soon' : 'good', title: `Free trial — ${d} day${d === 1 ? '' : 's'} left`, lines: [`Free until ${day(sub.paid_until)}. To keep everything open after that, pay for the plan before then.`, `If no plan is paid by then, the app stops for you, your staff and your members on ${sub.read_only_on ? day(sub.read_only_on) : 'the next day'} — nothing is deleted.`] }
      : { tone: 'bad', title: `The free trial ended ${-d} day${d === -1 ? '' : 's'} ago`, lines: [`Read-only from ${sub.read_only_on ? day(sub.read_only_on) : 'the end of the grace days'} unless it is paid.`] };
  }
  if (d < 0) return { tone: 'bad', title: `${-d} day${d === -1 ? '' : 's'} overdue`, lines: [`Covered until ${day(sub.paid_until)}; the grace runs ${sub.grace_days} days after the due date.`, `Read-only from ${sub.read_only_on ? day(sub.read_only_on) : 'the end of the grace days'} unless a payment is confirmed first.`] };
  return { tone: d <= 7 ? 'soon' : 'good', title: d === 0 ? 'Runs out today' : `Covered for ${d} more day${d === 1 ? '' : 's'}`, lines: [
    `Paid until ${day(sub.paid_until)}. You are reminded before then.`,
    `If it is not paid, a ${sub.grace_days}-day grace follows; read-only from ${sub.read_only_on ? day(sub.read_only_on) : '—'}. Nothing is ever deleted.`] };
}

/**
 * Your plan (0138; redesigned 2026-10-04): what this gym pays Core Fitness, what
 * the plan includes, where the gym stands — every state explained, including
 * "no billing" (a gym with no covered-until date, which never locks) and a plan
 * Core Fitness has not priced — how to pay, and a receipt for every payment.
 * Owner only; the reminders that link here go to owners only.
 *
 * Laid out to the owner's approved mock-up (2026-10-25, account-v1.html → Your
 * plan): the state across the top, three tiles, payments beside what the plan
 * includes. The countdown ring went with it — the state line says the days.
 */
export default function Subscription() {
  const [sub, setSub] = useState<GymSubscription | null | undefined>(null);
  const [payments, setPayments] = useState<GymReceiptRow[]>([]);
  const [features, setFeatures] = useState<GymFeature[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [receipt, setReceipt] = useState<GymReceipt | null>(null);
  /** The application that made this gym (0187) — its business documents, renewed from here. */
  const [application, setApplication] = useState<GymApplication | null>(null);
  const loadApplication = async () => setApplication(await myGymApplication());

  /** Bumped when PayMongo confirms a payment (0191), so the date and receipts reload. */
  const [tick, setTick] = useState(0);
  useEffect(() => {
    void (async () => {
      const [s, p, f, a] = await Promise.all([getSubscription(), myGymPayments(), getGymFeatures(), myGymApplication()]);
      setSub(s); setPayments(p); setFeatures(f); setApplication(a); setLoaded(true);
      // 0198: paid at last — the trial's lock is gone, so the whole app comes back.
      if (s && s.lock_reason === null && (await getGymContext())?.lockReason === 'trial_ended') {
        await getGymContext(true);
        window.location.assign('/');
      }
    })();
  }, [tick]);
  const reloadAfterPay = useCallback(() => setTick((t) => t + 1), []);

  const open = async (id: string) => {
    try { const r = await gymReceipt(id); if (r) setReceipt(r); }
    catch (e) { showToast(e instanceof Error ? e.message : 'Could not open the receipt', 'error'); }
  };

  if (!loaded) return <div className="att"><p className="a-sub">Loading…</p></div>;
  if (sub === undefined) return <div className="att"><div className="a-card"><p className="a-sub">Your plan page needs migration 0138, which is not live on this database.</p></div></div>;
  if (sub === null) return <div className="att"><div className="a-card"><p className="a-sub">Only the gym's owner sees its Core Fitness plan.</p></div></div>;

  const st = explain(sub);
  const billed = !!sub.paid_until;
  const priced = sub.price_monthly !== null && Number(sub.price_monthly) > 0;
  const included = features.filter((f) => f.enabled);
  const notIncluded = features.filter((f) => !f.enabled);
  const warn = st.tone === 'bad' || st.tone === 'soon';
  const toPay = () => document.getElementById('pay')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const meter = (label: string, used: number, cap: number | null, unit: string) => (
    <div className="a-card">
      <div className="a-lbl">{label}</div>
      <b style={{ fontSize: 22 }}>{used}{cap !== null ? <span className="a-sub" style={{ fontSize: 13 }}> of {cap}</span> : <span className="a-sub" style={{ fontSize: 13 }}> · no limit</span>}</b>
      {cap !== null && cap > 0 && <div className="a-meter" style={{ marginTop: 8 }}><i style={{ width: `${Math.min(100, (used / cap) * 100)}%`, background: used >= cap ? 'var(--a-amber)' : undefined }} /></div>}
      <div className="a-sub" style={{ marginTop: 6 }}>
        {cap === null ? 'this plan has no ceiling' : used >= cap ? `full — ask Core Fitness for a bigger plan` : `${cap - used} more ${unit}${cap - used === 1 ? '' : 's'} on this plan`}
      </div>
    </div>
  );

  return (
    <div className="att" data-your-plan>
      {receipt && <GymReceiptSheet receipt={receipt} onClose={() => setReceipt(null)} />}
      <div className="a-head">
        <div className="min-w-0"><h1>Your plan</h1><p>What this gym pays Core Fitness, what it includes, and a receipt for every payment</p></div>
      </div>

      <div className="a-card" data-plan-state
        style={warn ? { borderColor: '#5a4512', background: 'linear-gradient(90deg, #211a08, var(--a-surface) 60%)', flex: 'none' } : { flex: 'none' }}>
        <div className="a-row" style={{ padding: 0, alignItems: 'flex-start' }}>
          <span className="a-ic" style={warn ? { background: 'var(--a-alight)', color: 'var(--a-a300)' } : undefined}>
            {warn ? <AlertTriangle size={15} /> : billed ? <CalendarClock size={15} /> : <ShieldCheck size={15} />}
          </span>
          <div className="t">
            <b style={{ whiteSpace: 'normal', color: st.tone === 'bad' ? 'var(--a-a300)' : undefined }}>{st.title}</b>
            {st.lines.map((l) => <small key={l} style={{ whiteSpace: 'normal', display: 'block' }}>{l}</small>)}
          </div>
          {billed && warn && priced && (
            <button type="button" className="a-btn amber" onClick={toPay}><Wallet size={15} />Pay {peso(sub.price_monthly ?? 0)} now</button>
          )}
        </div>
      </div>

      <div className="a-grid" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', flex: 'none' }}>
        <div className="a-card">
          <div className="a-lbl">Your plan</div>
          <div className="flex gap-2 items-baseline">
            <b style={{ fontSize: 22 }}>{sub.plan_name ?? 'Not set'}</b>
            <span className="a-sub">{priced ? `${peso(sub.price_monthly ?? 0)} a month` : sub.price_monthly !== null ? 'Free' : ''}</span>
          </div>
          <div className="a-sub" style={{ marginTop: 6 }}>
            {sub.price_monthly === null
              ? <>Core Fitness has not put a price on this plan — ask in <Link to="/help" style={{ color: 'var(--a-p300)' }}>Help</Link>.</>
              : sub.on_trial ? `Free trial until ${sub.paid_until ? day(sub.paid_until) : '—'}`
              : billed ? `Covered until ${day(sub.paid_until!)}${payments[0]?.method ? ` · last paid by ${payments[0].method}` : ''}`
              : 'No billing for this gym'}
          </div>
          <a href="https://corefitness-site.vercel.app/#pricing" target="_blank" rel="noreferrer" className="a-btn sm" style={{ marginTop: 10, alignSelf: 'flex-start' }}>
            <ArrowUp size={13} />Compare plans
          </a>
        </div>
        {meter('Active members', sub.members, sub.max_members, 'member')}
        {meter('Owners and front desk', sub.staff, sub.max_staff, 'seat')}
      </div>

      <div className="a-grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) 360px', flex: 1 }}>
        <div className="a-card a-scroll">
          <div className="a-ct"><h3><Receipt size={16} />Payments to Core Fitness</h3></div>
          {payments.length === 0 ? <p className="a-sub">No payment has been recorded for this gym yet.</p> : (
            <table className="a-table">
              <thead><tr><th>Paid</th><th>Covers</th><th>How</th><th>Receipt</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td><b>{day(p.paid_on)}</b></td>
                    <td>to {day(p.covers_until)}{p.plan_name ? <div className="a-sub">{p.plan_name}</div> : null}</td>
                    <td>{p.method ? <span className="a-pill">{p.method}</span> : <span className="a-sub">—</span>}</td>
                    <td className="a-sub">{p.receipt_no}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <b>{peso(p.amount)}</b>{' '}
                      <button type="button" className="a-btn ghost sm" onClick={() => void open(p.id)} aria-label={`Receipt ${p.receipt_no}`}><FileDown size={13} />Receipt</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div id="pay" style={{ marginTop: 16 }}>
            <div className="a-ct"><h3><Wallet size={16} />Paying for the plan</h3></div>
            {billed ? (
              <div className="space-y-3">
                {/* PayMongo only (owner, 2026-10-28): the manual QR-and-reference form is gone here —
                    QR codes stay for what members pay the gym, and coaches paid directly. */}
                <PayOnline onPaid={reloadAfterPay} />
              </div>
            ) : (
              <div className="a-hint"><CalendarClock size={15} /><span>Nothing to pay. If Core Fitness starts billing this gym, how to pay appears here with the amount and every way to send it.</span></div>
            )}
          </div>

          {application && (
            <div id="documents" style={{ marginTop: 16 }}>
              <div className="a-ct"><h3><FileText size={16} />Business documents</h3></div>
              <p className="a-sub">
                What Core Fitness verified when it let {application.gym_name} in. Send the renewed permit each January, and any document before it runs out — you are reminded.
              </p>
              <div style={{ marginTop: 10 }}><ApplicationDocuments applicationId={application.id} documents={application.documents} onChanged={loadApplication} renewing /></div>
            </div>
          )}
        </div>

        <div className="a-card glow a-scroll">
          <div className="a-ct"><h3><ListChecks size={16} />{sub.plan_name ?? 'Your plan'} includes</h3></div>
          {features.length === 0 && <p className="a-sub">What the plan includes could not be loaded — a connection problem, not an empty plan.</p>}
          {sub.max_members !== null || sub.max_staff !== null ? (
            <div className="a-row"><Check size={15} style={{ color: 'var(--a-p300)' }} />
              <div className="t"><b>{sub.max_members !== null ? `Up to ${sub.max_members} members` : 'Any number of members'}, {sub.max_staff !== null ? `${sub.max_staff} staff` : 'any number of staff'}</b></div></div>
          ) : null}
          {included.map((f) => (
            <div key={f.feature_key} className="a-row"><Check size={15} style={{ color: 'var(--a-p300)' }} />
              <div className="t"><b style={{ whiteSpace: 'normal' }}>{f.label}</b>{f.description ? <small style={{ whiteSpace: 'normal' }}>{f.description}</small> : null}</div></div>
          ))}
          {notIncluded.map((f) => (
            <div key={f.feature_key} className="a-row"><Lock size={15} style={{ color: 'var(--a-muted)' }} />
              <div className="t"><b style={{ color: 'var(--a-text2)', whiteSpace: 'normal' }}>{f.label}</b><small style={{ whiteSpace: 'normal' }}>Not on this plan — ask Core Fitness to change plans.</small></div></div>
          ))}
        </div>
      </div>
    </div>
  );
}
