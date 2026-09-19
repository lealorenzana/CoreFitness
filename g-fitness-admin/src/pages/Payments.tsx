import { useEffect, useState } from 'react';
import { useFillGrid } from '../hooks/useFillGrid';
import Button from '../components/ui/Button';
import Avatar from '../components/ui/Avatar';
import Pagination from '../components/ui/Pagination';
import RecordPaymentModal, { type RecordPaymentInput } from '../components/ui/RecordPaymentModal';
import ViewReceiptModal from '../components/ui/ViewReceiptModal';
import DetailSheet, { SheetRow } from '../components/ui/DetailSheet';
import {
  PageHeader, StatTiles, Section, EmptyState, CardGrid, TileCard, OpenChevron,
  Chips, PageSummary,
} from '../components/ui/kit';
import { exportPaymentsToCSV } from '../utils/exportUtils';
import { Banknote, CheckCircle, XCircle, Clock, Download, Plus, Send } from 'lucide-react';
import { showToast } from '../utils/toast';
import { listPayments, recordPayment, updatePaymentStatus } from '../lib/api/payments';
import { listMembers } from '../lib/api/members';
import { listMemberships } from '../lib/api/memberships';
import { notifyUser } from '../lib/api/notify';
import {
  listOpenRenewalRequests, declineRenewalRequest, type OpenRenewalRequest,
} from '../lib/api/renewalRequests';
import ConfirmDialog from '../components/ui/ConfirmDialog';

interface Payment {
  id: string; memberName: string; memberId: string; membershipId: string | null;
  amount: number; plan: string; method: string;
  status: 'completed' | 'pending' | 'failed';
  /** `due_date` when one was set — never the paid date standing in for it.
   *  recordPayment does not set it, so most rows have none and say nothing. */
  date: string; dueDate: string | null; invoiceNumber: string;
}

/** The member's current plan, shown in the Record Payment form so staff aren't
 *  typing an amount blind against a plan they can't see. */
export interface MemberPlanInfo {
  membershipId: string;
  /** NULL on a non-expiring plan (0024) — recordPayment leaves the expiry unset. */
  durationDays: number | null;
  planName: string;
  planPrice: number;
}

interface MemberGroup {
  memberId: string; memberName: string;
  /** From `listMembers()`, which has always carried it — the card drew its own
   *  initials circle and never asked. NULL is normal and falls back to them. */
  photoUrl: string | null;
  payments: Payment[];
  totalPaid: number;
  lastPayment: string;
}

