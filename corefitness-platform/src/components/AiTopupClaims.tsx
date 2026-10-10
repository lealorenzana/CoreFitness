import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Image as ImageIcon, Sparkles } from 'lucide-react';
import {
  aiTopups, decideTopup, explain, setTopupPrice, topupPrice, type AiTopupRow,
} from '../lib/platform';

const peso = (n: string | number) => '₱' + Number(n).toLocaleString('en-PH', { maximumFractionDigits: 2 });
const when = (iso: string) => new Date(iso).toLocaleDateString('en-PH', { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * AI coach top-ups gyms say they paid for (0189). Check the reference in Core
 * Fitness's own GCash or bank history, then Add — the messages go on the gym's
 * balance and the owner is told — or say why not. The pack's size and price
 * are set here too; owners see exactly these numbers.
 */
export default function AiTopupClaims() {
  const [rows, setRows] = useState<AiTopupRow[] | null>(null);
  const [price, setPrice] = useState<{ messages: string; price: string } | null>(null);
  const [why, setWhy] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [proof, setProof] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [r, p] = await Promise.all([aiTopups(), topupPrice()]);
      setRows(r); setPrice(p ? { messages: String(p.messages), price: String(Number(p.price)) } : null); setError(null);
    } catch (e) { setRows([]); setError(explain(e, '0189')); }
  }, []);
  useEffect(() => { void (async () => { await load(); })(); }, [load]);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try { await fn(); await load(); } catch (e) { setError(e instanceof Error ? e.message : 'That did not work'); } finally { setBusy(false); }
  };

  const pending = (rows ?? []).filter((r) => r.status === 'pending');
  return (
    <section className="card" style={{ marginTop: 16 }} data-ai-topups>
      <h2 className="section-title"><Sparkles size={14} /> AI coach top-ups {pending.length > 0 && <span className="pill warn">{pending.length} to verify</span>}</h2>
      {error && <p className="err">{error}</p>}
      {price && (
        <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          <span className="meta" style={{ margin: 0 }}>A pack is</span>
          <input style={{ width: 90 }} inputMode="numeric" value={price.messages} aria-label="Messages in a pack" onChange={(e) => setPrice({ ...price, messages: e.target.value })} />
          <span className="meta" style={{ margin: 0 }}>messages for ₱</span>
          <input style={{ width: 90 }} inputMode="decimal" value={price.price} aria-label="Price of a pack" onChange={(e) => setPrice({ ...price, price: e.target.value })} />
          <button className="btn ghost" disabled={busy} onClick={() => void run(() => setTopupPrice(Number(price.messages), Number(price.price)))}>Save</button>
        </div>
      )}
      {rows && rows.length === 0 && <p className="empty">No gym has bought top-ups yet.</p>}
      {(rows ?? []).slice(0, 20).map((r) => (
        <div key={r.id} className="fb-row" data-topup={r.id}>
          <span className="grow">
            <span className="name"><Link to={`/gyms/${r.gym_id}`}>{r.gym_name}</Link> · {r.messages.toLocaleString('en-PH')} messages · {peso(r.amount)}</span>
            <span className="meta">ref <b>{r.reference}</b> · {when(r.created_at)} · balance now {r.balance.toLocaleString('en-PH')}
              {r.status !== 'pending' ? ` · ${r.status === 'paid' ? 'added' : `not added: ${r.reason ?? ''}`}` : ''}</span>
          </span>
          {r.status === 'pending' && (
            <div className="fb-actions">
              {r.proof_image && <button type="button" className="btn ghost" onClick={() => setProof(r.proof_image)}><ImageIcon size={13} /> Screenshot</button>}
              <button type="button" className="btn" disabled={busy} onClick={() => void run(() => decideTopup(r.id, true, null))}>Add the messages</button>
              <input value={why[r.id] ?? ''} placeholder="Why not (the owner reads this)" aria-label={`Why not for ${r.reference}`} maxLength={500}
                onChange={(e) => setWhy({ ...why, [r.id]: e.target.value })} />
              <button type="button" className="btn ghost" disabled={busy || !(why[r.id] ?? '').trim()} onClick={() => void run(() => decideTopup(r.id, false, why[r.id]!.trim()))}>Not paid</button>
            </div>
          )}
        </div>
      ))}
      {proof && (
        <div className="qr-big" role="dialog" aria-modal="true" onClick={() => setProof(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', display: 'grid', placeItems: 'center', zIndex: 50 }}>
          <img src={proof} alt="Receipt screenshot" style={{ maxWidth: '90vw', maxHeight: '85vh', borderRadius: 12 }} />
        </div>
      )}
    </section>
  );
}
