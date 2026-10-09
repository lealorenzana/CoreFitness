import { useCallback, useEffect, useState } from 'react';
import { Copy, Send, Wallet } from 'lucide-react';
import Card from './ui/Card';
import Button from './ui/Button';
import { showToast } from '../utils/toast';
import DatePicker from './ui/DatePicker';
import { todayKey } from '../utils/dates';
import { claimPayment, myPaymentClaims, payOptions, type PayOption, type PaymentClaim } from '../lib/api/subscription';

const MUTED = 'var(--color-text-muted)';
const peso = (n: string | number) => '₱' + Number(n).toLocaleString('en-PH', { maximumFractionDigits: 2 });
const day = (d: string) => new Date(d.length === 10 ? d + 'T00:00:00+08:00' : d)
  .toLocaleDateString('en-PH', { day: 'numeric', month: 'short', year: 'numeric' });

/** A screenshot made small enough to send on a weak signal and keep in a row (0148). */
async function shrink(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Choose a picture of your receipt.');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, fail) => {
      const i = new Image(); i.onload = () => ok(i); i.onerror = () => fail(new Error('That picture could not be read.')); i.src = url;
    });
    const scale = Math.min(1, 1100 / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.75);
  } finally { URL.revokeObjectURL(url); }
}

/**
 * Paying Core Fitness from wherever the gym is (0148): the platform's GCash,
 * Maya or bank details and QR codes, then a form for the reference number and
 * a screenshot. Core Fitness checks the reference against its own history and
 * records the payment — the receipt appears below and the date moves.
 *
 * Works while the gym is read-only for being overdue: that is when it matters.
 */
