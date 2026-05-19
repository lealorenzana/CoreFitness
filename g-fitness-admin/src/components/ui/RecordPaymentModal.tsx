import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import { X, CreditCard, User, Calendar, DollarSign } from 'lucide-react';
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

  const paymentMethods = ['Cash', 'GCash', 'Bank Transfer', 'Credit Card', 'Debit Card'];

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
      const selectedMember = gymMembers.find(m => m.id === formData.memberId);
      
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
      setErrors({});
      onClose();
    }
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
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-start to-primary-end flex items-center justify-center">
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
                {/* Member Selection */}
                <div>
                  <label className="text-gray-400 text-sm block mb-2 flex items-center gap-2">
                    <User size={16} />
                    Select Member
                  </label>
                  <select
                    value={formData.memberId}
                    onChange={(e) => {
                      setFormData({ ...formData, memberId: e.target.value });
                      if (errors.memberId) setErrors({ ...errors, memberId: '' });
                    }}
                    className={`w-full bg-dark border ${errors.memberId ? 'border-red-500' : 'border-dark-border'} rounded-xl px-4 py-3 text-white focus:outline-none focus:border-primary-start transition-colors`}
                  >
                    <option value="">Choose a member...</option>
                    {gymMembers.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.fullName} ({member.qrCode})
                      </option>
                    ))}
                  </select>
                  {errors.memberId && (
                    <p className="text-red-400 text-xs mt-1">{errors.memberId}</p>
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
                    <p className="text-red-400 text-xs mt-1">{errors.amount}</p>
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
                    <p className="text-red-400 text-xs mt-1">{errors.date}</p>
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
