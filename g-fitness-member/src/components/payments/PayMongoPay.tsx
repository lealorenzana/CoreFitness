import { useState } from 'react';
import { CreditCard } from '@phosphor-icons/react';
import { NocButton } from '../ui/noc';
import { toast } from '../ui/Toast';
import { payOnline, type MemberPurpose } from '../../lib/api/paymongo';

/**
 * "Pay ₱… now" through PayMongo (0192): GCash, Maya, card or online banking,
 * straight to the gym's (or the coach's) own account. Recorded the moment it is
 * paid — no reference to type, no desk to wait for.
 */
export default function PayMongoPay({ purpose, details, amount, returnPath, note, label }: {
  purpose: MemberPurpose; details: Record<string, unknown>; amount: string; returnPath: string; note?: string; label?: string;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <div data-paymongo-pay>
      <NocButton variant="fill" className="w-full" disabled={busy} icon={<CreditCard size={16} weight="fill" />}
        onClick={() => {
          setBusy(true);
          void payOnline(purpose, details, returnPath).catch((e: Error) => { setBusy(false); toast.error(e.message); });
        }}>
        {busy ? 'Opening PayMongo…' : label ?? `Pay ${amount} now`}
      </NocButton>
      <p style={{ fontSize: 12, marginTop: 6, color: 'var(--color-text-muted)' }}>
        {note ?? 'GCash, Maya, card or online banking, through PayMongo. Done the moment it is paid.'}
      </p>
    </div>
  );
}
