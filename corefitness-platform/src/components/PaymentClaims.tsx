import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BadgeCheck, Image as ImageIcon, Wallet, XCircle } from 'lucide-react';
import Modal from './Modal';
import {
  CHANGED, explain, paymentClaims, rejectPayment, verifyPayment, type PaymentClaim,
} from '../lib/platform';

const peso = (n: string | number) => '₱' + Number(n).toLocaleString('en-PH', { maximumFractionDigits: 2 });
const day = (iso: string) => new Date(iso.length === 10 ? `${iso}T00:00:00` : iso)
  .toLocaleDateString('en-PH', { day: 'numeric', month: 'short', year: 'numeric' });
const todayManila = () => new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10);
/** One calendar month on from a YYYY-MM-DD, as dates, never through UTC. */
const addMonths = (from: string, months: number) => {
  const [y, m, d] = from.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1 + months, d));
  return t.toISOString().slice(0, 10);
};

/**
 * Payments gyms say they sent (0148). The money is in Core Fitness's own GCash
 * or bank history, which this screen cannot see: check the reference there,
 * then Verify — which records the payment (receipt, paid-until, unlock) — or
 * say why not, which the gym's owner is told.
 */
export default function PaymentClaims({ onChanged }: { onChanged?: () => void }) {
  const [claims, setClaims] = useState<PaymentClaim[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<PaymentClaim | null>(null);
  const [until, setUntil] = useState('');
  const [amount, setAmount] = useState('');
  const [why, setWhy] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setClaims(await paymentClaims('pending')); setError(null); }
    catch (e) { setClaims([]); setError(explain(e, '0148')); }
  }, []);
  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  const pick = (c: PaymentClaim) => {
    // Continues from the gym's current paid-until, or from the day it paid.
    const start = c.paid_until && c.paid_until > c.paid_on ? c.paid_until : c.paid_on;
    setOpen(c); setUntil(addMonths(start, c.months)); setAmount(String(Number(c.amount))); setWhy(''); setError(null);
  };
  const done = async () => { setOpen(null); await load(); onChanged?.(); window.dispatchEvent(new Event(CHANGED)); };
  const verify = async () => {
    if (!open) return;
    setBusy(true);
    try { await verifyPayment(open.id, until, Number(amount)); await done(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not verify'); }
    finally { setBusy(false); }
  };
  const reject = async () => {
    if (!open) return;
    setBusy(true);
    try { await rejectPayment(open.id, why.trim()); await done(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not answer'); }
    finally { setBusy(false); }
  };

  if (claims === null) return null;
  return (
    <section className="card" style={{ marginBottom: 16 }}>
      <h2 className="section-title"><Wallet size={14} /> Payments to verify
        {claims.length > 0 && <span className="count" style={{ marginLeft: 8 }}>{claims.length}</span>}</h2>
      {error && !open && <p className="err">{error}</p>}
      {claims.length === 0 ? (
        <p className="meta" style={{ margin: 0 }}>
          Nothing waiting. When a gym pays by GCash, Maya or bank, its owner sends the reference and a screenshot from
          Your plan in their admin app, and it appears here.
        </p>
      ) : claims.map((c) => (
        <div key={c.id} className="claim">
          <div style={{ minWidth: 0 }}>
            <div className="name"><Link to={`/gyms/${c.gym_id}`}>{c.gym_name}</Link> · {peso(c.amount)} by {c.method_label}</div>
            <div className="meta" style={{ margin: '4px 0 0' }}>
              Ref <b style={{ color: 'var(--text)', letterSpacing: '0.04em' }}>{c.reference}</b> · sent {day(c.paid_on)}
              {' · '}{c.months} month{c.months === 1 ? '' : 's'}{c.plan_name ? ` of ${c.plan_name}` : ''}
              {c.price_monthly ? ` (list ${peso(Number(c.price_monthly) * c.months)})` : ''}
              {c.submitted_by_name ? ` · by ${c.submitted_by_name}` : ''}
            </div>
            {c.note && <div className="meta" style={{ margin: '4px 0 0' }}>“{c.note}”</div>}
          </div>
          <button className="btn" onClick={() => pick(c)}>{c.proof_image ? <ImageIcon size={14} /> : null} Check it</button>
        </div>
      ))}

      <Modal open={!!open} onClose={() => setOpen(null)} size="lg"
        title={open ? `${open.gym_name}: ${peso(open.amount)} by ${open.method_label}` : ''}
        subtitle="Find this reference in your own GCash or bank history before you verify it.">
        {open && (
          <div className="grid-2" style={{ gap: 18, alignItems: 'start' }}>
            <div>
              {open.proof_image
                ? <img className="proof" src={open.proof_image} alt={`Screenshot sent by ${open.gym_name}`} />
                : <p className="empty">No screenshot was sent — check the reference alone.</p>}
            </div>
            <div>
              <dl className="kv">
                <dt>Reference</dt><dd><b>{open.reference}</b></dd>
                <dt>Amount</dt><dd>{peso(open.amount)}</dd>
                <dt>Sent on</dt><dd>{day(open.paid_on)}</dd>
                <dt>For</dt><dd>{open.months} month{open.months === 1 ? '' : 's'}{open.plan_name ? ` of ${open.plan_name}` : ''}</dd>
                <dt>Paid until now</dt><dd>{open.paid_until ? day(open.paid_until) : 'No date yet'}</dd>
                <dt>Claimed</dt><dd>{day(open.created_at)}{open.submitted_by_name ? ` by ${open.submitted_by_name}` : ''}</dd>
              </dl>
              <div className="fields" style={{ marginTop: 14 }}>
                <div>
                  <label htmlFor="pc-amount">Amount received</label>
                  <input id="pc-amount" type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
                </div>
                <div>
                  <label htmlFor="pc-until">Covers the gym until</label>
                  <input id="pc-until" type="date" value={until} min={todayManila()} onChange={(e) => setUntil(e.target.value)} />
                </div>
              </div>
              <button className="btn" style={{ marginTop: 12, width: '100%' }} disabled={busy || !until || !(Number(amount) > 0)}
                onClick={() => void verify()}>
                <BadgeCheck size={15} /> {busy ? 'Recording…' : 'I found it — verify and record'}
              </button>
              <div style={{ marginTop: 18 }}>
                <label htmlFor="pc-why">Or, it is not there — tell the owner why</label>
                <input id="pc-why" value={why} placeholder="No transfer with that reference on that day" onChange={(e) => setWhy(e.target.value)} />
                <button className="btn ghost" style={{ marginTop: 8 }} disabled={busy || why.trim().length < 3} onClick={() => void reject()}>
                  <XCircle size={15} /> Not found
                </button>
              </div>
              {error && <p className="err">{error}</p>}
            </div>
          </div>
        )}
      </Modal>
    </section>
  );
}
