import { useCallback, useEffect, useState } from 'react';
import { Plus, QrCode, Trash2, Wallet } from 'lucide-react';
import InfoDot from './InfoDot';
import { explain, paymentMethods, removePaymentMethod, savePaymentMethod, type PaymentMethod } from '../lib/platform';
import { shrinkImage } from '../lib/image';

const KINDS: { key: PaymentMethod['kind']; label: string }[] = [
  { key: 'gcash', label: 'GCash' }, { key: 'maya', label: 'Maya' }, { key: 'bank', label: 'Bank transfer' }, { key: 'other', label: 'Other' },
];
const blank = (sort: number): PaymentMethod => ({
  id: '', kind: 'gcash', label: 'GCash', account_name: '', account_number: '', qr_image: null,
  instructions: 'Send the exact amount, then send us the reference number from Your plan in your admin app.', sort_order: sort, active: true,
});

/**
 * How gyms pay Core Fitness (0148): the numbers and QR codes a gym's owner sees
 * on Your plan, and an approved applicant sees on their status page. Gyms are
 * far away and the business is not a payment processor, so the money moves
 * GCash-to-GCash or bank-to-bank, and the gym sends the reference back.
 */
export default function PaymentMethods() {
  const [rows, setRows] = useState<PaymentMethod[] | null>(null);
  const [edit, setEdit] = useState<PaymentMethod | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setRows(await paymentMethods()); }
    catch (e) { setRows([]); setMsg(explain(e, '0148')); }
  }, []);
  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!edit) return;
    setBusy(true); setMsg(null);
    try { await savePaymentMethod({ ...edit, id: edit.id || null }); setEdit(null); await load(); setMsg('Saved — gyms see it on Your plan.'); }
    catch (err) { setMsg(err instanceof Error ? err.message : 'Could not save'); }
    finally { setBusy(false); }
  };
  const remove = async (m: PaymentMethod) => {
    if (!window.confirm(`Remove ${m.label}? Gyms stop seeing it straight away.`)) return;
    try { await removePaymentMethod(m.id); await load(); } catch (err) { setMsg(err instanceof Error ? err.message : 'Could not remove'); }
  };

  return (
    <section className="card set-6">
      <h2 className="section-title"><Wallet size={14} /> How gyms pay you
        <InfoDot tip="Shown to every gym's owner on Your plan, and to an applicant once you let them in. They send the money, then the reference and a screenshot; you verify it on Money." /></h2>
      {rows === null ? <p className="empty">Loading…</p> : (
        <>
          {rows.length === 0 && !edit && (
            <p className="meta" style={{ marginTop: 0 }}>
              No way to pay yet — gyms see “ask Core Fitness how to pay”. Add your GCash number and QR code so a gym in another
              province can pay without travelling.
            </p>
          )}
          {rows.map((m) => (
            <div key={m.id} className="row" style={{ gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border-soft)', opacity: m.active ? 1 : 0.55 }}>
              {m.qr_image ? <img className="qr-thumb" src={m.qr_image} alt={`${m.label} QR code`} /> : <span className="qr-thumb" style={{ display: 'grid', placeItems: 'center', color: '#888' }}><QrCode size={28} /></span>}
              <span className="grow" style={{ minWidth: 0 }}>
                <span className="name">{m.label}{!m.active && ' — hidden'}</span>
                <span className="meta" style={{ margin: 0 }}>{[m.account_name, m.account_number].filter(Boolean).join(' · ') || 'No account details'}</span>
              </span>
              <button className="btn ghost" onClick={() => setEdit(m)}>Edit</button>
              <button className="btn ghost" aria-label={`Remove ${m.label}`} onClick={() => void remove(m)}><Trash2 size={14} /></button>
            </div>
          ))}
          {edit ? (
            <form onSubmit={save} style={{ marginTop: 12 }}>
              <div className="fields" style={{ marginTop: 0 }}>
                <div><label htmlFor="pm-kind">Kind</label>
                  <select id="pm-kind" value={edit.kind} onChange={(e) => {
                    const kind = e.target.value as PaymentMethod['kind'];
                    setEdit({ ...edit, kind, label: edit.label && KINDS.some((k) => k.label === edit.label) ? KINDS.find((k) => k.key === kind)!.label : edit.label });
                  }}>
                    {KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
                  </select></div>
                <div><label htmlFor="pm-label">Shown as</label><input id="pm-label" required value={edit.label} placeholder="GCash" onChange={(e) => setEdit({ ...edit, label: e.target.value })} /></div>
                <div><label htmlFor="pm-name">Account name</label><input id="pm-name" value={edit.account_name ?? ''} placeholder="Juan Dela Cruz" onChange={(e) => setEdit({ ...edit, account_name: e.target.value })} /></div>
                <div><label htmlFor="pm-num">{edit.kind === 'bank' ? 'Bank and account number' : 'Number'}</label><input id="pm-num" value={edit.account_number ?? ''} placeholder={edit.kind === 'bank' ? 'BPI 1234 5678 90' : '0917 123 4567'} onChange={(e) => setEdit({ ...edit, account_number: e.target.value })} /></div>
                <div style={{ gridColumn: '1 / -1' }}><label htmlFor="pm-ins">Instructions</label><input id="pm-ins" value={edit.instructions ?? ''} onChange={(e) => setEdit({ ...edit, instructions: e.target.value })} /></div>
                <div><label htmlFor="pm-qr">QR code (from your GCash or bank app)</label>
                  <input id="pm-qr" type="file" accept="image/*" onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (f) void shrinkImage(f, 600, 'qr').then((qr) => setEdit((x) => (x ? { ...x, qr_image: qr } : x)), (err: Error) => setMsg(err.message));
                  }} /></div>
                <div><label htmlFor="pm-on">Shown to gyms</label>
                  <select id="pm-on" value={edit.active ? 'yes' : 'no'} onChange={(e) => setEdit({ ...edit, active: e.target.value === 'yes' })}>
                    <option value="yes">Yes</option><option value="no">Hidden for now</option>
                  </select></div>
              </div>
              {edit.qr_image && (
                <div className="row" style={{ gap: 10, marginTop: 10 }}>
                  <img className="qr-thumb" src={edit.qr_image} alt="QR code preview" />
                  <button type="button" className="btn ghost" onClick={() => setEdit({ ...edit, qr_image: null })}>Remove QR</button>
                </div>
              )}
              <div className="row set-actions">
                <button className="btn" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
                <button className="btn ghost" type="button" onClick={() => setEdit(null)}>Cancel</button>
              </div>
            </form>
          ) : (
            <div className="row set-actions"><button className="btn ghost" onClick={() => setEdit(blank((rows.length + 1) * 10))}><Plus size={14} /> Add a way to pay</button></div>
          )}
          {msg && <p className="meta">{msg}</p>}
        </>
      )}
    </section>
  );
}
