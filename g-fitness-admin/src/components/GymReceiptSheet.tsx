import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Printer, X } from 'lucide-react';
import Button from './ui/Button';
import type { GymReceipt } from '../lib/api/subscription';

const peso = (n: string | number) => '₱' + Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const day = (d: string) => new Date(d + 'T00:00:00+08:00').toLocaleDateString('en-PH', { day: 'numeric', month: 'long', year: 'numeric' });

/**
 * A receipt for what this gym paid Core Fitness (0138). Printed the way the
 * join poster is — portalled to <body>, `body.receipt-open` hides the app — so
 * "save as PDF" in the same dialog is the digital copy. The number, the amounts
 * and Core Fitness's own details all come from `gym_payment_receipt()`; nothing
 * on it is typed here.
 */
export default function GymReceiptSheet({ receipt, onClose }: { receipt: GymReceipt; onClose: () => void }) {
  useEffect(() => {
    document.body.classList.add('receipt-open');
    return () => document.body.classList.remove('receipt-open');
  }, []);
  const r = receipt;
  const row = (label: string, value: string | null) => value && (
    <tr><td style={{ padding: '6px 0', color: '#4B5563' }}>{label}</td><td style={{ padding: '6px 0', textAlign: 'right' }}>{value}</td></tr>
  );

  return createPortal((
    <div className="fixed inset-0 z-50 overflow-y-auto print:static print:overflow-visible" style={{ background: 'rgba(0,0,0,0.75)' }}>
      <div className="sticky top-0 flex items-center justify-between px-5 py-3 print:hidden"
        style={{ background: 'var(--color-surface)', borderBottom: '1px solid var(--color-border)' }}>
        <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Print it, or save it as a PDF from the same dialog.</p>
        <div className="flex gap-2">
          <Button onClick={() => window.print()}><Printer size={14} className="mr-1.5" /> Print</Button>
          <Button variant="ghost" onClick={onClose}><X size={14} className="mr-1.5" /> Close</Button>
        </div>
      </div>
      <div className="mx-auto my-6 print:my-0" style={{ maxWidth: 620 }}>
        <div role="document" aria-label={`Receipt ${r.receipt_no}`} className="px-10 py-10" style={{ background: '#FFFFFF', color: '#111827', fontSize: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
            <div>
              <p style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>{r.business_name}</p>
              {r.business_address && <p style={{ margin: '4px 0 0', color: '#4B5563' }}>{r.business_address}</p>}
              {(r.business_email || r.business_phone) && (
                <p style={{ margin: '2px 0 0', color: '#4B5563' }}>{[r.business_email, r.business_phone].filter(Boolean).join(' · ')}</p>
              )}
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontSize: 12, letterSpacing: '0.12em', color: '#6B7280', margin: 0 }}>RECEIPT</p>
              <p style={{ fontSize: 16, fontWeight: 700, margin: '4px 0 0' }}>{r.receipt_no}</p>
              <p style={{ margin: '2px 0 0', color: '#4B5563' }}>{day(r.paid_on)}</p>
            </div>
          </div>
          <div style={{ marginTop: 28, paddingTop: 16, borderTop: '1px solid #D1D5DB' }}>
            <p style={{ fontSize: 12, color: '#6B7280', margin: 0 }}>Received from</p>
            <p style={{ fontWeight: 700, margin: '2px 0 0' }}>{r.gym_name}</p>
            {r.gym_address && <p style={{ margin: '2px 0 0', color: '#4B5563' }}>{r.gym_address}</p>}
          </div>
          <table style={{ width: '100%', marginTop: 20, borderCollapse: 'collapse' }}>
            <tbody>
              {row('Plan', r.plan_name)}
              {row('Covers', r.covers_from ? `${day(r.covers_from)} to ${day(r.covers_until)}` : `to ${day(r.covers_until)}`)}
              {row('Paid by', r.method)}
              {row('Reference', r.reference)}
              <tr style={{ borderTop: '2px solid #111827' }}>
                <td style={{ padding: '12px 0 0', fontWeight: 700 }}>Amount received</td>
                <td style={{ padding: '12px 0 0', textAlign: 'right', fontSize: 20, fontWeight: 800 }}>{peso(r.amount)}</td>
              </tr>
            </tbody>
          </table>
          {r.receipt_note && <p style={{ marginTop: 28, color: '#4B5563' }}>{r.receipt_note}</p>}
        </div>
      </div>
    </div>
  ), document.body);
}
