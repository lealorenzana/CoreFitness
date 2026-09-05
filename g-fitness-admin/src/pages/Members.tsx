import Avatar from '../components/ui/Avatar';
import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect, useCallback } from 'react';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Pagination from '../components/ui/Pagination';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import MembershipActionDialog from '../components/ui/MembershipActionDialog';
import MemberDetailDrawer from '../components/ui/MemberDetailDrawer';
import FormField, { SectionLabel, FieldDivider } from '../components/ui/FormField';
import DatePicker from '../components/ui/DatePicker';
import { formatDate, formatPhoneNumber } from '../utils/formatters';
import { formatCheckInCode } from '../utils/checkInCode';
import { exportMembersToCSV } from '../utils/exportUtils';
import { Search, UserPlus, Edit2, Archive, Download, Users, Filter, X, CheckCircle, XCircle, Clock, Eye, EyeOff, Pause, Play, Ban, ArrowUp, ArrowDown, AlertTriangle, UserX, UserCheck } from 'lucide-react';
import { showToast } from '../utils/toast';
import {
  listMembers,
  listArchivedMembers,
  listPendingRegistrations,
  approveMemberRegistration,
  rejectPendingRegistration,
  createMember,
  updateMemberProfile,
  setMemberStatus,
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
const ITEMS_PER_PAGE = 10;

/**
 * All five membership statuses, mapped onto the design system's three tones.
 * Previously anything that wasn't `active` rendered as "Expired", so a frozen
 * membership and a cancelled one were indistinguishable from a lapsed one.
 */
const MEMBERSHIP_BADGE: Record<MembershipStatus, string> = {
  active: 'Active',
  pending: 'Pending',
  expired: 'Expired',
  frozen: 'Standard',
  cancelled: 'Cancelled',
};

/**
 * What the membership badge actually says.
 *
 * The cell used to render the raw enum, so this column showed a lowercase
 * **"pending"** — three characters from the word used by the "Pending" button
 * in the header, which opens something else entirely: the *registration* queue.
 * One means "this member has not paid yet", the other means "this person cannot
 * log in until you approve them", and the roster gave them the same word.
 *
 * `MEMBERSHIP_BADGE` above is the Badge *variant* (its colour). This is the
 * text, and it is deliberately not the enum.
 */
const MEMBERSHIP_LABEL: Record<MembershipStatus, string> = {
  active: 'Active',
  pending: 'Awaiting payment',
  expired: 'Expired',
  frozen: 'Frozen',
  cancelled: 'Cancelled',
};

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
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [plans, setPlans] = useState<MembershipPlanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
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
  const [showPendingPanel, setShowPendingPanel] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  /** The member whose full record is open in the drawer. */
  const [viewingId, setViewingId] = useState<string | null>(null);
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

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    listPendingRegistrations()
      .then((list) => setPendingCount(list.length))
      .catch(() => {});
  }, [showPendingPanel]);

  const filtered = members.filter((m) => {
    const q = searchTerm.trim().toLowerCase();
    // Phone and check-in code included: at a front desk the member is standing
    // there, and what they can give you is a number, not a spelling.
    const matchesSearch =
      !q ||
      m.fullName.toLowerCase().includes(q) ||
      m.email.toLowerCase().includes(q) ||
      m.phone.replace(/\D/g, '').includes(q.replace(/\D/g, '')) ||
      formatCheckInCode(m.id).toLowerCase().replace(/\s/g, '').includes(q.replace(/\s/g, ''));
    const matchesAccount =
      filters.accountStatus === 'all' || m.accountStatus === filters.accountStatus;
    const matchesMembership =
      filters.membershipStatus === 'all' || m.membershipStatus === filters.membershipStatus;
    return matchesSearch && matchesAccount && matchesMembership;
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

  const paginated = sorted.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const toggleSort = (key: SortKey) => {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
    setCurrentPage(1);
  };

  const expiringSoon = members.filter((m) => {
    const d = daysUntilExpiry(m);
    return m.membershipStatus === 'active' && d != null && d >= 0 && d <= EXPIRING_SOON_DAYS;
  }).length;

  const stats = [
    { label: 'Total', value: members.length },
    { label: 'Active', value: members.filter((m) => m.membershipStatus === 'active').length },
    { label: 'Expiring ≤7d', value: expiringSoon },
    { label: 'Pending Payment', value: members.filter((m) => m.membershipStatus === 'pending').length },
    // The one status that stops somebody using the app at all. It was loaded on
    // every row and shown nowhere, so an account waiting on approval was
    // indistinguishable from an active one at a glance.
    { label: 'Awaiting approval', value: members.filter((m) => m.accountStatus === 'pending_approval').length },
    { label: 'Expired', value: members.filter((m) => m.membershipStatus === 'expired').length },
    { label: 'Suspended', value: members.filter((m) => m.accountStatus === 'suspended').length },
  ];

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
      await setMemberStatus(m.id, 'active');
      showToast(`${m.fullName} can now sign in`, 'success');
      notifyUser({
        userId: m.id,
        type: 'membership',
        title: 'Your account is approved',
        message: 'You can sign in to the Core Fitness app now.',
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
  const handleSuspendToggle = async () => {
    if (!toSuspend) return;
    const next: ProfileStatus = toSuspend.accountStatus === 'suspended' ? 'active' : 'suspended';
    try {
      await setMemberStatus(toSuspend.id, next);
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

  const handleArchive = async () => {
    if (!toArchive) return;
    try {
      await setMemberStatus(toArchive.id, showArchived ? 'active' : 'archived');
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

  return (
    <div className="h-[calc(100vh-5rem)] flex flex-col gap-3 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-xl font-bold text-white">Members</h1>
          <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
            {showArchived ? 'Archived members — history retained' : 'Manage and track gym members'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => { setShowArchived(!showArchived); setCurrentPage(1); }}>
            {showArchived ? <><Eye size={14} /> Active Roster</> : <><EyeOff size={14} /> Archived</>}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowPendingPanel(true)}>
            <Clock size={14} /> Pending
            {pendingCount > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold" style={{ background: 'var(--color-secondary)', color: '#000' }}>
                {pendingCount}
              </span>
            )}
          </Button>
          {/* Exports what is on screen — the filter and search are part of the
              question being asked. No `as never[]` cast: the shape is checked. */}
          <Button variant="outline" size="sm" onClick={() =>
            exportMembersToCSV(
              sorted.map((m) => ({
                fullName: m.fullName,
                email: m.email,
                phone: m.phone,
                address: m.address,
                dateOfBirth: m.dateOfBirth,
                gender: m.gender,
                experienceLevel: m.experienceLevel,
                accountStatus: m.accountStatus,
                planName: m.planName,
                membershipStatus: m.membershipStatus,
                expiryDate: m.expiryDate,
                neverExpires: m.membership?.never_expires ?? false,
                joinedOn: m.joinedOn,
                emergencyContactName: m.emergencyContactName,
                emergencyContactPhone: m.emergencyContactPhone,
                emergencyContactRelationship: m.emergencyContactRelationship,
                checkInCode: formatCheckInCode(m.id),
              }))
            )
          }>
            <Download size={14} /> Export CSV
          </Button>
          <Button variant="primary" size="sm" onClick={() => setIsAddOpen(true)}>
            <UserPlus size={14} /> Add Member
          </Button>
        </div>
      </div>

      {/* Stats + Search */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          {stats.map((s) => (
            <div key={s.label} className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
              style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
              <Users size={12} style={{ color: 'var(--color-primary)' }} />
              <span className="text-[10px] uppercase" style={{ color: 'var(--color-text-muted)' }}>{s.label}</span>
              <span className="text-sm font-bold text-white">{s.value}</span>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-text-muted)' }} />
            <input type="text" placeholder="Search..." value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
              className="w-44 pl-9 pr-3 h-8 rounded-full text-xs text-white"
              style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }} />
          </div>
          <div className="relative">
            <Button variant="outline" size="sm" onClick={() => setShowFilterDropdown(!showFilterDropdown)}>
              <Filter size={12} /> Filter
            </Button>
            {showFilterDropdown && (
              <div className="absolute top-full right-0 mt-2 w-64 rounded-xl shadow-2xl z-20 p-3 space-y-3"
                style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
                <div>
                  <label className="text-[10px] block mb-1" style={{ color: 'var(--color-text-muted)' }}>Account status</label>
                  <select value={filters.accountStatus}
                    onChange={(e) => { setFilters({ ...filters, accountStatus: e.target.value as typeof filters.accountStatus }); setCurrentPage(1); }}
                    className="w-full px-2 py-1.5 rounded-lg text-white text-xs"
                    style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
                    <option value="all">All</option>
                    <option value="active">Active</option>
                    <option value="suspended">Suspended</option>
                    <option value="pending_approval">Pending approval</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] block mb-1" style={{ color: 'var(--color-text-muted)' }}>Membership</label>
                  <select value={filters.membershipStatus}
                    onChange={(e) => { setFilters({ ...filters, membershipStatus: e.target.value as typeof filters.membershipStatus }); setCurrentPage(1); }}
                    className="w-full px-2 py-1.5 rounded-lg text-white text-xs"
                    style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
                    <option value="all">All</option>
                    <option value="active">Active</option>
                    <option value="pending">Pending payment</option>
                    <option value="expired">Expired</option>
                    <option value="frozen">Frozen</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" className="flex-1"
                    onClick={() => { setFilters({ accountStatus: 'all', membershipStatus: 'all' }); setShowFilterDropdown(false); setCurrentPage(1); }}>
                    Clear
                  </Button>
                  <Button variant="primary" size="sm" className="flex-1" onClick={() => setShowFilterDropdown(false)}>Apply</Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 min-h-0 rounded-xl overflow-hidden flex flex-col"
        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
        <div className="overflow-y-auto scrollbar-thin scrollbar-thumb-dark-border">
          <table className="w-full table-fixed">
            <thead className="sticky top-0 z-10" style={{ background: 'var(--color-surface)' }}>
              <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                {([
                  { label: 'Member', key: 'name' as SortKey, w: 'w-[22%]' },
                  { label: 'Contact', key: null, w: 'w-[24%]' },
                  { label: 'Plan', key: 'plan' as SortKey, w: 'w-[13%]' },
                  { label: 'Membership', key: 'membership' as SortKey, w: 'w-[13%]' },
                  { label: 'Expiry', key: 'expiry' as SortKey, w: 'w-[14%]' },
                  { label: 'Actions', key: null, w: 'w-[14%]' },
                ]).map((h) => (
                  <th key={h.label} className={`text-left py-2 px-3 text-[10px] font-semibold uppercase tracking-wider ${h.w}`}
                    style={{ color: 'var(--color-text-muted)' }}>
                    {h.key ? (
                      <button onClick={() => toggleSort(h.key!)} className="inline-flex items-center gap-1 uppercase tracking-wider"
                        style={{ color: sort.key === h.key ? 'var(--color-secondary)' : 'inherit' }}>
                        {h.label}
                        {sort.key === h.key && (sort.dir === 'asc' ? <ArrowUp size={9} /> : <ArrowDown size={9} />)}
                      </button>
                    ) : h.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="py-10 text-center text-xs" style={{ color: 'var(--color-text-muted)' }}>Loading members…</td></tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center">
                    <Users size={20} style={{ color: 'var(--color-primary)' }} className="mx-auto mb-2" />
                    <p className="text-xs text-white font-semibold">
                      {showArchived ? 'No archived members' : 'No members yet'}
                    </p>
                    {!showArchived && (
                      <p className="text-[10px] mt-1" style={{ color: 'var(--color-text-muted)' }}>
                        Approve a pending registration, or use Add Member for a walk-in.
                      </p>
                    )}
                  </td>
                </tr>
              ) : paginated.map((m) => {
                const daysLeft = daysUntilExpiry(m);
                const lapsingSoon =
                  m.membershipStatus === 'active' && daysLeft != null && daysLeft >= 0 && daysLeft <= EXPIRING_SOON_DAYS;
                return (
                <tr key={m.id} className="transition-colors group cursor-pointer" style={{ borderBottom: '1px solid var(--color-border)' }}
                  onClick={() => setViewingId(m.id)}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-surface-raised)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                  <td className="py-2.5 px-3">
                    <div className="flex items-center gap-2">
                      <Avatar name={m.fullName} photoUrl={m.photoUrl} size={32} />
                      <div className="min-w-0">
                        <p className="text-sm text-white font-semibold leading-tight truncate">{m.fullName}</p>
                        {/* Under the name, not beside it: a badge on the same
                            line stole enough width to truncate "Conrad Connie"
                            to "Conrad…", and the name is the column.

                            Said in words either way. This used to render as a
                            lowercase enum appended to the experience level —
                            "beginner · pending_approval" — where the one status
                            that stops somebody opening the app read as a
                            footnote about their training. */}
                        {m.accountStatus === 'pending_approval' ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold"
                            style={{ color: 'var(--color-secondary)' }}>
                            <Clock size={9} /> Awaiting approval
                          </span>
                        ) : m.accountStatus === 'suspended' ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold"
                            style={{ color: 'var(--color-secondary)' }}>
                            <Ban size={9} /> Suspended
                          </span>
                        ) : (
                          <p className="text-[10px] truncate" style={{ color: 'var(--color-text-muted)' }}>
                            {m.experienceLevel || 'no level set'}
                          </p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="py-2.5 px-3">
                    <p className="text-xs text-white truncate">{m.email}</p>
                    <p className="text-[11px] truncate" style={{ color: 'var(--color-text-muted)' }}>
                      {m.phone ? formatPhoneNumber(m.phone) : '—'}
                    </p>
                  </td>
                  <td className="py-2.5 px-3"><p className="text-xs text-white truncate">{m.planName}</p></td>
                  <td className="py-2.5 px-3">
                    {m.membershipStatus ? (
                      <Badge variant={MEMBERSHIP_BADGE[m.membershipStatus]}>{MEMBERSHIP_LABEL[m.membershipStatus]}</Badge>
                    ) : (
                      <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>none</span>
                    )}
                  </td>
                  <td className="py-2.5 px-3">
                    {/* No expiry date has two meanings (0024): a lifetime plan,
                        or a membership that was never activated. The dash must
                        not stand for both. */}
                    <p className="text-xs text-white">
                      {m.expiryDate
                        ? formatDate(m.expiryDate)
                        : m.membership?.never_expires
                          ? 'Never'
                          : '—'}
                    </p>
                    {/* Renewal is the whole business. A date alone makes staff do
                        the arithmetic; this says how long is left. */}
                    {lapsingSoon && (
                      <p className="text-[10px] flex items-center gap-1" style={{ color: 'var(--color-secondary)' }}>
                        <AlertTriangle size={9} />
                        {daysLeft === 0 ? 'expires today' : `${daysLeft}d left`}
                      </p>
                    )}
                  </td>
                  <td className="py-2.5 px-3" onClick={(e) => e.stopPropagation()}>
                    {/*
                      Approve sits OUTSIDE the hover group on purpose.

                      Every other action here is a maintenance job you go looking
                      for, so revealing them on hover keeps the roster quiet.
                      Approval is the opposite: it is the one thing blocking a
                      real person from using the app they signed up for, and it
                      was reachable only through a modal that reads a *different*
                      table — so a member sitting in the roster at
                      `pending_approval` could not be approved from this screen
                      at all. It is now a labelled button on their row.
                    */}
                    {!showArchived && m.accountStatus === 'pending_approval' && (
                      <button
                        onClick={() => handleApprove(m)}
                        title={`Let ${m.firstName} sign in`}
                        className="mb-1 px-2.5 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 whitespace-nowrap"
                        style={{ background: 'var(--color-secondary)', color: '#000' }}
                      >
                        <UserCheck size={11} /> Approve
                      </button>
                    )}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {!showArchived && m.membership && (
                        m.membershipStatus === 'frozen' ? (
                          <button onClick={() => handleUnfreeze(m)} title="Resume membership — frozen days are added back to the expiry"
                            className="p-1.5 rounded-full" style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary)' }}>
                            <Play size={11} />
                          </button>
                        ) : m.membershipStatus === 'active' ? (
                          <>
                            {/* One freeze per period (0018). Showing it spent, rather
                                than hiding the button, explains why it's unavailable —
                                the database will refuse a second one anyway. */}
                            <button onClick={() => setToFreeze(m)}
                              disabled={(m.membership?.freeze_count ?? 0) >= 1}
                              title={(m.membership?.freeze_count ?? 0) >= 1
                                ? 'Already frozen once this period — resets on renewal'
                                : 'Freeze membership'}
                              className="p-1.5 rounded-full disabled:opacity-30 disabled:cursor-not-allowed"
                              style={{ background: 'rgba(56,189,248,0.15)', color: '#38bdf8' }}>
                              <Pause size={11} />
                            </button>
                            <button onClick={() => setToCancel(m)} title="Cancel membership"
                              className="p-1.5 rounded-full" style={{ background: 'var(--color-secondary-light)', color: 'var(--color-secondary)' }}>
                              <Ban size={11} />
                            </button>
                          </>
                        ) : null
                      )}
                      {!showArchived && (
                        <>
                          <button onClick={() => setEditing(m)} title="Edit member"
                            className="p-1.5 rounded-full" style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary)' }}>
                            <Edit2 size={11} />
                          </button>
                          <button onClick={() => setToSuspend(m)}
                            title={m.accountStatus === 'suspended' ? 'Reactivate account' : 'Suspend account'}
                            className="p-1.5 rounded-full"
                            style={{ background: 'var(--color-secondary-light)', color: 'var(--color-secondary)' }}>
                            {m.accountStatus === 'suspended' ? <UserCheck size={11} /> : <UserX size={11} />}
                          </button>
                        </>
                      )}
                      <button onClick={() => setToArchive(m)} title={showArchived ? 'Restore member' : 'Archive member'}
                        className="p-1.5 rounded-full" style={{ background: 'var(--color-secondary-light)', color: 'var(--color-secondary)' }}>
                        <Archive size={11} />
                      </button>
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex-shrink-0 px-3 py-1" style={{ borderTop: '1px solid var(--color-border)' }}>
          <Pagination currentPage={currentPage} totalItems={filtered.length} itemsPerPage={ITEMS_PER_PAGE} onPageChange={setCurrentPage} />
        </div>
      </div>

      {/* The whole member record, opened by clicking a row. Reloads the roster
          behind it after any write, so a payment taken in the drawer moves the
          membership badge in the table without a manual refresh. */}
      <MemberDetailDrawer memberId={viewingId} onClose={() => setViewingId(null)} onChanged={load} />

      {isAddOpen && (
        <AddMemberForm plans={plans} onClose={() => setIsAddOpen(false)} onCreated={async () => { setIsAddOpen(false); await load(); }} />
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
      />

      <ConfirmDialog
        isOpen={!!toArchive}
        onClose={() => setToArchive(null)}
        onConfirm={handleArchive}
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
              className="fixed inset-0 bg-black/70 z-50" onClick={() => setShowPendingPanel(false)} />
            <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
                className="w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden"
                style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
                onClick={(e) => e.stopPropagation()}>
                <div className="p-5 flex items-center justify-between" style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: 'var(--color-primary-light)' }}>
                      <Clock size={16} style={{ color: 'var(--color-primary)' }} />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-white">Pending Registrations</h2>
                      <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>Approve or reject member registrations</p>
                    </div>
                  </div>
                  <button onClick={() => setShowPendingPanel(false)} className="p-2 rounded-lg transition-colors" style={{ color: 'var(--color-text-muted)' }}>
                    <X size={18} />
                  </button>
                </div>

                <PendingRegistrationsList
                  onApprove={async (reg, planId) => {
                    try {
                      await approveMemberRegistration(reg, planId);
                      setPendingCount((c) => Math.max(0, c - 1));

                      // Until approval, a registered member can log in but the
                      // app unlocks nothing — so "you're in" is the single most
                      // useful message the gym ever sends them.
                      if (reg.auth_user_id) {
                        await notifyUser({
                          userId: reg.auth_user_id,
                          type: 'membership',
                          title: "You're in",
                          message: `Welcome to Core Fitness, ${reg.first_name}. Your membership is active — you can book classes now.`,
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

/* ─── Add Member (walk-in) ─── */
function AddMemberForm({
  plans,
  onClose,
  onCreated,
}: {
  plans: MembershipPlanRow[];
  onClose: () => void;
  onCreated: () => void | Promise<void>;
}) {
  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', password: '', phone: '', address: '',
    dateOfBirth: '', gender: '',
    emergencyContactName: '', emergencyContactPhone: '', emergencyContactRelationship: '',
    experienceLevel: '', planId: plans[0]?.id ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = async () => {
    // Marked against the field that's missing. A toast alone made staff hunt
    // through eleven inputs for the one they'd skipped.
    const next: Record<string, string> = {};
    if (!form.firstName.trim()) next.firstName = 'Required.';
    if (!form.lastName.trim()) next.lastName = 'Required.';
    if (!form.email.trim()) next.email = 'They sign in with this.';
    if (!form.password.trim()) next.password = 'Set a password for them.';
    else if (form.password.length < 6) next.password = 'Supabase needs at least 6 characters.';
    setErrors(next);
    if (Object.keys(next).length > 0) {
      showToast('Some required details are missing', 'error');
      return;
    }

    setSaving(true);
    try {
      const created = await createMember({
        email: form.email.trim(),
        password: form.password,
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        phone: form.phone || undefined,
        address: form.address || undefined,
        dateOfBirth: form.dateOfBirth || undefined,
        gender: form.gender || undefined,
        emergencyContactName: form.emergencyContactName || undefined,
        emergencyContactPhone: form.emergencyContactPhone || undefined,
        emergencyContactRelationship: form.emergencyContactRelationship || undefined,
        experienceLevel: form.experienceLevel || undefined,
        planId: form.planId || undefined,
      });

      // Written again from here, deliberately.
      //
      // The Edge Function learned about these two fields in the same change,
      // but it is deployed separately — against a copy that hasn't been
      // redeployed yet, it accepts the extra keys and silently ignores them,
      // which is precisely the shape of "a control that writes a flag nothing
      // reads". `updateMemberProfile` throws on a zero-row write, so this
      // either lands or says so. Once redeployed it rewrites identical values.
      if (form.dateOfBirth || form.gender) {
        try {
          await updateMemberProfile(created.id, {
            date_of_birth: form.dateOfBirth || null,
            gender: form.gender || null,
          });
        } catch {
          showToast(
            `${form.firstName} was added, but their birth date and gender could not be saved. Add them with Edit.`,
            'error'
          );
        }
      }

      showToast(`${form.firstName} ${form.lastName} added. Record their payment to activate the membership.`, 'success');
      await onCreated();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to add member', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell title="Add Member (Walk-in)" subtitle="Creates a real login the member can use on the phone app" onClose={onClose}>
      <SectionLabel>Who they are</SectionLabel>
      <div className="grid grid-cols-2 gap-3">
        <Field label="First name" required error={errors.firstName}
          value={form.firstName} onChange={(v) => setForm({ ...form, firstName: v })} />
        <Field label="Last name" required error={errors.lastName}
          value={form.lastName} onChange={(v) => setForm({ ...form, lastName: v })} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} placeholder="+63 917 000 0000" />
        <SelectField label="Experience level" value={form.experienceLevel}
          onChange={(v) => setForm({ ...form, experienceLevel: v })}
          hint="What they say about themselves."
          options={[{ value: '', label: 'Not set' }, ...EXPERIENCE_LEVELS.map((l) => ({ value: l, label: l }))]} />
      </div>
      {/* A birth date, not an age — an age column is right for a year and then
          lies. Self-registration has collected both since 0031; without these
          two fields a walk-in was left with NULLs nobody would ever fill in. */}
      <div className="grid grid-cols-2 gap-3">
        <DateField label="Date of birth" value={form.dateOfBirth}
          onChange={(v) => setForm({ ...form, dateOfBirth: v })} max={todayKey()} />
        <SelectField label="Gender" value={form.gender} onChange={(v) => setForm({ ...form, gender: v })} options={GENDERS} />
      </div>
      <Field label="Address" value={form.address} onChange={(v) => setForm({ ...form, address: v })} placeholder="Mamburao, Occidental Mindoro" />

      <FieldDivider />
      <SectionLabel>App login</SectionLabel>
      <p className="text-[10px] -mt-2" style={{ color: 'var(--color-text-muted)' }}>
        You are setting this password for them. Write it down before you save — it is not
        recoverable from this screen afterwards.
      </p>
      <Field label="Login email" required type="email" error={errors.email}
        value={form.email} onChange={(v) => setForm({ ...form, email: v })} placeholder="member@email.com" />
      <FormField label="Login password" required error={errors.password} hint="At least 6 characters.">
        <div className="relative">
          <input type={showPw ? 'text' : 'password'} value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Min. 6 characters"
            className={`${FIELD_CLASS} !pr-9`} style={FIELD_STYLE} />
          <button type="button" onClick={() => setShowPw(!showPw)}
            title={showPw ? 'Hide password' : 'Show password'}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1" style={{ color: 'var(--color-text-muted)' }}>
            {showPw ? <EyeOff size={12} /> : <Eye size={12} />}
          </button>
        </div>
      </FormField>

      <FieldDivider />
      <SectionLabel>Membership</SectionLabel>
      <SelectField label="Plan" value={form.planId} onChange={(v) => setForm({ ...form, planId: v })}
        hint="Starts as pending — recording their cash payment is what activates it."
        options={[{ value: '', label: 'No plan yet' }, ...plans.map((p) => ({ value: p.id, label: `${p.name} — ₱${p.price}` }))]} />

      <FieldDivider />
      <SectionLabel>Emergency contact</SectionLabel>
      <p className="text-[10px] -mt-2" style={{ color: 'var(--color-text-muted)' }}>
        Optional, but this is the one blank field that matters in a room full of heavy things.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Name" value={form.emergencyContactName} onChange={(v) => setForm({ ...form, emergencyContactName: v })} />
        <Field label="Phone" value={form.emergencyContactPhone} onChange={(v) => setForm({ ...form, emergencyContactPhone: v })} />
      </div>
      <Field label="Relationship" value={form.emergencyContactRelationship}
        onChange={(v) => setForm({ ...form, emergencyContactRelationship: v })} placeholder="e.g. Parent, Spouse" />

      <ModalFooter onClose={onClose} onSubmit={submit} saving={saving} submitLabel="Add Member" />
    </ModalShell>
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
    accountStatus: member.accountStatus,
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
      if (form.accountStatus !== member.accountStatus) {
        await setMemberStatus(member.id, form.accountStatus);
      }
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
      <SectionLabel>Who they are</SectionLabel>
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
        <DateField label="Date of birth" value={form.dateOfBirth}
          onChange={(v) => setForm({ ...form, dateOfBirth: v })} max={todayKey()} />
        <SelectField label="Gender" value={form.gender} onChange={(v) => setForm({ ...form, gender: v })} options={GENDERS} />
      </div>
      <Field label="Address" value={form.address} onChange={(v) => setForm({ ...form, address: v })} />

      <FieldDivider />
      <SectionLabel>Account</SectionLabel>
      <SelectField label="Account status" value={form.accountStatus}
        onChange={(v) => setForm({ ...form, accountStatus: v as ProfileStatus })}
        hint="Suspending blocks sign-in. The membership keeps running and nothing is deleted."
        options={[{ value: 'active', label: 'Active' }, { value: 'suspended', label: 'Suspended (cannot log in)' }]} />
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
          className="w-full max-w-md rounded-2xl shadow-2xl overflow-hidden"
          style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}
          onClick={(e) => e.stopPropagation()}>
          <div className="p-5 flex items-center justify-between" style={{ borderBottom: '1px solid var(--color-border)' }}>
            <div>
              <h2 className="text-lg font-bold text-white">{title}</h2>
              {subtitle && <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{subtitle}</p>}
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg" style={{ color: 'var(--color-text-muted)' }}><X size={18} /></button>
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
      <button onClick={onClose} className="flex-1 py-2.5 rounded-full font-semibold text-sm"
        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
        Cancel
      </button>
      <button onClick={onSubmit} disabled={saving}
        className="flex-1 py-2.5 rounded-full font-semibold text-sm text-black disabled:opacity-60"
        style={{ background: 'var(--color-secondary)' }}>
        {saving ? 'Saving…' : submitLabel}
      </button>
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
function DateField({ label, value, onChange, max, hint }: {
  label: string; value: string; onChange: (v: string) => void; max?: string; hint?: string;
}) {
  return (
    <FormField label={label} hint={hint}>
      <DatePicker value={value} max={max} onChange={onChange} startView="year"
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
  onApprove: (reg: PendingRegistrationRow, planId: string) => Promise<void>;
  onReject: (reg: PendingRegistrationRow) => Promise<void>;
}) {
  const [pendingList, setPendingList] = useState<PendingRegistrationRow[]>([]);
  const [planIds, setPlanIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([listPendingRegistrations(), listPlans()])
      .then(([list, plans]) => {
        setPendingList(list);
        setPlanIds(plans.map((p) => p.id));
      })
      .catch(() => showToast('Failed to load pending registrations', 'error'))
      .finally(() => setLoading(false));
  }, []);

  const handleApprove = async (reg: PendingRegistrationRow) => {
    const planId = reg.requested_plan_id ?? planIds[0];
    if (!planId) {
      showToast('No membership plans exist yet — create one in Membership Plans first', 'error');
      return;
    }
    try {
      await onApprove(reg, planId);
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

  if (loading) {
    return <div className="p-8 text-center text-xs" style={{ color: 'var(--color-text-muted)' }}>Loading…</div>;
  }

  if (pendingList.length === 0) {
    return (
      <div className="p-8 text-center">
        <CheckCircle size={32} className="mx-auto mb-3" style={{ color: 'var(--color-primary)' }} />
        <p className="text-sm font-semibold text-white">All caught up!</p>
        <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>No pending registrations to review.</p>
      </div>
    );
  }

  return (
    <div className="p-4 max-h-[400px] overflow-y-auto scrollbar-thin scrollbar-thumb-dark-border space-y-2.5">
      {pendingList.map((reg, i) => (
        <motion.div key={reg.id}
          initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
          className="flex items-center gap-3 p-3 rounded-xl"
          style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
          <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-xs flex-shrink-0"
            style={{ background: 'var(--color-primary)' }}>
            {reg.first_name[0]}{reg.last_name[0]}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-white font-semibold truncate">{reg.first_name} {reg.last_name}</p>
            <p className="text-[10px] truncate" style={{ color: 'var(--color-text-muted)' }}>{reg.email}</p>
            <span className="text-[9px]" style={{ color: 'var(--color-text-muted)' }}>
              Registered {new Date(reg.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button onClick={() => handleApprove(reg)} className="p-2 rounded-full" style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary)' }} title="Approve">
              <CheckCircle size={16} />
            </button>
            <button onClick={() => handleReject(reg)} className="p-2 rounded-full" style={{ background: 'var(--color-secondary-light)', color: 'var(--color-secondary)' }} title="Reject">
              <XCircle size={16} />
            </button>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
