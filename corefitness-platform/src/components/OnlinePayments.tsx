import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CreditCard } from 'lucide-react';
import { explain, onlinePayments, setColoursPrice, themePrice, type OnlinePaymentRow } from '../lib/platform';

const peso = (n: string | number) => '₱' + Number(n).toLocaleString('en-PH', { maximumFractionDigits: 2 });
const when = (iso: string) => new Date(iso).toLocaleString('en-PH', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const WHAT: Record<string, string> = { gym_subscription: 'Plan', ai_topup: 'AI top-up', custom_colours: 'Custom colours' };

/**
 * What gyms paid Core Fitness through PayMongo (0191) — recorded by the signed
 * webhook, nothing for you to verify. A mismatch (paid amount ≠ asked) is
 * listed as failed and in Activity. The custom-colours price is set here.
 */
export default function OnlinePayments() {
  const [rows, setRows] = useState<OnlinePaymentRow[] | null>(null);
  const [price, setPrice] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const load = useCallback(async () => {
    try { const [r, p] = await Promise.all([onlinePayments(), themePrice()]); setRows(r); setPrice(p != null ? String(Number(p)) : ''); setError(null); }
    catch (e) { setRows([]); setError(explain(e, '0191')); }
  }, []);
  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  return (
    <section className="card" style={{ marginTop: 16 }} data-online-payments>
      <h2 className="section-title"><CreditCard size={14} /> Paid online (PayMongo)</h2>
      {error && <p className="err">{error}</p>}
      <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <span className="meta" style={{ margin: 0 }}>Custom colours cost ₱</span>
        <input style={{ width: 90 }} inputMode="decimal" value={price} aria-label="Custom colours price" onChange={(e) => { setPrice(e.target.value); setSaved(false); }} />
        <span className="meta" style={{ margin: 0 }}>once, per gym</span>
        <button className="btn ghost" onClick={() => void setColoursPrice(Number(price)).then(() => setSaved(true)).catch((e: Error) => setError(e.message))}>Save</button>
        {saved && <span className="meta" style={{ margin: 0 }}>Saved</span>}
      </div>
      {rows && rows.length === 0 && <p className="empty">No gym has paid online yet. Payments appear here the moment PayMongo confirms them.</p>}
      {(rows ?? []).slice(0, 30).map((r) => (
        <div key={r.id} className="fb-row">
          <span className="grow">
            <span className="name">{r.gym_id ? <Link to={`/gyms/${r.gym_id}`}>{r.gym_name}</Link> : r.gym_name} · {WHAT[r.purpose] ?? r.purpose} · {peso(r.amount)}</span>
            <span className="meta">{r.status === 'paid' ? `paid ${when(r.paid_at ?? r.created_at)}${r.method ? ` by ${r.method}` : ''} · ${r.payment_id}` : r.status === 'failed' ? 'did not match its checkout — not recorded' : r.status}</span>
          </span>
        </div>
      ))}
    </section>
  );
}
