import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Camera, Copy, Check } from '@phosphor-icons/react';
import { Chip } from './ui/noc';
import { Field, TextInput } from './ui/Field';
import { shrinkImage } from '../lib/image';
import { useT } from '../lib/i18n';
import type { GymPayMethod } from '../lib/api/renewalRequests';

export interface PayOnlineValue { methodId: string | null; reference: string; proof: string | null }

/**
 * Paying the gym from the app (0167): one of the gym's own GCash / Maya / bank
 * accounts, the exact amount to send, then the reference and a screenshot for
 * the desk to check. Nothing here moves money — the member pays in their own
 * GCash or bank app, and the gym confirms it reached them.
 */
export default function PayOnline({ methods, amount, value, onChange }: {
  methods: GymPayMethod[];
  amount: string;
  value: PayOnlineValue;
  onChange: (v: PayOnlineValue) => void;
}) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const [big, setBig] = useState(false);
  const m = methods.find((x) => x.id === value.methodId) ?? methods[0];
  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* the number is on screen */ }
  };

  return (
    <div className="flex flex-col" style={{ gap: 14 }} data-pay-online>
      {methods.length > 1 && (
        <div className="flex flex-wrap" style={{ gap: 8 }}>
          {methods.map((x) => <Chip key={x.id} label={x.label} on={x.id === m.id} onClick={() => onChange({ ...value, methodId: x.id })} />)}
        </div>
      )}

      <div className="flex items-start" style={{ gap: 14 }}>
        {m.qr_image && (
          <button type="button" onClick={() => setBig(true)} aria-label={t('Show the QR code bigger')}
            style={{ flex: 'none', width: 112, height: 112, borderRadius: 12, background: '#fff', padding: 6 }}>
            <img src={m.qr_image} alt={`${m.label} QR code`} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </button>
        )}
        <div className="min-w-0 flex-1" style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--color-text-secondary)' }}>
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{t('Send exactly')}</p>
          <p style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-secondary)' }}>{amount}</p>
          <p style={{ marginTop: 4, color: 'var(--color-text-primary)', fontWeight: 600 }}>{m.label}</p>
          {m.account_name && <p>{m.account_name}</p>}
          {m.account_number && (
            <button type="button" onClick={() => void copy(m.account_number as string)} className="inline-flex items-center noc-press"
              style={{ gap: 6, marginTop: 2, color: 'var(--color-primary-300)', fontWeight: 600 }}>
              {m.account_number} {copied ? <Check size={14} /> : <Copy size={14} />}
            </button>
          )}
        </div>
      </div>
      {m.instructions && <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>{m.instructions}</p>}

      <Field label={t('Reference number from your receipt')}>
        <TextInput value={value.reference} maxLength={60} placeholder="e.g. 1009 876 543210" autoComplete="off"
          onChange={(e) => onChange({ ...value, methodId: m.id, reference: e.target.value })} />
      </Field>

      <label className="flex items-center noc-press" style={{ gap: 12, cursor: 'pointer' }}>
        {value.proof
          ? <img src={value.proof} alt="" style={{ width: 52, height: 52, borderRadius: 10, objectFit: 'cover' }} />
          : <span className="grid place-items-center" style={{ width: 52, height: 52, borderRadius: 10, border: '1px dashed var(--color-hairline)' }}><Camera size={20} style={{ color: 'var(--color-text-muted)' }} /></span>}
        <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
          {value.proof ? t('Screenshot added — tap to change') : t('Add a screenshot of the receipt (helps the desk find it)')}
        </span>
        <input type="file" accept="image/*" className="hidden" aria-label={t('Receipt screenshot')}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void shrinkImage(f, 1100, 'photo').then((url) => onChange({ ...value, methodId: m.id, proof: url })).catch(() => undefined);
          }} />
      </label>

      {big && m.qr_image && createPortal(
        <div role="dialog" aria-label={`${m.label} QR code`} onClick={() => setBig(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(0,0,0,0.85)', display: 'grid', placeItems: 'center', padding: 24 }}>
          <img src={m.qr_image} alt={`${m.label} QR code`} style={{ width: 'min(86vw, 360px)', background: '#fff', borderRadius: 16, padding: 12 }} />
        </div>, document.body)}
    </div>
  );
}
