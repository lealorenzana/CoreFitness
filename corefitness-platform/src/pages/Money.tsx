import { useCallback, useEffect, useState } from 'react';
import { Download, Receipt as ReceiptIcon } from 'lucide-react';
import { downloadCsv } from '../lib/csv';
import ReceiptSheet from '../components/ReceiptSheet';
import {
  billingSettings, explain, listDue, listGyms, listPayments, listRevenue, paymentReceipt, recordPayment, saveBillingSettings,
  type BillingSettings, type GymDue, type GymPayment, type PlatformGym, type Receipt, type RevenueMonth,
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
 * this list shows it coming — after the platform's own grace period (0138).
 */
export default function Money() {
  const [due, setDue] = useState<GymDue[] | null>(null);
  const [revenue, setRevenue] = useState<RevenueMonth[] | null>(null);
  const [payments, setPayments] = useState<GymPayment[] | null>(null);
  const [gyms, setGyms] = useState<PlatformGym[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState<PlatformGym | null>(null);
  const [settings, setSettings] = useState<BillingSettings | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);

  const load = useCallback(async () => {
    try {
      const [d, r, p, g] = await Promise.all([listDue(30), listRevenue(12), listPayments(), listGyms()]);
      setDue(d); setRevenue(r); setPayments(p); setGyms(g); setError(null);
      // Before 0138 there is no setting, and the lock is seven days.
      setSettings(await billingSettings().catch(() => null));
    } catch (e) {
      setDue([]); setRevenue([]); setPayments([]);
      setError(explain(e, '0108'));
    }
  }, []);

  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  const name = (id: string) => gyms.find((g) => g.id === id)?.name ?? 'A gym';
  const thisMonth = revenue?.[0];
  const grace = settings?.grace_days ?? 7;
  const openReceipt = async (id: string) => {
    try { const r = await paymentReceipt(id); if (r) setReceipt(r); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not open the receipt'); }
  };

  return (
    <>
      {error && <p className="err">{error}</p>}
      {receipt && <ReceiptSheet receipt={receipt} onClose={() => setReceipt(null)} />}

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
          A gym goes read-only {grace} day{grace === 1 ? '' : 's'} after its date, and its owners are reminded before. This is where you see it coming.
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
                  : g.days_left < -grace ? `read-only — ${-g.days_left} days past ${day(g.paid_until)}`
                  : g.days_left < 0 ? `${-g.days_left} days late — read-only in ${grace + 1 + g.days_left} more`
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
          <button className="btn ghost" disabled={!payments?.length} onClick={() => downloadCsv('core-fitness-payments', payments ?? [], [
            ['Receipt', (p) => p.receipt_no], ['Gym', (p) => name(p.gym_id)], ['Amount', (p) => Number(p.amount)], ['Paid on', (p) => p.paid_on],
            ['Covers from', (p) => p.covers_from], ['Covers until', (p) => p.covers_until], ['Method', (p) => p.method],
            ['Reference', (p) => p.reference], ['Note', (p) => p.note],
          ])}><Download size={15} /> Export CSV</button>
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
            <div className="log" key={p.id} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <span style={{ flex: 1, minWidth: 0 }}>
              <strong style={{ color: 'var(--text)' }}>{peso(p.amount)}</strong>
              {p.receipt_no ? <span className="muted"> · {p.receipt_no}</span> : null}
              {' — '}{name(p.gym_id)} · paid {day(p.paid_on)} · covers to {day(p.covers_until)}
              {p.method ? ` · ${p.method}` : ''}
              {p.reference ? ` · ${p.reference}` : ''}
              {p.note ? <><br /><span className="muted">{p.note}</span></> : null}
              </span>
              {p.receipt_no && (
                <button className="btn ghost" onClick={() => void openReceipt(p.id)}><ReceiptIcon size={14} /> Receipt</button>
              )}
            </div>
          ))}
        </div>
      </div>

      {settings && <BillingSettingsCard initial={settings} onSaved={setSettings} />}
    </>
  );
}

/**
 * The platform's billing rules (0138): how long after its date a gym keeps
 * working, which days its owners are reminded, and the details printed on every
 * receipt. One row in the database; the gyms' lock and banner read the same one.
 */
function BillingSettingsCard({ initial, onSaved }: { initial: BillingSettings; onSaved: (b: BillingSettings) => void }) {
  const [f, setF] = useState({ ...initial, reminders: initial.reminder_days.join(', ') });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const b: BillingSettings = { grace_days: Number(f.grace_days), business_name: f.business_name,
      reminder_days: f.reminders.split(/[ ,]+/).map(Number).filter((n) => Number.isInteger(n) && n > 0),
      business_address: f.business_address || null, business_email: f.business_email || null,
      business_phone: f.business_phone || null, receipt_note: f.receipt_note || null };
    try { await saveBillingSettings(b); onSaved(b); setMsg('Saved. Every gym\'s lock date follows it now.'); }
    catch (err) { setMsg(err instanceof Error ? err.message : 'Could not save'); }
    finally { setBusy(false); }
  };
  return (
    <form className="card" onSubmit={save}>
      <div className="name">Billing rules and receipts</div>
      <div className="meta">A gym keeps working this many days after its paid-until date, then goes read-only. Nothing is ever deleted.</div>
      <div className="fields">
        <div><label htmlFor="bs-grace">Days before read-only</label>
          <input id="bs-grace" type="number" min={0} max={60} required value={f.grace_days}
            onChange={(e) => setF({ ...f, grace_days: Number(e.target.value) })} /></div>
        <div><label htmlFor="bs-rem">Remind owners, days before</label>
          <input id="bs-rem" value={f.reminders} placeholder="7, 3, 1" onChange={(e) => setF({ ...f, reminders: e.target.value })} /></div>
        <div><label htmlFor="bs-name">Name on receipts</label>
          <input id="bs-name" required value={f.business_name} onChange={(e) => setF({ ...f, business_name: e.target.value })} /></div>
        <div><label htmlFor="bs-addr">Address on receipts</label>
          <input id="bs-addr" value={f.business_address ?? ''} onChange={(e) => setF({ ...f, business_address: e.target.value })} /></div>
        <div><label htmlFor="bs-email">Email on receipts</label>
          <input id="bs-email" type="email" value={f.business_email ?? ''} onChange={(e) => setF({ ...f, business_email: e.target.value })} /></div>
        <div><label htmlFor="bs-phone">Phone on receipts</label>
          <input id="bs-phone" value={f.business_phone ?? ''} onChange={(e) => setF({ ...f, business_phone: e.target.value })} /></div>
        <div style={{ gridColumn: '1 / -1' }}><label htmlFor="bs-note">Line at the bottom of receipts (optional)</label>
          <input id="bs-note" value={f.receipt_note ?? ''} onChange={(e) => setF({ ...f, receipt_note: e.target.value })} /></div>
      </div>
      <p className="meta" style={{ marginTop: 10 }}>Owners are also told on the due date, the day after, and the day it goes read-only.</p>
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save billing rules'}</button>
        {msg && <span className="meta" style={{ marginTop: 0 }}>{msg}</span>}
      </div>
    </form>
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
