import { useCallback, useEffect, useState } from 'react';
import InfoDot from '../components/InfoDot';
import { Link } from 'react-router-dom';
import { Download, Receipt as ReceiptIcon } from 'lucide-react';
import { downloadCsv } from '../lib/csv';
import ReceiptSheet from '../components/ReceiptSheet';
import PaymentClaims from '../components/PaymentClaims';
import AiTopupClaims from '../components/AiTopupClaims';
import OnlinePayments from '../components/OnlinePayments';
import BillGym from '../components/BillGym';
import Modal from '../components/Modal';
import { detail } from '../components/DetailLayer';
import Pagination from '../components/Pagination';
import { usePaged } from '../lib/usePaged';
import {
  billingSettings, explain, listDue, listGyms, listPayments, listRevenue, paymentReceipt,
  type BillingSettings, type GymDue, type GymPayment, type PlatformGym, type Receipt, type RevenueMonth,
} from '../lib/platform';
import SkelRows from '../components/ui/SkelRows';

const peso = (n: string | number) =>
  '₱' + Number(n).toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const day = (iso: string) =>
  new Date(iso).toLocaleDateString('en-PH', { day: 'numeric', month: 'short', year: 'numeric' });
const monthName = (iso: string) =>
  new Date(iso).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });

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
  const paidPage = usePaged(payments);
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
      {settings && (
        <div className="card money-rules">
          <div className="row">
            <span className="grow">
              <span className="name">Billing rules</span>
              <span className="meta">Read-only {settings.grace_days} day{settings.grace_days === 1 ? '' : 's'} after the due date · owners reminded {settings.reminder_days.join(', ')} day{settings.reminder_days.length === 1 && settings.reminder_days[0] === 1 ? '' : 's'} before · receipts from {settings.business_name}</span>
            </span>
            <Link to="/settings?part=billing" className="btn ghost" style={{ textDecoration: 'none' }}>Change in Settings</Link>
          </div>
        </div>
      )}
      {receipt && <ReceiptSheet receipt={receipt} onClose={() => setReceipt(null)} />}

      {/* Two columns (2026-11-08): what is waiting on the left, each box as tall as what it holds; who is due and every
          payment on the right, the list taking the height. Equal grid rows had padded empty boxes to the same height. */}
      <div className="money-grid">
      <div className="money-col">
      <PaymentClaims onChanged={() => void load()} />
      {/* 0189: AI coach messages gyms paid for, to verify like any payment. */}
      <AiTopupClaims />
      {/* 0191: what gyms paid through PayMongo — recorded by the signed webhook. */}
      <OnlinePayments />

      {/* Recording a payment is a window over the page (2026-11-08): as a box in the grid it shuffled every other box. */}
      <Modal open={!!recording} onClose={() => setRecording(null)} size="lg" label="Bill this gym">
        {recording && (
          <BillGym
            gym={recording}
            onCancel={() => setRecording(null)}
            onDone={() => { setRecording(null); void load(); }}
          />
        )}
      </Modal>

      <div className="card">
        <div className="row">
          <span className="grow">
            <span className="name">
              {thisMonth ? `${peso(thisMonth.total)} in ${monthName(thisMonth.month)}` : 'Nothing paid yet'}
            </span>
            <span className="meta">
              {thisMonth
                ? `${thisMonth.payments} payment${thisMonth.payments === 1 ? '' : 's'} from ${thisMonth.gyms} gym${thisMonth.gyms === 1 ? '' : 's'}`
                : 'No gym has paid Core Fitness yet. Bill a gym below to record the first payment.'}
            </span>
          </span>
        </div>
        {revenue && revenue.length > 1 && (
          <div className="ticks" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))' }}>
            {revenue.slice(0, 12).map((m) => (
              <span key={m.month} className="meta" style={{ cursor: 'pointer' }}
                data-detail={detail({ title: `Paid in ${monthName(m.month)}`, value: peso(m.total), rows: [
                  ['Payments', String(m.payments)], ['Gyms that paid', String(m.gyms)], ['Average payment', m.payments ? peso(Number(m.total) / m.payments) : '—'],
                ], note: 'By the day each payment was made, not the period it covers.' })}>
                <strong style={{ color: 'var(--text)' }}>{peso(m.total)}</strong><br />
                {monthName(m.month)}
              </span>
            ))}
          </div>
        )}
      </div>

      </div>
      <div className="money-col">
      <div className="card">
        <div className="name">Due in the next 30 days <InfoDot tip="Gyms whose paid-until date falls in the next 30 days, or has passed. Owners are reminded before; the grace period is in Settings." /></div>
        <div className="meta">
          A gym goes read-only {grace} day{grace === 1 ? '' : 's'} after its date, and its owners are reminded before. This is where you see it coming.
        </div>
        <div style={{ marginTop: 10 }}>
          {due === null && <SkelRows label="Loading…" />}
          {due?.length === 0 && (
            <p className="empty">
              No gym is due. Gyms with no paid-until date at all are not listed here, set one with
              Bill this gym.
            </p>
          )}
          {due?.map((g) => (
            <div className="row log" key={g.id}>
              <span className="grow">
                <strong style={{ color: 'var(--text)' }}>{g.name}</strong>
                {' · '}{g.members} member{g.members === 1 ? '' : 's'}
                {' · '}
                {g.lock_reason === 'suspended' ? 'suspended by you'
                  : g.lock_reason === 'trial_ended' ? `free trial ended ${day(g.paid_until)}, paused until it pays`
                  : g.days_left < -grace ? `read-only, ${-g.days_left} days past ${day(g.paid_until)}`
                  : g.days_left < 0 ? `${-g.days_left} days late, read-only in ${grace + 1 + g.days_left} more`
                  : g.days_left === 0 ? 'due today'
                  : `due in ${g.days_left} days`}
              </span>
              <button className="btn" onClick={() => setRecording(gyms.find((x) => x.id === g.id) ?? null)}>
                Bill this gym
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="row">
          <span className="grow">
            <span className="name">Every payment <InfoDot tip="What each gym paid Core Fitness. Each one has a numbered receipt the gym's owner can print from Your plan." /></span>
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
            <option value="">Bill a gym…</option>
            {gyms.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </div>
        <div style={{ marginTop: 10 }}>
          {payments === null && <SkelRows label="Loading…" />}
          {payments?.length === 0 && <p className="empty">No payment has been recorded yet.</p>}
          {paidPage.rows.map((p) => (
            <div className="log" key={p.id} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <span style={{ flex: 1, minWidth: 0 }}>
              <strong style={{ color: 'var(--text)' }}>{peso(p.amount)}</strong>
              {p.receipt_no ? <span className="muted"> · {p.receipt_no}</span> : null}
              {', '}{name(p.gym_id)} · paid {day(p.paid_on)} · covers to {day(p.covers_until)}
              {p.method ? ` · ${p.method}` : ''}
              {p.reference ? ` · ${p.reference}` : ''}
              {p.note ? <><br /><span className="muted">{p.note}</span></> : null}
              </span>
              {p.receipt_no && (
                <button className="btn ghost" onClick={() => void openReceipt(p.id)}><ReceiptIcon size={14} /> Receipt</button>
              )}
            </div>
          ))}
          <Pagination page={paidPage.page} perPage={paidPage.perPage} total={paidPage.total} noun={paidPage.total === 1 ? 'payment' : 'payments'} onPage={paidPage.setPage} />
        </div>
      </div>

      </div>
      </div>
    </>
  );
}
