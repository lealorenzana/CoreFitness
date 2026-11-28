import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import ViewMenu from '../components/ui/ViewMenu';
import FloatingWindow from '../components/ui/FloatingWindow';
import { supabase } from '../lib/supabaseClient';
import { useFitRows } from '../hooks/useFitRows';
import RecordPaymentModal, { type RecordPaymentInput } from '../components/ui/RecordPaymentModal';
import ViewReceiptModal from '../components/ui/ViewReceiptModal';
import DetailSheet, { SheetRow } from '../components/ui/DetailSheet';
import {
  RdHeader, RdCard, StatTile, PageTabs, FilterChips, SearchField, RdSelect, RdButton, Pill, RdTable, Tr, Td, TableFooter,
  EmptyBlock, FitBody, Initials,
} from '../components/ui/rd';
import { TONE } from '../components/ui/rdTokens';
import { todayKey } from '../utils/dates';
import { exportPaymentsToCSV } from '../utils/exportUtils';
import { ArrowRightLeft, Banknote, CalendarRange, Smartphone, ChevronRight, Download, ImageOff, Plus, Receipt as ReceiptIcon, Send, Wallet } from 'lucide-react';
import { showToast } from '../utils/toast';
import { listPayments, updatePaymentStatus } from '../lib/api/payments';
import { recordDeskPayment, renewalPayment, type MemberPlanInfo } from '../services/deskActions';
import { listMembers } from '../lib/api/members';
import { listMemberships } from '../lib/api/memberships';
import { listPlans } from '../lib/api/membershipPlans';
import type { MembershipPlanRow } from '../types/db';
import { notifyUser } from '../lib/api/notify';
import {
  listOpenRenewalRequests, declineRenewalRequest, type OpenRenewalRequest,
} from '../lib/api/renewalRequests';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import CashCloseout from '../components/ui/CashCloseout';
import type { CashDay } from '../lib/api/cash';
import SkelRows from '../components/ui/SkelRows';

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
export type { MemberPlanInfo } from '../services/deskActions';

interface MemberGroup {
  memberId: string; memberName: string;
  /** From `listMembers()`, which has always carried it — the card drew its own
   *  initials circle and never asked. NULL is normal and falls back to them. */
  photoUrl: string | null;
  payments: Payment[];
  totalPaid: number;
  lastPayment: string;
}

const SECOND = 'var(--color-text-secondary)';
const MUTED = 'var(--color-text-muted)';
const LINE = '1px solid rgb(var(--hair-rgb, 255 255 255) / 0.06)';
const RENEW_VIEWS: [string, string][] = [['details', 'Details'], ['list', 'List'], ['tiles', 'Tiles']];
const peso = (n: number) => `₱${n.toLocaleString('en-PH', { maximumFractionDigits: 2 })}`;

/**
 * Payments, 2026-10-12: fits the screen — tiles, Records (by member, or every
 * payment) paged by what fits, Coming to renew as its own tab, and End of day
 * in the rail so the drawer is always one glance away.
 */
