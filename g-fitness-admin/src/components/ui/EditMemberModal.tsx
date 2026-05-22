import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect } from 'react';
import { X, User, Mail, CreditCard, Activity } from 'lucide-react';
import Button from './Button';
import Input from './Input';
import type { EditMemberData } from '../../types/member';

export type { EditMemberData };

interface EditMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (member: EditMemberData) => void;
  member: any;
}

export default function EditMemberModal({ isOpen, onClose, onSubmit, member }: EditMemberModalProps) {
  const [formData, setFormData] = useState({
    id: '',
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    address: '',
    membershipType: 'Standard' as 'Basic' | 'Standard' | 'Premium',
    membershipStatus: 'Active' as 'Active' | 'Expired' | 'Expiring' | 'Suspended',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (member && isOpen) {
      setFormData({
        id: member.id,
        firstName: member.firstName,
        lastName: member.lastName,
        email: member.email,
        phone: member.phone,
        address: member.address,
        membershipType: member.membershipType,
        membershipStatus: member.membershipStatus,
      });
    }
  }, [member, isOpen]);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!formData.firstName.trim()) e.firstName = 'Required';
    if (!formData.lastName.trim())  e.lastName  = 'Required';
    if (!formData.email.trim())     e.email     = 'Required';
    else if (!/\S+@\S+\.\S+/.test(formData.email)) e.email = 'Invalid email';
    if (!formData.phone.trim())     e.phone     = 'Required';
    if (!formData.address.trim())   e.address   = 'Required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setIsLoading(true);
    setTimeout(() => {
      onSubmit(formData as EditMemberData);
      setErrors({});
      setIsLoading(false);
      onClose();
    }, 600);
  };

  const handleClose = () => {
    if (!isLoading) { setErrors({}); onClose(); }
  };

  const field = (label: string, key: keyof typeof formData, type = 'text') => (
    <div>
      <label className="text-sm block mb-1.5" style={{ color: 'var(--color-text-muted)' }}>{label}</label>
      <Input
        type={type}
        value={formData[key] as string}
        onChange={(e) => {
          setFormData({ ...formData, [key]: e.target.value });
          if (errors[key]) setErrors({ ...errors, [key]: '' });
        }}
        className={errors[key] ? 'border-red-500' : ''}
      />
      {errors[key] && <p className="text-xs mt-1" style={{ color: 'var(--color-secondary)' }}>{errors[key]}</p>}
    </div>
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={handleClose} className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50" />

          <div className="fixed inset-0 flex items-center justify-center z-50 p-4 overflow-y-auto">
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden my-8"
              style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
              onClick={(e) => e.stopPropagation()}>

              {/* Header */}
              <div className="p-5 flex items-center justify-between" style={{ borderBottom: '1px solid var(--color-border)' }}>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: 'var(--color-primary)' }}>
                    <User size={22} className="text-white" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-white">Edit Member</h2>
                    <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Update member information</p>
                  </div>
                </div>
                <button onClick={handleClose} disabled={isLoading} style={{ color: 'var(--color-text-muted)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = '#fff')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-muted)')}>
                  <X size={22} />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-5 space-y-6 max-h-[calc(100vh-200px)] overflow-y-auto">
                {/* Personal Info */}
                <section className="space-y-3">
                  <h3 className="text-white font-semibold flex items-center gap-2">
                    <User size={16} style={{ color: 'var(--color-secondary)' }} /> Personal Information
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    {field('First Name *', 'firstName')}
                    {field('Last Name *',  'lastName')}
                  </div>
                </section>

                {/* Contact */}
                <section className="space-y-3">
                  <h3 className="text-white font-semibold flex items-center gap-2">
                    <Mail size={16} style={{ color: 'var(--color-secondary)' }} /> Contact Information
                  </h3>
                  {field('Email Address *', 'email', 'email')}
                  {field('Phone Number *', 'phone',  'tel')}
                  {field('Address *',      'address')}
                </section>

                {/* Membership */}
                <section className="space-y-3">
                  <h3 className="text-white font-semibold flex items-center gap-2">
                    <CreditCard size={16} style={{ color: 'var(--color-secondary)' }} /> Membership
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-sm block mb-1.5" style={{ color: 'var(--color-text-muted)' }}>Plan *</label>
                      <select value={formData.membershipType}
                        onChange={(e) => setFormData({ ...formData, membershipType: e.target.value as any })}
                        className="w-full px-4 py-2.5 rounded-xl text-white focus:outline-none"
                        style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
                        <option value="Basic">Basic — ₱800/month</option>
                        <option value="Standard">Standard — ₱1,500/month</option>
                        <option value="Premium">Premium — ₱2,500/month</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-sm block mb-1.5" style={{ color: 'var(--color-text-muted)' }}>Status *</label>
                      <select value={formData.membershipStatus}
                        onChange={(e) => setFormData({ ...formData, membershipStatus: e.target.value as any })}
                        className="w-full px-4 py-2.5 rounded-xl text-white focus:outline-none"
                        style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
                        <option value="Active">Active</option>
                        <option value="Expiring">Expiring Soon</option>
                        <option value="Expired">Expired</option>
                        <option value="Suspended">Suspended</option>
                      </select>
                    </div>
                  </div>
                  <div className="rounded-xl p-3 text-xs flex items-center gap-2"
                    style={{ background: 'var(--color-primary-light)', border: '1px solid rgba(124,58,237,0.25)', color: 'var(--color-primary)' }}>
                    <Activity size={14} /> Physical info is managed by the member through their app.
                  </div>
                </section>

                {/* Footer */}
                <div className="flex items-center gap-3 pt-3" style={{ borderTop: '1px solid var(--color-border)' }}>
                  <Button type="button" variant="ghost" onClick={handleClose} disabled={isLoading} className="flex-1">
                    Cancel
                  </Button>
                  <Button type="submit" variant="primary" disabled={isLoading} className="flex-1">
                    {isLoading ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                        Saving…
                      </span>
                    ) : 'Save Changes'}
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
