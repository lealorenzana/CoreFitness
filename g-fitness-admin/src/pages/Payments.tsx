import { useEffect, useState } from 'react';
import Button from '../components/ui/Button';
import Pagination from '../components/ui/Pagination';
import RecordPaymentModal, { type RecordPaymentInput } from '../components/ui/RecordPaymentModal';
import ViewReceiptModal from '../components/ui/ViewReceiptModal';
import DetailSheet, { SheetRow } from '../components/ui/DetailSheet';
import {
  PageHeader, StatTiles, Section, EmptyState, CardGrid, TileCard, OpenChevron,
  Chips, PageSummary,
} from '../components/ui/kit';
import { exportPaymentsToCSV } from '../utils/exportUtils';
import { Banknote, CheckCircle, XCircle, Clock, Download, Plus } from 'lucide-react';
import { showToast } from '../utils/toast';
import { listPayments, recordPayment, updatePaymentStatus } from '../lib/api/payments';
import { listMembers } from '../lib/api/members';
import { listMemberships } from '../lib/api/memberships';
import { notifyUser } from '../lib/api/notify';

interface Payment {
  id: string; memberName: string; memberId: string; membershipId: string | null;
  amount: number; plan: string; method: string;
  status: 'completed' | 'pending' | 'failed';
  date: string; dueDate: string; invoiceNumber: string;
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
  payments: Payment[];
  totalPaid: number;
  lastPayment: string;
}

const ITEMS_PER_PAGE = 8;

export default function Payments() {
  const [filterStatus, setFilterStatus] = useState<'all' | 'completed' | 'pending' | 'failed'>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [expandedMember, setExpandedMember] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  // memberId -> the member's current plan, for the Record Payment form
  const [memberMembership, setMemberMembership] = useState<Record<string, MemberPlanInfo>>({});

  const loadData = async () => {
    setLoading(true);
    try {
      const [paymentRows, members, memberships] = await Promise.all([
        listPayments(),
        listMembers(),
        listMemberships(),
      ]);

      const nameById: Record<string, string> = {};
      for (const m of members) nameById[m.profile.id] = `${m.profile.first_name} ${m.profile.last_name}`;

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
          plan: p.membership_id ? planByMembershipId[p.membership_id] ?? 'Unknown plan' : 'Unknown plan',
          method: p.method.toLowerCase(),
          status: p.status,
          // The day the cash was received, not the day it was keyed in.
          date: p.paid_on ?? p.created_at.slice(0, 10),
          dueDate: p.due_date ?? p.paid_on ?? p.created_at.slice(0, 10),
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

  useEffect(() => {
    loadData();
  }, []);

  // Group payments by member
  const memberGroups: MemberGroup[] = Object.values(
    payments.reduce((acc: Record<string, MemberGroup>, p) => {
      const filtered = filterStatus === 'all' || p.status === filterStatus;
      if (!filtered) return acc;
      if (!acc[p.memberId]) {
        acc[p.memberId] = { memberId: p.memberId, memberName: p.memberName, payments: [], totalPaid: 0, lastPayment: p.date };
      }
      acc[p.memberId].payments.push(p);
      if (p.status === 'completed') acc[p.memberId].totalPaid += p.amount;
      if (p.date > acc[p.memberId].lastPayment) acc[p.memberId].lastPayment = p.date;
      return acc;
    }, {})
  );

  const paginatedGroups = memberGroups.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  useEffect(() => { setCurrentPage(1); }, [filterStatus]);

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

  const confirmPayment = async (id: string) => {
    try {
      await updatePaymentStatus(id, 'completed');
      showToast('Payment confirmed!', 'success');
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

  return (
    <div className="space-y-4">
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
        actions={
          <Chips
            value={filterStatus}
            onChange={setFilterStatus}
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
            <CardGrid min={280}>
              {paginatedGroups.map((group) => {
                const owing = group.payments.filter((p) => p.status === 'pending').length;
                return (
                  <TileCard key={group.memberId} accent={owing > 0}
                    onClick={() => setExpandedMember(group.memberId)}
                    title={`Open ${group.memberName}'s payments`}>
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-full flex items-center justify-center text-black font-bold text-[11px] flex-shrink-0"
                        style={{ background: 'var(--color-secondary)' }}>
                        {group.memberName.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                      </div>
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
            <div className="flex items-center justify-between mt-3">
              <PageSummary page={currentPage} perPage={ITEMS_PER_PAGE}
                total={memberGroups.length} noun="members" />
              <Pagination currentPage={currentPage} totalItems={memberGroups.length}
                itemsPerPage={ITEMS_PER_PAGE} onPageChange={setCurrentPage} />
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
                <SheetRow label="Covers until">{new Date(p.dueDate).toLocaleDateString('en-PH', { day: 'numeric', month: 'long', year: 'numeric' })}</SheetRow>
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
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleRecordPayment}
        planByMember={memberMembership}
      />
      <ViewReceiptModal isOpen={isReceiptModalOpen} onClose={() => { setIsReceiptModalOpen(false); setSelectedPayment(null); }} payment={selectedPayment} />
    </div>
  );
}
