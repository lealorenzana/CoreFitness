import { useEffect, useState } from 'react';
import ReceiptSheet from '../ReceiptSheet';
import { getGymSettings, type GymSettingsRow } from '../../lib/api/settings';
import type { ReceiptDoc } from '../../lib/receipt';

interface Payment {
  id: string;
  memberName: string;
  memberId: string;
  amount: number;
  plan: string;
  method: string;
  status: string;
  date: string;
  /** Only when the payment recorded one — a receipt never invents a term. */
  dueDate: string | null;
  invoiceNumber: string;
}

interface ViewReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  payment: Payment | null;
}

const longDay = (d: Date) => d.toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' });
const METHOD: Record<string, string> = { cash: 'Cash', gcash: 'GCash', maya: 'Maya', card: 'Card', bank: 'Bank transfer', bank_transfer: 'Bank transfer' };

/** A member's payment as a receipt (`ReceiptSheet`): fits the screen, downloads as a PNG, prints only the paper.
 *
 * The gym's own details come from `gym_settings` (0013) — the receipt once said
 * "G-FITNESS RECEIPT", a prototype's name, on the one document a member keeps.
 * An unreadable setting leaves the line off rather than printing another name. */
export default function ViewReceiptModal({ isOpen, onClose, payment }: ViewReceiptModalProps) {
  const [gym, setGym] = useState<GymSettingsRow | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    getGymSettings().then(setGym).catch(() => setGym(null));
  }, [isOpen]);

  if (!isOpen || !payment) return null;

  const gymName = gym?.gym_name?.trim() || 'Core Fitness';
  const gymLines = [gym?.address, [gym?.phone, gym?.email].map((v) => v?.trim()).filter(Boolean).join(' · ')]
    .map((v) => v?.trim()).filter(Boolean) as string[];
  const paid = new Date(payment.date);
  const until = payment.dueDate ? new Date(`${payment.dueDate}T00:00:00`) : null;
  const status = payment.status === 'completed' ? { text: 'Paid', tone: 'done' as const }
    : payment.status === 'pending' ? { text: 'Waiting to be confirmed', tone: 'waiting' as const }
    : { text: 'Not received', tone: 'void' as const };

  const doc: ReceiptDoc = {
    gymName, gymLines, logoUrl: gym?.logo_url ?? null,
    title: 'Official receipt',
    number: payment.invoiceNumber,
    date: longDay(paid),
    status,
    lines: [
      { label: 'Received from', value: payment.memberName },
      { label: 'Member no.', value: payment.memberId.slice(0, 8).toUpperCase() },
      { label: 'For', value: `${payment.plan} membership` },
      ...(until ? [{ label: 'Covers', value: `${longDay(paid)} – ${longDay(until)}` }] : []),
      { label: 'Paid by', value: METHOD[payment.method.toLowerCase()] ?? payment.method },
    ],
    total: payment.amount,
    footer: [
      'Thank you for training with us.',
      gym?.phone ? `Questions about this receipt? Call ${gym.phone}.` : 'Questions about this receipt? Ask at the front desk.',
    ],
  };

  return <ReceiptSheet doc={doc} filename={`Receipt-${payment.invoiceNumber}`} onClose={onClose} />;
}
