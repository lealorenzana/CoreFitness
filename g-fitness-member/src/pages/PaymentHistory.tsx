import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SkeletonList } from '../components/ui/Skeleton';
import { toast } from '../components/ui/Toast';
import { errorMessage } from '../utils/errorMessage';
import { getCurrentMemberId } from '../services/bookingService';
import { listMemberPayments } from '../lib/api/payments';
import { getCurrentMembership, type MembershipWithPlan } from '../lib/api/memberships';
import type { PaymentRow, PaymentStatus } from '../types/db';
import { Page, PageTitle } from '../components/ui/page';
import { InlineStat, NocButton, StatusPill } from '../components/ui/noc';

/**
 * The member's real payment history (Nocturne redesign).
 *
 * This screen used to `setPayments(FALLBACK)` unconditionally — six invented
 * invoices totalling ₱11,500, two paid by GCash and bank transfer in a cash-only
 * gym, plus a hardcoded "Next Payment Due: June 30, 2024".
 *
 * Amounts are dated by `paid_on` (when the cash changed hands), never
 * `created_at` (when the desk keyed it in). They diverge whenever a payment is
 * recorded late, and a receipt should match the day the member actually paid.
 *
 * The refund line points at the Terms rather than restating a rule: the
 * prototype's "within seven days and before your first check-in" was half the
 * policy — 0073 also pays pro-rata after that — and a half-rule on a money
 * screen is the most expensive kind.
 */

const STATUS: Record<PaymentStatus, { label: string; tone: 'structure' | 'action' | 'muted' }> = {
  completed: { label: 'Paid', tone: 'structure' },
  pending: { label: 'Pending', tone: 'action' },
  failed: { label: 'Not completed', tone: 'muted' },
};

const peso = (n: number) => `₱${n.toLocaleString('en-PH')}`;

export default function PaymentHistory() {
  const navigate = useNavigate();
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [membership, setMembership] = useState<MembershipWithPlan | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const id = await getCurrentMemberId();
        if (!id) {
          toast.error('Your session could not be verified. Please sign in again.');
          return;
        }
        const [rows, current] = await Promise.all([
          listMemberPayments(id),
          getCurrentMembership(id).catch(() => null),
        ]);
        if (cancelled) return;
        setPayments(rows);
        setMembership(current);
      } catch (err) {
        if (!cancelled) toast.error(errorMessage(err, 'Could not load your payments'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const completed = payments.filter((p) => p.status === 'completed');
  const totalPaid = completed.reduce((sum, p) => sum + Number(p.amount), 0);
  const sorted = [...payments].sort((a, b) => (b.paid_on ?? '').localeCompare(a.paid_on ?? ''));
  const expiry = membership?.expiry_date ?? null;

  return (
    <Page>
      <PageTitle back title="Payments" subtitle="Recorded at the desk — the gym takes cash" />

      {loading ? <SkeletonList /> : (
        <>
          <div className="flex flex-wrap" style={{ gap: 24 }}>
            <InlineStat value={peso(totalPaid)} label="paid in all" />
            <InlineStat value={completed.length} label={completed.length === 1 ? 'payment' : 'payments'} />
            <InlineStat value={membership?.membership_plans?.name ?? 'None'} label="current plan" />
          </div>

          <section>
            {sorted.length === 0 ? (
              <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--color-text-muted)' }}>
                No payments yet. Payments recorded at the front desk appear here.
              </p>
            ) : (
              <>
                <div className="rule" style={{ marginBottom: 4 }} />
                {sorted.map((p, i) => (
                  <div key={p.id}>
                    <div className="flex items-start" style={{ gap: 12, padding: '13px 0' }}>
                      <span className="flex-none" style={{ width: 56, fontSize: 12.5, lineHeight: 1.4, color: 'var(--color-text-muted)' }}>
                        {new Date(`${p.paid_on}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        <br />
                        {new Date(`${p.paid_on}T00:00:00`).getFullYear()}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="flex items-baseline justify-between" style={{ gap: 10 }}>
                          <span style={{ fontSize: 14.5, color: 'var(--color-text-primary)' }}>{peso(Number(p.amount))}</span>
                          <StatusPill label={STATUS[p.status].label} tone={STATUS[p.status].tone} />
                        </span>
                        <span className="block" style={{ fontSize: 12, marginTop: 3, color: 'var(--color-text-secondary)' }}>
                          Membership · {p.method}
                          {p.invoice_number && <span style={{ fontFamily: 'ui-monospace, Menlo, Consolas, monospace' }}> · {p.invoice_number}</span>}
                        </span>
                        {p.notes && (
                          <span className="block" style={{ fontSize: 12.5, marginTop: 5, lineHeight: 1.5, color: 'var(--color-text-muted)' }}>{p.notes}</span>
                        )}
                      </span>
                    </div>
                    {i < sorted.length - 1 && <div className="hair" />}
                  </div>
                ))}
              </>
            )}
          </section>

          {/* Renewal — only when there is a real expiry to show. */}
          {expiry && (
            <section className="flex flex-col" style={{ gap: 12 }}>
              <p style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
                Your membership runs until{' '}
                <span style={{ color: 'var(--color-text-primary)' }}>
                  {new Date(`${expiry}T00:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                </span>.
              </p>
              <NocButton variant="action" onClick={() => navigate('/member/renew-membership')}>Renew</NocButton>
            </section>
          )}

          <button onClick={() => navigate('/terms')} className="self-start" style={{ fontSize: 12.5, color: 'var(--color-primary-300)' }}>
            How refunds work
          </button>
        </>
      )}
    </Page>
  );
}
