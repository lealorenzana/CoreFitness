import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowsClockwise, CaretRight, HourglassMedium, PaperPlaneTilt, Receipt } from '@phosphor-icons/react';
import { SkeletonList } from '../components/ui/Skeleton';
import { toast } from '../components/ui/Toast';
import GlassSheet from '../components/ui/GlassSheet';
import { errorMessage } from '../utils/errorMessage';
import { getCurrentMemberId } from '../services/bookingService';
import { listMemberPayments } from '../lib/api/payments';
import { getCurrentMembership, type MembershipWithPlan } from '../lib/api/memberships';
import { listMyRenewalRequests, type RenewalRequest } from '../lib/api/renewalRequests';
import { getGymSettings, type GymSettingsRow } from '../lib/api/settings';
import type { PaymentRow, PaymentStatus } from '../types/db';
import { Page, PageTitle } from '../components/ui/page';
import { Eyebrow, InlineStat, NocButton, Panel, StatusPill } from '../components/ui/noc';

/**
 * The member's real payment history (Nocturne redesign; reworked 2026-09-19).
 *
 *   Summary     paid this year, in all, the last payment, and when the term ends
 *   Waiting     a pending payment, or a renewal request on its way to the desk
 *   By year     every payment, each opening its receipt
 *   Receipt     the fields the desk's own receipt prints — invoice number, date
 *               paid, plan, method, amount — with the plan as it was *bought*
 *               (0091 snapshot), and "current plan" said out loud for older rows
 *
 * Amounts are dated by `paid_on` (when the cash changed hands), never
 * `created_at` (when the desk keyed it in). The refund line points at the Terms
 * rather than restating a rule — a half-rule on a money screen is the most
 * expensive kind.
 */

const STATUS: Record<PaymentStatus, { label: string; tone: 'structure' | 'action' | 'muted' }> = {
  completed: { label: 'Paid', tone: 'structure' },
  pending: { label: 'Pending', tone: 'action' },
  failed: { label: 'Not completed', tone: 'muted' },
};