export default function Payments() {
  const [filterStatus, setFilterStatus] = useState<'all' | 'completed' | 'pending' | 'failed'>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [expandedMember, setExpandedMember] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  /**
   * Whole rows of tiles, as many as the window has room for. The column count
   * follows the width (six on one desktop, five on another) and the row count
   * follows the height — a fixed two rows left half the screen empty below the
   * pager. Both are read off the browser's own layout by `useFillGrid`.
   */
  const { measure: measureRecords, perPage } = useFillGrid(12);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  // memberId -> the member's current plan, for the Record Payment form
  const [memberMembership, setMemberMembership] = useState<Record<string, MemberPlanInfo>>({});
  const [memberPhotos, setMemberPhotos] = useState<Record<string, string | null>>({});
  /** "I'm coming to renew" from the phone app (0091). Null before it is live. */
  const [requests, setRequests] = useState<OpenRenewalRequest[] | null>(null);
  const [preset, setPreset] = useState<{ memberId: string; memberName: string; amount: number; key: string } | null>(null);
  const [toDecline, setToDecline] = useState<OpenRenewalRequest | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [paymentRows, members, memberships, open] = await Promise.all([
        listPayments(),
        listMembers(),
        listMemberships(),
        listOpenRenewalRequests(),
      ]);
      setRequests(open);

      const nameById: Record<string, string> = {};
      const photoById: Record<string, string | null> = {};
      for (const m of members) {
        nameById[m.profile.id] = `${m.profile.first_name} ${m.profile.last_name}`;
        photoById[m.profile.id] = m.profile.photo_url ?? null;
      }
      setMemberPhotos(photoById);

      const planByMembershipId: Record<string, string> = {};
      const latestMembershipByMember: Record<string, MemberPlanInfo> = {};
      // A member can renew, so there may be several rows. Take the newest — a payment
      // must extend the current membership, never resurrect an old expired one.
      const newestCreatedAt: Record<string, string> = {};
      for (const m of memberships) {
        planByMembershipId[m.id] = m.membership_plans?.name ?? 'Unknown plan';
        if (!newestCreatedAt[m.member_id] || m.created_at > newestCreatedAt[m.member_id]) {
          newestCreatedAt[m.member_id] = m.created_at;
          latestMembershipByMember[m.member_id] = {
            membershipId: m.id,
            // `?? 30` would be wrong here: NULL is a deliberate "never expires",
            // and coalescing it would hand the free tier a 30-day expiry. Only a
            // missing plan join falls back.
            durationDays: m.membership_plans ? m.membership_plans.duration_days : 30,
            planName: m.membership_plans?.name ?? 'Unknown plan',
            planPrice: Number(m.membership_plans?.price) || 0,
          };
        }
      }
      setMemberMembership(latestMembershipByMember);

      setPayments(
        paymentRows.map((p) => ({
          id: p.id,
          memberId: p.member_id,
          membershipId: p.membership_id,
          memberName: nameById[p.member_id] ?? 'Unknown member',
          amount: p.amount,
          // The plan it bought (0091 snapshot); older rows name today's plan and say so.
          plan: p.plan_name
            ?? (p.membership_id && planByMembershipId[p.membership_id] ? `${planByMembershipId[p.membership_id]} (current plan)` : 'Unknown plan'),
          method: p.method.toLowerCase(),
          status: p.status,
          // The day the cash was received, not the day it was keyed in.
          date: p.paid_on ?? p.created_at.slice(0, 10),
          dueDate: p.due_date,
          // No `?? INV-${id.slice(0,8)}` fallback. That invented an invoice
          // number at render time which was never stored, so the receipt modal
          // and this table could show different identifiers for one payment.
          // 0045 makes the column NOT NULL, so there is nothing to fall back to.
          invoiceNumber: p.invoice_number,
        }))
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to load payments', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void (async () => { await loadData(); })(); }, []);

  // Group payments by member
  const memberGroups: MemberGroup[] = Object.values(
    payments.reduce((acc: Record<string, MemberGroup>, p) => {
      const filtered = filterStatus === 'all' || p.status === filterStatus;
      if (!filtered) return acc;
      if (!acc[p.memberId]) {
        acc[p.memberId] = { memberId: p.memberId, memberName: p.memberName,
          photoUrl: memberPhotos[p.memberId] ?? null, payments: [], totalPaid: 0, lastPayment: p.date };
      }
      acc[p.memberId].payments.push(p);
      if (p.status === 'completed') acc[p.memberId].totalPaid += p.amount;
      if (p.date > acc[p.memberId].lastPayment) acc[p.memberId].lastPayment = p.date;
      return acc;
    }, {})
  );

  // Clamped here rather than corrected in an effect: widening the window can
  // shrink the page count under whatever page is open.
  const page = Math.min(currentPage, Math.max(1, Math.ceil(memberGroups.length / perPage)));
  const paginatedGroups = memberGroups.slice((page - 1) * perPage, page * perPage);


  const handleRecordPayment = async (data: RecordPaymentInput) => {
    const membership = memberMembership[data.memberId];
    if (!membership) {
      showToast('This member has no membership plan assigned yet', 'error');
      return;
    }
    try {
      await recordPayment({
        member_id: data.memberId,
        membership_id: membership.membershipId,
        duration_days: membership.durationDays,
        amount: data.amount,
        method: data.method.toLowerCase(),
        status: 'completed',
        paid_on: data.date,
        due_date: null,
        notes: data.notes || null,
        recorded_by: null,
      });

      // A cash payment at the desk extends the membership, so the receipt is
      // the member's only proof it registered. Failing to notify must not read
      // as a failed payment — the money has already changed hands.
      await notifyUser({
        userId: data.memberId,
        type: 'payment',
        title: 'Payment received',
        message: `We received ₱${data.amount.toLocaleString('en-PH')}. Your membership has been extended.`,
        actionUrl: '/member/payments',
      }).catch(() => {
        showToast('Payment recorded, but the member could not be notified', 'error');
      });

      showToast('Payment recorded!', 'success');
      await loadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to record payment', 'error');
    }
  };

  /**
   * Confirms a pending payment — and tells the member.
   *
   * Marking it paid used to be invisible from the member's side: the row
   * changed, and the only way to find out was to open the payment history and
   * notice. For a personal training session that had already been paid for in
   * cash at the desk, that is the member's only confirmation the gym agrees.
   *
   * The notification is deduped on the payment id, so a double-clicked Confirm
   * cannot send two receipts. It is also not allowed to fail the confirmation:
   * the payment *is* settled, and a member who misses the alert still has the
   * row — the same asymmetry notify.ts describes between record and alert.
   */
  /** Record the payment a request asked for — the modal opens filled in. */
  const recordForRequest = (r: OpenRenewalRequest) => {
    setPreset({ memberId: r.memberId, memberName: r.memberName, amount: r.planPrice, key: r.id });
    setIsModalOpen(true);
  };

  const decline = async (reason: string) => {
    if (!toDecline) return;
    try {
      await declineRenewalRequest(toDecline.id, reason);
      showToast('Request declined — the member has been told why', 'success');
      setToDecline(null);
      await loadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not decline it', 'error');
    }
  };

  const confirmPayment = async (id: string) => {
    try {
      const updated = await updatePaymentStatus(id, 'completed');
      showToast('Payment confirmed', 'success');

      try {
        await notifyUser({
          userId: updated.member_id,
          type: 'payment',
          title: 'Payment received',
          message: `The gym has confirmed your payment of ₱${Number(updated.amount).toLocaleString('en-PH')}.`,
          actionUrl: '/member/payments',
          dedupe: `payment:${updated.id}:paid`,
        });
      } catch (notifyErr) {
        console.error('Payment confirmed but the member was not notified:', notifyErr);
        showToast('Payment confirmed, but we could not notify the member.', 'error');
      }

      await loadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to confirm payment', 'error');
    }
  };

  const getStatusStyle = (status: string) => {
    if (status === 'completed') return { color: 'var(--color-primary)', background: 'var(--color-primary-light)', border: '1px solid rgba(124,58,237,0.30)' };
    if (status === 'pending') return { color: 'var(--color-secondary)', background: 'var(--color-secondary-light)', border: '1px solid rgba(245,158,11,0.30)' };
    return { color: 'var(--color-secondary)', background: 'var(--color-secondary-light)', border: '1px solid rgba(245,158,11,0.30)' };
  };

  const methodIcon: Record<string, string> = { cash: '💵' };

  const totalRevenue = payments.filter(p => p.status === 'completed').reduce((s, p) => s + p.amount, 0);
  const stats = [
    { label: 'Total Revenue', value: `₱${totalRevenue.toLocaleString()}`, icon: Banknote, color: 'var(--color-primary)' },
    { label: 'Completed', value: payments.filter(p => p.status === 'completed').length, icon: CheckCircle, color: 'var(--color-primary)' },
    { label: 'Pending', value: payments.filter(p => p.status === 'pending').length, icon: Clock, color: 'var(--color-secondary)' },
    { label: 'Failed', value: payments.filter(p => p.status === 'failed').length, icon: XCircle, color: 'var(--color-secondary)' },
  ];

  if (loading) {
    return <div className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Loading payments…</div>;
  }

  const openGroup = memberGroups.find((g) => g.memberId === expandedMember) ?? null;

  // Exactly the window's height (header 4rem + <main>'s padding 3rem), so the
  // records panel runs to the bottom edge and the pager sits there.
  return (
    <div className="h-[calc(100vh-7rem)] flex flex-col gap-4">
      <PageHeader
        title="Payments"
        subtitle="Cash taken at the desk, grouped by member"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => exportPaymentsToCSV(payments)}>
              <Download size={14} /> Export
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setIsModalOpen(true)}>
              <Plus size={15} /> Record payment
            </Button>
          </>
        }
      />

      {/* ── Coming to renew (0091) ── a member tapped "Tell the desk I'm coming".
          Recording the payment closes the request by itself; the only desk
          action of its own is Decline. */}
      {requests && requests.length > 0 && (
        <Section title="Coming to renew" icon={Send} count={requests.length}
          hint="closes itself when you record their payment">
          <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
            {requests.map((r) => {
              const current = memberMembership[r.memberId];
              const planChange = current && current.planName !== r.planName;
              const hours = Math.max(0, Math.round((Date.parse(new Date().toISOString()) - Date.parse(r.createdAt)) / 3_600_000));
              return (
                <div key={r.id} className="rounded-xl p-3 flex flex-col gap-2"
                  style={{ background: 'var(--color-surface-raised)', border: '1px solid rgba(245,158,11,0.35)' }}>
                  <div className="flex items-center gap-2.5">
                    <Avatar name={r.memberName} photoUrl={r.photoUrl} size={34} tone="secondary" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] text-white font-semibold truncate">{r.memberName}</p>
                      <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                        {hours < 1 ? 'just now' : hours < 24 ? `${hours}h ago` : `${Math.round(hours / 24)}d ago`}
                        {r.note ? ` · ${r.note}` : ''}
                      </p>
                    </div>
                    <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--color-secondary)' }}>
                      {r.planPrice > 0 ? `₱${r.planPrice.toLocaleString()}` : 'Free'}
                    </span>
                  </div>
                  <p className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
                    Wants <span className="text-white font-semibold">{r.planName}</span>
                    {current ? <> · on {current.planName} now</> : ' · no membership yet'}
                  </p>
                  {planChange && (
                    <p className="text-[10px]" style={{ color: 'var(--color-secondary)' }}>
                      A plan change: switch them to {r.planName} in Members → Membership first, then record the payment.
                    </p>
                  )}
                  <div className="flex gap-1.5">
                    <Button variant="secondary" size="sm" disabled={!!planChange || !current}
                      onClick={() => recordForRequest(r)}>
                      <Banknote size={13} /> Record payment
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setToDecline(r)}>Decline</Button>
                  </div>
                </div>
              );
            })}
          </div>
        </Section>
      )}

      <StatTiles items={stats.map((s) => ({
        label: s.label,
        value: s.value,
        icon: s.icon,
        tone: s.color === 'var(--color-secondary)' ? 'secondary' : 'primary',
      }))} />

      {/* The member list.

          Clicking a member used to unfold an eight-column table *inside* the
          list, pushing every member below it down the page — and the table was
          wider than the space it had, so Invoice and Actions fought for room.
          The row now opens a sheet: the list stays where it is, and the columns
          become labelled lines with space to breathe. */}
      <Section
        title="Payment records" icon={Banknote} count={memberGroups.length}
        hint="click a member to see their receipts"
        className="flex-1 min-h-0 flex flex-col"
        actions={
          <Chips
            value={filterStatus}
            // Back to page one with the filter — in the handler, not an effect.
            onChange={(v) => { setFilterStatus(v); setCurrentPage(1); }}
            options={[
              { value: 'all', label: 'All' },
              { value: 'completed', label: 'Completed', count: payments.filter((p) => p.status === 'completed').length },
              { value: 'pending', label: 'Pending', count: payments.filter((p) => p.status === 'pending').length },
              { value: 'failed', label: 'Failed', count: payments.filter((p) => p.status === 'failed').length },
            ]}
          />
        }
      >
        {memberGroups.length === 0 ? (
          <EmptyState
            icon={Banknote}
            title={filterStatus === 'all' ? 'No payments recorded' : `No ${filterStatus} payments`}
            hint={filterStatus === 'all'
              ? 'Every peso taken at the desk is recorded here.'
              : 'Try another filter — the money is still on the All tab.'}
            action={filterStatus === 'all'
              ? <Button variant="secondary" size="sm" onClick={() => setIsModalOpen(true)}><Plus size={14} /> Record one</Button>
              : undefined}
          />
        ) : (
          <>
            {/* Measured by `useFillGrid`: height from the panel, never from
                the tiles; scrolls rather than clips; stable gutter so a
                scrollbar cannot change the column count. */}
            <div ref={measureRecords} className="flex-1 min-h-0 overflow-y-auto"
              style={{ scrollbarGutter: 'stable' }}>
            <CardGrid min={280}>
              {paginatedGroups.map((group) => {
                const owing = group.payments.filter((p) => p.status === 'pending').length;
                return (
                  <TileCard key={group.memberId} accent={owing > 0}
                    onClick={() => setExpandedMember(group.memberId)}
                    title={`Open ${group.memberName}'s payments`}>
                    <div className="flex items-center gap-2.5">
                      <Avatar name={group.memberName} photoUrl={group.photoUrl}
                        size={36} tone="secondary" />
                      <div className="min-w-0 flex-1">
                        <p className="text-[12px] text-white font-semibold truncate">{group.memberName}</p>
                        <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                          {group.payments.length} payment{group.payments.length !== 1 ? 's' : ''}
                          {owing > 0 && (
                            <span style={{ color: 'var(--color-secondary)' }}> · {owing} pending</span>
                          )}
                        </p>
                      </div>
                      <OpenChevron />
                    </div>
                    <div className="mt-2.5 flex items-baseline justify-between">
                      <span className="text-base font-bold text-white tabular-nums">
                        ₱{group.totalPaid.toLocaleString()}
                      </span>
                      <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                        last {new Date(group.lastPayment).toLocaleDateString('en-PH', { day: 'numeric', month: 'short' })}
                      </span>
                    </div>
                  </TileCard>
                );
              })}
            </CardGrid>
            </div>
            <div className="flex items-center justify-between mt-3">
              <PageSummary page={page} perPage={perPage}
                total={memberGroups.length} noun="members" />
              <Pagination currentPage={page} totalItems={memberGroups.length}
                itemsPerPage={perPage} onPageChange={setCurrentPage} />
            </div>
          </>
        )}
      </Section>

      {/* One member's receipts, floating over the list. */}
      <DetailSheet
        open={!!openGroup}
        onClose={() => setExpandedMember(null)}
        title={openGroup?.memberName ?? ''}
        subtitle={openGroup
          ? `₱${openGroup.totalPaid.toLocaleString()} across ${openGroup.payments.length} payment${openGroup.payments.length === 1 ? '' : 's'}`
          : undefined}
      >
        <div className="space-y-2">
          {openGroup?.payments.map((p) => (
            <div key={p.id} className="rounded-xl p-3"
              style={{ background: 'var(--color-surface-high)', border: '1px solid var(--color-border)' }}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-base font-bold text-white tabular-nums">₱{p.amount.toLocaleString()}</p>
                  {/* 0045 makes invoice_number NOT NULL, so this is the real
                      stored identifier — never one invented at render time. */}
                  <p className="text-[10px] font-mono" style={{ color: 'var(--color-text-muted)' }}>
                    {p.invoiceNumber}
                  </p>
                </div>
                <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase flex-shrink-0"
                  style={getStatusStyle(p.status)}>{p.status}</span>
              </div>

              <div className="mt-2 space-y-0.5">
                <SheetRow label="Plan">{p.plan}</SheetRow>
                <SheetRow label="Method">{methodIcon[p.method] || '💰'} {p.method}</SheetRow>
                {/* paid_on, not created_at — the day the cash changed hands. */}
                <SheetRow label="Paid on">{new Date(p.date).toLocaleDateString('en-PH', { day: 'numeric', month: 'long', year: 'numeric' })}</SheetRow>
                {p.dueDate && (
                  <SheetRow label="Covers until">{new Date(`${p.dueDate}T00:00:00`).toLocaleDateString('en-PH', { day: 'numeric', month: 'long', year: 'numeric' })}</SheetRow>
                )}
              </div>

              <div className="flex gap-1.5 mt-2.5">
                <Button variant="ghost" size="sm"
                  onClick={() => { setSelectedPayment(p); setIsReceiptModalOpen(true); }}>
                  View receipt
                </Button>
                {p.status === 'pending' && (
                  <Button variant="secondary" size="sm" onClick={() => confirmPayment(p.id)}>
                    Confirm
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </DetailSheet>

      <RecordPaymentModal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); setPreset(null); }}
        onSubmit={handleRecordPayment}
        planByMember={memberMembership}
        preset={preset}
      />
      <DeclineDialog request={toDecline} onClose={() => setToDecline(null)} onDecline={decline} />
      <ViewReceiptModal isOpen={isReceiptModalOpen} onClose={() => { setIsReceiptModalOpen(false); setSelectedPayment(null); }} payment={selectedPayment} />
    </div>
  );
}

/** Decline needs a reason the member reads — ConfirmDialog's reason field. */
function DeclineDialog({ request, onClose, onDecline }: {
  request: OpenRenewalRequest | null; onClose: () => void; onDecline: (reason: string) => void;
}) {
  return (
    <ConfirmDialog
      isOpen={!!request}
      onClose={onClose}
      onConfirm={(reason) => onDecline((reason ?? '').trim())}
      title="Decline renewal request"
      message={request ? `${request.memberName} asked for ${request.planName}.` : ''}
      confirmText="Decline"
      type="danger"
      reason={{ label: 'Why', placeholder: 'e.g. Renewed in person already — nothing more to do.', required: true,
        hint: 'The member reads this in their notifications and on their Plans screen.' }}
    />
  );
}
