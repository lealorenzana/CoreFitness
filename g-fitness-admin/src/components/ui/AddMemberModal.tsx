import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import { X, User, Mail, CreditCard, Activity } from 'lucide-react';
import Button from './Button';
import Input from './Input';
import { useGymContext } from '../../hooks/useGymContext';
import type { NewMemberData } from '../../types/member';

export type { NewMemberData };

interface AddMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (member: NewMemberData) => void;
}

function calcBMI(heightCm: number, weightKg: number): string {
  if (!heightCm || !weightKg) return '';
  const h = heightCm / 100;
  return (weightKg / (h * h)).toFixed(1);
}

function isStudent(birthday: string): boolean {
  if (!birthday) return false;
  const age = Math.floor((Date.now() - new Date(birthday).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
  return age >= 12 && age <= 24;
}

export default function AddMemberModal({ isOpen, onClose, onSubmit }: AddMemberModalProps) {
  const { selectedGym } = useGymContext();

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    address: '',
    birthday: '',
    heightCm: '',
    weightKg: '',
    medicalConditions: '',
    membershipType: 'Standard' as 'Basic' | 'Standard' | 'Premium',
    startDate: new Date().toISOString().split('T')[0],
    photoUrl: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setErrors({ ...errors, photo: 'Max 2MB' });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setFormData({ ...formData, photoUrl: reader.result as string });
      setErrors({ ...errors, photo: '' });
    };
    reader.readAsDataURL(file);
  };

  const bmi = calcBMI(Number(formData.heightCm), Number(formData.weightKg));
  const studentDetected = isStudent(formData.birthday);

  const getBMICategory = (bmiVal: string) => {
    const v = parseFloat(bmiVal);
    if (!v) return '';
    if (v < 18.5) return { label: 'Underweight', color: 'var(--color-primary)' };
    if (v < 25) return { label: 'Normal', color: 'var(--color-primary)' };
    if (v < 30) return { label: 'Overweight', color: 'var(--color-secondary)' };
    return { label: 'Obese', color: 'var(--color-secondary)' };
  };

  const bmiCategory = getBMICategory(bmi);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!formData.firstName.trim()) e.firstName = 'Required';
    if (!formData.lastName.trim()) e.lastName = 'Required';
    if (!formData.email.trim()) e.email = 'Required';
    else if (!/\S+@\S+\.\S+/.test(formData.email)) e.email = 'Invalid email';
    if (!formData.phone.trim()) e.phone = 'Required';
    if (!formData.address.trim()) e.address = 'Required';
    if (!formData.startDate) e.startDate = 'Required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setIsLoading(true);
    setTimeout(() => {
      onSubmit({
        ...formData,
        bmi: bmi || undefined,
        isStudent: studentDetected,
      } as any);
      setFormData({
        firstName: '', lastName: '', email: '', phone: '', address: '',
        birthday: '', heightCm: '', weightKg: '', medicalConditions: '',
        membershipType: 'Standard',
        startDate: new Date().toISOString().split('T')[0],
        photoUrl: '',
      });
      setErrors({});
      setIsLoading(false);
      onClose();
    }, 800);
  };

  const handleClose = () => {
    if (!isLoading) {
      setFormData({
        firstName: '', lastName: '', email: '', phone: '', address: '',
        birthday: '', heightCm: '', weightKg: '', medicalConditions: '',
        membershipType: 'Standard',
        startDate: new Date().toISOString().split('T')[0],
        photoUrl: '',
      });
      setErrors({});
      onClose();
    }
  };

  const field = (label: string, key: keyof typeof formData, type = 'text', placeholder = '') => (
    <div>
      <label className="text-sm block mb-1.5" style={{ color: 'var(--color-text-muted)' }}>{label}</label>
      <Input
        type={type}
        value={formData[key] as string}
        onChange={e => { setFormData({ ...formData, [key]: e.target.value }); if (errors[key]) setErrors({ ...errors, [key]: '' }); }}
        placeholder={placeholder}
        className={errors[key] ? 'border-red-500' : ''}
      />
      {errors[key] && <p className="text-yellow text-xs mt-1">{errors[key]}</p>}
    </div>
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={handleClose} className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50" />

          <div className="fixed inset-0 flex items-center justify-center z-50 p-4 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden my-8"
              style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="p-6 flex items-center justify-between" style={{ borderBottom: '1px solid var(--color-border)' }}>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: 'var(--color-secondary)' }}>
                    <User size={24} className="text-black" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-white">Add New Member</h2>
                    <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Add member to {selectedGym.name}</p>
                  </div>
                </div>
                <button onClick={handleClose} disabled={isLoading} style={{ color: 'var(--color-text-muted)' }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-text-muted)')}>
                  <X size={24} />
                </button>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} className="p-6 space-y-6 max-h-[calc(100vh-200px)] overflow-y-auto">

                {/* Personal Info */}
                <section className="space-y-4">
                  <h3 className="text-white font-semibold flex items-center gap-2">
                    <User size={16} style={{ color: 'var(--color-secondary)' }} /> Personal Information
                  </h3>

                  {/* Photo upload */}
                  <div className="flex items-center gap-4">
                    <div className="relative">
                      {formData.photoUrl ? (
                        <img src={formData.photoUrl} alt="Preview"
                          className="w-16 h-16 rounded-full object-cover"
                          style={{ border: '2px solid var(--color-primary)' }} />
                      ) : (
                        <div className="w-16 h-16 rounded-full flex items-center justify-center"
                          style={{ background: 'var(--color-primary-light)', border: '2px dashed var(--color-border)' }}>
                          <User size={24} style={{ color: 'var(--color-primary)' }} />
                        </div>
                      )}
                    </div>
                    <div className="flex-1">
                      <label className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold cursor-pointer transition-colors"
                        style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
                        {formData.photoUrl ? 'Change Photo' : 'Upload Photo'}
                        <input type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
                      </label>
                      <p className="text-[10px] mt-1" style={{ color: 'var(--color-text-muted)' }}>JPG, PNG. Max 2MB.</p>
                      {errors.photo && <p className="text-[10px] mt-0.5" style={{ color: 'var(--color-secondary)' }}>{errors.photo}</p>}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    {field('First Name *', 'firstName', 'text', 'Juan')}
                    {field('Last Name *', 'lastName', 'text', 'Dela Cruz')}
                  </div>
                  <div>
                    <label className="text-sm block mb-1.5" style={{ color: 'var(--color-text-muted)' }}>Birthday</label>
                    <Input type="date" value={formData.birthday}
                      onChange={e => setFormData({ ...formData, birthday: e.target.value })} />
                    {studentDetected && (
                      <p className="text-xs mt-1 font-semibold" style={{ color: 'var(--color-secondary)' }}>
                        🎓 Student detected (age qualifies for student rate)
                      </p>
                    )}
                  </div>
                </section>

                {/* Physical Stats */}
                <section className="space-y-4">
                  <h3 className="text-white font-semibold flex items-center gap-2">
                    <Activity size={16} style={{ color: 'var(--color-primary)' }} /> Physical Stats
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm block mb-1.5" style={{ color: 'var(--color-text-muted)' }}>Height (cm)</label>
                      <Input type="number" value={formData.heightCm} placeholder="170"
                        onChange={e => setFormData({ ...formData, heightCm: e.target.value })} />
                    </div>
                    <div>
                      <label className="text-sm block mb-1.5" style={{ color: 'var(--color-text-muted)' }}>Weight (kg)</label>
                      <Input type="number" value={formData.weightKg} placeholder="65"
                        onChange={e => setFormData({ ...formData, weightKg: e.target.value })} />
                    </div>
                  </div>
                  {bmi && (
                    <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
                      <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>BMI (auto-calculated):</span>
                      <span className="text-xl font-bold text-white">{bmi}</span>
                      {bmiCategory && (
                        <span className="text-xs font-semibold px-2 py-1 rounded-full" style={{ background: `${bmiCategory.color}20`, color: bmiCategory.color }}>
                          {bmiCategory.label}
                        </span>
                      )}
                    </div>
                  )}
                  <div>
                    <label className="text-sm block mb-1.5" style={{ color: 'var(--color-text-muted)' }}>Physical / Medical Conditions</label>
                    <textarea
                      value={formData.medicalConditions}
                      onChange={e => setFormData({ ...formData, medicalConditions: e.target.value })}
                      placeholder="e.g. Hypertension, Asthma, None"
                      rows={2}
                      className="w-full px-4 py-3 rounded-xl text-white text-sm resize-none focus:outline-none"
                      style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}
                    />
                  </div>
                </section>

                {/* Contact */}
                <section className="space-y-4">
                  <h3 className="text-white font-semibold flex items-center gap-2">
                    <Mail size={16} style={{ color: 'var(--color-secondary)' }} /> Contact Information
                  </h3>
                  {field('Email Address *', 'email', 'email', 'juan@email.com')}
                  {field('Phone Number *', 'phone', 'tel', '+63 912 345 6789')}
                  {field('Address *', 'address', 'text', 'Mamburao, Occidental Mindoro')}
                </section>

                {/* Membership */}
                <section className="space-y-4">
                  <h3 className="text-white font-semibold flex items-center gap-2">
                    <CreditCard size={16} style={{ color: 'var(--color-secondary)' }} /> Membership Details
                  </h3>
                  <div>
                    <label className="text-sm block mb-1.5" style={{ color: 'var(--color-text-muted)' }}>Membership Plan *</label>
                    <select
                      value={formData.membershipType}
                      onChange={e => setFormData({ ...formData, membershipType: e.target.value as any })}
                      className="w-full px-4 py-3 rounded-xl text-white focus:outline-none"
                      style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}
                    >
                      <option value="Basic">Basic — ₱800/month</option>
                      <option value="Standard">Standard — ₱1,500/month</option>
                      <option value="Premium">Premium — ₱2,500/month</option>
                    </select>
                  </div>
                  {field('Start Date *', 'startDate', 'date')}
                </section>

                {/* Actions */}
                <div className="flex items-center gap-3 pt-4" style={{ borderTop: '1px solid var(--color-border)' }}>
                  <Button type="button" variant="ghost" onClick={handleClose} disabled={isLoading} className="flex-1">Cancel</Button>
                  <Button type="submit" variant="primary" disabled={isLoading} className="flex-1">
                    {isLoading ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                        Adding…
                      </span>
                    ) : 'Add Member'}
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