export default function Payments() {
  const [filterStatus, setFilterStatus] = useState<'all' | 'completed' | 'pending' | 'failed'>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [expandedMember, setExpandedMember] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  /** Rows that fit the records box — the page never scrolls. */
  const fit = useFitRows(10);
  const [tab, setTab] = useState<'records' | 'renew'>('records');
  const [view, setView] = useState<'members' | 'all'>('members');
  const [q, setQ] = useState('');
  const [nowMs] = useState(() => Date.now());
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  // memberId -> the member's current plan, for the Record Payment form
  const [memberMembership, setMemberMembership] = useState<Record<string, MemberPlanInfo>>({});
  const [memberPhotos, setMemberPhotos] = useState<Record<string, string | null>>({});
  /** "I'm coming to renew" from the phone app (0091). Null before it is live. */
  const [requests, setRequests] = useState<OpenRenewalRequest[] | null>(null);
  const [preset, setPreset] = useState<{ memberId: string; memberName: string; amount: number; key: string; method?: string; notes?: string; planId?: string } | null>(null);
  /** The gym's plans, for the form's plan picker (owner, 2026-11-10: "there should be a plan picker"). */
  const [plans, setPlans] = useState<MembershipPlanRow[]>([]);
  /** A request being approved in one click — its button is busy so a double tap records once. */
  const [approving, setApproving] = useState<string | null>(null);
  const [proof, setProof] = useState<string | null>(null);
  const [toDecline, setToDecline] = useState<OpenRenewalRequest | null>(null);
  /** Today's drawer, from the End of day card (0271): what should be in it right now. */
  const [drawer, setDrawer] = useState<CashDay | null>(null);
  /** To approve's View menu, like Members (owner, 2026-11-28): kept in the address and on the account (0285). */
  const [searchParams, setSearchParams] = useSearchParams();
  const rView = RENEW_VIEWS.some(([k]) => k === searchParams.get('rview')) ? searchParams.get('rview')! : 'tiles';
  const rPane = searchParams.get('rpane') === '1';
  const setRenewLook = (v: string, p: boolean) => {
    void supabase.rpc('set_view_pref', { p_key: 'admin.renewals', p_value: { view: v, pane: p } }).then(() => undefined, () => undefined);
    setSearchParams((prev) => {
      if (v === 'tiles') prev.delete('rview'); else prev.set('rview', v);
      if (p) prev.set('rpane', '1'); else prev.delete('rpane');
      return prev;
    }, { replace: true });
  };
  // With no layout in the address, the one this person chose last time (0285).
  useEffect(() => {
    if (searchParams.has('rview') || searchParams.has('rpane')) return;
    let alive = true;
    void (async () => {
      const { data, error } = await supabase.rpc('my_view_prefs');
      const saved = !error && data && typeof data === 'object' ? (data as Record<string, { view?: string; pane?: boolean }>)['admin.renewals'] : undefined;
      if (!alive || !saved) return;
      setSearchParams((prev) => {
        if (saved.view && saved.view !== 'tiles' && RENEW_VIEWS.some(([k]) => k === saved.view)) prev.set('rview', saved.view);
        if (saved.pane) prev.set('rpane', '1');
        return prev;
      }, { replace: true });
    })();
    return () => { alive = false; };
    // Once, on arriving at the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  /** The renewal a List or Details row opened: in the pane when it is on, else in its own window. */
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [windowOpen, setWindowOpen] = useState(false);
  const picked = requests?.find((r) => r.id === pickedId) ?? null;
  const shown = picked ?? (rPane ? requests?.find((r) => r.paid) ?? requests?.[0] ?? null : null);
  const openRenewal = (id: string) => { setPickedId(id); if (!rPane) setWindowOpen(true); };

  const loadData = async () => {
    setLoading(true);
    try {
      const [paymentRows, members, memberships, open, planRows] = await Promise.all([
        listPayments(),
        listMembers(),
        listMemberships(),
        listOpenRenewalRequests(),
        listPlans().catch(() => [] as MembershipPlanRow[]),
      ]);
      setRequests(open);
      setPlans(planRows);

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
            planId: m.plan_id,
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

      // Add member's "Record their first payment" lands here as ?record=<member>:
      // the form opens on that member and their plan's price, once.
      const rec = new URLSearchParams(window.location.search).get('record');
      if (rec && latestMembershipByMember[rec]) {
        setPreset({ memberId: rec, memberName: nameById[rec] ?? 'Member', amount: latestMembershipByMember[rec].planPrice, key: `new-${rec}` });
        setIsModalOpen(true);
        window.history.replaceState(window.history.state, '', window.location.pathname);
      } else if (rec === 'new') {
        // The dashboard's "Record payment": the form, open, with nobody chosen yet.
        setIsModalOpen(true);
        window.history.replaceState(window.history.state, '', window.location.pathname);
      }

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



  const handleRecordPayment = async (data: RecordPaymentInput) => {
    const membership = memberMembership[data.memberId];
    if (!membership) {
      showToast('This member has no membership plan assigned yet', 'error');
      return;
    }
    try {
      // The plan switch (first), the payment and the member's notice: services/deskActions, shared with Notifications.
      const { notified } = await recordDeskPayment(data, membership, plans);
      if (!notified) showToast('Payment recorded, but the member could not be notified', 'error');
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
  /**
   * One click (owner, 2026-11-10: "a button clicked then it's approved, so the transaction is fast"): the plan they
   * asked for, its price (or what they sent online), today, cash at the desk or the method they paid by — the plan
   * switched if it changed, the payment recorded, the request closed. Edit details opens the same in the form first.
   */
  const approveRequest = async (r: OpenRenewalRequest) => {
    if (approving) return;
    setApproving(r.id);
    try {
      await handleRecordPayment(renewalPayment(r));
    } finally { setApproving(null); }
  };

  const recordForRequest = (r: OpenRenewalRequest) => {
    setPreset({ memberId: r.memberId, memberName: r.memberName, amount: r.paid?.amount ?? r.planPrice, key: r.id, planId: r.planId,
      ...(r.paid ? {
        method: r.paid.kind === 'gcash' ? 'GCash' : r.paid.kind === 'maya' ? 'Maya' : 'Bank transfer',
        notes: `Paid online by ${r.paid.method}, ref ${r.paid.reference}${r.paid.paidOn ? ` on ${r.paid.paidOn}` : ''}`,
      } : {}) });
    setIsModalOpen(true);
  };

  const decline = async (reason: string) => {
    if (!toDecline) return;
    try {
      await declineRenewalRequest(toDecline.id, reason);
      showToast('Request declined. The member has been told why', 'success');
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

  const methodWord = (m: string) => (m === 'gcash' ? 'GCash' : m === 'maya' ? 'Maya' : m ? m[0].toUpperCase() + m.slice(1) : '—');
  const fmtDate = (ymd: string) => new Date(ymd.length === 10 ? `${ymd}T00:00:00` : ymd).toLocaleDateString('en-PH', { day: 'numeric', month: 'short', year: 'numeric' });

  const completed = payments.filter((p) => p.status === 'completed');
  const totalRevenue = completed.reduce((s, p) => s + p.amount, 0);
  const monthKey = todayKey().slice(0, 7);
  const thisMonth = completed.filter((p) => p.date.slice(0, 7) === monthKey).reduce((s, p) => s + p.amount, 0);
  const pendingCount = payments.filter((p) => p.status === 'pending').length;

  if (loading) {
    return <SkelRows shape="table" label="Loading payments…" />;
  }

  const openGroup = memberGroups.find((g) => g.memberId === expandedMember) ?? null;
  // Autofill (E4): a renewal starts from how the member paid last time — rows are newest first.
  const lastMethodByMember: Record<string, string> = {};
  for (const p of payments) if (!(p.memberId in lastMethodByMember)) lastMethodByMember[p.memberId] = p.method;
  const needle = q.trim().toLowerCase();
  const paymentMatches = (p: Payment) => `${p.memberName} ${p.plan} ${p.invoiceNumber}`.toLowerCase().includes(needle);
  const flat = payments.filter((p) => (filterStatus === 'all' || p.status === filterStatus) && (!needle || paymentMatches(p)));
  // By member: the box says "Member, plan or invoice", so a member shows when any of their
  // payments matches — it searched names only (staging QA, DASH-PAYMENTS, 2026-11-13).
  const groupsShown = memberGroups.filter((g) => !needle || g.memberName.toLowerCase().includes(needle) || g.payments.some(paymentMatches));
  const rowsTotal = view === 'members' ? groupsShown.length : flat.length;
  const page = Math.min(currentPage, Math.max(1, Math.ceil(rowsTotal / fit.perPage)));
  const slice = <T,>(list: T[]) => list.slice((page - 1) * fit.perPage, page * fit.perPage);
  const rowH = rowsTotal > fit.perPage ? fit.rowHeight : undefined;
  const reqCount = requests?.length ?? 0;
  const paidCount = requests?.filter((r) => r.paid).length ?? 0;

  /** One renewal, whole: the Tiles view, and the Details pane beside the List and Details views. */
  const renewalCard = (r: OpenRenewalRequest) => {
                    const current = memberMembership[r.memberId];
                    const planChange = current && current.planName !== r.planName;
                    const hours = Math.max(0, Math.round((nowMs - Date.parse(r.createdAt)) / 3_600_000));
    return (
                      <div key={r.id} className="rounded-xl flex flex-col" style={{ background: 'rgb(var(--hair-rgb, 255 255 255) / 0.02)', border: '1px solid rgb(var(--hair-rgb, 255 255 255) / 0.09)' }}>
                        <div className="p-3.5 flex flex-col gap-3 flex-1">
                        <div className="flex items-start gap-2.5">
                          <Initials name={r.memberName} photo={r.photoUrl} size={36} />
                          <div className="min-w-0 flex-1">
                            <p className="text-[14px] text-white font-semibold truncate">{r.memberName}</p>
                            <p className="text-[12px]" style={{ color: MUTED }}>
                              {hours < 1 ? 'just now' : hours < 24 ? `${hours} h ago` : `${Math.round(hours / 24)} d ago`}
                              {r.note ? `. ${r.note}` : ''}
                            </p>
                          </div>
                          <span className="text-[17px] font-bold tabular-nums text-white">{r.planPrice > 0 ? peso(r.planPrice) : 'Free'}</span>
                        </div>
                        {r.paid && (
                          // What to check against the gym's own GCash or bank before approving (owner, 2026-11-24).
                          <div className="flex gap-3 rounded-lg p-2.5" data-online-pay style={{ background: 'rgb(var(--hair-rgb, 255 255 255) / 0.03)', border: '1px solid rgb(var(--hair-rgb, 255 255 255) / 0.07)' }}>
                            {r.paid.proof && (
                              <button type="button" onClick={() => setProof(r.paid!.proof)} aria-label="Open the screenshot full size" data-tip="Open full size"
                                className="h-[92px] w-[68px] flex-shrink-0 overflow-hidden rounded-md bg-white" data-proof>
                                <img src={r.paid.proof} alt="The member's payment screenshot" className="h-full w-full object-cover object-top" />
                              </button>
                            )}
                            <dl className="text-[12.5px] leading-snug grid gap-y-1 min-w-0 flex-1" style={{ gridTemplateColumns: 'auto minmax(0, 1fr)', columnGap: 12, color: MUTED }}>
                              <dt>Amount</dt><dd className="text-white font-semibold tabular-nums">{peso(r.paid.amount)}</dd>
                              <dt>Sent by</dt><dd className="text-white truncate">{r.paid.method}</dd>
                              <dt>Reference</dt><dd className="font-mono text-[13px] text-white break-all tracking-wide" data-ref>{r.paid.reference}</dd>
                              <dt>Paid on</dt><dd className="text-white">{r.paid.paidOn ? fmtDate(r.paid.paidOn) : 'not given'}</dd>
                              {!r.paid.proof && <><dt>Screenshot</dt><dd className="flex items-center gap-1"><ImageOff size={13} />No screenshot sent</dd></>}
                            </dl>
                          </div>
                        )}
                        <div className="text-[12.5px] grid gap-1" style={{ color: SECOND }}>
                          <p>
                            Wants <span className="text-white font-semibold">{r.planName}</span>
                            {current ? <>, on {current.planName} now</> : ', no membership yet'}
                          </p>
                          {planChange && (
                            <p className="flex items-center gap-1.5 text-[12px]" style={{ color: TONE.amber.fg }} data-plan-switch>
                              <ArrowRightLeft size={13} className="flex-shrink-0" />Approving switches them from {current.planName} to {r.planName}.
                            </p>
                          )}
                          {!current && (
                            <p className="text-[12px]" style={{ color: TONE.amber.fg }}>No membership yet. Give them one in Members first.</p>
                          )}
                        </div>
                        </div>
                        <div className="p-3 grid grid-cols-2 gap-1.5" style={{ borderTop: LINE }}>
                          <RdButton size="md" variant="primary" icon={Banknote} className="col-span-2" disabled={!current || approving !== null} onClick={() => void approveRequest(r)} data-approve>
                            {approving === r.id ? 'Approving…'
                              : r.paid ? `It reached us, approve ${peso(r.paid.amount)}`
                              : r.planPrice > 0 ? `Cash received, approve ${peso(r.planPrice)}` : 'Approve'}
                          </RdButton>
                          <RdButton size="sm" variant="secondary" disabled={!current || approving !== null} onClick={() => recordForRequest(r)} data-approve-edit>Edit details</RdButton>
                          <RdButton size="sm" variant="ghost" onClick={() => setToDecline(r)}>Decline</RdButton>
                        </div>
                      </div>
    );
  };

  return (
    <div className="rd-fit" data-payments>
      <RdHeader title="Payments" subtitle="Money taken at the desk and online, by member, and the drawer at closing time."
        actions={<>
          {/* Up here, not above the table: the table and End of day start on one line (2026-10-25). */}
          <PageTabs<'records' | 'renew'> label="Payments sections" value={tab} onChange={setTab} tabs={[
            { key: 'records', label: 'Records', icon: Banknote },
            { key: 'renew', label: 'To approve', icon: Send, count: reqCount },
          ]} />
          <RdButton icon={Download} onClick={() => exportPaymentsToCSV(payments)}>Export</RdButton>
          <RdButton variant="primary" icon={Plus} onClick={() => setIsModalOpen(true)}>Record payment</RdButton>
        </>} />

      <div className="rd-tiles-rail">
        <StatTile compact icon={Banknote} label="Total collected" value={peso(totalRevenue)} sub={`${completed.length} completed payments`} />
        <StatTile compact icon={CalendarRange} label="This month" value={peso(thisMonth)} sub="by the day it was paid" />
        {/* Was "Pending": no flow creates a pending payment any more, so it was always 0 (owner, 2026-11-24). */}
        <StatTile compact icon={Wallet} label="In the drawer now" value={drawer ? peso(drawer.expected) : '…'}
          sub={drawer ? (drawer.closed ? 'today is closed' : 'counted by the system') : 'reading the drawer'} />
        <StatTile compact icon={Send} tone={reqCount ? 'amber' : 'violet'} label="To approve" value={reqCount}
          sub={paidCount ? `${paidCount} paid online to check, ${reqCount - paidCount} coming to pay` : 'members renewing their plan'}
          active={tab === 'renew'} onClick={() => setTab('renew')} />
      </div>

      <FitBody rail={<>
        {/* The drawer at closing time (0095). Re-reads whenever payments change. */}
        <CashCloseout refreshKey={payments} onDrawer={setDrawer} />
      </>}>
        {tab === 'records' ? (
          <RdCard className="overflow-hidden rd-fit-fill" data-records>
            <div className="flex items-center gap-2.5 flex-wrap px-4 py-3" style={{ borderBottom: LINE }}>
              <FilterChips<'all' | 'completed' | 'pending' | 'failed'> compact value={filterStatus}
                onChange={(v) => { setFilterStatus(v); setCurrentPage(1); }} items={[
                  { key: 'all', label: 'All', count: payments.length },
                  { key: 'completed', label: 'Completed', count: completed.length },
                  // Only while one exists: nothing creates a pending payment any more (2026-11-24).
                  ...(pendingCount ? [{ key: 'pending' as const, label: 'Pending', count: pendingCount, tone: 'amber' as const }] : []),
                  { key: 'failed', label: 'Failed', count: payments.filter((p) => p.status === 'failed').length },
                ]} />
              <div className="flex-1 min-w-[180px]"><SearchField value={q} onChange={(v) => { setQ(v); setCurrentPage(1); }} placeholder="Member, plan or invoice" /></div>
              <RdSelect label="Show" value={view} onChange={(v) => { setView(v as 'members' | 'all'); setCurrentPage(1); }} className="w-[170px]">
                <option value="members">By member</option>
                <option value="all">Every payment</option>
              </RdSelect>
            </div>
            {view === 'members' ? (
              <RdTable boxRef={fit.ref} head={['Member', 'Payments', 'Total paid', 'Last paid', { label: '', align: 'right' }]}
                empty={groupsShown.length === 0 ? (
                  <EmptyBlock compact icon={Banknote} title={filterStatus === 'all' ? 'No payments recorded' : `No ${filterStatus} payments`}
                    body={filterStatus === 'all' ? 'Every peso taken at the desk is recorded here.' : 'Try another filter. The money is still under All.'}
                    action={filterStatus === 'all' ? <RdButton variant="primary" icon={Plus} onClick={() => setIsModalOpen(true)}>Record one</RdButton> : undefined} />
                ) : undefined}>
                {slice(groupsShown).map((group) => {
                  const owing = group.payments.filter((p) => p.status === 'pending').length;
                  return (
                    <Tr key={group.memberId} onClick={() => setExpandedMember(group.memberId)} style={{ height: rowH }} data-member-row>
                      <Td>
                        <span className="flex items-center gap-3 min-w-0">
                          <Initials name={group.memberName} photo={group.photoUrl} size={34} />
                          <span className="font-semibold text-white truncate">{group.memberName}</span>
                        </span>
                      </Td>
                      <Td style={{ color: SECOND }}>
                        {group.payments.length} payment{group.payments.length !== 1 ? 's' : ''}
                        {owing > 0 && <span style={{ color: TONE.amber.fg }}>, {owing} pending</span>}
                      </Td>
                      <Td><span className="font-semibold text-white tabular-nums">{peso(group.totalPaid)}</span></Td>
                      <Td style={{ color: SECOND }}>{fmtDate(group.lastPayment)}</Td>
                      <Td align="right"><ChevronRight size={17} style={{ color: MUTED }} className="inline" /></Td>
                    </Tr>
                  );
                })}
              </RdTable>
            ) : (
              <RdTable boxRef={fit.ref} head={['Paid on', 'Member', 'Plan', 'Method', 'Amount', 'Status', { label: '', align: 'right' }]}
                empty={flat.length === 0 ? <EmptyBlock compact icon={Banknote} title="No payments match" /> : undefined}>
                {slice(flat).map((p) => (
                  <Tr key={p.id} style={{ height: rowH }} data-payment-row>
                    <Td className="whitespace-nowrap" style={{ color: SECOND }}>{fmtDate(p.date)}</Td>
                    <Td><span className="font-semibold text-white truncate block max-w-[170px]">{p.memberName}</span></Td>
                    <Td><span className="block truncate max-w-[170px]" style={{ color: SECOND }}>{p.plan}</span></Td>
                    <Td style={{ color: SECOND }}>{methodWord(p.method)}</Td>
                    <Td><span className="font-semibold text-white tabular-nums">{peso(p.amount)}</span></Td>
                    <Td><Pill tone={p.status === 'completed' ? 'violet' : 'amber'} solidDot>{p.status === 'completed' ? 'Completed' : p.status === 'pending' ? 'Pending' : 'Failed'}</Pill></Td>
                    <Td align="right">
                      <span className="inline-flex gap-1">
                        {p.status === 'pending' && <RdButton size="sm" variant="primary" onClick={() => confirmPayment(p.id)}>Confirm</RdButton>}
                        <button type="button" aria-label={`Receipt ${p.invoiceNumber}`} data-tip={`Receipt ${p.invoiceNumber}`}
                          onClick={() => { setSelectedPayment(p); setIsReceiptModalOpen(true); }}
                          className="w-9 h-9 rounded-xl grid place-items-center hover:bg-white/[0.06]" style={{ color: SECOND, border: '1px solid rgb(var(--hair-rgb, 255 255 255) / 0.1)' }}><ReceiptIcon size={15} /></button>
                      </span>
                    </Td>
                  </Tr>
                ))}
              </RdTable>
            )}
            <TableFooter page={page} perPage={fit.perPage} total={rowsTotal} noun={view === 'members' ? 'members' : 'payments'} onPage={setCurrentPage} />
          </RdCard>
        ) : (
          /* ── Coming to renew (0091) ── a member tapped "Tell the desk I'm coming". Recording the
             payment closes the request by itself; the only desk action of its own is Decline. */
          <RdCard className="flex flex-col min-h-0 overflow-hidden rd-fit-fill" data-renew>
            <div className="px-4 py-3 grid gap-2" style={{ borderBottom: LINE }}>
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-semibold text-white">To approve: renewals</p>
                  <p className="text-[12.5px]" style={{ color: SECOND }}>Members renewing from the phone app. Approving records the payment, the receipt and the plan they asked for.</p>
                </div>
                <span className="att" style={{ height: 'auto', overflow: 'visible', display: 'inline-flex' }}>
                  <ViewMenu views={RENEW_VIEWS} view={rView} pane={rPane} onChange={setRenewLook} />
                </span>
              </div>
              <ol className="flex flex-wrap gap-x-6 gap-y-1 text-[12px]" style={{ color: SECOND }}>
                <li className="flex gap-2"><Smartphone size={14} className="mt-0.5 flex-shrink-0" style={{ color: TONE.violet.fg }} />
                  <span><span className="text-white font-semibold">Paid online</span>: open your GCash or bank, find that reference and amount, then approve.</span></li>
                <li className="flex gap-2"><Banknote size={14} className="mt-0.5 flex-shrink-0" style={{ color: TONE.amber.fg }} />
                  <span><span className="text-white font-semibold">Coming to pay</span>: approve when they hand you the cash.</span></li>
              </ol>
            </div>
            <div className="flex-1 min-h-0 flex">
            <div className="rd-fit-scroll p-4 flex-1 min-w-0" data-renew-view={rView}>
              {!requests || requests.length === 0 ? (
                <EmptyBlock compact icon={Send} title="Nothing to approve" body="When a member renews in the app, by paying your GCash or bank or by saying they will pay at the desk, they show here." />
              ) : (
                /* Paid ones first: money is waiting on the desk's yes (owner, 2026-10-28). */
                <div className="grid gap-5">
                  {([['Paid online, check it', requests.filter((q) => q.paid)], ['Coming to pay at the desk', requests.filter((q) => !q.paid)]] as const)
                    .filter(([, list]) => list.length > 0).map(([label, list]) => (
                    <section key={label} className="grid gap-2.5">
                      <p className="text-[12.5px] font-semibold flex items-center gap-2" style={{ color: SECOND }}>
                        {label}<span className="tabular-nums rounded-full px-1.5 text-[11.5px]" style={{ background: 'rgb(var(--hair-rgb, 255 255 255) / 0.08)', color: MUTED }}>{list.length}</span>
                      </p>
                      {rView === 'tiles' ? (
                        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
                          {list.map((r) => renewalCard(r))}
                        </div>
                      ) : rView === 'list' ? (
                        // List: one line each; the row opens the whole renewal (the pane, or its own window).
                        <div className="grid" style={{ borderTop: LINE }}>
                          {list.map((r) => (
                            <button key={r.id} type="button" onClick={() => openRenewal(r.id)} aria-pressed={rPane ? shown?.id === r.id : undefined}
                              className="flex items-center gap-3 px-2 py-2 text-left hover:bg-white/[0.03]"
                              style={{ borderBottom: LINE, background: rPane && shown?.id === r.id ? TONE.violet.bg : undefined }}>
                              <Initials name={r.memberName} photo={r.photoUrl} size={30} />
                              <span className="min-w-0 flex-1">
                                <span className="block text-[13.5px] text-white font-semibold truncate">{r.memberName}</span>
                                <span className="block text-[12px] truncate" style={{ color: MUTED }}>Wants {r.planName}{r.paid ? `. ${r.paid.method}, ${r.paid.reference}` : ''}</span>
                              </span>
                              <span className="text-[14px] font-bold tabular-nums text-white">{r.planPrice > 0 ? peso(r.planPrice) : 'Free'}</span>
                              <ChevronRight size={15} style={{ color: MUTED }} />
                            </button>
                          ))}
                        </div>
                      ) : (
                        // Details: the columns to check against your GCash or bank, side by side.
                        <div className="overflow-x-auto">
                          {/* Fixed widths, the same in both groups, so the columns line up down the whole page. */}
                          <table className="w-full text-[12.5px]" style={{ borderCollapse: 'collapse', tableLayout: 'fixed', minWidth: 720 }}>
                            <colgroup>
                              {['24%', '12%', '11%', '17%', '20%', '12%', '4%'].map((w, i) => <col key={i} style={{ width: w }} />)}
                            </colgroup>
                            <thead>
                              <tr style={{ color: MUTED, borderBottom: LINE }}>
                                {['Member', 'Wants', 'Amount', 'Sent by', 'Reference', 'Paid on', ''].map((h) => <th key={h} className="text-left font-medium px-2 py-2 whitespace-nowrap">{h}</th>)}
                              </tr>
                            </thead>
                            <tbody>
                              {list.map((r) => (
                                <tr key={r.id} onClick={() => openRenewal(r.id)} className="cursor-pointer hover:bg-white/[0.03]"
                                  style={{ borderBottom: LINE, background: rPane && shown?.id === r.id ? TONE.violet.bg : undefined }}>
                                  <td className="px-2 py-2"><span className="flex items-center gap-2.5 min-w-0"><Initials name={r.memberName} photo={r.photoUrl} size={28} /><span className="text-white font-semibold truncate">{r.memberName}</span></span></td>
                                  <td className="px-2 py-2 truncate" style={{ color: SECOND }}>{r.planName}</td>
                                  <td className="px-2 py-2 tabular-nums text-white font-semibold whitespace-nowrap">{peso(r.paid ? r.paid.amount : r.planPrice)}</td>
                                  <td className="px-2 py-2 truncate" style={{ color: SECOND }}>{r.paid ? r.paid.method : 'Cash at the desk'}</td>
                                  <td className="px-2 py-2 font-mono text-white truncate">{r.paid ? r.paid.reference : ''}</td>
                                  <td className="px-2 py-2 whitespace-nowrap" style={{ color: SECOND }}>{r.paid ? (r.paid.paidOn ? fmtDate(r.paid.paidOn) : 'not given') : ''}</td>
                                  <td className="px-2 py-2 text-right"><ChevronRight size={15} style={{ color: MUTED }} className="inline" /></td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </section>
                  ))}
                </div>
              )}
            </div>
            {/* The Details pane (the View menu): the chosen renewal, whole, beside the list. */}
            {rPane && rView !== 'tiles' && shown && (
              <aside className="w-[340px] flex-shrink-0 rd-fit-scroll p-4" style={{ borderLeft: LINE }} aria-label="Details pane" data-renew-pane>
                {renewalCard(shown)}
              </aside>
            )}
            </div>
          </RdCard>
        )}
      </FitBody>

      {/* A renewal opened from the List or Details view with the pane off. Closes itself once approved or declined. */}
      <FloatingWindow open={windowOpen && !!picked && !rPane} onClose={() => setWindowOpen(false)} title={picked ? `Renewal: ${picked.memberName}` : 'Renewal'} icon={Send} width={440} data-renew-window>
        <div className="p-4">{picked && renewalCard(picked)}</div>
      </FloatingWindow>

      {/* One member's receipts, floating over the list. */}
      <DetailSheet
        open={!!openGroup}
        onClose={() => setExpandedMember(null)}
        title={openGroup?.memberName ?? ''}
        subtitle={openGroup
          ? `${peso(openGroup.totalPaid)} across ${openGroup.payments.length} payment${openGroup.payments.length === 1 ? '' : 's'}`
          : undefined}
      >
        <div className="space-y-2">
          {openGroup?.payments.map((p) => (
            <div key={p.id} className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgb(var(--hair-rgb, 255 255 255) / 0.08)' }}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[17px] font-bold text-white tabular-nums">{peso(p.amount)}</p>
                  {/* 0045 makes invoice_number NOT NULL: the real stored identifier. */}
                  <p className="text-[12px] font-mono" style={{ color: MUTED }}>{p.invoiceNumber}</p>
                </div>
                <Pill tone={p.status === 'completed' ? 'violet' : 'amber'} solidDot>{p.status === 'completed' ? 'Completed' : p.status === 'pending' ? 'Pending' : 'Failed'}</Pill>
              </div>
              <div className="mt-2 space-y-0.5">
                <SheetRow label="Plan">{p.plan}</SheetRow>
                <SheetRow label="Method">{methodWord(p.method)}</SheetRow>
                {/* paid_on, not created_at — the day the cash changed hands. */}
                <SheetRow label="Paid on">{new Date(p.date).toLocaleDateString('en-PH', { day: 'numeric', month: 'long', year: 'numeric' })}</SheetRow>
                {p.dueDate && (
                  <SheetRow label="Covers until">{new Date(`${p.dueDate}T00:00:00`).toLocaleDateString('en-PH', { day: 'numeric', month: 'long', year: 'numeric' })}</SheetRow>
                )}
              </div>
              <div className="flex gap-1.5 mt-2.5">
                <RdButton variant="ghost" size="sm" icon={ReceiptIcon} onClick={() => { setSelectedPayment(p); setIsReceiptModalOpen(true); }}>View receipt</RdButton>
                {p.status === 'pending' && <RdButton variant="primary" size="sm" onClick={() => confirmPayment(p.id)}>Confirm</RdButton>}
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
        plans={plans}
        preset={preset}
        lastMethodByMember={lastMethodByMember}
      />
      <DeclineDialog request={toDecline} onClose={() => setToDecline(null)} onDecline={decline} />
      {proof && (
        <div className="fixed inset-0 z-[1000] grid place-items-center p-6" style={{ background: 'rgba(0,0,0,0.75)' }}
          onClick={() => setProof(null)} role="dialog" aria-label="Payment screenshot">
          <img src={proof} alt="The member's payment screenshot" className="max-h-[85vh] max-w-full rounded-lg" />
        </div>
      )}
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
      reason={{ label: 'Why', placeholder: 'e.g. Renewed in person already, nothing more to do.', required: true,
        hint: 'The member reads this in their notifications and on their Plans screen.' }}
    />
  );
}
