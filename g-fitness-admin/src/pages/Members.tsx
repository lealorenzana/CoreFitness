import AddMemberWizard from '../components/members/AddMemberWizard';
import { setAccountStatus } from '../lib/api/accountEvents';
import {
  declineMembershipRequest, listOpenMembershipRequests,
  type OpenMembershipRequest,
} from '../lib/api/membershipRequests';
import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect, useCallback } from 'react';
import { useBranding } from '../hooks/useBranding';
import { useSearchParams } from 'react-router-dom';
import Popover from '../components/ui/Popover';
import { useFitRows } from '../hooks/useFitRows';
import {
  RdHeader, RdCard, IconTile, Ring, Bar, FilterChips, SearchField, RdSelect, RdButton, Pill, RdTable, Tr, Td, TableFooter,
  EmptyBlock, RailCard, RailAction, RailRow, TipCard, FitBody, Initials, DotMenu, type Chip,
} from '../components/ui/rd';
import type { Tone } from '../components/ui/rdTokens';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import MembershipActionDialog from '../components/ui/MembershipActionDialog';
import MemberDetailDrawer from '../components/ui/MemberDetailDrawer';
import InviteMembersPanel from '../components/InviteMembersPanel';
import FormField, { SectionLabel, FieldDivider } from '../components/ui/FormField';
import DatePicker from '../components/ui/DatePicker';
import { formatDate, formatPhoneNumber } from '../utils/formatters';
import { formatCheckInCode } from '../utils/checkInCode';
import { exportMembersToCSV } from '../utils/exportUtils';
import { UserPlus, Edit2, Archive, Download, Users, Filter, X, CheckCircle, XCircle, Clock, Eye, Pause, Play, Ban, ArrowUp, ArrowDown, AlertTriangle, UserX, UserCheck, Link2, Zap } from 'lucide-react';
import { showToast } from '../utils/toast';
import {
  listMembers,
  listArchivedMembers,
  listPendingRegistrations,
  approveMemberRegistration,
  rejectPendingRegistration,
  updateMemberProfile,
  startFreeMembership,
} from '../lib/api/members';
import { updateProfile } from '../lib/api/profiles';
import {
  listMemberships, freezeMembership, unfreezeMembership, cancelMembership,
  type MembershipActionDetail,
} from '../lib/api/memberships';
import { listPlans } from '../lib/api/membershipPlans';
import { notifyUser } from '../lib/api/notify';
import type {
  PendingRegistrationRow,
  MembershipPlanRow,
  ProfileStatus,
  MembershipStatus,
  MembershipRow,
} from '../types/db';

/** A member row joined with their current membership, for the roster table. */
interface MemberRow {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  /** Uploaded avatar, or null — <Avatar> falls back to initials. */
  photoUrl: string | null;
  email: string;
  phone: string;
  address: string;
  qrCode: string;
  experienceLevel: string;
  dateOfBirth: string;
  gender: string;
  accountStatus: ProfileStatus;
  emergencyContactName: string;
  emergencyContactPhone: string;
  emergencyContactRelationship: string;
  joinedOn: string;
  planName: string;
  membershipStatus: MembershipStatus | null;
  expiryDate: string | null;
  /** The live membership row itself — freeze/cancel act on it, not on the member. */
  membership: MembershipRow | null;
}

const EXPERIENCE_LEVELS = ['beginner', 'intermediate', 'advanced'];
const GENDERS = [
  { value: '', label: 'Not set' },
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
];


/**
 * What the membership badge actually says.
 *
 * The cell used to render the raw enum, so this column showed a lowercase
 * **"pending"** — three characters from the word used by the "Pending" button
 * in the header, which opens something else entirely: the *registration* queue.
 * One means "this member has not paid yet", the other means "this person cannot
 * log in until you approve them", and the roster gave them the same word.
 *
 * The pill's colour is `statusTone`; this is its text, deliberately not the enum.
 */
const MEMBERSHIP_LABEL: Record<MembershipStatus, string> = {
  active: 'Active',
  pending: 'Awaiting payment',
  expired: 'Expired',
  frozen: 'Frozen',
  cancelled: 'Cancelled',
};

/** Rows a page shows (the mock-up's ten). */
const PER_PAGE = 10;
type ChipKey = 'all' | 'active' | 'expiring' | 'pending' | 'approval' | 'expired' | 'suspended';

/** Days of remaining membership below which the roster starts warning. */
const EXPIRING_SOON_DAYS = 7;

type SortKey = 'name' | 'plan' | 'membership' | 'expiry' | 'joined';

/** Local calendar date as YYYY-MM-DD. Never toISOString() — that shifts to UTC. */
function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Whole days until a membership lapses, or null when the question doesn't apply
 * — no membership, a plan that never expires, or one that was never activated.
 * Negative means it has already lapsed.
 */
function daysUntilExpiry(row: MemberRow): number | null {
  if (!row.membership || row.membership.never_expires || !row.expiryDate) return null;
  return Math.round(
    (new Date(`${row.expiryDate}T00:00:00`).getTime() - new Date(`${todayKey()}T00:00:00`).getTime()) / 86_400_000
  );
}

