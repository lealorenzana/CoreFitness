import { motion } from 'framer-motion';
import { useState } from 'react';
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
import type { NewMemberData, EditMemberData } from '../types/member';

export default function Members() {
  const navigate = useNavigate();
  const { selectedGym } = useGymContext();
  const gymMembers = MEMBERS.filter(m => m.gymId === selectedGym.id);
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<any>(null);
  const [memberToDelete, setMemberToDelete] = useState<any>(null);
  const [members, setMembers] = useState(gymMembers);

  const filteredMembers = members.filter(m => 
    m.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    m.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const stats = [
    { label: 'Total Members', value: members.length, color: 'from-blue-500 to-cyan-500' },
    { label: 'Active', value: members.filter(m => m.membershipStatus === 'Active').length, color: 'from-green-500 to-emerald-500' },
    { label: 'Expiring Soon', value: members.filter(m => m.membershipStatus === 'Expiring').length, color: 'from-yellow-500 to-orange-500' },
    { label: 'Expired', value: members.filter(m => m.membershipStatus === 'Expired').length, color: 'from-red-500 to-pink-500' },
  ];

  const handleAddMember = (newMemberData: any) => {
    const newMember = {
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
      membershipStatus: 'Active' as const,
      joinDate: newMemberData.startDate,
      expiryDate: new Date(new Date(newMemberData.startDate).setMonth(new Date(newMemberData.startDate).getMonth() + 1)).toISOString().split('T')[0],
    };

    setMembers([newMember, ...members]);
  };

  const handleEditMember = (editedMemberData: any) => {
    setMembers(members.map(m => 
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
    ));
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
      // In production, this would be a soft delete (mark as inactive)
      setMembers(members.filter(m => m.id !== memberToDelete.id));
      setMemberToDelete(null);
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
            <Button variant="ghost">Filter</Button>
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
                      <Badge variant={member.membershipStatus}>{member.membershipStatus}</Badge>
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
