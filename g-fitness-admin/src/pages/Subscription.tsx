import { useEffect, useState } from 'react';
import { CreditCard, Receipt } from 'lucide-react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import GymReceiptSheet from '../components/GymReceiptSheet';
import PayCoreFitness from '../components/PayCoreFitness';
import { showToast } from '../utils/toast';
import {
  getSubscription, gymReceipt, myGymPayments, type GymReceipt, type GymReceiptRow, type GymSubscription,
} from '../lib/api/subscription';

const MUTED = 'var(--color-text-muted)';
const peso = (n: string | number) => '₱' + Number(n).toLocaleString('en-PH', { maximumFractionDigits: 2 });
const day = (d: string) => new Date(d + 'T00:00:00+08:00').toLocaleDateString('en-PH', { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * Your plan (0138): what this gym pays Core Fitness, until when, the day it
 * would go read-only, how full the plan is, and a receipt for every payment.
 * Owner only; the reminders that link here are sent to owners only.
 */
export default function Subscription() {
  const [sub, setSub] = useState<GymSubscription | null | undefined>(null);
  const [payments, setPayments] = useState<GymReceiptRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [receipt, setReceipt] = useState<GymReceipt | null>(null);

  useEffect(() => {
    void (async () => {
      const [s, p] = await Promise.all([getSubscription(), myGymPayments()]);
      setSub(s); setPayments(p); setLoaded(true);
    })();
  }, []);

  const open = async (id: string) => {
    try { const r = await gymReceipt(id); if (r) setReceipt(r); }
    catch (e) { showToast(e instanceof Error ? e.message : 'Could not open the receipt', 'error'); }
  };

  if (!loaded) return <div className="text-sm" style={{ color: MUTED }}>Loading…</div>;
  if (sub === undefined) return <Card className="!p-4"><p className="text-xs text-white">Your plan page is not switched on yet — paste migration 0138.</p></Card>;
  if (sub === null) return <Card className="!p-4"><p className="text-xs text-white">Only the gym's owner sees its Core Fitness plan.</p></Card>;

  const status = sub.lock_reason === 'overdue' ? 'Read-only until it is paid'
    : sub.lock_reason ? 'Read-only'
    : sub.days_left === null ? 'No paid-until date'
    : sub.days_left < 0 ? (sub.on_trial ? `Trial ended ${-sub.days_left} day${sub.days_left === -1 ? '' : 's'} ago` : `${-sub.days_left} day${sub.days_left === -1 ? '' : 's'} overdue`)
    : sub.days_left === 0 ? 'Runs out today' : `${sub.days_left} day${sub.days_left === 1 ? '' : 's'} left`;
  const meter = (label: string, used: number, cap: number | null) => (
    <div>
      <div className="flex justify-between text-xs"><span style={{ color: MUTED }}>{label}</span>
        <span className="text-white font-semibold">{used}{cap !== null ? ` of ${cap}` : ' · no limit'}</span></div>
      {cap !== null && cap > 0 && (
        <div className="h-1.5 rounded-full mt-1.5" style={{ background: 'var(--color-surface-high)' }}>
          <div className="h-full rounded-full" style={{ width: `${Math.min(100, (used / cap) * 100)}%`,
            background: used >= cap ? 'var(--color-secondary)' : 'var(--color-primary)' }} />
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      {receipt && <GymReceiptSheet receipt={receipt} onClose={() => setReceipt(null)} />}
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2"><CreditCard size={22} /> Your plan</h1>
        <p className="text-xs mt-1" style={{ color: MUTED }}>What this gym pays Core Fitness, and a receipt for every payment.</p>
      </div>
      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
        <Card className="!p-4">
          <p className="text-xs" style={{ color: MUTED }}>Plan</p>
          <p className="text-lg font-bold text-white mt-1">{sub.plan_name ?? '—'}</p>
          <p className="text-xs mt-1" style={{ color: MUTED }}>{sub.price_monthly !== null ? `${peso(sub.price_monthly)} a month` : 'No price set'}</p>
        </Card>
        <Card className="!p-4">
          <p className="text-xs" style={{ color: MUTED }}>{sub.on_trial ? 'Free trial until' : 'Covered until'}</p>
          <p className="text-lg font-bold text-white mt-1">{sub.paid_until ? day(sub.paid_until) : '—'}</p>
          <p className="text-xs mt-1" style={{ color: sub.days_left !== null && sub.days_left <= 7 ? 'var(--color-secondary)' : MUTED }}>{status}</p>
        </Card>
        <Card className="!p-4">
          <p className="text-xs" style={{ color: MUTED }}>If it is not paid</p>
          <p className="text-lg font-bold text-white mt-1">{sub.read_only_on ? `Read-only from ${day(sub.read_only_on)}` : 'Never locks'}</p>
          <p className="text-xs mt-1" style={{ color: MUTED }}>{sub.grace_days} day{sub.grace_days === 1 ? '' : 's'} after the due date. Nothing is deleted.</p>
        </Card>
      </div>
      <PayCoreFitness priceMonthly={sub.price_monthly} />
      <Card className="!p-4 space-y-3">
        <p className="text-xs font-semibold text-white">How full your plan is</p>
        {meter('Active members', sub.members, sub.max_members)}
        {meter('Owners and front desk', sub.staff, sub.max_staff)}
      </Card>
      <Card className="!p-4">
        <p className="text-xs font-semibold text-white mb-2">Payments to Core Fitness</p>
        {payments.length === 0 && <p className="text-xs" style={{ color: MUTED }}>No payment has been recorded for this gym yet.</p>}
        <div className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
          {payments.map((p) => (
            <div key={p.id} className="flex items-center gap-3 py-2.5">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white">{peso(p.amount)} <span className="text-xs font-normal" style={{ color: MUTED }}>· {p.receipt_no}</span></p>
                <p className="text-xs" style={{ color: MUTED }}>Paid {day(p.paid_on)} · covers to {day(p.covers_until)}{p.method ? ` · ${p.method}` : ''}{p.plan_name ? ` · ${p.plan_name}` : ''}</p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => void open(p.id)}><Receipt size={14} className="mr-1.5" /> Receipt</Button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
