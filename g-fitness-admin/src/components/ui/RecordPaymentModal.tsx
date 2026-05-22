import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import { X, CreditCard, User, Calendar, DollarSign, Search } from 'lucide-react';
import Button from './Button';
import Input from './Input';
import { MEMBERS } from '../../data/members';
import { useGymContext } from '../../hooks/useGymContext';
import type { PaymentData } from '../../types/member';

export type { PaymentData };

interface RecordPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (payment: PaymentData) => void;
}

export default function RecordPaymentModal({ isOpen, onClose, onSubmit }: RecordPaymentModalProps) {
  const { selectedGym } = useGymContext();
  const gymMembers = MEMBERS.filter(m => m.gymId === selectedGym.id);

  const [formData, setFormData] = useState({
    memberId: '',
    amount: '',
    method: 'Cash',
    date: new Date().toISOString().split('T')[0],
    notes: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const [showMemberDropdown, setShowMemberDropdown] = useState(false);

  const paymentMethods = ['Cash', 'GCash', 'Bank Transfer', 'Credit Card', 'Debit Card'];

  // Filter members based on search
  const filteredMembers = gymMembers.filter(m =>
    m.fullName.toLowerCase().includes(memberSearch.toLowerCase()) ||
    m.qrCode.toLowerCase().includes(memberSearch.toLowerCase()) ||
    m.email.toLowerCase().includes(memberSearch.toLowerCase())
  );

  const selectedMember = gymMembers.find(m => m.id === formData.memberId);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.memberId) {
      newErrors.memberId = 'Please select a member';
    }
    if (!formData.amount || parseFloat(formData.amount) <= 0) {
      newErrors.amount = 'Please enter a valid amount';
    }
    if (!formData.date) {
      newErrors.date = 'Please select a date';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsLoading(true);

    // Simulate API call
    setTimeout(() => {
      onSubmit({
        memberId: formData.memberId,
        memberName: selectedMember?.fullName || '',
        amount: parseFloat(formData.amount),
        method: formData.method,
        date: formData.date,
        notes: formData.notes,
      });

      // Reset form
      setFormData({
        memberId: '',
        amount: '',
        method: 'Cash',
        date: new Date().toISOString().split('T')[0],
        notes: '',
      });
      setMemberSearch('');
      setErrors({});
      setIsLoading(false);
      onClose();
    }, 1000);
  };

  const handleClose = () => {
    if (!isLoading) {
      setFormData({
        memberId: '',
        amount: '',
        method: 'Cash',
        date: new Date().toISOString().split('T')[0],
        notes: '',
      });
      setMemberSearch('');
      setShowMemberDropdown(false);
      setErrors({});
      onClose();
    }
  };

  const handleSelectMember = (member: typeof gymMembers[0]) => {
    setFormData({ ...formData, memberId: member.id });
    setMemberSearch(member.fullName);
    setShowMemberDropdown(false);
    if (errors.memberId) setErrors({ ...errors, memberId: '' });
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50"
          />

          {/* Modal */}
          <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="bg-dark-lighter border border-dark-border rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="p-6 border-b border-dark-border flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: 'var(--color-primary)' }}>
                    <CreditCard size={24} className="text-white" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-white">Record Payment</h2>
                    <p className="text-gray-400 text-sm">Add a new payment record</p>
                  </div>
                </div>
                <button
                  onClick={handleClose}
                  disabled={isLoading}
                  className="text-gray-400 hover:text-white transition-colors disabled:opacity-50"
                >
                  <X size={24} />
                </button>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                {/* Member Selection with Search */}
                <div>
                  <label className="text-gray-400 text-sm block mb-2 flex items-center gap-2">
                    <User size={16} />
                    Select Member
                  </label>
                  <div className="relative">
                    <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 z-10" />
                    <Input
                      type="text"
                      value={memberSearch}
                      onChange={(e) => {
                        setMemberSearch(e.target.value);
                        setShowMemberDropdown(true);
                        if (!e.target.value) {
                          setFormData({ ...formData, memberId: '' });
                        }
                      }}
                      onFocus={() => setShowMemberDropdown(true)}
                      placeholder="Search by name, email, or ID..."
                      className={`pl-12 ${errors.memberId ? 'border-red-500' : ''}`}
                    />
                    
                    {/* Dropdown List */}
                    {showMemberDropdown && (
                      <div className="absolute top-full left-0 right-0 mt-2 bg-dark border border-dark-border rounded-xl shadow-2xl max-h-60 overflow-y-auto z-20">
                        {filteredMembers.length > 0 ? (
                          filteredMembers.map((member) => (
                            <button
                              key={member.id}
                              type="button"
                              onClick={() => handleSelectMember(member)}
                              className="w-full text-left px-4 py-3 hover:bg-dark-border transition-colors flex items-center gap-3 border-b border-dark-border last:border-b-0"
                            >
                              <div className="w-10 h-10 rounded-full flex items-center justify-center text-black font-bold flex-shrink-0"
                                style={{ background: 'var(--color-secondary)' }}>
                                {member.firstName[0]}{member.lastName[0]}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-white font-semibold truncate">{member.fullName}</p>
                                <p className="text-gray-400 text-xs truncate">{member.email}</p>
                                <p className="text-gray-500 text-xs font-mono">{member.qrCode}</p>
                              </div>
                              <div className="flex-shrink-0">
                                <span className={`text-xs px-2 py-1 rounded-full ${
                                  member.membershipType === 'Premium' ? 'bg-purple-500/20 text-violet' :
                                  member.membershipType === 'Standard' ? 'bg-blue-500/20 text-violet' :
                                  'bg-gray-500/20 text-gray-400'
                                }`}>
                                  {member.membershipType}
                                </span>
                              </div>
                            </button>
                          ))
                        ) : (
                          <div className="px-4 py-8 text-center text-gray-400">
                            <User size={32} className="mx-auto mb-2 opacity-50" />
                            <p className="text-sm">No members found</p>
                            <p className="text-xs mt-1">Try a different search term</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  {errors.memberId && (
                    <p className="text-yellow text-xs mt-1">{errors.memberId}</p>
                  )}
                  
                  {/* Selected Member Display */}
                  {selectedMember && (
                    <div className="mt-3 p-3 bg-dark rounded-xl border border-primary-start/30">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full flex items-center justify-center text-black font-bold"
                          style={{ background: 'var(--color-secondary)' }}>
                          {selectedMember.firstName[0]}{selectedMember.lastName[0]}
                        </div>
                        <div className="flex-1">
                          <p className="text-white font-semibold text-sm">{selectedMember.fullName}</p>
                          <p className="text-gray-400 text-xs">{selectedMember.membershipType} Member</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setFormData({ ...formData, memberId: '' });
                            setMemberSearch('');
                          }}
                          className="text-gray-400 hover:text-yellow transition-colors"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Amount */}
                <div>
                  <label className="text-gray-400 text-sm block mb-2 flex items-center gap-2">
                    <DollarSign size={16} />
                    Amount (₱)
                  </label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.amount}
                    onChange={(e) => {
                      setFormData({ ...formData, amount: e.target.value });
                      if (errors.amount) setErrors({ ...errors, amount: '' });
                    }}
                    placeholder="0.00"
                    className={errors.amount ? 'border-red-500' : ''}
                  />
                  {errors.amount && (
                    <p className="text-yellow text-xs mt-1">{errors.amount}</p>
                  )}
                </div>

                {/* Payment Method */}
                <div>
                  <label className="text-gray-400 text-sm block mb-2 flex items-center gap-2">
                    <CreditCard size={16} />
                    Payment Method
                  </label>
                  <select
                    value={formData.method}
                    onChange={(e) => setFormData({ ...formData, method: e.target.value })}
                    className="w-full bg-dark border border-dark-border rounded-xl px-4 py-3 text-white focus:outline-none focus:border-primary-start transition-colors"
                  >
                    {paymentMethods.map((method) => (
                      <option key={method} value={method}>
                        {method}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Date */}
                <div>
                  <label className="text-gray-400 text-sm block mb-2 flex items-center gap-2">
                    <Calendar size={16} />
                    Payment Date
                  </label>
                  <Input
                    type="date"
                    value={formData.date}
                    onChange={(e) => {
                      setFormData({ ...formData, date: e.target.value });
                      if (errors.date) setErrors({ ...errors, date: '' });
                    }}
                    className={errors.date ? 'border-red-500' : ''}
                  />
                  {errors.date && (
                    <p className="text-yellow text-xs mt-1">{errors.date}</p>
                  )}
                </div>

                {/* Notes */}
                <div>
                  <label className="text-gray-400 text-sm block mb-2">
                    Notes (Optional)
                  </label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Add any additional notes..."
                    rows={3}
                    className="w-full bg-dark border border-dark-border rounded-xl px-4 py-3 text-white focus:outline-none focus:border-primary-start transition-colors resize-none"
                  />
                </div>

                {/* Actions */}
                <div className="flex items-center gap-3 pt-4">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={handleClose}
                    disabled={isLoading}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={isLoading}
                    className="flex-1"
                  >
                    {isLoading ? (
                      <div className="flex items-center justify-center gap-2">
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                        Recording...
                      </div>
                    ) : (
                      'Record Payment'
                    )}
                  </Button>
                </div>
              </form>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
