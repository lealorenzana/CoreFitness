import type { GymSettingsRow } from '../../lib/api/settings';
import type { Sale } from '../../lib/api/shop';
import type { ReceiptDoc } from '../../lib/receipt';

/** A counter sale's number: its id's first characters. The id is the sale's identity, so this is too. */
export const saleNo = (id: string) => `S-${id.replace(/-/g, '').slice(0, 8).toUpperCase()}`;

/** A shop sale as a `ReceiptDoc` — the same paper and PNG as a membership receipt. */
export function saleReceipt(sale: Sale, gym: GymSettingsRow | null, tendered: number | null = null): ReceiptDoc {
  const when = new Date(sale.createdAt);
  return {
    gymName: gym?.gym_name?.trim() || 'Core Fitness',
    gymLines: [gym?.address, [gym?.phone, gym?.email].map((v) => v?.trim()).filter(Boolean).join(' · ')]
      .map((v) => v?.trim()).filter(Boolean) as string[],
    logoUrl: gym?.logo_url ?? null,
    title: 'Sales receipt',
    number: saleNo(sale.id),
    date: when.toLocaleString('en-PH', { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }),
    status: sale.voidedAt ? { text: 'Voided', tone: 'void' } : { text: 'Paid in cash', tone: 'done' },
    lines: [
      ...(sale.memberName ? [{ label: 'Member', value: sale.memberName }] : []),
      ...(sale.soldByName ? [{ label: 'Served by', value: sale.soldByName }] : []),
      ...(sale.voidedAt && sale.voidReason ? [{ label: 'Voided because', value: sale.voidReason }] : []),
    ],
    items: sale.items.map((i) => ({ name: i.name, qty: i.qty, unit: i.unitPrice })),
    total: sale.total,
    tendered,
    footer: ['Thank you!', 'Questions about this sale? Ask at the front desk.'],
  };
}
