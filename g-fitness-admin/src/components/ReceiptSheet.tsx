import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, Printer, X } from 'lucide-react';
import Button from './ui/Button';
import { downloadReceiptPng, peso, type ReceiptDoc } from '../lib/receipt';

/** The receipt as paper: white, narrow, the same lines the PNG draws. */
export function ReceiptPaper({ doc }: { doc: ReceiptDoc }) {
  const muted = '#6B7280';
  const tone = doc.status?.tone === 'done' ? '#5B21B6' : doc.status?.tone === 'void' ? muted : '#92400E';
  const change = doc.tendered != null && doc.tendered >= doc.total ? doc.tendered - doc.total : null;
  return (
    <div role="document" aria-label={`${doc.title} ${doc.number}`} className="receipt-paper"
      style={{ background: '#FFFFFF', color: '#111827', fontSize: 14, padding: '32px 28px', borderRadius: 14 }}>
      <div style={{ textAlign: 'center' }}>
        {doc.logoUrl && <img src={doc.logoUrl} alt="" style={{ width: 48, height: 48, objectFit: 'contain', margin: '0 auto 8px' }} />}
        <p style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>{doc.gymName}</p>
        {doc.gymLines.map((l) => <p key={l} style={{ margin: '3px 0 0', color: '#4B5563', fontSize: 13 }}>{l}</p>)}
      </div>
      <div style={{ borderTop: '1px solid #D1D5DB', marginTop: 18, paddingTop: 16, display: 'flex', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', color: muted }}>{doc.title.toUpperCase()}</p>
          <p style={{ margin: '4px 0 0', fontSize: 17, fontWeight: 700, fontFamily: 'ui-monospace, Consolas, monospace' }}>{doc.number}</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ margin: 0, fontSize: 13, color: '#374151' }}>{doc.date}</p>
          {doc.status && <p style={{ margin: '6px 0 0', fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', color: tone }}>{doc.status.text.toUpperCase()}</p>}
        </div>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 14, borderTop: '1px dashed #D1D5DB' }}>
        <tbody>
          {doc.lines.map((l) => (
            <tr key={l.label}>
              <td style={{ padding: '9px 0 0', color: muted, verticalAlign: 'top' }}>{l.label}</td>
              <td style={{ padding: '9px 0 0', textAlign: 'right', fontWeight: 600 }}>{l.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {doc.items && doc.items.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 14, borderTop: '1px dashed #D1D5DB' }}>
          <tbody>
            {doc.items.map((it, i) => (
              <tr key={i}>
                <td style={{ padding: '9px 0 0' }}>
                  {it.qty} × {it.name}
                  {it.qty > 1 && <span style={{ display: 'block', fontSize: 12, color: muted }}>{peso(it.unit)} each</span>}
                </td>
                <td style={{ padding: '9px 0 0', textAlign: 'right', fontWeight: 600, verticalAlign: 'top' }}>{peso(it.qty * it.unit)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div style={{ borderTop: '1px solid #D1D5DB', marginTop: 16, paddingTop: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontWeight: 700, fontSize: 16 }}>Total</span>
        <span style={{ fontWeight: 800, fontSize: 26 }}>{peso(doc.total)}</span>
      </div>
      {change !== null && (
        <div style={{ marginTop: 6, fontSize: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: muted }}>Cash received</span><b>{peso(doc.tendered!)}</b></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}><span style={{ color: muted }}>Change</span><b>{peso(change)}</b></div>
        </div>
      )}
      <div style={{ borderTop: '1px dashed #D1D5DB', marginTop: 16, paddingTop: 12, textAlign: 'center', color: '#4B5563', fontSize: 13 }}>
        {doc.footer.map((f) => <p key={f} style={{ margin: '4px 0 0' }}>{f}</p>)}
      </div>
    </div>
  );
}

/**
 * A receipt over the page: it fits the screen and scrolls inside, the buttons
 * stay in reach at the top, Download saves a PNG of the receipt, and Print
 * prints only the paper (`body.receipt-open` hides the dashboard, as the join
 * poster does).
 */
export default function ReceiptSheet({ doc, filename, onClose }: { doc: ReceiptDoc; filename: string; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    document.body.classList.add('receipt-open');
    // Esc closes the receipt only — caught first, so a sheet underneath stays open.
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => { document.body.classList.remove('receipt-open'); window.removeEventListener('keydown', onKey, true); };
  }, [onClose]);

  const download = async () => {
    setBusy(true); setError(null);
    try { await downloadReceiptPng(doc, filename); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not make the image.'); }
    finally { setBusy(false); }
  };

  return createPortal((
    <div className="receipt-sheet fixed inset-0 z-[1000] flex flex-col print:static print:block" role="dialog" aria-modal="true" aria-label={doc.title}
      style={{ background: 'rgba(0,0,0,0.72)' }} onClick={onClose}>
      <div className="flex items-center justify-between gap-2 px-4 py-3 print:hidden flex-wrap"
        style={{ background: 'var(--color-surface)', borderBottom: '1px solid var(--color-border)' }} onClick={(e) => e.stopPropagation()}>
        <p className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>{doc.title} · {doc.number}</p>
        <div className="flex gap-2 flex-wrap">
          <Button variant="ghost" onClick={() => void download()} disabled={busy}><Download size={14} className="mr-1.5" /> {busy ? 'Making…' : 'Download image'}</Button>
          <Button variant="ghost" onClick={() => window.print()}><Printer size={14} className="mr-1.5" /> Print</Button>
          <Button onClick={onClose}><X size={14} className="mr-1.5" /> Close</Button>
        </div>
      </div>
      {error && <p className="text-sm px-4 py-2 print:hidden" style={{ color: 'var(--color-secondary)', background: 'var(--color-surface)' }}>{error}</p>}
      <div className="flex-1 overflow-y-auto px-4 py-6 print:overflow-visible print:p-0">
        <div className="mx-auto print:m-0" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
          <ReceiptPaper doc={doc} />
        </div>
      </div>
    </div>
  ), document.body);
}
