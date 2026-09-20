import { useCallback, useEffect, useState } from 'react';
import {
  explain, listDue, listGyms, listPayments, listRevenue, recordPayment,
  type GymDue, type GymPayment, type PlatformGym, type RevenueMonth,
} from '../lib/platform';

const peso = (n: string | number) =>
  '₱' + Number(n).toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const day = (iso: string) =>
  new Date(iso).toLocaleDateString('en-PH', { day: 'numeric', month: 'short', year: 'numeric' });
const monthName = (iso: string) =>
  new Date(iso).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });

/** Today in Manila, as the date input wants it. The gym's clock, not the browser's. */
const todayManila = () => {
  const d = new Date(Date.now() + 8 * 3_600_000);
  return d.toISOString().slice(0, 10);
};
const plusDays = (from: string, days: number) => {
  const d = new Date(from + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/**
 * What the service is owed, and what it has been paid.
 *
 * `gyms.paid_until` used to be a date typed into a prompt. It is now the
 * consequence of a recorded payment (0108's `record_gym_payment`), so there is
 * always an amount, a date and a reference behind a gym's access — the same
 * rule the gyms themselves follow about a member's expiry.
 *
 * "Due soon" exists because the first anyone knew of a lock used to be a gym
 * that had stopped working. A gym goes read-only seven days after its date, and
 * this list shows it coming.
 */
export default function Money() {
  const [due, setDue] = useState<GymDue[] | null>(null);
  const [revenue, setRevenue] = useState<RevenueMonth[] | null>(null);
  const [payments, setPayments] = useState<GymPayment[] | null>(null);
  const [gyms, setGyms] = useState<PlatformGym[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState<PlatformGym | null>(null);

  const load = useCallback(async () => {
    try {
      const [d, r, p, g] = await Promise.all([listDue(30), listRevenue(12), listPayments(), listGyms()]);
      setDue(d); setRevenue(r); setPayments(p); setGyms(g); setError(null);
    } catch (e) {
      setDue([]); setRevenue([]); setPayments([]);
      setError(explain(e, '0108'));
    }
  }, []);

  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  const name = (id: string) => gyms.find((g) => g.id === id)?.name ?? 'A gym';
  const thisMonth = revenue?.[0];

  return (
    <>
      {error && <p className="err">{error}</p>}

      {recording && (
        <RecordPayment
          gym={recording}
          onCancel={() => setRecording(null)}
          onDone={() => { setRecording(null); void load(); }}
        />
      )}

      <div className="card">
        <div className="row">
          <span className="grow">
            <span className="name">
              {thisMonth ? `${peso(thisMonth.total)} in ${monthName(thisMonth.month)}` : 'Nothing paid yet'}
            </span>
            <span className="meta">
              {thisMonth
                ? `${thisMonth.payments} payment${thisMonth.payments === 1 ? '' : 's'} from ${thisMonth.gyms} gym${thisMonth.gyms === 1 ? '' : 's'}`
                : 'No gym has paid Core Fitness yet. Record the first payment from a gym below.'}
            </span>
          </span>
        </div>
        {revenue && revenue.length > 1 && (
          <div className="ticks" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))' }}>
            {revenue.slice(0, 12).map((m) => (
              <span key={m.month} className="meta">
                <strong style={{ color: 'var(--text)' }}>{peso(m.total)}</strong><br />
                {monthName(m.month)}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <div className="name">Due in the next 30 days</div>
        <div className="meta">
          A gym goes read-only a week after its date. This is where you see it coming.
        </div>
        <div style={{ marginTop: 10 }}>
          {due === null && <p className="empty">Loading…</p>}
          {due?.length === 0 && (
            <p className="empty">
              No gym is due. Gyms with no paid-until date at all are not listed here — set one by
              recording a payment.
            </p>
          )}
          {due?.map((g) => (
            <div className="row log" key={g.id}>
              <span className="grow">
                <strong style={{ color: 'var(--text)' }}>{g.name}</strong>
                {' · '}{g.members} member{g.members === 1 ? '' : 's'}
                {' · '}
                {g.lock_reason === 'suspended' ? 'suspended by you'
                  : g.days_left < -7 ? `read-only — ${-g.days_left} days past ${day(g.paid_until)}`
                  : g.days_left < 0 ? `${-g.days_left} days late — read-only in ${7 + g.days_left} more`
                  : g.days_left === 0 ? 'due today'
                  : `due in ${g.days_left} days`}
              </span>
              <button className="btn" onClick={() => setRecording(gyms.find((x) => x.id === g.id) ?? null)}>
                Record a payment
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="row">
          <span className="grow">
            <span className="name">Every payment</span>
            <span className="meta">What each gym paid, what it covered, and how it arrived.</span>
          </span>
          <select
            className="grow"
            style={{ maxWidth: 220 }}
            value=""
            onChange={(e) => {
              const g = gyms.find((x) => x.id === e.target.value);
              if (g) setRecording(g);
            }}
          >
            <option value="">Record a payment from…</option>
            {gyms.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </div>
        <div style={{ marginTop: 10 }}>
          {payments === null && <p className="empty">Loading…</p>}
          {payments?.length === 0 && <p className="empty">No payment has been recorded yet.</p>}
          {payments?.map((p) => (
            <div className="log" key={p.id}>
              <strong style={{ color: 'var(--text)' }}>{peso(p.amount)}</strong>
              {' — '}{name(p.gym_id)} · paid {day(p.paid_on)} · covers to {day(p.covers_until)}
              {p.method ? ` · ${p.method}` : ''}
              {p.reference ? ` · ${p.reference}` : ''}
              {p.note ? <><br /><span className="muted">{p.note}</span></> : null}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

/**
 * Recording a payment.
 *
 * Defaults are a guess, never a decision: today, and a month from today. Both
 * are editable, because a gym that paid last week for three months is the
 * normal case and typing over a wrong default is worse than typing a right one.
 */
function RecordPayment({ gym, onCancel, onDone }: {
  gym: PlatformGym; onCancel: () => void; onDone: () => void;
}) {
  const today = todayManila();
  // A renewal continues from where the last one ended, not from today —
  // otherwise a gym that pays early loses the days it already bought.
  const from = gym.paid_until && gym.paid_until > today ? plusDays(gym.paid_until, 1) : today;
  const [form, setForm] = useState({
    amount: gym.price_monthly ?? '',
    paid_on: today,
    covers_from: from,
    covers_until: plusDays(from, 30),
    method: 'cash',
    reference: '',
    note: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await recordPayment({
        gym: gym.id,
        amount: Number(form.amount || 0),
        coversUntil: form.covers_until,
        paidOn: form.paid_on,
        coversFrom: form.covers_from || null,
        method: form.method || null,
        reference: form.reference || null,
        note: form.note || null,
      });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That could not be recorded');
      setBusy(false);
    }
  };

  return (
    <form className="card ask" onSubmit={submit}>
      <div className="name">A payment from {gym.name}</div>
      <div className="meta">
        This is what moves the gym's access. {gym.paid_until
          ? `It is covered to ${day(gym.paid_until)} today.`
          : 'It has no paid-until date, so it has never been past due.'}
        {gym.price_monthly !== null
          ? ` Its plan is ${peso(gym.price_monthly)} a month.`
          : ' Its plan has no price set, so the amount is yours to type.'}
      </div>
      <div className="fields">
        <div>
          <label htmlFor="pay-amt">Amount (₱)</label>
          <input id="pay-amt" type="number" min={0} step="0.01" required value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })} />
        </div>
        <div>
          <label htmlFor="pay-on">Paid on</label>
          <input id="pay-on" type="date" required value={form.paid_on}
            onChange={(e) => setForm({ ...form, paid_on: e.target.value })} />
        </div>
        <div>
          <label htmlFor="pay-from">Covers from</label>
          <input id="pay-from" type="date" value={form.covers_from}
            onChange={(e) => setForm({ ...form, covers_from: e.target.value })} />
        </div>
        <div>
          <label htmlFor="pay-to">Covers until</label>
          <input id="pay-to" type="date" required value={form.covers_until}
            onChange={(e) => setForm({ ...form, covers_until: e.target.value })} />
        </div>
        <div>
          <label htmlFor="pay-how">How it arrived</label>
          <input id="pay-how" value={form.method} placeholder="cash, bank transfer, GCash"
            onChange={(e) => setForm({ ...form, method: e.target.value })} />
        </div>
        <div>
          <label htmlFor="pay-ref">Reference</label>
          <input id="pay-ref" value={form.reference} placeholder="receipt or bank reference"
            onChange={(e) => setForm({ ...form, reference: e.target.value })} />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label htmlFor="pay-note">Note (optional)</label>
          <input id="pay-note" value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })} />
        </div>
      </div>
      {error && <p className="err">{error}</p>}
      <p className="meta" style={{ marginTop: 10 }}>
        Recording this covers {gym.name} to {day(form.covers_until)}. A payment covering an earlier
        date than the gym already has never pulls its access in.
      </p>
      <div style={{ height: 12 }} />
      <div className="row">
        <button className="btn" type="submit" disabled={busy}>{busy ? 'Recording…' : 'Record it'}</button>
        <button className="btn ghost" type="button" onClick={onCancel} disabled={busy}>Cancel</button>
      </div>
    </form>
  );
}