export default function PayCoreFitness({ priceMonthly }: { priceMonthly: string | null }) {
  const [opts, setOpts] = useState<PayOption[] | undefined | null>(null);
  const [claims, setClaims] = useState<PaymentClaim[]>([]);
  /** A QR code shown big enough to scan from this screen with another phone, and saved as an image. */
  const [bigQr, setBigQr] = useState<{ src: string; label: string } | null>(null);
  const [method, setMethod] = useState('');
  const [months, setMonths] = useState(1);
  const [amount, setAmount] = useState('');
  const [paidOn, setPaidOn] = useState(todayKey());
  const [reference, setReference] = useState('');
  const [proof, setProof] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [o, c] = await Promise.all([payOptions(), myPaymentClaims()]);
    setOpts(o); setClaims(c);
    if (o?.length) setMethod((m) => m || o[0].id);
  }, []);
  useEffect(() => { void (async () => { await load(); })(); }, [load]);
  // The list price for the months chosen, filled in when the months change; the owner can type over it.
  const listPrice = (m: number) => (priceMonthly !== null && Number(priceMonthly) > 0 ? String(Number(priceMonthly) * m) : '');
  const [seeded, setSeeded] = useState(false);
  if (!seeded && listPrice(1)) { setSeeded(true); setAmount(listPrice(1)); }

  if (opts === null) return null;
  if (opts === undefined) return null; // 0148 not pasted: nothing to offer, nothing broken.

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await claimPayment({ amount: Number(amount), paidOn, method, reference: reference.trim(), proof, months, note: note.trim() || null });
      showToast('Sent. Core Fitness will check it and confirm — you will get a notification.', 'success');
      setReference(''); setProof(null); setNote('');
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not send', 'error');
    } finally { setBusy(false); }
  };

  const input = 'w-full rounded-lg border px-3 py-2 text-sm text-white';
  const inputStyle = { borderColor: 'var(--color-border)', background: 'var(--color-bg)' };

  return (
    <Card className="!p-4 space-y-4">
      <p className="text-xs font-semibold text-white flex items-center gap-2"><Wallet size={14} /> Pay Core Fitness</p>
      {opts.length === 0 ? (
        <p className="text-xs" style={{ color: MUTED }}>Core Fitness has not published how to pay yet. Ask them through Support.</p>
      ) : (
        <>
          <p className="text-xs" style={{ color: MUTED }}>
            1. Send the amount to one of these. 2. Tell us the reference number below, with a screenshot.
            We check it and confirm, usually within a day — your paid-until date moves and a receipt appears here.
          </p>
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
            {opts.map((o) => (
              <div key={o.id} className="rounded-lg border p-3" style={{ borderColor: 'var(--color-border)' }}>
                <p className="text-sm font-semibold text-white">{o.label}</p>
                {o.qr_image && (
                  <button type="button" onClick={() => setBigQr({ src: o.qr_image!, label: o.label })} aria-label={`Show the ${o.label} QR code larger`} className="block mt-2 cursor-zoom-in">
                    <img src={o.qr_image} alt={`${o.label} QR code`} className="w-full max-w-[200px] rounded-md bg-white p-1" />
                    <span className="block text-[11px] mt-1" style={{ color: MUTED }}>Tap to enlarge</span>
                  </button>
                )}
                {o.account_name && <p className="text-xs mt-2" style={{ color: MUTED }}>{o.account_name}</p>}
                {o.account_number && (
                  <p className="text-sm text-white mt-0.5 flex items-center gap-2">{o.account_number}
                    <button type="button" aria-label="Copy number" onClick={() => void navigator.clipboard.writeText(o.account_number ?? '').then(() => showToast('Copied', 'success'))}>
                      <Copy size={13} style={{ color: MUTED }} />
                    </button>
                  </p>
                )}
                {o.instructions && <p className="text-xs mt-2" style={{ color: MUTED }}>{o.instructions}</p>}
              </div>
            ))}
          </div>

          <form onSubmit={submit} className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
            <label className="text-xs" style={{ color: MUTED }}>Paid by
              <select className={input + ' mt-1'} style={inputStyle} value={method} onChange={(e) => setMethod(e.target.value)}>
                {opts.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select></label>
            <label className="text-xs" style={{ color: MUTED }}>For how many months
              <select className={input + ' mt-1'} style={inputStyle} value={months} onChange={(e) => { const m = Number(e.target.value); setMonths(m); const p = listPrice(m); if (p) setAmount(p); }}>
                {[1, 2, 3, 6, 12].map((m) => <option key={m} value={m}>{m} month{m === 1 ? '' : 's'}</option>)}
              </select></label>
            <label className="text-xs" style={{ color: MUTED }}>Amount sent (₱)
              <input className={input + ' mt-1'} style={inputStyle} type="number" min={1} step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
            <div className="text-xs" style={{ color: MUTED }}>Day you sent it
              <div className="mt-1"><DatePicker mode="record" bounds={{ backDays: 62 }} value={paidOn} onChange={setPaidOn} /></div></div>
            <label className="text-xs" style={{ color: MUTED }}>Reference number
              <input className={input + ' mt-1'} style={inputStyle} required minLength={4} maxLength={60} placeholder="From your GCash or bank receipt"
                value={reference} onChange={(e) => setReference(e.target.value)} /></label>
            <label className="text-xs" style={{ color: MUTED }}>Screenshot of the receipt
              <input className="mt-1 block text-xs" type="file" accept="image/*" onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) void shrink(f).then(setProof, (err: Error) => showToast(err.message, 'error'));
              }} />
              {proof && <span className="block mt-1" style={{ color: 'var(--color-primary-300, #c4b5fd)' }}>Screenshot attached</span>}
            </label>
            <label className="text-xs col-span-full" style={{ color: MUTED }}>Note (optional)
              <input className={input + ' mt-1'} style={inputStyle} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} /></label>
            <div className="col-span-full">
              <Button type="submit" disabled={busy || !method || !(Number(amount) > 0) || reference.trim().length < 4}>
                <Send size={14} className="mr-1.5" /> {busy ? 'Sending…' : 'Tell Core Fitness I paid'}
              </Button>
            </div>
          </form>
        </>
      )}

      {claims.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-white mb-1">What you told us</p>
          {claims.map((c) => (
            <p key={c.id} className="text-xs py-1" style={{ color: MUTED }}>
              {peso(c.amount)} by {c.method_label} · ref {c.reference} · {day(c.paid_on)} —{' '}
              <span style={{ color: c.status === 'verified' ? 'var(--color-primary-300, #c4b5fd)' : c.status === 'rejected' ? 'var(--color-secondary)' : undefined }}>
                {c.status === 'pending' ? 'being checked' : c.status === 'verified' ? 'confirmed' : `not found: ${c.reason ?? ''}`}
              </span>
            </p>
          ))}
        </div>
      )}
      {bigQr && (
        <div className="fixed inset-0 z-[1000] grid place-items-center p-4" style={{ background: 'rgba(0,0,0,0.8)' }} role="dialog" aria-modal="true"
          aria-label={`${bigQr.label} QR code`} onClick={() => setBigQr(null)}>
          <div className="rounded-2xl p-5 w-full max-w-sm text-center" style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }} onClick={(e) => e.stopPropagation()}>
            <img src={bigQr.src} alt={`${bigQr.label} QR code`} className="w-full rounded-xl bg-white p-2" />
            <p className="text-sm text-white mt-3">{bigQr.label}</p>
            <div className="flex gap-2 justify-center mt-3">
              <a href={bigQr.src} download={`${bigQr.label.replace(/[^a-z0-9]+/gi, '-')}-qr.png`} className="h-9 px-4 rounded-lg text-xs font-semibold grid place-items-center"
                style={{ border: '1px solid var(--color-border)', color: '#fff' }}>Save image</a>
              <button type="button" onClick={() => setBigQr(null)} className="h-9 px-4 rounded-lg text-xs font-semibold" style={{ background: 'var(--color-primary)', color: '#fff' }}>Close</button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
