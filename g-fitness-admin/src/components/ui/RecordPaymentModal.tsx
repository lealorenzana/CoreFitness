import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, CreditCard, User, Calendar, Banknote, Search } from 'lucide-react';
import Button from './Button';
import Input from './Input';
import { listMembers, type MemberWithProfile } from '../../lib/api/members';

export interface RecordPaymentInput {
  memberId: string;
  memberName: string;
  amount: number;
  method: string;
  date: string;
  notes: string;
}

/**
 * Imported rather than redeclared. This was a second, identical copy of the
 * shape defined in Payments.tsx, and the two silently drifted the moment
 * `durationDays` learned to be null for a non-expiring plan (0024).
 */
import type { MemberPlanInfo } from '../../pages/Payments';

interface RecordPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (payment: RecordPaymentInput) => void;
  /** memberId -> their current plan. Missing entry = no membership to bill against. */
  planByMember: Record<string, MemberPlanInfo>;
}

export default function RecordPaymentModal({ isOpen, onClose, onSubmit, planByMember }: RecordPaymentModalProps) {
  const [members, setMembers] = useState<MemberWithProfile[]>([]);

  useEffect(() => {
    if (isOpen) {
      listMembers().then(setMembers).catch(() => setMembers([]));
    }
  }, [isOpen]);

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

  const paymentMethods = ['Cash'];

  const filteredMembers = members.filter(m => {
    const fullName = `${m.profile.first_name} ${m.profile.last_name}`;
    return (
      fullName.toLowerCase().includes(memberSearch.toLowerCase()) ||
      m.profile.email.toLowerCase().includes(memberSearch.toLowerCase()) ||
      (m.member.qr_code ?? '').toLowerCase().includes(memberSearch.toLowerCase())
    );
  });

  const selectedMember = members.find(m => m.profile.id === formData.memberId);
  const selectedPlan = formData.memberId ? planByMember[formData.memberId] : undefined;

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.memberId) {
      newErrors.memberId = 'Please select a member';
    } else if (!planByMember[formData.memberId]) {
      // recordPayment needs a membership to extend; without one it would fail
      // after submit. Catch it here while the member is still on screen.
      newErrors.memberId = 'This member has no membership plan assigned yet';
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

  const resetForm = () => {
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
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm() || !selectedMember) {
      return;
    }

    setIsLoading(true);
    try {
      onSubmit({
        memberId: formData.memberId,
        memberName: `${selectedMember.profile.first_name} ${selectedMember.profile.last_name}`,
        amount: parseFloat(formData.amount),
        method: formData.method,
        date: formData.date,
        notes: formData.notes,
      });
      resetForm();
      onClose();
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    if (!isLoading) {
      resetForm();
      onClose();
    }
  };

  const handleSelectMember = (member: MemberWithProfile) => {
    // Prefill the plan's price rather than leaving staff to type an amount blind.
    // Still editable — partial and advance payments are normal at a cash desk.
    const plan = planByMember[member.profile.id];
    setFormData({
      ...formData,
      memberId: member.profile.id,
      amount: plan && plan.planPrice > 0 ? String(plan.planPrice) : formData.amount,
    });
    setMemberSearch(`${member.profile.first_name} ${member.profile.last_name}`);
    setShowMemberDropdown(false);
    if (errors.memberId) setErrors({ ...errors, memberId: '' });
  };

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[200]"
          />

          {/* Modal */}
          <div className="fixed inset-0 flex items-center justify-center z-[200] p-4">
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
                      placeholder="Search by name, email, or QR code..."
                      className={`pl-12 ${errors.memberId ? 'border-red-500' : ''}`}
                    />

                    {/* Dropdown List */}
                    {showMemberDropdown && (
                      <div className="absolute top-full left-0 right-0 mt-2 bg-dark border border-dark-border rounded-xl shadow-2xl max-h-60 overflow-y-auto z-20">
                        {filteredMembers.length > 0 ? (
                          filteredMembers.map((member) => (
                            <button
                              key={member.profile.id}
                              type="button"
                              onClick={() => handleSelectMember(member)}
                              className="w-full text-left px-4 py-3 hover:bg-dark-border transition-colors flex items-center gap-3 border-b border-dark-border last:border-b-0"
                            >
                              <div className="w-10 h-10 rounded-full flex items-center justify-center text-black font-bold flex-shrink-0"
                                style={{ background: 'var(--color-secondary)' }}>
                                {member.profile.first_name[0]}{member.profile.last_name[0]}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-white font-semibold truncate">{member.profile.first_name} {member.profile.last_name}</p>
                                <p className="text-gray-400 text-xs truncate">{member.profile.email}</p>
                              </div>
                            </button>
                          ))
                        ) : (
                          <div className="px-4 py-8 text-center text-gray-400">
                            <User size={32} className="mx-auto mb-2 opacity-50" />
                            <p className="text-sm">No members found</p>
                            <p className="text-xs mt-1">Only approved members can receive payments</p>
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
                          {selectedMember.profile.first_name[0]}{selectedMember.profile.last_name[0]}
                        </div>
                        <div className="flex-1">
                          <p className="text-white font-semibold text-sm">{selectedMember.profile.first_name} {selectedMember.profile.last_name}</p>
                          <p className="text-gray-400 text-xs">{selectedMember.profile.email}</p>
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

                      {/* What this member is actually on. Without it, staff bill a
                          plan they can't see — which is how ₱600 ends up recorded
                          against a ₱0 plan. */}
                      <div className="mt-3 pt-3 border-t border-dark-border">
                        {selectedPlan ? (
                          <p className="text-xs text-gray-400">
                            Plan:{' '}
                            <span className="text-white font-semibold">{selectedPlan.planName}</span>
                            {' — '}
                            <span className="text-white">₱{selectedPlan.planPrice.toLocaleString()}</span>
                            {' / '}
                            {selectedPlan.durationDays == null
                              ? 'no expiry'
                              : `${selectedPlan.durationDays} days`}
                          </p>
                        ) : (
                          <p className="text-xs text-yellow">
                            No membership assigned — assign a plan before recording a payment.
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Amount */}
                <div>
                  <label className="text-gray-400 text-sm block mb-2 flex items-center gap-2">
                    <Banknote size={16} />
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
                    className="w-full bg-dark border border-dark-border rounded-xl px-4 py-3 text-white focus:border-primary-start transition-colors"
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
                    className="w-full bg-dark border border-dark-border rounded-xl px-4 py-3 text-white focus:border-primary-start transition-colors resize-none"
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
    </AnimatePresence>,
    document.body
  );
}
