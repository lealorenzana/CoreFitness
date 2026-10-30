import { useState, type ReactNode } from 'react';
import { CreditCard, PaperPlaneTilt, Storefront } from '@phosphor-icons/react';
import { NocButton } from '../ui/noc';
import { toast } from '../ui/Toast';
import PayOnline, { type PayOnlineValue } from '../PayOnline';
import { payOnline, type MemberPurpose } from '../../lib/api/paymongo';
import { errorMessage } from '../../utils/errorMessage';
import type { GymPayMethod } from '../../lib/api/renewalRequests';

export type PayWay = 'online' | 'transfer' | 'desk';

/**
 * One way to pay (owner, 2026-10-28): a PayMongo button beside a separate "pay by
 * QR" form confused members. Everything a member pays — a renewal, a day pass, a
 * coach's package — is one list of the ways this gym (or coach) takes, one button
 * whose words follow the choice, and a line under each saying what happens next.
 *
 * A way shows only when its prop is given: `online` when the gym's or coach's
 * PayMongo is connected (pre-selected then), `transfer` when there are accounts to
 * send to, `desk` when paying at the counter is possible. Nothing here prices
 * anything — PayMongo is sent the purpose, a reference goes to the desk to approve.
 */
export default function PayChooser({ amount, online, transfer, desk }: {
  /** The amount, already formatted ("₱1,500"). */
  amount: string;
  online?: { purpose: MemberPurpose; details: Record<string, unknown>; returnPath: string; to?: string } | null;
  transfer?: {
    methods: GymPayMethod[];
    /** Whose account it is, for the row's words: "the gym's" or "Ana's". */
    whose: string;
    /** Who approves it: "the desk" or the coach's first name. */
    approver: string;
    allowProof?: boolean;
    send: (methodId: string, reference: string, proof: string | null) => Promise<void>;
  } | null;
  desk?: {
    /** The button's words; without `choose` there is no button — paying at the counter needs nothing here. */
    button?: string;
    next: string;
    body?: ReactNode;
    choose?: () => Promise<void>;
  } | null;
}) {
  const ways: PayWay[] = [
    ...(online ? ['online' as const] : []),
    ...(transfer && transfer.methods.length > 0 ? ['transfer' as const] : []),
    ...(desk ? ['desk' as const] : []),
  ];
  const [picked, setPicked] = useState<PayWay | null>(null);
  const way: PayWay | null = picked && ways.includes(picked) ? picked : ways[0] ?? null;
  const [pay, setPay] = useState<PayOnlineValue>({ methodId: null, reference: '', proof: null });
  const [busy, setBusy] = useState(false);
  if (!way) return null;

  const ROW: Record<PayWay, { icon: ReactNode; title: string; next: string }> = {
    online: { icon: <CreditCard size={18} weight="fill" />, title: 'Pay online now',
      next: `GCash, Maya, card or QRPh through PayMongo${online?.to ? `, straight to ${online.to}` : ''} — confirmed right away.` },
    transfer: { icon: <PaperPlaneTilt size={18} weight="fill" />, title: `Send to ${transfer?.whose ?? 'the gym’s'} ${transfer?.methods.map((m) => m.label).join(' / ') ?? ''}`.trim(),
      next: `Then type the reference — ${transfer?.approver ?? 'the desk'} approves it.` },
    desk: { icon: <Storefront size={18} weight="fill" />, title: 'Pay at the front desk', next: desk?.next ?? '' },
  };

  const go = async () => {
    setBusy(true);
    try {
      if (way === 'online' && online) {
        await payOnline(online.purpose, online.details, online.returnPath);
        return; // this tab leaves for PayMongo
      }
      if (way === 'transfer' && transfer) {
        if (pay.reference.trim().length < 4) { toast.error('Type the reference number from your receipt.'); return; }
        await transfer.send(pay.methodId ?? transfer.methods[0].id, pay.reference.trim(), pay.proof);
        setPay({ methodId: null, reference: '', proof: null });
        return;
      }
      if (way === 'desk' && desk?.choose) await desk.choose();
    } catch (e) {
      toast.error(errorMessage(e, 'That did not go through. Try again.'));
    } finally {
      setBusy(false);
    }
  };

  const label = way === 'online' ? (busy ? 'Opening PayMongo…' : `Pay ${amount} online`)
    : way === 'transfer' ? (busy ? 'Sending…' : 'Send my reference')
    : desk?.choose ? (busy ? 'Sending…' : desk.button ?? 'I’ll pay at the desk') : null;

  return (
    <div className="flex flex-col" style={{ gap: 12 }} data-pay-chooser>
      <div role="radiogroup" aria-label="How you will pay" className="flex flex-col" style={{ gap: 8 }}>
        {ways.map((w) => {
          const on = w === way;
          return (
            <button key={w} type="button" role="radio" aria-checked={on} onClick={() => setPicked(w)} data-pay-way={w}
              className="flex items-start text-left noc-press"
              style={{ gap: 12, padding: '12px 14px', borderRadius: 14, justifyContent: 'flex-start',
                border: `1px solid ${on ? 'var(--color-primary-300)' : 'var(--color-hairline)'}`,
                background: on ? 'color-mix(in srgb, var(--color-primary) 14%, transparent)' : 'transparent' }}>
              <span aria-hidden className="grid place-items-center flex-none" style={{ width: 20, height: 20, marginTop: 1, borderRadius: 999,
                border: `2px solid ${on ? 'var(--color-primary-300)' : 'var(--color-hairline)'}` }}>
                {on && <span style={{ width: 8, height: 8, borderRadius: 999, background: 'var(--color-primary-300)' }} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center" style={{ gap: 6, fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}>
                  <span style={{ color: on ? 'var(--color-primary-300)' : 'var(--color-text-muted)' }}>{ROW[w].icon}</span>{ROW[w].title}
                </span>
                <span className="block" style={{ fontSize: 12.5, marginTop: 2, lineHeight: 1.45, color: 'var(--color-text-secondary)' }}>{ROW[w].next}</span>
              </span>
            </button>
          );
        })}
      </div>

      {way === 'transfer' && transfer && (
        <PayOnline methods={transfer.methods} amount={amount} value={pay} onChange={setPay} allowProof={transfer.allowProof ?? true} />
      )}
      {way === 'desk' && desk?.body}

      {label && (
        <NocButton variant="fill" className="w-full" disabled={busy} onClick={() => void go()}>
          <span data-pay-go>{label}</span>
        </NocButton>
      )}
    </div>
  );
}
