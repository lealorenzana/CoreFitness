import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect } from 'react';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Pagination from '../components/ui/Pagination';
import AddMemberModal from '../components/ui/AddMemberModal';
import EditMemberModal from '../components/ui/EditMemberModal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import MemberDetailModal from '../components/ui/MemberDetailModal';
import { useGymContext } from '../hooks/useGymContext';
import { MEMBERS } from '../data/members';
import { formatDate, formatPhoneNumber } from '../utils/formatters';
import { exportMembersToCSV } from '../utils/exportUtils';
import { Search, UserPlus, Edit2, Trash2, Download, Users, Filter, X, CheckCircle, XCircle, Clock } from 'lucide-react';
import { showToast } from '../utils/toast';
import { SharedStorage } from '../utils/sharedStorage';

interface SimpleMember {
  id: string;
  gymId: string;
  qrCode: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  phone: string;
  address: string;
  membershipType: 'Basic' | 'Standard' | 'Premium';
  membershipStatus: 'Active' | 'Expired' | 'Expiring' | 'Suspended';
  joinDate: string;
  expiryDate: string;
  photoUrl?: string;
}

interface NewMemberData {
  firstName: string; lastName: string; email: string; phone: string; address: string;
  membershipType: 'Basic' | 'Standard' | 'Premium';
  startDate: string;
}

interface EditMemberData {
  id: string; firstName: string; lastName: string; email: string; phone: string; address: string;
  membershipType: 'Basic' | 'Standard' | 'Premium';
  membershipStatus: 'Active' | 'Expired' | 'Expiring' | 'Suspended';
}