const peso = (n: number) => `₱${n.toLocaleString('en-PH')}`;
const longDate = (key: string) =>
  new Date(`${key}T00:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

export default function PaymentHistory() {
  const navigate = useNavigate();
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [membership, setMembership] = useState<MembershipWithPlan | null>(null);
  const [request, setRequest] = useState<RenewalRequest | null>(null);
  const [gym, setGym] = useState<GymSettingsRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<PaymentRow | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const id = await getCurrentMemberId();
        if (!id) {
          toast.error('Your session could not be verified. Please sign in again.');
          return;
        }
        const [rows, current, reqs, settings] = await Promise.all([
          listMemberPayments(id),
          getCurrentMembership(id).catch(() => null),
          listMyRenewalRequests(id),
          getGymSettings().catch(() => null),
        ]);
        if (cancelled) return;
        setPayments(rows);
        setMembership(current);
        setRequest(reqs?.find((r) => r.status === 'open') ?? null);
        setGym(settings);
      } catch (err) {
        if (!cancelled) toast.error(errorMessage(err, 'Could not load your payments'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const completed = payments.filter((p) => p.status === 'completed');
  const pending = payments.filter((p) => p.status === 'pending');
  const totalPaid = completed.reduce((sum, p) => sum + Number(p.amount), 0);
  const year = new Date().getFullYear();
  const thisYear = completed.filter((p) => p.paid_on?.startsWith(String(year))).reduce((s, p) => s + Number(p.amount), 0);
  const last = [...completed].sort((a, b) => b.paid_on.localeCompare(a.paid_on))[0] ?? null;
  const expiry = membership?.expiry_date ?? null;
  const currentPlanName = membership?.membership_plans?.name ?? null;

  const byYear = useMemo(() => {
    const sorted = [...payments].sort((a, b) => (b.paid_on ?? '').localeCompare(a.paid_on ?? ''));
    const out: [string, PaymentRow[]][] = [];
    for (const p of sorted) {
      const y = (p.paid_on ?? '').slice(0, 4) || '—';
      const lastGroup = out[out.length - 1];
      if (lastGroup && lastGroup[0] === y) lastGroup[1].push(p);
      else out.push([y, [p]]);
    }
    return out;
  }, [payments]);

  /** The plan a payment bought: the 0091 snapshot, or — for older rows — the plan today, labelled as such. */
  const planOf = (p: PaymentRow): string =>
    p.plan_name ?? (currentPlanName ? `${currentPlanName} (current plan)` : 'Membership');

  return (
    <Page>
      <PageTitle back fallback="/member/membership" title="Payments" subtitle="Recorded at the desk — the gym takes cash" />

      {loading ? <SkeletonList /> : (
        <>
          {/* ── Summary ── */}
          <Panel glow="structure">
            <Eyebrow>Paid in {year}</Eyebrow>
            <p style={{ fontSize: 32, fontWeight: 700, marginTop: 6, letterSpacing: '-0.02em', color: 'var(--color-text-primary)' }}>
              {peso(thisYear)}
            </p>
            <div className="grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12, marginTop: 14 }}>
              {/* The all-time total only when it says something the headline does not. */}
              {totalPaid !== thisYear
                ? <InlineStat value={peso(totalPaid)} label={`in all · ${completed.length} ${completed.length === 1 ? 'payment' : 'payments'}`} />
                : <InlineStat value={completed.length} label={completed.length === 1 ? 'payment, all this year' : 'payments, all this year'} />}
              <InlineStat
                value={last ? new Date(`${last.paid_on}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                label={last ? `last paid · ${peso(Number(last.amount))}` : 'no payment yet'} />
            </div>
            {expiry && (
              <div className="flex items-center justify-between" style={{ gap: 12, marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--color-separator)' }}>
                <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
                  {currentPlanName ?? 'Your plan'} runs until{' '}
                  <span style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>{longDate(expiry)}</span>
                </span>
                <button onClick={() => navigate('/member/renew-membership')} className="flex-none inline-flex items-center"
                  style={{ gap: 5, fontSize: 13, fontWeight: 600, color: 'var(--color-secondary)' }}>
                  <ArrowsClockwise size={14} /> Renew
                </button>
              </div>
            )}
          </Panel>

          {/* ── Waiting on something ── */}
          {request && (
            <button onClick={() => navigate('/member/renew-membership')} className="w-full flex items-center text-left noc-press-soft"
              style={{ gap: 12, padding: 14, borderRadius: 14, border: '1px solid color-mix(in srgb, var(--color-secondary) 40%, transparent)' }}>
              <PaperPlaneTilt size={18} weight="fill" style={{ color: 'var(--color-secondary)', flex: 'none' }} aria-hidden />
              <span className="flex-1 min-w-0">
                <span className="block" style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}>
                  Renewal requested · {request.planName}
                </span>
                <span className="block" style={{ fontSize: 12, marginTop: 2, color: 'var(--color-text-secondary)' }}>
                  {request.planPrice ? `Bring ${peso(request.planPrice)} — ` : ''}it appears here once the desk records it
                </span>
              </span>
              <CaretRight size={15} style={{ color: 'var(--color-text-muted)' }} aria-hidden />
            </button>
          )}
          {pending.length > 0 && (
            <p className="flex items-start" style={{ gap: 8, fontSize: 12.5, lineHeight: 1.5, color: 'var(--color-secondary)' }}>
              <HourglassMedium size={15} className="flex-none" style={{ marginTop: 1 }} aria-hidden />
              {pending.length === 1 ? 'One payment is' : `${pending.length} payments are`} waiting to be confirmed by the desk —
              not counted in your totals until then.
            </p>
          )}

          {/* ── By year ── */}
          {byYear.length === 0 ? (
            <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--color-text-muted)' }}>
              No payments yet. Payments recorded at the front desk appear here, each with its receipt.
            </p>
          ) : byYear.map(([y, rows]) => (
            <section key={y}>
              <div className="flex items-baseline justify-between" style={{ gap: 12 }}>
                <h2 style={{ fontSize: 'var(--text-title)', fontWeight: 700, color: 'var(--color-text-primary)' }}>{y}</h2>
                <span style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>
                  {peso(rows.filter((p) => p.status === 'completed').reduce((s, p) => s + Number(p.amount), 0))}
                </span>
              </div>
              <div className="noc-rows" style={{ marginTop: 4 }}>
                {rows.map((p, i) => (
                  <button key={p.id} onClick={() => setOpen(p)} className="w-full flex items-center text-left noc-row"
                    style={{ gap: 12, padding: '13px 0', borderBottom: i === rows.length - 1 ? 'none' : '1px solid var(--color-separator)' }}>
                    <span className="flex-none grid place-items-center orb-cell" aria-hidden
                      style={{ width: 42, height: 42, borderRadius: 12, color: 'var(--color-primary-300)' }}>
                      <Receipt size={18} />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="flex items-center" style={{ gap: 8 }}>
                        <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text-primary)' }}>{peso(Number(p.amount))}</span>
                        <StatusPill label={STATUS[p.status].label} tone={STATUS[p.status].tone} />
                      </span>
                      <span className="block truncate" style={{ fontSize: 12, marginTop: 3, color: 'var(--color-text-secondary)' }}>
                        {new Date(`${p.paid_on}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        {' · '}{p.plan_name ?? 'Membership'} · {p.method}
                      </span>
                    </span>
                    <CaretRight size={15} className="flex-none" style={{ color: 'var(--color-text-muted)' }} aria-hidden />
                  </button>
                ))}
              </div>
            </section>
          ))}

          <button onClick={() => navigate('/terms')} className="self-start" style={{ fontSize: 12.5, color: 'var(--color-primary-300)' }}>
            How refunds work
          </button>
        </>
      )}

      {/* ── A receipt ── */}
      <GlassSheet
        open={open != null}
        onClose={() => setOpen(null)}
        title={open ? peso(Number(open.amount)) : ''}
        subtitle={open ? `${STATUS[open.status].label} · ${gym?.gym_name ?? 'Front desk'}` : undefined}
      >
        {open && (
          <div className="flex flex-col">
            {[
              ['Invoice', open.invoice_number ?? '—'],
              ['Date paid', longDate(open.paid_on)],
              ['Plan', planOf(open)],
              ['Method', open.method.replace(/^\w/, (c) => c.toUpperCase())],
              ['Recorded', new Date(open.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })],
              ...(open.notes ? [['Note', open.notes]] : []),
            ].map(([k, v], i, arr) => (
              <div key={k} className="flex items-start justify-between" style={{
                gap: 16, padding: '12px 0', borderBottom: i === arr.length - 1 ? 'none' : '1px solid var(--color-separator)',
              }}>
                <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>{k}</span>
                <span className="text-right" style={{
                  fontSize: 13.5, fontWeight: 600, color: 'var(--color-text-primary)',
                  fontFamily: k === 'Invoice' ? 'ui-monospace, Menlo, Consolas, monospace' : undefined,
                }}>{v}</span>
              </div>
            ))}
            {!open.plan_name && (
              <p style={{ fontSize: 12, marginTop: 10, lineHeight: 1.5, color: 'var(--color-text-muted)' }}>
                Older payments did not record their plan, so this shows the plan you are on now.
              </p>
            )}
            {open.status === 'pending' && (
              <p style={{ fontSize: 12.5, marginTop: 10, color: 'var(--color-secondary)' }}>
                Waiting for the desk to confirm it — it counts once confirmed.
              </p>
            )}
            <NocButton variant="ghost" className="w-full" style={{ marginTop: 16 }} onClick={() => setOpen(null)}>Done</NocButton>
          </div>
        )}
      </GlassSheet>
    </Page>
  );
}
