import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock, Check, CreditCard, Crown, Receipt, ShieldCheck, Users, X } from 'lucide-react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import GymReceiptSheet from '../components/GymReceiptSheet';
import PayCoreFitness from '../components/PayCoreFitness';
import ApplicationDocuments from '../components/ApplicationDocuments';
import { myGymApplication, type GymApplication } from '../lib/api/applications';
import { showToast } from '../utils/toast';
import {
  getGymFeatures, getSubscription, gymReceipt, myGymPayments,
  type GymFeature, type GymReceipt, type GymReceiptRow, type GymSubscription,
} from '../lib/api/subscription';

const MUTED = 'var(--color-text-secondary)';
const peso = (n: string | number) => '₱' + Number(n).toLocaleString('en-PH', { maximumFractionDigits: 2 });
const day = (d: string) => new Date(d + 'T00:00:00+08:00').toLocaleDateString('en-PH', { day: 'numeric', month: 'short', year: 'numeric' });

type State = { tone: 'good' | 'soon' | 'bad' | 'none'; title: string; lines: string[] };

/** Every state the page can be in, said in words — including the ones with no date at all. */
function explain(sub: GymSubscription): State {
  if (sub.lock_reason === 'suspended') return { tone: 'bad', title: 'Suspended by Core Fitness', lines: ['Everything is read-only until Core Fitness reactivates the gym. Nothing is deleted. Ask in Support why.'] };
  if (sub.lock_reason === 'overdue') return { tone: 'bad', title: 'Read-only until it is paid', lines: [`The plan ran out on ${sub.paid_until ? day(sub.paid_until) : 'its due date'} and the ${sub.grace_days}-day grace has passed.`, 'Members and staff can still sign in and look; nothing can change until a payment is confirmed. Nothing is deleted.'] };
  if (!sub.paid_until) {
    return { tone: 'none', title: 'No billing for this gym', lines: [
      'Core Fitness has not given this gym a covered-until date, so nothing is due and nothing locks — usually because it is a founding or partner gym.',
      'If that changes, Core Fitness sets a date here first and you are told, with reminders before anything is due.'] };
  }
  const d = sub.days_left ?? 0;
  if (sub.on_trial) {
    return d >= 0
      ? { tone: d <= 7 ? 'soon' : 'good', title: `Free trial — ${d} day${d === 1 ? '' : 's'} left`, lines: [`Free until ${day(sub.paid_until)}. To keep everything open after that, pay for the plan before then.`, `If it is not paid, the gym goes read-only on ${sub.read_only_on ? day(sub.read_only_on) : 'the day after the grace'} — nothing is deleted.`] }
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

  useEffect(() => {
    void (async () => {
      const [s, p, f, a] = await Promise.all([getSubscription(), myGymPayments(), getGymFeatures(), myGymApplication()]);
      setSub(s); setPayments(p); setFeatures(f); setApplication(a); setLoaded(true);
    })();
  }, []);

  const open = async (id: string) => {
    try { const r = await gymReceipt(id); if (r) setReceipt(r); }
    catch (e) { showToast(e instanceof Error ? e.message : 'Could not open the receipt', 'error'); }
  };

  if (!loaded) return <div className="text-sm" style={{ color: MUTED }}>Loading…</div>;
  if (sub === undefined) return <Card className="!p-4"><p className="text-xs text-white">Your plan page needs migration 0138, which is not live on this database.</p></Card>;
  if (sub === null) return <Card className="!p-4"><p className="text-xs text-white">Only the gym's owner sees its Core Fitness plan.</p></Card>;

  const st = explain(sub);
  const tone = st.tone === 'bad' ? 'var(--color-secondary)' : st.tone === 'soon' ? 'var(--color-secondary)' : 'var(--color-primary)';
  const billed = !!sub.paid_until;
  const left = sub.days_left ?? 0;
  const ring = billed && left >= 0 ? Math.min(1, left / 30) : 0;
  const included = features.filter((f) => f.enabled);
  const notIncluded = features.filter((f) => !f.enabled);
  const meter = (label: string, used: number, cap: number | null) => (
    <div>
      <div className="flex justify-between text-xs"><span style={{ color: MUTED }}>{label}</span>
        <span className="text-white font-semibold">{used}{cap !== null ? ` of ${cap}` : ' · no limit'}</span></div>
      {cap !== null && cap > 0 && (
        <div className="h-1.5 rounded-full mt-1.5" style={{ background: 'var(--color-surface-high)' }}>
          <div className="h-full rounded-full" style={{ width: `${Math.min(100, (used / cap) * 100)}%`, background: used >= cap ? 'var(--color-secondary)' : 'var(--color-primary)' }} />
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      {receipt && <GymReceiptSheet receipt={receipt} onClose={() => setReceipt(null)} />}
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2"><CreditCard size={22} /> Your plan</h1>
        <p className="text-xs mt-1" style={{ color: MUTED }}>What this gym pays Core Fitness, what it includes, and a receipt for every payment.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        {/* Where the gym stands, with the countdown */}
        <Card className="!p-5">
          <div className="flex items-center gap-5">
            <div className="relative w-24 h-24 flex-shrink-0">
              <svg viewBox="0 0 36 36" className="w-24 h-24 -rotate-90" aria-hidden>
                <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--color-surface-high)" strokeWidth="3" />
                {billed && <circle cx="18" cy="18" r="15.5" fill="none" stroke={tone} strokeWidth="3" strokeLinecap="round"
                  strokeDasharray={`${ring * 97.4} 97.4`} />}
              </svg>
              <div className="absolute inset-0 grid place-items-center text-center">
                {billed ? (
                  <span><span className="block text-2xl font-bold text-white tabular-nums">{Math.max(0, left)}</span><span className="block text-[10px]" style={{ color: MUTED }}>days</span></span>
                ) : <ShieldCheck size={28} style={{ color: 'var(--color-primary)' }} />}
              </div>
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase" style={{ color: MUTED }}>{sub.on_trial ? 'Free trial' : billed ? 'Covered until' : 'Billing'}</p>
              <p className="text-lg font-bold" style={{ color: st.tone === 'bad' ? 'var(--color-secondary)' : '#fff' }}>{st.title}</p>
              {st.lines.map((l) => <p key={l} className="text-xs mt-1" style={{ color: MUTED }}>{l}</p>)}
            </div>
          </div>
        </Card>

        {/* The plan */}
        <Card className="!p-5">
          <p className="text-[11px] font-semibold uppercase" style={{ color: MUTED }}>Your Core Fitness plan</p>
          <p className="text-xl font-bold text-white mt-1 flex items-center gap-2"><Crown size={18} style={{ color: 'var(--color-secondary)' }} /> {sub.plan_name ?? 'Not set'}</p>
          <p className="text-sm mt-1" style={{ color: 'var(--color-text-primary)' }}>
            {sub.price_monthly !== null && Number(sub.price_monthly) > 0 ? <>{peso(sub.price_monthly)} <span style={{ color: MUTED }}>a month</span></>
              : sub.price_monthly !== null ? 'Free' : <span style={{ color: MUTED }}>Core Fitness has not put a price on this plan — ask in <Link to="/support" style={{ color: 'var(--color-primary)' }}>Support</Link>.</span>}
          </p>
          <div className="mt-4 space-y-3">
            {meter('Active members', sub.members, sub.max_members)}
            {meter('Owners and front desk', sub.staff, sub.max_staff)}
          </div>
        </Card>
      </div>

      {application && (
        <Card className="!p-5" id="documents">
          <p className="text-sm font-semibold text-white">Business documents</p>
          <p className="text-xs mt-1" style={{ color: MUTED }}>
            What Core Fitness verified when it let {application.gym_name} in. Send the renewed permit each January, and any document
            before it runs out — you are reminded.
          </p>
          <div className="mt-3"><ApplicationDocuments applicationId={application.id} documents={application.documents} onChanged={loadApplication} renewing /></div>
        </Card>
      )}

      {features.length > 0 && (
        <Card className="!p-5">
          <p className="text-sm font-semibold text-white">What the plan includes</p>
          <div className="grid gap-2 mt-3 sm:grid-cols-2 lg:grid-cols-3">
            {included.map((f) => (
              <div key={f.feature_key} className="flex items-start gap-2 text-xs">
                <Check size={14} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--color-primary)' }} />
                <span><span className="text-white font-semibold">{f.label}</span>{f.description ? <span className="block" style={{ color: MUTED }}>{f.description}</span> : null}</span>
              </div>
            ))}
            {notIncluded.map((f) => (
              <div key={f.feature_key} className="flex items-start gap-2 text-xs" style={{ opacity: 0.6 }}>
                <X size={14} className="flex-shrink-0 mt-0.5" style={{ color: MUTED }} />
                <span><span className="text-white">{f.label}</span><span className="block" style={{ color: MUTED }}>Not on this plan — ask Core Fitness to change plans.</span></span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {billed ? <PayCoreFitness priceMonthly={sub.price_monthly} /> : (
        <Card className="!p-4 flex items-center gap-3">
          <CalendarClock size={16} style={{ color: MUTED }} />
          <p className="text-xs" style={{ color: MUTED }}>Nothing to pay. If Core Fitness starts billing this gym, how to pay appears here with the amount and every way to send it.</p>
        </Card>
      )}

      <Card className="!p-5">
        <p className="text-sm font-semibold text-white flex items-center gap-2"><Users size={15} /> Payments to Core Fitness</p>
        {payments.length === 0 && <p className="text-xs mt-2" style={{ color: MUTED }}>No payment has been recorded for this gym yet.</p>}
        <div className="divide-y mt-1" style={{ borderColor: 'var(--color-border)' }}>
          {payments.map((p) => (
            <div key={p.id} className="flex items-center gap-3 py-2.5">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white">{peso(p.amount)} <span className="text-xs font-normal" style={{ color: MUTED }}>· {p.receipt_no}</span></p>
                <p className="text-xs" style={{ color: MUTED }}>Paid {day(p.paid_on)} · covers to {day(p.covers_until)}{p.method ? ` · ${p.method}` : ''}{p.plan_name ? ` · ${p.plan_name}` : ''}</p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => void open(p.id)}><Receipt size={14} className="mr-1.5" /> Receipt</Button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
