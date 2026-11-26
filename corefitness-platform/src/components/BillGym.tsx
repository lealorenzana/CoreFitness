import { useEffect, useState } from 'react';
import DatePicker from './DatePicker';
import {
  billingSettings, listPlatformPlans, recordPayment, setGymBilling, setGymPlan,
  type PlatformGym, type PlatformPlan,
} from '../lib/platform';

const peso = (n: string | number) => '₱' + Number(n).toLocaleString('en-PH', { maximumFractionDigits: 2 });
/** YYYY-MM-DD as "3 Dec 2026", read as a calendar date, never through the browser's clock. */
const day = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-PH', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
};
const todayManila = () => new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10);
const plusDays = (from: string, n: number) => {
  const d = new Date(from + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
};
/** n calendar months on, less a day: from 4 Dec, one month covers to 3 Jan. */
const coverEnd = (from: string, months: number) => {
  const [y, m, d] = from.split('-').map(Number);
  return plusDays(new Date(Date.UTC(y, m - 1 + months, d)).toISOString().slice(0, 10), -1);
};
const isTrial = (g: PlatformGym) => g.plan === 'trial' && Number(g.paid_total) === 0;

/**
 * Where a gym stands, in words (2026-11-27, "even I get confused how it works").
 * The same rules as gym_lock_reason (0138/0198): a trial stops the day after its
 * date; a paid gym is open for the grace days after it, then read only.
 */
export function billingState(g: PlatformGym, grace: number): string[] {
  const lines: string[] = [];
  if (g.lock_reason === 'suspended') lines.push('Suspended by you (Manage), so it is read only whatever it has paid.');
  if (g.lock_reason === 'archived') lines.push('Archived, off the service.');
  if (!g.paid_until) {
    lines.push('Not billed: it has no covered until date, so nothing is ever due and it never locks.');
  } else if (g.lock_reason === 'trial_ended') {
    lines.push(`Free trial ended ${day(g.paid_until)}. Paused for everyone at the gym until a payment is recorded.`);
  } else if (isTrial(g)) {
    lines.push(`Free trial until ${day(g.paid_until)}${g.days_left !== null ? `, ${g.days_left} day${g.days_left === 1 ? '' : 's'} left` : ''}. The next day the app stops for the gym (trials get no grace days).`);
  } else {
    const lock = day(plusDays(g.paid_until, grace + 1));
    const left = g.days_left ?? 0;
    lines.push(g.lock_reason === 'overdue'
      ? `Read only since ${lock}, ${-left} days past ${day(g.paid_until)}. It opens again the moment a payment is recorded.`
      : left < 0
      ? `${-left} day${left === -1 ? '' : 's'} late (was covered until ${day(g.paid_until)}). Read only from ${lock} if still unpaid.`
      : `Covered until ${day(g.paid_until)}, ${left} day${left === 1 ? '' : 's'} left. If unpaid, read only from ${lock}.`);
  }
  lines.push(g.max_members !== null
    ? `${g.members.toLocaleString('en-PH')} of ${g.max_members} active members. Free plan members count the same as paying ones.`
    : `${g.members.toLocaleString('en-PH')} active members, no limit on this plan.`);
  return lines;
}

type Choice = 'paid' | 'date' | 'stop';

/**
 * Bill this gym: one window for everything money does to a gym's access. It
 * replaced four scattered controls (Money's Record a payment, the gym page's
 * Change the date and No billing, the Plan window's Paid until box). Each act is
 * an existing platform function: set_gym_plan, record_gym_payment, platform_set_billing.
 */
export default function BillGym({ gym, onDone, onCancel }: { gym: PlatformGym; onDone: () => void; onCancel: () => void }) {
  const today = todayManila();
  const [plans, setPlans] = useState<PlatformPlan[]>([]);
  const [grace, setGrace] = useState(7);
  const [choice, setChoice] = useState<Choice>('paid');
  // A trial pays for a real plan: recording one on 'trial' would leave it on trial.
  const [plan, setPlan] = useState(gym.plan);
  const [months, setMonths] = useState(1);
  // A renewal continues from where the last one ended, so paying early loses no days.
  const from = gym.paid_until && gym.paid_until >= today ? plusDays(gym.paid_until, 1) : today;
  const [until, setUntil] = useState(coverEnd(from, 1));
  const [amount, setAmount] = useState('');
  const [paidOn, setPaidOn] = useState(today);
  const [method, setMethod] = useState('cash');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [moveTo, setMoveTo] = useState(gym.paid_until && gym.paid_until >= today ? gym.paid_until : plusDays(today, 30));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const payable = plans.filter((p) => (p.is_active || p.key === gym.plan) && p.key !== 'trial' && p.price_monthly !== null);
  const chosen = plans.find((p) => p.key === plan);
  const priceFor = (p: PlatformPlan | undefined, n: number) =>
    !p || p.price_monthly === null ? '' : String(n === 12 && p.price_yearly !== null ? Number(p.price_yearly) : Number(p.price_monthly) * n);

  useEffect(() => {
    void (async () => {
      const [p, s] = await Promise.all([listPlatformPlans(), billingSettings().catch(() => null)]);
      setPlans(p);
      if (s) setGrace(s.grace_days);
      const start = p.find((x) => x.key === gym.plan && x.key !== 'trial' && x.price_monthly !== null)
        ?? p.find((x) => x.key === 'starter') ?? p.find((x) => x.is_active && x.key !== 'trial');
      if (start) { setPlan(start.key); setAmount(priceFor(start, 1)); }
    })().catch((e) => setError(e instanceof Error ? e.message : 'Could not load the plans'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gym.id]);

  const pickPlan = (key: string) => { setPlan(key); setAmount(priceFor(plans.find((p) => p.key === key), months)); };
  const pickMonths = (n: number) => { setMonths(n); setUntil(coverEnd(from, n)); setAmount(priceFor(chosen, n)); };

  const tooSmall = chosen?.max_members != null && gym.members > chosen.max_members;
  const review = choice === 'paid'
    ? `This records ${amount ? peso(amount) : 'a payment'} paid ${method ? `by ${method}` : ''} on ${day(paidOn)}${plan !== gym.plan && chosen ? `, moves ${gym.name} to ${chosen.name}` : ''}, and covers it until ${day(until)}. ${gym.lock_reason === 'overdue' || gym.lock_reason === 'trial_ended' ? 'It opens again at once.' : 'It stays open.'} A numbered receipt appears on its owner's Your plan.`
    : choice === 'date'
    ? `No money is recorded. ${gym.name} is covered until ${day(moveTo)}${isTrial(gym) ? ' (its free trial ends then)' : ''}, and its owner is told the new date.`
    : `${gym.name} will have no covered until date: nothing is ever due and it never locks. Use this for a founding or partner gym. Its owner is told.`;

  const confirm = async () => {
    setBusy(true); setError(null);
    try {
      if (choice === 'paid') {
        // The plan first: a payment is filed under the plan the gym is on when it is recorded.
        if (plan !== gym.plan) await setGymPlan(gym.id, plan, null);
        await recordPayment({
          gym: gym.id, amount: Number(amount || 0), coversUntil: until, paidOn, coversFrom: from,
          method: method || null, reference: reference.trim() || null, note: note.trim() || null,
        });
      } else {
        await setGymBilling(gym.id, choice === 'date' ? moveTo : null, note.trim() || null);
      }
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That could not be saved');
      setBusy(false);
    }
  };

  const CHOICES: [Choice, string][] = [
    ['paid', 'They paid'],
    ['date', gym.paid_until ? (isTrial(gym) ? 'Lengthen or shorten the trial' : 'Give free days or move the date') : 'Start billing'],
    ...(gym.paid_until ? [['stop', 'Stop billing this gym'] as [Choice, string]] : []),
  ];

  return (
    <div className="card ask bill-gym" data-bill-gym>
      <div className="name">Bill {gym.name}</div>
      <div className="bill-state" data-bill-state>
        <strong>{chosen && plan === gym.plan ? chosen.name : gym.plan_name ?? gym.plan}{gym.price_monthly !== null ? `, ${peso(gym.price_monthly)} a month` : ''}</strong>
        {billingState(gym, grace).map((l) => <span key={l}>{l}</span>)}
      </div>

      <div className="app-lbl" style={{ marginTop: 14 }}>What happened?</div>
      <div className="ptabs bill-choices" role="radiogroup" aria-label="What happened">
        {CHOICES.map(([k, label]) => (
          <button key={k} type="button" role="radio" aria-checked={choice === k} className={choice === k ? 'on' : undefined}
            onClick={() => setChoice(k)}>{label}</button>
        ))}
      </div>

      {choice === 'paid' && (
        <div className="fields">
          <div>
            <label htmlFor="bg-plan">Plan</label>
            <select id="bg-plan" value={plan} onChange={(e) => pickPlan(e.target.value)}>
              {payable.map((p) => <option key={p.key} value={p.key}>{p.name}, {peso(p.price_monthly!)} a month{p.max_members ? `, up to ${p.max_members} members` : ', no member limit'}</option>)}
            </select>
          </div>
          <div>
            <span className="label-like">How long</span>
            <div className="ptabs" role="radiogroup" aria-label="How long">
              {[1, 3, 6, 12].map((n) => (
                <button key={n} type="button" role="radio" aria-checked={months === n} className={months === n ? 'on' : undefined}
                  onClick={() => pickMonths(n)}>{n === 12 ? '1 year' : `${n} month${n === 1 ? '' : 's'}`}</button>
              ))}
            </div>
          </div>
          <div>
            <label htmlFor="bg-amt">Amount (₱)</label>
            <input id="bg-amt" type="number" min={0} step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div>
            <label htmlFor="bg-until">Covered until</label>
            <DatePicker id="bg-until" mode="future" value={until} onChange={setUntil} />
          </div>
          <div>
            <label htmlFor="bg-how">How it arrived</label>
            <select id="bg-how" value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="cash">Cash</option><option value="GCash">GCash</option><option value="bank transfer">Bank transfer</option><option value="other">Other</option>
            </select>
          </div>
          <div>
            <label htmlFor="bg-on">Paid on</label>
            <DatePicker id="bg-on" mode="record" bounds={{ backDays: 62 }} value={paidOn} onChange={setPaidOn} />
          </div>
          <div>
            <label htmlFor="bg-ref">Reference (optional)</label>
            <input id="bg-ref" value={reference} placeholder="receipt or GCash reference" onChange={(e) => setReference(e.target.value)} />
          </div>
          <div>
            <label htmlFor="bg-note">Note (optional)</label>
            <input id="bg-note" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
          </div>
          {tooSmall && <p className="meta" style={{ gridColumn: '1 / -1', color: 'var(--warn)' }}>
            It has {gym.members} active members, over {chosen!.name}'s {chosen!.max_members}. Nobody is removed, but no new member gets in until it is under.</p>}
        </div>
      )}

      {choice === 'date' && (
        <div className="fields">
          <div>
            <label htmlFor="bg-move">Covered until</label>
            <DatePicker id="bg-move" mode="future" value={moveTo} onChange={setMoveTo} />
          </div>
          <div>
            <label htmlFor="bg-why">A note for the owner (optional)</label>
            <input id="bg-why" value={note} maxLength={300} placeholder="e.g. a free week while you set up" onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
      )}

      {choice === 'stop' && (
        <div className="fields">
          <div style={{ gridColumn: '1 / -1' }}>
            <label htmlFor="bg-stop">A note for the owner (optional)</label>
            <input id="bg-stop" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
      )}

      <p className="bill-review" data-bill-review>{review}</p>
      {error && <p className="err">{error}</p>}
      <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
        <button className="btn ghost" type="button" onClick={onCancel} disabled={busy}>Cancel</button>
        <button className="btn" type="button" onClick={() => void confirm()}
          disabled={busy || (choice === 'paid' && (!amount || !until || !payable.length)) || (choice === 'date' && !moveTo)}>
          {busy ? 'Saving…' : 'Confirm'}
        </button>
      </div>
    </div>
  );
}
