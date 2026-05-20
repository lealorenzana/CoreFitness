import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import AddMemberModal from '../components/ui/AddMemberModal';
import EditMemberModal from '../components/ui/EditMemberModal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { useGymContext } from '../hooks/useGymContext';
import { MEMBERS } from '../data/members';
import { formatDate, formatPhoneNumber } from '../utils/formatters';
import { exportMembersToCSV } from '../utils/exportUtils';
import { Search, UserPlus, Edit2, Trash2, Download } from 'lucide-react';
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
}

interface NewMemberData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  membershipType: 'Basic' | 'Standard' | 'Premium';
  startDate: string;
}

interface EditMemberData {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  membershipType: 'Basic' | 'Standard' | 'Premium';
  membershipStatus: 'Active' | 'Expired' | 'Expiring' | 'Suspended';
}

export default function Members() {
  const navigate = useNavigate();
  const { selectedGym } = useGymContext();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<any>(null);
  const [memberToDelete, setMemberToDelete] = useState<any>(null);
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [filters, setFilters] = useState({
    membershipType: 'all' as 'all' | 'Basic' | 'Standard' | 'Premium',
    membershipStatus: 'all' as 'all' | 'Active' | 'Expired' | 'Expiring' | 'Suspended',
  });
  
  // Convert MEMBERS data to simple format
  const getGymMembers = () => {
    return MEMBERS.filter(m => m.gymId === selectedGym.id).map(m => ({
      id: m.id,
      gymId: m.gymId,
      qrCode: m.qrCode,
      firstName: m.firstName,
      lastName: m.lastName,
      fullName: m.fullName,
      email: m.email,
      phone: m.phone,
      address: m.address,
      membershipType: m.membershipType,
      membershipStatus: m.membershipStatus,
      joinDate: m.startDate instanceof Date ? m.startDate.toISOString().split('T')[0] : String(m.startDate),
      expiryDate: m.expiryDate instanceof Date ? m.expiryDate.toISOString().split('T')[0] : String(m.expiryDate),
    }));
  };
  
  // Load members from localStorage or use default
  const [members, setMembers] = useState<SimpleMember[]>(() => {
    try {
      const saved = localStorage.getItem(`members_${selectedGym.id}`);
      if (saved) {
        const localMembers = JSON.parse(saved);
        // Also sync to SharedStorage for member app access
        SharedStorage.setMembers(localMembers);
        return localMembers;
      }
    } catch (error) {
      console.error('Error loading members from localStorage:', error);
    }
    const gymMembers = getGymMembers();
    // Initialize SharedStorage with gym members
    SharedStorage.setMembers(gymMembers);
    return gymMembers;
  });

  // Save to localStorage whenever members change
  useEffect(() => {
    try {
      localStorage.setItem(`members_${selectedGym.id}`, JSON.stringify(members));
      // Also update SharedStorage
      SharedStorage.setMembers(members);
    } catch (error) {
      console.error('Error saving members to localStorage:', error);
    }
  }, [members, selectedGym.id]);

  const filteredMembers = members.filter(m => {
    // Search filter
    const matchesSearch = m.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.email.toLowerCase().includes(searchTerm.toLowerCase());
    
    // Membership type filter
    const matchesType = filters.membershipType === 'all' || m.membershipType === filters.membershipType;
    
    // Membership status filter
    const matchesStatus = filters.membershipStatus === 'all' || m.membershipStatus === filters.membershipStatus;
    
    return matchesSearch && matchesType && matchesStatus;
  });

  const stats = [
    { label: 'Total Members', value: members.length, color: 'from-blue-500 to-cyan-500' },
    { label: 'Active', value: members.filter(m => m.membershipStatus === 'Active').length, color: 'from-green-500 to-emerald-500' },
    { label: 'Expiring Soon', value: members.filter(m => m.membershipStatus === 'Expiring').length, color: 'from-yellow-500 to-orange-500' },
    { label: 'Expired', value: members.filter(m => m.membershipStatus === 'Expired').length, color: 'from-red-500 to-pink-500' },
  ];

  const handleAddMember = (newMemberData: NewMemberData) => {
    const newMember: SimpleMember = {
      id: `${selectedGym.id}-${Date.now()}`,
      gymId: selectedGym.id,
      qrCode: `${selectedGym.id.toUpperCase()}-2024-${String(members.length + 1).padStart(3, '0')}`,
      firstName: newMemberData.firstName,
      lastName: newMemberData.lastName,
      fullName: `${newMemberData.firstName} ${newMemberData.lastName}`,
      email: newMemberData.email,
      phone: newMemberData.phone,
      address: newMemberData.address,
      membershipType: newMemberData.membershipType,
      membershipStatus: 'Active',
      joinDate: newMemberData.startDate,
      expiryDate: new Date(new Date(newMemberData.startDate).setMonth(new Date(newMemberData.startDate).getMonth() + 1)).toISOString().split('T')[0],
    };

    setMembers([newMember, ...members]);
    setIsAddModalOpen(false);
    showToast('Member added successfully!', 'success');
  };

  const handleEditMember = (editedMemberData: EditMemberData) => {
    const updatedMembers = members.map((m: SimpleMember) => 
      m.id === editedMemberData.id 
        ? {
            ...m,
            firstName: editedMemberData.firstName,
            lastName: editedMemberData.lastName,
            fullName: `${editedMemberData.firstName} ${editedMemberData.lastName}`,
            email: editedMemberData.email,
            phone: editedMemberData.phone,
            address: editedMemberData.address,
            membershipType: editedMemberData.membershipType,
            membershipStatus: editedMemberData.membershipStatus,
          }
        : m
    );
    
    setMembers(updatedMembers);
    
    // Save to SharedStorage so member app can see the changes
    const updatedMember = updatedMembers.find(m => m.id === editedMemberData.id);
    if (updatedMember) {
      SharedStorage.updateMember(updatedMember.id, {
        firstName: updatedMember.firstName,
        lastName: updatedMember.lastName,
        fullName: updatedMember.fullName,
        email: updatedMember.email,
        phone: updatedMember.phone,
        address: updatedMember.address,
        membershipType: updatedMember.membershipType,
        membershipStatus: updatedMember.membershipStatus,
      });
    }
    
    setIsEditModalOpen(false);
    showToast('Member updated successfully!', 'success');
  };

  const handleEditClick = (e: React.MouseEvent, member: any) => {
    e.stopPropagation();
    setSelectedMember(member);
    setIsEditModalOpen(true);
  };

  const handleDeleteClick = (e: React.MouseEvent, member: any) => {
    e.stopPropagation();
    setMemberToDelete(member);
    setIsDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = () => {
    if (memberToDelete) {
      setMembers(members.filter((m: SimpleMember) => m.id !== memberToDelete.id));
      setMemberToDelete(null);
      setIsDeleteDialogOpen(false);
      showToast('Member deleted successfully!', 'success');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-3xl font-orbitron font-bold text-gradient">Members</h1>
          <p className="text-gray-400 mt-1">Manage and track gym members</p>
        </div>
        <div className="flex items-center gap-3">
          <Button 
            variant="ghost" 
            className="flex items-center gap-2"
            onClick={() => exportMembersToCSV(filteredMembers)}
          >
            <Download size={18} />
            Export CSV
          </Button>
          <Button variant="primary" className="shadow-lg shadow-primary-start/30 flex items-center gap-2" onClick={() => setIsAddModalOpen(true)}>
            <UserPlus size={18} />
            Add Member
          </Button>
        </div>
      </motion.div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {stats.map((stat, index) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: index * 0.1 }}
          >
            <div className={`relative overflow-hidden rounded-xl bg-gradient-to-br ${stat.color} p-6 shadow-lg`}>
              <div className="relative z-10">
                <p className="text-white/80 text-sm font-medium">{stat.label}</p>
                <p className="text-4xl font-bold text-white mt-2 font-orbitron">{stat.value}</p>
              </div>
              <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full blur-2xl"></div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Search and Filter */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
      >
        <Card>
          <div className="flex items-center gap-4">
            <div className="flex-1 relative">
              <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
              <Input
                type="text"
                placeholder="Search members by name or email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-12"
              />
            </div>
            <div className="relative">
              <Button 
                variant="ghost" 
                onClick={() => setShowFilterDropdown(!showFilterDropdown)}
                className="flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                </svg>
                Filter
                {(filters.membershipType !== 'all' || filters.membershipStatus !== 'all') && (
                  <span className="w-2 h-2 bg-primary-start rounded-full"></span>
                )}
              </Button>

              {/* Filter Dropdown */}
              {showFilterDropdown && (
                <div className="absolute top-full right-0 mt-2 w-72 bg-dark border border-dark-border rounded-xl shadow-2xl z-20 p-4 space-y-4">
                  <div>
                    <label className="text-gray-400 text-sm block mb-2">Membership Type</label>
                    <select
                      value={filters.membershipType}
                      onChange={(e) => setFilters({ ...filters, membershipType: e.target.value as any })}
                      className="w-full bg-dark-lighter border border-dark-border rounded-lg px-3 py-2 text-white focus:outline-none focus:border-primary-start"
                    >
                      <option value="all">All Types</option>
                      <option value="Basic">Basic</option>
                      <option value="Standard">Standard</option>
                      <option value="Premium">Premium</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-gray-400 text-sm block mb-2">Membership Status</label>
                    <select
                      value={filters.membershipStatus}
                      onChange={(e) => setFilters({ ...filters, membershipStatus: e.target.value as any })}
                      className="w-full bg-dark-lighter border border-dark-border rounded-lg px-3 py-2 text-white focus:outline-none focus:border-primary-start"
                    >
                      <option value="all">All Statuses</option>
                      <option value="Active">Active</option>
                      <option value="Expiring">Expiring Soon</option>
                      <option value="Expired">Expired</option>
                      <option value="Suspended">Suspended</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-2 pt-2 border-t border-dark-border">
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setFilters({ membershipType: 'all', membershipStatus: 'all' });
                        setShowFilterDropdown(false);
                      }}
                      className="flex-1 text-xs"
                    >
                      Clear
                    </Button>
                    <Button
                      variant="primary"
                      onClick={() => setShowFilterDropdown(false)}
                      className="flex-1 text-xs"
                    >
                      Apply
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </Card>
      </motion.div>

      {/* Members Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
      >
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b-2 border-dark-border">
                  <th className="text-left py-4 px-4 text-gray-400 font-semibold uppercase text-xs tracking-wider">Member</th>
                  <th className="text-left py-4 px-4 text-gray-400 font-semibold uppercase text-xs tracking-wider">Contact</th>
                  <th className="text-left py-4 px-4 text-gray-400 font-semibold uppercase text-xs tracking-wider">Membership</th>
                  <th className="text-left py-4 px-4 text-gray-400 font-semibold uppercase text-xs tracking-wider">Status</th>
                  <th className="text-left py-4 px-4 text-gray-400 font-semibold uppercase text-xs tracking-wider">Expiry</th>
                  <th className="text-left py-4 px-4 text-gray-400 font-semibold uppercase text-xs tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredMembers.map((member, index) => (
                  <motion.tr 
                    key={member.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.6 + index * 0.05 }}
                    onClick={() => navigate(`/members/${member.id}`)}
                    className="border-b border-dark-border hover:bg-dark-border/50 transition-all duration-200 group cursor-pointer"
                  >
                    <td className="py-5 px-4">
                      <div className="flex items-center gap-4">
                        <div className="relative">
                          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary-start to-primary-end flex items-center justify-center text-white font-bold text-lg shadow-lg">
                            {member.firstName[0]}{member.lastName[0]}
                          </div>
                          {member.membershipStatus === 'Active' && (
                            <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-dark-lighter"></div>
                          )}
                        </div>
                        <div>
                          <p className="text-white font-semibold group-hover:text-primary-start transition-colors">{member.fullName}</p>
                          <p className="text-gray-400 text-sm font-mono">{member.qrCode}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-5 px-4">
                      <p className="text-white text-sm">{member.email}</p>
                      <p className="text-gray-400 text-sm">{formatPhoneNumber(member.phone)}</p>
                    </td>
                    <td className="py-5 px-4">
                      <Badge variant={member.membershipType}>{member.membershipType}</Badge>
                    </td>
                    <td className="py-5 px-4">
                      <div className="flex items-center gap-2">
                        <Badge variant={member.membershipStatus}>{member.membershipStatus}</Badge>
                        {/* Suspend/Activate Toggle */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const newStatus = member.membershipStatus === 'Suspended' ? 'Active' : 'Suspended';
                            const updatedMembers = members.map((m: SimpleMember) => 
                              m.id === member.id ? { ...m, membershipStatus: newStatus as any } : m
                            );
                            setMembers(updatedMembers);
                            
                            // Update SharedStorage
                            SharedStorage.updateMember(member.id, { membershipStatus: newStatus });
                            
                            showToast(
                              `${member.fullName} ${newStatus === 'Suspended' ? 'suspended' : 'activated'}!`, 
                              newStatus === 'Suspended' ? 'error' : 'success'
                            );
                          }}
                          className={`px-2 py-1 rounded-lg text-xs font-semibold transition-all ${
                            member.membershipStatus === 'Suspended'
                              ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                              : 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                          }`}
                          title={member.membershipStatus === 'Suspended' ? 'Activate' : 'Suspend'}
                        >
                          {member.membershipStatus === 'Suspended' ? '✓ Activate' : '✕ Suspend'}
                        </button>
                      </div>
                    </td>
                    <td className="py-5 px-4">
                      <p className="text-white font-medium">{formatDate(member.expiryDate)}</p>
                    </td>
                    <td className="py-5 px-4">
                      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={(e) => handleEditClick(e, member)}
                          className="text-gray-400 hover:text-primary-start transition-colors p-2 hover:bg-dark rounded-lg"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button 
                          onClick={(e) => handleDeleteClick(e, member)}
                          className="text-gray-400 hover:text-red-400 transition-colors p-2 hover:bg-dark rounded-lg"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </motion.div>

      {/* Add Member Modal */}
      <AddMemberModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSubmit={handleAddMember}
      />

      {/* Edit Member Modal */}
      <EditMemberModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        onSubmit={handleEditMember}
        member={selectedMember}
      />

      {/* Delete Confirmation Dialog */}
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
    </div>
  );
}
