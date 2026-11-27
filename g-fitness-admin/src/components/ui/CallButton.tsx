import { Copy, Phone } from 'lucide-react';
import { showToast } from '../../utils/toast';

/**
 * Call, plus Copy for a laptop (owner, 2026-11-27): `tel:` opens the dialer on a phone, but on a computer
 * it only works through an app such as Phone Link. Copy puts the number on the clipboard to dial by hand.
 */
export default function CallButton({ phone, name, label = true, className = 'a-btn sm' }: { phone: string; name: string; label?: boolean; className?: string }) {
  const copy = async () => {
    try { await navigator.clipboard.writeText(phone); showToast(`${name}'s number is copied: ${phone}`, 'success'); }
    catch { showToast(`Could not copy. The number is ${phone}`, 'error'); }
  };
  return (
    <span style={{ display: 'inline-flex', gap: 4, flex: 'none' }} data-call>
      <a href={`tel:${phone.replace(/[^\d+]/g, '')}`} className={className} aria-label={`Call ${name}`} data-tip={`Call ${phone}`}><Phone size={13} />{label && 'Call'}</a>
      <button type="button" className={className} onClick={() => void copy()} aria-label={`Copy ${name}'s number`} data-tip={`Copy ${phone}`} data-copy-phone><Copy size={13} /></button>
    </span>
  );
}