export default function Members() {
  // The gym's own name: a welcome from Ferrer Gym must not greet a member
  // in Core Fitness's name (0110).
  const branding = useBranding();
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [plans, setPlans] = useState<MembershipPlanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  /** Rows that fit the table's own box (the page never scrolls, 2026-10-11). */
  const fit = useFitRows(PER_PAGE);
  /** The stat chips double as filters (the mock-up's row of counts). */
  const [chip, setChip] = useState<ChipKey>('all');
  const [planFilter, setPlanFilter] = useState('all');
  /** The Filter button's panel: account status and sort. */
  const [filterAnchor, setFilterAnchor] = useState<HTMLElement | null>(null);
  const [filters, setFilters] = useState({
    accountStatus: 'all' as 'all' | ProfileStatus,
    membershipStatus: 'all' as 'all' | MembershipStatus,
  });

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editing, setEditing] = useState<MemberRow | null>(null);
  const [toArchive, setToArchive] = useState<MemberRow | null>(null);
  const [toFreeze, setToFreeze] = useState<MemberRow | null>(null);
  const [toCancel, setToCancel] = useState<MemberRow | null>(null);
  const [toSuspend, setToSuspend] = useState<MemberRow | null>(null);
  // `?pending=1` is how the Dashboard's "sign-ups to approve" button lands here
  // with the queue already open — read once, in the initialiser, not an effect.
  const [searchParams, setSearchParams] = useSearchParams();
  const [showPendingPanel, setShowPendingPanel] = useState(() => searchParams.get('pending') === '1');
  const [showInvite, setShowInvite] = useState(() => searchParams.get('invite') === '1');
  /** Closes the panel and drops the flag, so a reload does not reopen it. */
  const closePendingPanel = () => {
    setShowPendingPanel(false);
    if (searchParams.has('pending')) {
      setSearchParams((prev) => { prev.delete('pending'); return prev; }, { replace: true });
    }
  };
  const [pendingCount, setPendingCount] = useState(0);
  /** Members asking to pause or stop (0118). Null = 0118 not pasted; the
      section then renders nothing rather than an empty promise. */
  const [msRequests, setMsRequests] = useState<OpenMembershipRequest[] | null>(null);
  /** The decline box, open on one request. */
  const [decliningId, setDecliningId] = useState<string | null>(null);
  const [declineWhy, setDeclineWhy] = useState('');
  /** The member whose full record is open in the drawer. `?open=<id>` is how
   *  the header search and the Activity feed land on one member (via
   *  /members/:id) — read once, in the initialiser, like `?pending`. */
  const [viewingId, setViewingId] = useState<string | null>(() => searchParams.get('open'));
  const closeDrawer = () => {
    setViewingId(null);
    if (searchParams.has('open')) {
      setSearchParams((prev) => { prev.delete('open'); return prev; }, { replace: true });
    }
  };
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'name', dir: 'asc' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rows, memberships, planList] = await Promise.all([
        showArchived ? listArchivedMembers() : listMembers(),
        listMemberships(),
        listPlans(),
      ]);
      setPlans(planList);

      // Newest membership per member — a member can renew, so there may be several.
      const currentByMember = new Map<string, (typeof memberships)[number]>();
      for (const m of memberships) {
        const existing = currentByMember.get(m.member_id);
        if (!existing || new Date(m.created_at) > new Date(existing.created_at)) {
          currentByMember.set(m.member_id, m);
        }
      }

      setMembers(
        rows.map(({ profile, member }) => {
          const ms = currentByMember.get(profile.id);
          return {
            id: profile.id,
            firstName: profile.first_name,
            lastName: profile.last_name,
            fullName: `${profile.first_name} ${profile.last_name}`.trim(),
            photoUrl: profile.photo_url ?? null,
            email: profile.email,
            phone: profile.phone ?? '',
            address: member.address ?? '',
            qrCode: member.qr_code ?? '',
            experienceLevel: member.experience_level ?? '',
            dateOfBirth: member.date_of_birth ?? '',
            gender: member.gender ?? '',
            accountStatus: profile.status,
            emergencyContactName: member.emergency_contact_name ?? '',
            emergencyContactPhone: member.emergency_contact_phone ?? '',
            emergencyContactRelationship: member.emergency_contact_relationship ?? '',
            joinedOn: member.created_at ?? profile.created_at,
            planName: ms?.membership_plans?.name ?? '—',
            membershipStatus: ms?.status ?? null,
            expiryDate: ms?.expiry_date ?? null,
            membership: ms ?? null,
          };
        })
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to load members', 'error');
    } finally {
      setLoading(false);
    }
  }, [showArchived]);

  const loadMsRequests = useCallback(async () => {
    setMsRequests(await listOpenMembershipRequests());
  }, []);
  useEffect(() => { void (async () => { await loadMsRequests(); })(); }, [loadMsRequests]);

  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  useEffect(() => {
    listPendingRegistrations()
      .then((list) => setPendingCount(list.length))
      .catch(() => {});
  }, [showPendingPanel]);

  const q = searchTerm.trim().toLowerCase();
  // Only the digits typed, and only when there are some: a name has none, and
  // every phone number "includes" the empty string — which made every member
  // match a name search (2026-10-09).
  const qDigits = q.replace(/\D/g, '');
  const qCode = q.replace(/[\s-]/g, '');
  // Word by word, so "Lea R. Lorenzana" finds "Lea Lorenzana": a middle initial
  // (one letter) and the word order never stop a match.
  const qWords = q.split(/[\s,.]+/).filter((w) => w.length > 1);
  const filtered = members.filter((m) => {
    const hay = `${m.fullName} ${m.email}`.toLowerCase();
    // Phone and check-in code included: at a front desk the member is standing
    // there, and what they can give you is a number, not a spelling.
    const matchesSearch =
      !q ||
      hay.includes(q) ||
      (qWords.length > 0 && qWords.every((w) => hay.includes(w))) ||
      (qDigits.length >= 3 && m.phone.replace(/\D/g, '').includes(qDigits)) ||
      (qCode.length >= 3 && formatCheckInCode(m.id).toLowerCase().replace(/\s/g, '').includes(qCode));
    const matchesAccount =
      filters.accountStatus === 'all' || m.accountStatus === filters.accountStatus;
    const matchesMembership =
      filters.membershipStatus === 'all' || m.membershipStatus === filters.membershipStatus;
    const matchesPlan = planFilter === 'all' || m.planName === planFilter;
    const d = daysUntilExpiry(m);
    const matchesChip =
      chip === 'all' ? true
      : chip === 'active' ? m.membershipStatus === 'active'
      : chip === 'expiring' ? m.membershipStatus === 'active' && d != null && d >= 0 && d <= EXPIRING_SOON_DAYS
      : chip === 'pending' ? m.membershipStatus === 'pending'
      : chip === 'approval' ? m.accountStatus === 'pending_approval'
      : chip === 'expired' ? m.membershipStatus === 'expired'
      : m.accountStatus === 'suspended';
    return matchesSearch && matchesAccount && matchesMembership && matchesPlan && matchesChip;
  });

  const sorted = [...filtered].sort((a, b) => {
    const dir = sort.dir === 'asc' ? 1 : -1;
    switch (sort.key) {
      case 'plan':
        return dir * a.planName.localeCompare(b.planName);
      case 'membership':
        return dir * (a.membershipStatus ?? 'zzz').localeCompare(b.membershipStatus ?? 'zzz');
      case 'expiry': {
        // A member with no expiry date sorts last either way, rather than
        // pretending to be the oldest or the furthest out.
        const av = a.expiryDate ?? '';
        const bv = b.expiryDate ?? '';
        if (!av && !bv) return 0;
        if (!av) return 1;
        if (!bv) return -1;
        return dir * av.localeCompare(bv);
      }
      case 'joined':
        return dir * a.joinedOn.localeCompare(b.joinedOn);
      default:
        return dir * a.fullName.localeCompare(b.fullName);
    }
  });

  const perPage = fit.perPage;
  // Clamped here, not corrected in an effect: a taller window means fewer
  // pages, and the one that was open may no longer exist.
  const page = Math.min(currentPage, Math.max(1, Math.ceil(sorted.length / perPage)));
  const paginated = sorted.slice((page - 1) * perPage, page * perPage);

  const planNames = [...new Set(members.map((m) => m.planName))].filter((p) => p !== '—').sort();

  const toggleSort = (key: SortKey) => {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
    setCurrentPage(1);
  };

  const expiringSoon = members.filter((m) => {
    const d = daysUntilExpiry(m);
    return m.membershipStatus === 'active' && d != null && d >= 0 && d <= EXPIRING_SOON_DAYS;
  }).length;

  /**
   * Freeze, unfreeze, cancel — the three membership actions the front desk owns.
   *
   * All three are recorded, reversible transactions on the membership row, which
   * is the line drawn for what staff may do. None of them delete anything.
   */
  // The dialog owns the error now: the database's refusal ("already frozen
  // twice this month") has to be readable *in* the form, not as a toast that
  // vanishes while the desk is still looking at half-filled fields.
  const handleFreeze = async (detail: Omit<MembershipActionDetail, 'memberId'>) => {
    if (!toFreeze?.membership) return;
    await freezeMembership(toFreeze.membership.id, { ...detail, memberId: toFreeze.id });
    showToast(`${toFreeze.fullName}'s membership is frozen`, 'success');
    setToFreeze(null);
    await load();
  };

  /**
   * Let a member who is already on the roster sign in.
   *
   * Distinct from `approveMemberRegistration`, which the Pending panel uses:
   * that one works off the `pending_registrations` queue and also copies the
   * intake details the member typed at sign-up onto their row. This is for a
   * member whose row already exists — added at the desk, or approved through
   * the queue before and later suspended — where the only thing standing
   * between them and the app is `profiles.status`.
   *
   * They are told. An account that quietly starts working is one the member
   * finds out about by trying again days later.
   */
  const handleApprove = async (m: MemberRow) => {
    try {
      // Audited like every other status change (0069). Approving needs no
      // reason, but it still belongs on the account's history — 'when did they
      // get in' is a question the desk asks about a member who is now suspended.
      await setAccountStatus(m.id, 'active');
      // And give them something to be a member *of*. Flipping the status alone
      // let them sign in with no membership at all — every screen that asks
      // what their plan allows got nothing back, so they were admitted and
      // still could not check in. Idempotent, so a member who already has a
      // plan keeps it.
      await startFreeMembership(m.id);
      showToast(`${m.fullName} can now sign in — started on the free plan`, 'success');
      notifyUser({
        userId: m.id,
        type: 'membership',
        title: 'Your account is approved',
        message: 'You can sign in to the app now.',
        actionUrl: '/member/home',
      }).catch(() => undefined);
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not approve that account', 'error');
    }
  };

  const handleUnfreeze = async (m: MemberRow) => {
    if (!m.membership) return;
    try {
      await unfreezeMembership(m.membership);
      showToast(`${m.fullName}'s membership resumed — frozen days added back`, 'success');
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not resume that membership', 'error');
    }
  };

  const handleCancel = async (detail: Omit<MembershipActionDetail, 'memberId'>) => {
    if (!toCancel?.membership) return;
    await cancelMembership(toCancel.membership.id, { ...detail, memberId: toCancel.id });
    showToast(`${toCancel.fullName}'s membership cancelled — access runs to expiry`, 'success');
    setToCancel(null);
    await load();
  };

  /**
   * Suspend / reactivate straight from the roster.
   *
   * This was reachable only through the Edit modal's Account Status dropdown,
   * which meant locking someone out was three clicks and a Save behind a form
   * full of unrelated fields.
   */
  const handleSuspendToggle = async (reason?: string) => {
    if (!toSuspend) return;
    const next: ProfileStatus = toSuspend.accountStatus === 'suspended' ? 'active' : 'suspended';
    try {
      // Through the RPC (0069), so the status and the reason land in one
      // transaction and cannot come apart. A bare update could not carry the
      // reason at all, and reported success when RLS declined it.
      await setAccountStatus(toSuspend.id, next, reason);
      showToast(
        next === 'suspended'
          ? `${toSuspend.fullName} suspended — they can no longer log in`
          : `${toSuspend.fullName} reactivated`,
        'success'
      );
      setToSuspend(null);
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not change that account', 'error');
    }
  };

  const handleArchive = async (reason?: string) => {
    if (!toArchive) return;
    try {
      await setAccountStatus(toArchive.id, showArchived ? 'active' : 'archived', reason);
      showToast(
        showArchived
          ? `${toArchive.fullName} restored to the active roster.`
          : `${toArchive.fullName} archived. Their payment and attendance history is kept.`,
        'success'
      );
      setToArchive(null);
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to update member', 'error');
    }
  };

  const statusTone = (s: MembershipStatus): Tone =>
    s === 'active' ? 'violet' : s === 'cancelled' ? 'gray' : 'amber';
  const activeCount = members.filter((m) => m.membershipStatus === 'active').length;
  const pendingPayment = members.filter((m) => m.membershipStatus === 'pending').length;
  const awaitingApproval = members.filter((m) => m.accountStatus === 'pending_approval').length;
  const share = members.length ? activeCount / members.length : null;
  const CHIPS: Chip<ChipKey>[] = [
    { key: 'all', label: 'All', count: members.length },
    { key: 'active', label: 'Active', count: activeCount, tone: 'green' },
    { key: 'expiring', label: 'Expiring soon', count: expiringSoon, tone: 'amber' },
    { key: 'pending', label: 'Payment due', count: pendingPayment, tone: 'red' },
    { key: 'approval', label: 'Awaiting approval', count: awaitingApproval, tone: 'blue' },
    { key: 'expired', label: 'Expired', count: members.filter((m) => m.membershipStatus === 'expired').length, tone: 'violet' },
    { key: 'suspended', label: 'Suspended', count: members.filter((m) => m.accountStatus === 'suspended').length, tone: 'gray' },
  ];
  const pickChip = (k: ChipKey) => { setChip(k); setCurrentPage(1); };
  const exportCsv = () => exportMembersToCSV(
    sorted.map((m) => ({
      fullName: m.fullName, email: m.email, phone: m.phone, address: m.address, dateOfBirth: m.dateOfBirth,
      gender: m.gender, experienceLevel: m.experienceLevel, accountStatus: m.accountStatus, planName: m.planName,
      membershipStatus: m.membershipStatus, expiryDate: m.expiryDate, neverExpires: m.membership?.never_expires ?? false,
      joinedOn: m.joinedOn, emergencyContactName: m.emergencyContactName, emergencyContactPhone: m.emergencyContactPhone,
      emergencyContactRelationship: m.emergencyContactRelationship, checkInCode: formatCheckInCode(m.id),
    })),
  );
  const sortHead = (label: string, key: SortKey) => ({
    label: (
      <button type="button" onClick={() => toggleSort(key)} className="inline-flex items-center gap-1 uppercase tracking-wider"
        style={{ color: sort.key === key ? '#C4B5FD' : 'inherit' }}>
        {label}{sort.key === key && (sort.dir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
      </button>
    ),
  });

  return (
    <div className="rd-fit" data-members>
      {showInvite && <InviteMembersPanel onClose={() => setShowInvite(false)} />}

      <RdHeader title={showArchived ? 'Archived members' : 'Members'}
        subtitle={showArchived ? 'Archived members — history retained. Restore anyone from the row menu.' : 'Manage and track gym members.'}
        actions={(
          <>
            <RdButton icon={Link2} onClick={() => setShowInvite(true)}>Invite link</RdButton>
            <RdButton variant="primary" icon={UserPlus} onClick={() => setIsAddOpen(true)}>Add Member</RdButton>
          </>
        )} />

      <FitBody rail={(
        <>
          <RailCard icon={Zap} title="Quick actions" sub="Common member management tools.">
            {/* Exports what is on screen — the filter and search are part of the question. */}
            <RailAction icon={Download} label="Export CSV" onClick={exportCsv} />
            <RailAction icon={showArchived ? Eye : Archive} label={showArchived ? 'Active roster' : 'Archived members'}
              onClick={() => { setShowArchived(!showArchived); setCurrentPage(1); setChip('all'); }} />
            <RailAction icon={Clock} label={`Pending sign-ups${pendingCount ? ` · ${pendingCount}` : ''}`} onClick={() => setShowPendingPanel(true)} />
          </RailCard>
          <RailCard icon={AlertTriangle} tone="amber" title="Needs attention" sub="Members that need your action.">
            <RailRow tone="amber" label="Expiring soon" count={expiringSoon} onClick={() => pickChip('expiring')} />
            <RailRow tone="red" label="Payment due" count={pendingPayment} onClick={() => pickChip('pending')} />
            {awaitingApproval > 0 && <RailRow tone="blue" label="Awaiting approval" count={awaitingApproval} onClick={() => pickChip('approval')} />}
            {pendingCount > 0 && <RailRow tone="blue" label="Sign-ups to review" count={pendingCount} onClick={() => setShowPendingPanel(true)} />}
            {msRequests && msRequests.length > 0 && <RailRow tone="amber" label="Asking to pause or stop" count={msRequests.length}
              onClick={() => document.getElementById('ms-requests')?.scrollIntoView({ behavior: 'smooth', block: 'center' })} />}
          </RailCard>
        {/* ── Members asking to pause or stop (0118) ──
            Granting is not a button: freezing or cancelling the member the way the desk
            always has is what closes the request (a trigger on membership_events). */}
        {msRequests && msRequests.length > 0 && (
          <RdCard className="p-4" id="ms-requests" style={{ borderColor: 'rgba(245,158,11,0.45)' }} data-ms-requests>
            <div className="flex items-center gap-3">
              <AlertTriangle size={22} style={{ color: '#FBBF24' }} />
              <h2 className="text-[18px] font-semibold text-white">
                {msRequests.length === 1 ? 'A member is asking to pause or stop' : `${msRequests.length} members are asking to pause or stop`}
              </h2>
            </div>
            <p className="text-[14px] mt-1" style={{ color: 'var(--color-text-secondary)' }}>
              Open the member and freeze or cancel them as usual — that closes the request by itself. Nothing has changed on their membership yet.
            </p>
            <div className="mt-3 flex flex-col gap-2.5">
              {msRequests.map((r) => (
                <div key={r.id} className="rounded-xl px-4 py-3" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-3 min-w-0">
                      <Initials name={r.memberName} size={38} />
                      <div className="min-w-0">
                        <p className="text-[14.5px] text-white"><strong>{r.memberName}</strong> — {r.kind === 'freeze' ? `pause for ${r.requestedDays} days` : 'cancel'}{r.planName ? ` (${r.planName})` : ''}</p>
                        <p className="text-[13px]" style={{ color: 'var(--color-text-secondary)' }}>&ldquo;{r.reason}&rdquo;{r.expiryDate ? ` — term ends ${r.expiryDate}` : ''}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <RdButton size="sm" variant="soft" onClick={() => setViewingId(r.memberId)}>Open</RdButton>
                      <RdButton size="sm" variant="ghost" onClick={() => { setDecliningId(r.id); setDeclineWhy(''); }}>Turn down</RdButton>
                    </div>
                  </div>
                  {decliningId === r.id && (
                    <form className="mt-3 flex items-center gap-2" onSubmit={(e) => {
                      e.preventDefault();
                      void (async () => {
                        try {
                          await declineMembershipRequest(r.id, declineWhy.trim());
                          setDecliningId(null);
                          await loadMsRequests();
                          showToast('The member has been told.', 'success');
                        } catch (err) {
                          showToast(err instanceof Error ? err.message : 'That did not work', 'error');
                        }
                      })();
                    }}>
                      <input className="flex-1 h-10 rounded-xl px-3 text-[14px] text-white outline-none"
                        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)' }}
                        value={declineWhy} autoFocus maxLength={280} placeholder="Why? The member reads this."
                        onChange={(e) => setDeclineWhy(e.target.value)} />
                      <RdButton size="sm" variant="primary" type="submit" disabled={declineWhy.trim().length === 0}>Send</RdButton>
                      <RdButton size="sm" variant="ghost" onClick={() => setDecliningId(null)}>Cancel</RdButton>
                    </form>
                  )}
                </div>
              ))}
            </div>
          </RdCard>
        )}
          <TipCard>Keep your members active by following up on expiring members and pending payments.</TipCard>
        </>
      )}>
        {/* ── The hero ── */}
        {!showArchived && (
          <RdCard glow className="px-6 py-4 rd-hero rd-hero-tight" data-members-hero>
            <div className="flex items-center gap-6 min-w-0">
              <IconTile icon={Users} size={64} />
              <div className="min-w-0 flex-1">
                <p className="text-[30px] leading-none font-bold text-white tabular-nums">{members.length} members</p>
                <p className="text-[15px] mt-2" style={{ color: 'var(--color-text-secondary)' }}>
                  {activeCount} active{share !== null ? ` • ${Math.round(share * 100)}% of total` : ''}
                </p>
                <div className="mt-3 max-w-md"><Bar value={share} /></div>
              </div>
            </div>
            <Ring value={share} label={`${share === null ? 0 : Math.round(share * 100)}%`} sub="Active" size={104} />
            <div className="min-w-0 rd-hero-side">
              <p className="text-[22px] font-bold text-white tabular-nums">{activeCount} active</p>
              <p className="text-[15.5px] mt-1" style={{ color: 'var(--color-text-secondary)' }}>
                {expiringSoon > 0 ? `${expiringSoon} expiring within ${EXPIRING_SOON_DAYS} days — follow up early.` : 'Keep the momentum going.'}
              </p>
            </div>
          </RdCard>
        )}

        <FilterChips items={CHIPS} value={chip} onChange={pickChip} compact />

        {/* ── Search and filters ── */}
        <div className="flex items-center gap-3 flex-wrap" data-members-toolbar>
          <SearchField value={searchTerm} onChange={(v) => { setSearchTerm(v); setCurrentPage(1); }}
            placeholder="Search members by name, email, phone or check-in code…" label="Search members" />
          <RdSelect value={planFilter} onChange={(v) => { setPlanFilter(v); setCurrentPage(1); }} label="Filter by plan" className="w-[210px]">
            <option value="all">All plans</option>
            {planNames.map((p) => <option key={p} value={p}>{p}</option>)}
          </RdSelect>
          <RdSelect value={filters.membershipStatus} onChange={(v) => { setFilters({ ...filters, membershipStatus: v as typeof filters.membershipStatus }); setCurrentPage(1); }}
            label="Filter by membership" className="w-[210px]">
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="pending">Awaiting payment</option>
            <option value="expired">Expired</option>
            <option value="frozen">Frozen</option>
            <option value="cancelled">Cancelled</option>
          </RdSelect>
          <RdButton icon={Filter} onClick={(e) => setFilterAnchor(filterAnchor ? null : e.currentTarget)} aria-expanded={!!filterAnchor}
            variant={filters.accountStatus !== 'all' ? 'soft' : 'secondary'}>Filter</RdButton>
          <Popover anchor={filterAnchor} open={!!filterAnchor} onClose={() => setFilterAnchor(null)} width={280}>
            <div className="p-4 flex flex-col gap-3">
              <label className="text-[13px]" style={{ color: 'var(--color-text-secondary)' }}>Account status
                <RdSelect value={filters.accountStatus} onChange={(v) => { setFilters({ ...filters, accountStatus: v as typeof filters.accountStatus }); setCurrentPage(1); }}
                  label="Account status" className="w-full mt-1">
                  <option value="all">All</option>
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                  <option value="pending_approval">Pending approval</option>
                </RdSelect>
              </label>
              <label className="text-[13px]" style={{ color: 'var(--color-text-secondary)' }}>Sort by
                <RdSelect value={`${sort.key}:${sort.dir}`} onChange={(v) => { const [key, dir] = v.split(':'); setSort({ key: key as SortKey, dir: dir as 'asc' | 'desc' }); setCurrentPage(1); }}
                  label="Sort by" className="w-full mt-1">
                  <option value="name:asc">Name, A–Z</option>
                  <option value="name:desc">Name, Z–A</option>
                  <option value="expiry:asc">Expiry, soonest first</option>
                  <option value="expiry:desc">Expiry, latest first</option>
                  <option value="joined:desc">Newest members</option>
                  <option value="joined:asc">Oldest members</option>
                  <option value="plan:asc">Plan</option>
                  <option value="membership:asc">Membership status</option>
                </RdSelect>
              </label>
              <div className="flex gap-2">
                <RdButton size="sm" variant="ghost" className="flex-1" onClick={() => {
                  setFilters({ accountStatus: 'all', membershipStatus: 'all' }); setPlanFilter('all'); setChip('all'); setSearchTerm(''); setFilterAnchor(null); setCurrentPage(1);
                }}>Clear all</RdButton>
                <RdButton size="sm" variant="primary" className="flex-1" onClick={() => setFilterAnchor(null)}>Done</RdButton>
              </div>
            </div>
          </Popover>
        </div>

        {/* ── The roster ── */}
        <RdCard className="overflow-hidden rd-fit-fill" data-members-table>
          <RdTable boxRef={fit.ref} head={[sortHead('Member', 'name'), 'Contact', sortHead('Plan', 'plan'), sortHead('Status', 'membership'), sortHead('Expiry', 'expiry'), { label: 'Actions', align: 'right' }]}
            empty={loading ? <p className="py-12 text-center text-[14.5px]" style={{ color: 'var(--color-text-muted)' }}>Loading members…</p>
              : filtered.length === 0 ? (
                <EmptyBlock icon={Users} title={members.length === 0 ? (showArchived ? 'No archived members' : 'No members yet') : 'No members match these filters'}
                  body={members.length === 0 ? (showArchived ? undefined : 'Approve a pending registration, or use Add Member for a walk-in.') : 'Clear a filter or the search to see everyone.'}
                  action={members.length > 0 ? <RdButton onClick={() => { setChip('all'); setPlanFilter('all'); setSearchTerm(''); setFilters({ accountStatus: 'all', membershipStatus: 'all' }); }}>Clear filters</RdButton> : undefined} />
              ) : undefined}>
            {!loading && paginated.map((m) => {
              const daysLeft = daysUntilExpiry(m);
              const lapsingSoon = m.membershipStatus === 'active' && daysLeft != null && daysLeft >= 0 && daysLeft <= EXPIRING_SOON_DAYS;
              const frozenOnce = (m.membership?.freeze_count ?? 0) >= 1;
              return (
                <Tr key={m.id} data-member-row onClick={() => setViewingId(m.id)} style={{ height: filtered.length > perPage ? fit.rowHeight : undefined }}>
                  <Td>
                    <div className="flex items-center gap-3.5 min-w-0">
                      <Initials name={m.fullName} photo={m.photoUrl} size={40} />
                      <div className="min-w-0">
                        <p className="text-[15.5px] text-white font-semibold truncate">{m.fullName}</p>
                        {/* Said in words, under the name: the one status that stops somebody opening the app. */}
                        {m.accountStatus === 'pending_approval' ? (
                          <span className="inline-flex items-center gap-1 text-[13px] font-medium" style={{ color: '#93C5FD' }}><Clock size={13} /> Awaiting approval</span>
                        ) : m.accountStatus === 'suspended' ? (
                          <span className="inline-flex items-center gap-1 text-[13px] font-medium" style={{ color: '#FBBF24' }}><Ban size={13} /> Suspended</span>
                        ) : (
                          <p className="text-[13px] truncate capitalize" style={{ color: 'var(--color-text-secondary)' }}>{m.experienceLevel || 'no level set'}</p>
                        )}
                      </div>
                    </div>
                  </Td>
                  <Td>
                    <p className="text-[14.5px] text-white truncate max-w-[260px]">{m.email}</p>
                    <p className="text-[13px]" style={{ color: 'var(--color-text-secondary)' }}>{m.phone ? formatPhoneNumber(m.phone) : '—'}</p>
                  </Td>
                  <Td>{m.planName}</Td>
                  <Td>{m.membershipStatus ? <Pill tone={statusTone(m.membershipStatus)}>{MEMBERSHIP_LABEL[m.membershipStatus]}</Pill>
                    : <span className="text-[13.5px]" style={{ color: 'var(--color-text-muted)' }}>none</span>}</Td>
                  <Td>
                    {/* No expiry has two meanings (0024): a lifetime plan, or one never activated. */}
                    <p className="text-[14.5px]">{m.expiryDate ? formatDate(m.expiryDate) : m.membership?.never_expires ? 'Never' : '—'}</p>
                    {lapsingSoon && (
                      <p className="text-[12.5px] flex items-center gap-1" style={{ color: '#FBBF24' }}>
                        <AlertTriangle size={12} /> {daysLeft === 0 ? 'expires today' : `${daysLeft}d left`}
                      </p>
                    )}
                  </Td>
                  <Td align="right" onClick={(e) => e.stopPropagation()}>
                    <div className="inline-flex items-center gap-2">
                      {/* Approve is not hidden in the menu: it is what blocks a real person from the app. */}
                      {!showArchived && m.accountStatus === 'pending_approval' && (
                        <RdButton size="sm" variant="amber" icon={UserCheck} onClick={() => void handleApprove(m)} data-tip={`Let ${m.firstName} sign in`}>Approve</RdButton>
                      )}
                      <DotMenu label={`Actions for ${m.fullName}`} items={[
                        { label: 'View details', icon: Eye, onClick: () => setViewingId(m.id) },
                        { label: 'Resume membership', icon: Play, onClick: () => void handleUnfreeze(m), hidden: showArchived || !m.membership || m.membershipStatus !== 'frozen' },
                        { label: frozenOnce ? 'Freeze (used this period)' : 'Freeze membership', icon: Pause, onClick: () => setToFreeze(m),
                          hidden: showArchived || !m.membership || m.membershipStatus !== 'active', disabled: frozenOnce },
                        { label: 'Cancel membership', icon: Ban, onClick: () => setToCancel(m), tone: 'warn', hidden: showArchived || !m.membership || m.membershipStatus !== 'active' },
                        { label: 'Edit member', icon: Edit2, onClick: () => setEditing(m), hidden: showArchived },
                        { label: m.accountStatus === 'suspended' ? 'Reactivate account' : 'Suspend account', icon: m.accountStatus === 'suspended' ? UserCheck : UserX,
                          onClick: () => setToSuspend(m), tone: m.accountStatus === 'suspended' ? undefined : 'warn', hidden: showArchived },
                        { label: showArchived ? 'Restore member' : 'Archive member', icon: Archive, onClick: () => setToArchive(m), tone: showArchived ? undefined : 'danger' },
                      ]} />
                    </div>
                  </Td>
                </Tr>
              );
            })}
          </RdTable>
          <TableFooter page={page} perPage={perPage} total={filtered.length} noun={showArchived ? 'archived members' : 'members'} onPage={setCurrentPage} />
        </RdCard>
      </FitBody>

      {/* The whole member record, opened by clicking a row. Reloads the roster
          behind it after any write, so a payment taken in the drawer moves the
          membership badge in the table without a manual refresh. */}
      <MemberDetailDrawer memberId={viewingId} onClose={closeDrawer} onChanged={load} />

      {isAddOpen && (
        <AddMemberWizard plans={plans} onClose={() => setIsAddOpen(false)} onCreated={load} />
      )}
      {editing && (
        <EditMemberForm member={editing} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await load(); }} />
      )}

      {/* Mounted only while open, with a key, so each decision starts from a
          blank form without a reset effect. */}
      {toFreeze && <MembershipActionDialog
        key={`freeze-${toFreeze.id}`}
        kind="freeze"
        memberName={toFreeze?.fullName ?? 'this member'}
        memberId={toFreeze?.id ?? ''}
        membershipId={toFreeze?.membership?.id ?? ''}
        neverExpires={toFreeze?.membership?.never_expires ?? false}
        expiryLabel={toFreeze?.expiryDate ? formatDate(toFreeze.expiryDate) : null}
        onClose={() => setToFreeze(null)}
        onConfirm={handleFreeze}
      />}

      {toCancel && <MembershipActionDialog
        key={`cancel-${toCancel.id}`}
        kind="cancel"
        memberName={toCancel?.fullName ?? 'this member'}
        memberId={toCancel?.id ?? ''}
        membershipId={toCancel?.membership?.id ?? ''}
        neverExpires={toCancel?.membership?.never_expires ?? false}
        expiryLabel={toCancel?.expiryDate ? formatDate(toCancel.expiryDate) : null}
        onClose={() => setToCancel(null)}
        onConfirm={handleCancel}
      />}

      <ConfirmDialog
        isOpen={!!toSuspend}
        onClose={() => setToSuspend(null)}
        onConfirm={handleSuspendToggle}
        title={toSuspend?.accountStatus === 'suspended' ? 'Reactivate Account' : 'Suspend Account'}
        message={
          toSuspend?.accountStatus === 'suspended'
            ? `Let ${toSuspend?.fullName ?? 'this member'} log in again? Their membership and history are untouched — this only restores access.`
            : `Suspend ${toSuspend?.fullName ?? 'this member'}? They will not be able to log in to the phone app. Their membership keeps running and nothing is deleted, so this is reversible at any time.`
        }
        confirmText={toSuspend?.accountStatus === 'suspended' ? 'Reactivate' : 'Suspend'}
        type={toSuspend?.accountStatus === 'suspended' ? 'info' : 'warning'}
        /* Required to suspend, optional to reinstate — nobody has ever needed to
           justify giving somebody their account back. The database enforces the
           same asymmetry (0069); this only means the admin finds out before the
           click rather than after it. */
        reason={
          toSuspend?.accountStatus === 'suspended'
            ? { label: 'Note (optional)', placeholder: 'Dues settled on 12 September.',
                hint: 'Kept on the account history.' }
            : { label: 'Reason for suspension', required: true,
                placeholder: 'Unpaid dues since August. Spoke to them on the 3rd.',
                hint: 'The member sees this when they try to sign in, and it stays on their account history.' }
        }
      />

      <ConfirmDialog
        isOpen={!!toArchive}
        onClose={() => setToArchive(null)}
        onConfirm={handleArchive}
        reason={
          showArchived
            ? { label: 'Note (optional)', placeholder: 'Rejoined on 1 October.' }
            : { label: 'Reason for archiving', required: true,
                placeholder: 'Moved away — asked to be taken off the roster.',
                hint: 'Kept with their payment and attendance history.' }
        }
        title={showArchived ? 'Restore Member' : 'Archive Member'}
        message={
          showArchived
            ? `Restore ${toArchive?.fullName} to the active roster? They will be able to log in again.`
            : `Archive ${toArchive?.fullName}? They'll be removed from the active roster and can no longer log in, but all payment and attendance history is kept. You can restore them later.`
        }
        confirmText={showArchived ? 'Restore' : 'Archive'}
        cancelText="Cancel"
        type={showArchived ? 'info' : 'danger'}
      />

      {/* Pending Registrations Panel */}
      <AnimatePresence>
        {showPendingPanel && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/70 z-50" onClick={closePendingPanel} />
            <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
                className="w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[86vh]" data-pending-dialog
                style={{ background: 'radial-gradient(120% 70% at 0% 0%, rgba(124,58,237,0.20), transparent 55%), var(--color-surface)', border: '1px solid rgba(139,92,246,0.3)' }}
                onClick={(e) => e.stopPropagation()}>
                <div className="px-6 pt-6 pb-4 flex items-start justify-between gap-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                  <div className="flex items-center gap-4">
                    <IconTile icon={Clock} size={52} />
                    <div>
                      <div className="flex items-center gap-2.5">
                        <h2 className="text-[22px] font-bold text-white">Pending registrations</h2>
                        {pendingCount > 0 && <Pill tone="violet">{pendingCount} waiting</Pill>}
                      </div>
                      <p className="text-[14px] mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>People who signed up in the app and are waiting for you. Approving lets them in on the free plan.</p>
                    </div>
                  </div>
                  <button aria-label="Close" onClick={closePendingPanel} className="w-10 h-10 grid place-items-center rounded-xl hover:bg-white/5 flex-none" style={{ color: 'var(--color-text-secondary)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <X size={18} />
                  </button>
                </div>

                <PendingRegistrationsList
                  onApprove={async (reg) => {
                    try {
                      await approveMemberRegistration(reg);
                      setPendingCount((c) => Math.max(0, c - 1));

                      // Until approval, a registered member can log in but the
                      // app unlocks nothing — so "you're in" is the single most
                      // useful message the gym ever sends them.
                      if (reg.auth_user_id) {
                        await notifyUser({
                          userId: reg.auth_user_id,
                          type: 'membership',
                          title: "You're in",
                          message: `Welcome to ${branding.name}, ${reg.first_name}. Your membership is active — you can book classes now.`,
                          actionUrl: '/member/home',
                        }).catch(() => {
                          showToast('Approved, but the member could not be notified', 'error');
                        });
                      }

                      showToast(`${reg.first_name} ${reg.last_name} approved and activated!`, 'success');
                      await load();
                    } catch (err) {
                      showToast(err instanceof Error ? err.message : 'Failed to approve registration', 'error');
                      throw err;
                    }
                  }}
                  onReject={async (reg) => {
                    try {
                      await rejectPendingRegistration(reg);
                      setPendingCount((c) => Math.max(0, c - 1));
                      showToast(`${reg.first_name} ${reg.last_name} registration rejected.`, 'success');
                    } catch (err) {
                      showToast(err instanceof Error ? err.message : 'Failed to reject registration', 'error');
                      throw err;
                    }
                  }}
                />
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── Edit Member ─── */
function EditMemberForm({
  member,
  onClose,
  onSaved,
}: {
  member: MemberRow;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [form, setForm] = useState({
    firstName: member.firstName, lastName: member.lastName, phone: member.phone,
    address: member.address, experienceLevel: member.experienceLevel,
    dateOfBirth: member.dateOfBirth, gender: member.gender,
    emergencyContactName: member.emergencyContactName,
    emergencyContactPhone: member.emergencyContactPhone,
    emergencyContactRelationship: member.emergencyContactRelationship,
  });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = async () => {
    const next: Record<string, string> = {};
    if (!form.firstName.trim()) next.firstName = 'Required.';
    if (!form.lastName.trim()) next.lastName = 'Required.';
    setErrors(next);
    if (Object.keys(next).length > 0) {
      showToast('First and last name are required', 'error');
      return;
    }

    setSaving(true);
    try {
      await updateProfile(member.id, {
        first_name: form.firstName.trim(),
        last_name: form.lastName.trim(),
        phone: form.phone || null,
      });
      await updateMemberProfile(member.id, {
        address: form.address || null,
        experience_level: form.experienceLevel || null,
        // '' would violate the date column; null is what "not on file" means.
        date_of_birth: form.dateOfBirth || null,
        gender: form.gender || null,
        emergency_contact_name: form.emergencyContactName || null,
        emergency_contact_phone: form.emergencyContactPhone || null,
        emergency_contact_relationship: form.emergencyContactRelationship || null,
      });
      showToast(`${form.firstName} ${form.lastName} updated.`, 'success');
      await onSaved();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to update member', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell title="Edit Member" subtitle={member.email} onClose={onClose}>
      <SectionLabel>Personal Information</SectionLabel>
      <div className="grid grid-cols-2 gap-3">
        <Field label="First name" required error={errors.firstName}
          value={form.firstName} onChange={(v) => setForm({ ...form, firstName: v })} />
        <Field label="Last name" required error={errors.lastName}
          value={form.lastName} onChange={(v) => setForm({ ...form, lastName: v })} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
        <SelectField label="Experience level" value={form.experienceLevel}
          onChange={(v) => setForm({ ...form, experienceLevel: v })}
          hint="What they say about themselves."
          options={[{ value: '', label: 'Not set' }, ...EXPERIENCE_LEVELS.map((l) => ({ value: l, label: l }))]} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <BirthField label="Date of birth" value={form.dateOfBirth}
          onChange={(v) => setForm({ ...form, dateOfBirth: v })} max={todayKey()} />
        <SelectField label="Gender" value={form.gender} onChange={(v) => setForm({ ...form, gender: v })} options={GENDERS} />
      </div>
      <Field label="Address" value={form.address} onChange={(v) => setForm({ ...form, address: v })} />

      {/* The Account Status dropdown that used to sit here is gone.
          Suspending now requires a written reason (0069) and this form has
          nowhere to type one — so the dropdown could only ever have produced
          'A reason is required', from a screen with no way to supply it.

          The roster's own Suspend action asks for the reason and is one click,
          which is what it was added for. Losing a duplicate route to the same
          action is not a loss. */}
      <FieldDivider />
      <SectionLabel>Emergency contact</SectionLabel>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Name" value={form.emergencyContactName} onChange={(v) => setForm({ ...form, emergencyContactName: v })} />
        <Field label="Phone" value={form.emergencyContactPhone} onChange={(v) => setForm({ ...form, emergencyContactPhone: v })} />
      </div>
      <Field label="Relationship" value={form.emergencyContactRelationship}
        onChange={(v) => setForm({ ...form, emergencyContactRelationship: v })} placeholder="e.g. Parent, Spouse" />

      <ModalFooter onClose={onClose} onSubmit={submit} saving={saving} submitLabel="Save Changes" />
    </ModalShell>
  );
}

/* ─── Shared modal pieces ─── */
function ModalShell({ title, subtitle, onClose, children }: { title: string; subtitle?: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <>
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50" onClick={onClose} />
      <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
        <motion.div initial={{ opacity: 0, scale: 0.95, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }}
          className="w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden"
          style={{ background: 'radial-gradient(120% 80% at 0% 0%, rgba(124,58,237,0.16), transparent 55%), var(--color-surface)', border: '1px solid rgba(139,92,246,0.25)' }}
          onClick={(e) => e.stopPropagation()}>
          <div className="p-5 flex items-center justify-between" style={{ borderBottom: '1px solid var(--color-border)' }}>
            <div>
              <h2 className="text-lg font-bold text-white">{title}</h2>
              {subtitle && <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{subtitle}</p>}
            </div>
            <button aria-label="Close" onClick={onClose} className="p-1.5 rounded-lg" style={{ color: 'var(--color-text-muted)' }}><X size={18} /></button>
          </div>
          <div className="p-5 space-y-3 max-h-[60vh] overflow-y-auto scrollbar-thin scrollbar-thumb-dark-border">{children}</div>
        </motion.div>
      </div>
    </>
  );
}

function ModalFooter({ onClose, onSubmit, saving, submitLabel }: { onClose: () => void; onSubmit: () => void; saving: boolean; submitLabel: string }) {
  return (
    <div className="flex items-center gap-3 pt-3" style={{ borderTop: '1px solid var(--color-border)' }}>
      <RdButton className="flex-1" onClick={onClose}>Cancel</RdButton>
      <RdButton className="flex-1" variant="primary" onClick={onSubmit} disabled={saving}>{saving ? 'Saving…' : submitLabel}</RdButton>
    </div>
  );
}

/* These three wrap the shared <FormField>, so a required marker, a hint and an
   inline error read identically here, on Trainers and on Events. The `*` used to
   be typed into the label string ("First Name *"), which meant it could be — and
   was — left off fields that were in fact required. */

const FIELD_CLASS = 'w-full px-3 py-2 rounded-xl text-white text-xs';
const FIELD_STYLE = { background: 'var(--color-bg)', border: '1px solid var(--color-border)' };

function Field({ label, value, onChange, placeholder, required, hint, error, type }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
  required?: boolean; hint?: string; error?: string; type?: string;
}) {
  return (
    <FormField label={label} required={required} hint={hint} error={error}>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className={FIELD_CLASS} style={FIELD_STYLE} />
    </FormField>
  );
}

/**
 * `max` defaults to today — the DB check constraint rejects a future birth date
 * anyway, and a picker that lets you choose one is a form that fails on submit.
 *
 * `startView="year"` because this is a birth date: paging back from this month
 * to 1998 is 300-odd clicks, so it opens on the year grid instead.
 */
function BirthField({ label, value, onChange, max, hint }: {
  label: string; value: string; onChange: (v: string) => void; max?: string; hint?: string;
}) {
  return (
    <FormField label={label} hint={hint}>
      <DatePicker mode="birth" value={value} max={max} onChange={onChange} startView="year"
        placeholder="Not on file" />
    </FormField>
  );
}

function SelectField({ label, value, onChange, options, hint }: {
  label: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[]; hint?: string;
}) {
  return (
    <FormField label={label} hint={hint}>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className={FIELD_CLASS} style={FIELD_STYLE}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </FormField>
  );
}

/* ─── Pending Registrations List ─── */
function PendingRegistrationsList({
  onApprove,
  onReject,
}: {
  onApprove: (reg: PendingRegistrationRow) => Promise<void>;
  onReject: (reg: PendingRegistrationRow) => Promise<void>;
}) {
  const [pendingList, setPendingList] = useState<PendingRegistrationRow[]>([]);
  /** id -> name, so the row can say which plan they asked about. */
  const [planNames, setPlanNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    Promise.all([listPendingRegistrations(), listPlans()])
      .then(([list, plans]) => {
        setPendingList(list);
        setPlanNames(Object.fromEntries(plans.map((p) => [p.id, p.name])));
      })
      .catch(() => showToast('Failed to load pending registrations', 'error'))
      .finally(() => setLoading(false));
  }, []);

  const handleApprove = async (reg: PendingRegistrationRow) => {
    try {
      await onApprove(reg);
      setPendingList((prev) => prev.filter((p) => p.id !== reg.id));
    } catch {
      // onApprove already surfaced the error toast
    }
  };

  const handleReject = async (reg: PendingRegistrationRow) => {
    try {
      await onReject(reg);
      setPendingList((prev) => prev.filter((p) => p.id !== reg.id));
    } catch {
      // onReject already surfaced the error toast
    }
  };

  const q = search.trim().toLowerCase();
  const shown = q ? pendingList.filter((r) => `${r.first_name} ${r.last_name} ${r.email}`.toLowerCase().includes(q)) : pendingList;

  if (loading) {
    return <div className="p-10 text-center text-[14.5px]" style={{ color: 'var(--color-text-muted)' }}>Loading…</div>;
  }

  if (pendingList.length === 0) {
    return <EmptyBlock icon={CheckCircle} title="All caught up!" body="No pending registrations to review." />;
  }

  return (
    <>
      {pendingList.length > 4 && (
        <div className="px-6 pt-4"><SearchField value={search} onChange={setSearch} placeholder="Find a sign-up by name or email…" label="Find a sign-up" /></div>
      )}
      <div className="px-6 py-4 overflow-y-auto flex-1 min-h-0 flex flex-col gap-3" data-pending-list>
        {shown.length === 0 && <p className="text-center py-6 text-[14px]" style={{ color: 'var(--color-text-muted)' }}>Nobody matches “{search}”.</p>}
        {shown.map((reg, i) => {
          const asked = reg.requested_plan_id ? planNames[reg.requested_plan_id] : null;
          const name = `${reg.first_name} ${reg.last_name}`;
          return (
            <motion.div key={reg.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 8) * 0.04 }}
              className="flex items-center gap-4 p-4 rounded-2xl" data-pending-row
              style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <Initials name={name} size={48} />
              <div className="flex-1 min-w-0">
                <p className="text-[16px] font-semibold text-white truncate">{name}</p>
                <p className="text-[13.5px] truncate" style={{ color: 'var(--color-text-secondary)' }}>{reg.email}</p>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <span className="text-[12.5px] inline-flex items-center gap-1" style={{ color: 'var(--color-text-muted)' }}>
                    <Clock size={13} /> Registered {new Date(reg.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                  {/* What approving grants, and what they came in wanting: approving never sells a paid plan. */}
                  <span className="text-[12px] px-2 py-0.5 rounded-md" style={{ background: 'rgba(124,58,237,0.14)', color: '#C4B5FD' }}>Starts on the free plan</span>
                  {asked && <span className="text-[12px] px-2 py-0.5 rounded-md" style={{ background: 'rgba(245,158,11,0.12)', color: '#FBBF24' }}>Asked about {asked}</span>}
                </div>
              </div>
              <div className="flex flex-col gap-2 flex-none">
                <RdButton size="sm" variant="primary" icon={CheckCircle} onClick={() => void handleApprove(reg)}>Approve</RdButton>
                <RdButton size="sm" variant="amber" icon={XCircle} onClick={() => void handleReject(reg)}>Reject</RdButton>
              </div>
            </motion.div>
          );
        })}
      </div>
    </>
  );
}