export default function Members() {
  const { selectedGym } = useGymContext();

  const [searchTerm, setSearchTerm] = useState('');
  const [isAddModalOpen, setIsAddModalOpen]   = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<SimpleMember | null>(null);
  const [memberToDelete, setMemberToDelete] = useState<SimpleMember | null>(null);
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [showPendingPanel, setShowPendingPanel] = useState(false);
  const ITEMS_PER_PAGE = 10;
  const [filters, setFilters] = useState({
    membershipType:   'all' as 'all' | 'Basic' | 'Standard' | 'Premium',
    membershipStatus: 'all' as 'all' | 'Active' | 'Expired' | 'Expiring' | 'Suspended',
  });

  const getGymMembers = (): SimpleMember[] => MEMBERS.filter(m => m.gymId === selectedGym.id).map(m => ({
    id: m.id, gymId: m.gymId, qrCode: m.qrCode,
    firstName: m.firstName, lastName: m.lastName, fullName: m.fullName,
    email: m.email, phone: m.phone, address: m.address,
    membershipType: m.membershipType, membershipStatus: m.membershipStatus,
    joinDate:   m.startDate  instanceof Date ? m.startDate.toISOString().split('T')[0]  : String(m.startDate),
    expiryDate: m.expiryDate instanceof Date ? m.expiryDate.toISOString().split('T')[0] : String(m.expiryDate),
  }));

  const [members, setMembers] = useState<SimpleMember[]>(() => {
    // Always start from source data to pick up new mock members
    const gymMembers = getGymMembers();
    try {
      const saved = localStorage.getItem(`members_${selectedGym.id}`);
      if (saved) {
        const localMembers: SimpleMember[] = JSON.parse(saved);
        // Merge: keep any locally-added members (IDs not in source) on top of source data
        const sourceIds = new Set(gymMembers.map(m => m.id));
        const localOnly = localMembers.filter(m => !sourceIds.has(m.id));
        const merged = [...localOnly, ...gymMembers];
        SharedStorage.setMembers(merged);
        return merged;
      }
    } catch (err) { console.error(err); }
    SharedStorage.setMembers(gymMembers);
    return gymMembers;
  });

  useEffect(() => {
    try {
      localStorage.setItem(`members_${selectedGym.id}`, JSON.stringify(members));
      SharedStorage.setMembers(members);
    } catch (err) { console.error(err); }
  }, [members, selectedGym.id]);

  const filteredMembers = members.filter(m => {
    const matchesSearch = m.fullName.toLowerCase().includes(searchTerm.toLowerCase())
                       || m.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType   = filters.membershipType   === 'all' || m.membershipType   === filters.membershipType;
    const matchesStatus = filters.membershipStatus === 'all' || m.membershipStatus === filters.membershipStatus;
    return matchesSearch && matchesType && matchesStatus;
  });

  // Reset to page 1 when filters change
  const totalPages = Math.ceil(filteredMembers.length / ITEMS_PER_PAGE);
  const paginatedMembers = filteredMembers.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE,
  );

  const stats = [
    { label: 'Total Members', value: members.length },
    { label: 'Active',        value: members.filter(m => m.membershipStatus === 'Active').length },
    { label: 'Expiring Soon', value: members.filter(m => m.membershipStatus === 'Expiring').length },
    { label: 'Expired',       value: members.filter(m => m.membershipStatus === 'Expired').length },
  ];

  const handleAddMember = (data: NewMemberData) => {
    const start = new Date(data.startDate);
    const expiry = new Date(start);
    expiry.setMonth(expiry.getMonth() + 1);
    const newMember: SimpleMember = {
      id: `${selectedGym.id}-${Date.now()}`,
      gymId: selectedGym.id,
      qrCode: `${selectedGym.id.toUpperCase()}-2024-${String(members.length + 1).padStart(3, '0')}`,
      firstName: data.firstName, lastName: data.lastName,
      fullName: `${data.firstName} ${data.lastName}`,
      email: data.email, phone: data.phone, address: data.address,
      membershipType: data.membershipType, membershipStatus: 'Active',
      joinDate: data.startDate,
      expiryDate: expiry.toISOString().split('T')[0],
    };
    setMembers([newMember, ...members]);
    setIsAddModalOpen(false);
    showToast('Member added successfully!', 'success');
  };

  const handleEditMember = (data: EditMemberData) => {
    const updated = members.map(m =>
      m.id === data.id
        ? { ...m,
            firstName: data.firstName, lastName: data.lastName,
            fullName: `${data.firstName} ${data.lastName}`,
            email: data.email, phone: data.phone, address: data.address,
            membershipType: data.membershipType, membershipStatus: data.membershipStatus,
          }
        : m,
    );
    setMembers(updated);
    const u = updated.find(m => m.id === data.id);
    if (u) {
      SharedStorage.updateMember(u.id, {
        firstName: u.firstName, lastName: u.lastName, fullName: u.fullName,
        email: u.email, phone: u.phone, address: u.address,
        membershipType: u.membershipType, membershipStatus: u.membershipStatus,
      });
    }
    setIsEditModalOpen(false);
    showToast('Member updated successfully!', 'success');
  };

  const handleRowClick = (member: SimpleMember) => {
    setSelectedMember(member);
    setIsDetailModalOpen(true);
  };

  const handleEditClick = (e: React.MouseEvent, m: SimpleMember) => {
    e.stopPropagation();
    setSelectedMember(m);
    setIsEditModalOpen(true);
  };
  const handleDeleteClick = (e: React.MouseEvent, m: SimpleMember) => {
    e.stopPropagation();
    setMemberToDelete(m);
    setIsDeleteDialogOpen(true);
  };
  const handleDeleteConfirm = () => {
    if (!memberToDelete) return;
    setMembers(members.filter(m => m.id !== memberToDelete.id));
    setMemberToDelete(null);
    setIsDeleteDialogOpen(false);
    showToast('Member deleted successfully!', 'success');
  };

  return (
    <div className="h-[calc(100vh-5rem)] flex flex-col gap-3 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-xl font-bold text-white">Members</h1>
          <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>Manage and track gym members</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowPendingPanel(true)}>
            <Clock size={14} /> Pending
            {(() => {
              const pendingCount = SharedStorage.getPendingRegistrations ? SharedStorage.getPendingRegistrations().length : 0;
              return pendingCount > 0 ? (
                <span className="ml-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold" style={{ background: 'var(--color-secondary)', color: '#000' }}>{pendingCount}</span>
              ) : null;
            })()}
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportMembersToCSV(filteredMembers)}>
            <Download size={14} /> Export CSV
          </Button>
          <Button variant="primary" size="sm" onClick={() => setIsAddModalOpen(true)}>
            <UserPlus size={14} /> Add Member
          </Button>
        </div>
      </div>

      {/* Stats + Search row */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          {stats.map(stat => (
            <div key={stat.label} className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
              style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
              <Users size={12} style={{ color: 'var(--color-primary)' }} />
              <span className="text-[10px] uppercase" style={{ color: 'var(--color-text-muted)' }}>{stat.label}</span>
              <span className="text-sm font-bold text-white">{stat.value}</span>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-text-muted)' }} />
            <input type="text" placeholder="Search..."
              value={searchTerm} onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
              className="w-44 pl-9 pr-3 h-8 rounded-full text-xs text-white focus:outline-none"
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
                  <label className="text-[10px] block mb-1" style={{ color: 'var(--color-text-muted)' }}>Type</label>
                  <select value={filters.membershipType}
                    onChange={e => { setFilters({ ...filters, membershipType: e.target.value as any }); setCurrentPage(1); }}
                    className="w-full px-2 py-1.5 rounded-lg text-white text-xs focus:outline-none"
                    style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
                    <option value="all">All</option>
                    <option value="Basic">Basic</option>
                    <option value="Standard">Standard</option>
                    <option value="Premium">Premium</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] block mb-1" style={{ color: 'var(--color-text-muted)' }}>Status</label>
                  <select value={filters.membershipStatus}
                    onChange={e => { setFilters({ ...filters, membershipStatus: e.target.value as any }); setCurrentPage(1); }}
                    className="w-full px-2 py-1.5 rounded-lg text-white text-xs focus:outline-none"
                    style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
                    <option value="all">All</option>
                    <option value="Active">Active</option>
                    <option value="Expiring">Expiring</option>
                    <option value="Expired">Expired</option>
                    <option value="Suspended">Suspended</option>
                  </select>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" className="flex-1"
                    onClick={() => { setFilters({ membershipType: 'all', membershipStatus: 'all' }); setShowFilterDropdown(false); setCurrentPage(1); }}>Clear</Button>
                  <Button variant="primary" size="sm" className="flex-1"
                    onClick={() => setShowFilterDropdown(false)}>Apply</Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Table — fills remaining height */}
      <div className="flex-1 min-h-0 rounded-xl overflow-hidden flex flex-col"
        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
        <div className="overflow-y-auto scrollbar-thin scrollbar-thumb-dark-border">
          <table className="w-full table-fixed">
            <thead className="sticky top-0 z-10" style={{ background: 'var(--color-surface)' }}>
              <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                <th className="text-left py-2 px-3 text-[10px] font-semibold uppercase tracking-wider w-[22%]" style={{ color: 'var(--color-text-muted)' }}>Member</th>
                <th className="text-left py-2 px-3 text-[10px] font-semibold uppercase tracking-wider w-[24%]" style={{ color: 'var(--color-text-muted)' }}>Contact</th>
                <th className="text-left py-2 px-3 text-[10px] font-semibold uppercase tracking-wider w-[13%]" style={{ color: 'var(--color-text-muted)' }}>Membership</th>
                <th className="text-left py-2 px-3 text-[10px] font-semibold uppercase tracking-wider w-[11%]" style={{ color: 'var(--color-text-muted)' }}>Status</th>
                <th className="text-left py-2 px-3 text-[10px] font-semibold uppercase tracking-wider w-[14%]" style={{ color: 'var(--color-text-muted)' }}>Expiry</th>
                <th className="text-left py-2 px-3 text-[10px] font-semibold uppercase tracking-wider w-[10%]" style={{ color: 'var(--color-text-muted)' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredMembers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center">
                    <Users size={20} style={{ color: 'var(--color-primary)' }} className="mx-auto mb-2" />
                    <p className="text-xs text-white font-semibold">No members found</p>
                  </td>
                </tr>
              ) : paginatedMembers.map(member => (
                <tr key={member.id}
                  onClick={() => handleRowClick(member)}
                  className="cursor-pointer transition-colors group"
                  style={{ borderBottom: '1px solid var(--color-border)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-surface-raised)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <td className="py-2.5 px-3">
                    <div className="flex items-center gap-2">
                      {member.photoUrl ? (
                        <img src={member.photoUrl} alt={member.firstName}
                          className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-[11px] flex-shrink-0"
                          style={{ background: 'var(--color-primary)' }}>
                          {member.firstName[0]}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-sm text-white font-semibold leading-tight truncate">{member.fullName}</p>
                        <p className="text-[10px] font-mono truncate" style={{ color: 'var(--color-text-muted)' }}>{member.qrCode}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-2.5 px-3">
                    <p className="text-xs text-white truncate">{member.email}</p>
                    <p className="text-[11px] truncate" style={{ color: 'var(--color-text-muted)' }}>{formatPhoneNumber(member.phone)}</p>
                  </td>
                  <td className="py-2.5 px-3">
                    <Badge variant={member.membershipType}>{member.membershipType}</Badge>
                  </td>
                  <td className="py-2.5 px-3">
                    <Badge variant={member.membershipStatus}>
                      {member.membershipStatus === 'Active' ? 'Active' : 'Inactive'}
                    </Badge>
                  </td>
                  <td className="py-2.5 px-3">
                    <p className="text-xs text-white">{formatDate(member.expiryDate)}</p>
                  </td>
                  <td className="py-2.5 px-3">
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={e => handleEditClick(e, member)}
                        className="p-1.5 rounded-full" style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary)' }}>
                        <Edit2 size={11} />
                      </button>
                      <button onClick={e => handleDeleteClick(e, member)}
                        className="p-1.5 rounded-full" style={{ background: 'var(--color-secondary-light)', color: 'var(--color-secondary)' }}>
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex-shrink-0 px-3 py-1" style={{ borderTop: '1px solid var(--color-border)' }}>
          <Pagination currentPage={currentPage} totalItems={filteredMembers.length} itemsPerPage={ITEMS_PER_PAGE} onPageChange={setCurrentPage} />
        </div>
      </div>

      {/* Modals */}
      <AddMemberModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSubmit={handleAddMember}
      />
      <EditMemberModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        onSubmit={handleEditMember}
        member={selectedMember}
      />
      <MemberDetailModal
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        member={selectedMember}
      />
      <ConfirmDialog
        isOpen={isDeleteDialogOpen}
        onClose={() => setIsDeleteDialogOpen(false)}
        onConfirm={handleDeleteConfirm}
        title="Delete Member"
        message={`Are you sure you want to delete ${memberToDelete?.fullName}? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        type="danger"
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
                onClick={e => e.stopPropagation()}>
                {/* Header */}
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
                  <button onClick={() => setShowPendingPanel(false)} className="p-2 rounded-lg transition-colors"
                    style={{ color: 'var(--color-text-muted)' }}>
                    <X size={18} />
                  </button>
                </div>

                {/* Pending List */}
                <PendingRegistrationsList
                  onApprove={(reg) => {
                    // Create active member from registration
                    const start = new Date();
                    const expiry = new Date(start);
                    expiry.setMonth(expiry.getMonth() + 1);
                    const newMember: SimpleMember = {
                      id: `${selectedGym.id}-${Date.now()}`,
                      gymId: selectedGym.id,
                      qrCode: `${selectedGym.id.toUpperCase()}-2024-${String(members.length + 1).padStart(3, '0')}`,
                      firstName: reg.firstName,
                      lastName: reg.lastName,
                      fullName: `${reg.firstName} ${reg.lastName}`,
                      email: reg.email,
                      phone: reg.phone || '',
                      address: reg.address || '',
                      membershipType: reg.membershipType || 'Basic',
                      membershipStatus: 'Active',
                      joinDate: start.toISOString().split('T')[0],
                      expiryDate: expiry.toISOString().split('T')[0],
                    };
                    setMembers([newMember, ...members]);
                    SharedStorage.removePendingRegistration(reg.id);
                    showToast(`${reg.firstName} ${reg.lastName} approved and added as Active member!`, 'success');
                  }}
                  onReject={(reg) => {
                    SharedStorage.removePendingRegistration(reg.id);
                    showToast(`${reg.firstName} ${reg.lastName} registration rejected.`, 'success');
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

/* ─── Pending Registrations List Sub-component ─── */
interface PendingReg {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  address?: string;
  membershipType?: 'Basic' | 'Standard' | 'Premium';
  registeredAt?: string;
}

const MOCK_PENDING: PendingReg[] = [
  { id: 'pend-001', firstName: 'Mark', lastName: 'Villanueva', email: 'mark.v@email.com', phone: '09171234567', membershipType: 'Standard', registeredAt: '2026-05-20' },
  { id: 'pend-002', firstName: 'Jasmine', lastName: 'Cruz', email: 'jasmine.cruz@email.com', phone: '09181234567', membershipType: 'Premium', registeredAt: '2026-05-21' },
  { id: 'pend-003', firstName: 'Rafael', lastName: 'Santos', email: 'rafael.s@email.com', phone: '09191234567', membershipType: 'Basic', registeredAt: '2026-05-22' },
];

function PendingRegistrationsList({ onApprove, onReject }: { onApprove: (reg: PendingReg) => void; onReject: (reg: PendingReg) => void }) {
  const [pendingList, setPendingList] = useState<PendingReg[]>([]);

  useEffect(() => {
    let list = SharedStorage.getPendingRegistrations();
    // Seed mock data if empty
    if (list.length === 0) {
      MOCK_PENDING.forEach(p => SharedStorage.addPendingRegistration(p));
      list = SharedStorage.getPendingRegistrations();
    }
    setPendingList(list);
  }, []);

  const handleApprove = (reg: PendingReg) => {
    onApprove(reg);
    setPendingList(prev => prev.filter(p => p.id !== reg.id));
  };

  const handleReject = (reg: PendingReg) => {
    onReject(reg);
    setPendingList(prev => prev.filter(p => p.id !== reg.id));
  };

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
          {/* Avatar */}
          <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-xs flex-shrink-0"
            style={{ background: 'var(--color-primary)' }}>
            {reg.firstName[0]}{reg.lastName[0]}
          </div>
          {/* Info */}
          <div className="flex-1 min-w-0">
            <p className="text-sm text-white font-semibold truncate">{reg.firstName} {reg.lastName}</p>
            <p className="text-[10px] truncate" style={{ color: 'var(--color-text-muted)' }}>{reg.email}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[9px] px-2 py-0.5 rounded-full font-medium"
                style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary)' }}>
                {reg.membershipType || 'Basic'}
              </span>
              {reg.registeredAt && (
                <span className="text-[9px]" style={{ color: 'var(--color-text-muted)' }}>
                  Registered {new Date(reg.registeredAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              )}
            </div>
          </div>
          {/* Actions */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button onClick={() => handleApprove(reg)}
              className="p-2 rounded-full transition-colors"
              style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e' }}
              title="Approve">
              <CheckCircle size={16} />
            </button>
            <button onClick={() => handleReject(reg)}
              className="p-2 rounded-full transition-colors"
              style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}
              title="Reject">
              <XCircle size={16} />
            </button>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
