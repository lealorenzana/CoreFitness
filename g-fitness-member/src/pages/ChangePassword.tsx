import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { ArrowLeft, Lock, Eye, EyeOff, Check } from 'lucide-react';
import { showSuccessToast, showErrorToast } from '../utils/errorHandler';

export default function ChangePassword() {
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Password strength checker
  const getPasswordStrength = (password: string) => {
    if (!password) return { strength: 0, label: '', color: '' };
    
    let strength = 0;
    if (password.length >= 8) strength++;
    if (password.length >= 12) strength++;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) strength++;
    if (/\d/.test(password)) strength++;
    if (/[^a-zA-Z0-9]/.test(password)) strength++;

    if (strength <= 2) return { strength, label: 'Weak', color: 'var(--color-secondary)' };
    if (strength <= 3) return { strength, label: 'Fair', color: '#f59e0b' };
    if (strength <= 4) return { strength, label: 'Good', color: '#10b981' };
    return { strength, label: 'Strong', color: '#10b981' };
  };

  const passwordStrength = getPasswordStrength(newPassword);

  const requirements = [
    { label: 'At least 8 characters', met: newPassword.length >= 8 },
    { label: 'Contains uppercase & lowercase', met: /[a-z]/.test(newPassword) && /[A-Z]/.test(newPassword) },
    { label: 'Contains a number', met: /\d/.test(newPassword) },
    { label: 'Contains special character', met: /[^a-zA-Z0-9]/.test(newPassword) },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!currentPassword || !newPassword || !confirmPassword) {
      showErrorToast('Please fill in all fields');
      return;
    }

    if (newPassword !== confirmPassword) {
      showErrorToast('New passwords do not match');
      return;
    }

    if (newPassword.length < 8) {
      showErrorToast('Password must be at least 8 characters');
      return;
    }

    setIsLoading(true);

    // Simulate API call
    setTimeout(() => {
      setIsLoading(false);
      showSuccessToast('Password changed successfully!');
      navigate('/member/settings');
    }, 1500);
  };

  return (
    <div className="space-y-5 pb-4">
      {/* Header */}
      <motion.div 
        initial={{ opacity: 0, y: -16 }} 
        animate={{ opacity: 1, y: 0 }} 
        className="flex items-center gap-3"
      >
        <button
          onClick={() => navigate('/member/settings')}
          className="w-10 h-10 rounded-xl flex items-center justify-center transition-colors"
          style={{ 
            background: 'var(--color-surface-raised)', 
            border: '1px solid var(--color-border)', 
            color: 'var(--color-text-secondary)' 
          }}
          onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--color-secondary)')}
          onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--color-border)')}
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-white">Change Password</h1>
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            Update your account password
          </p>
        </div>
      </motion.div>

      {/* Form */}
      <motion.form
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        onSubmit={handleSubmit}
        className="space-y-4"
      >
        {/* Current Password */}
        <div className="rounded-2xl p-5 space-y-4" 
          style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
          <div>
            <label className="text-sm font-semibold text-white mb-2 block">
              Current Password
            </label>
            <div className="relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2">
                <Lock size={18} style={{ color: 'var(--color-text-muted)' }} />
              </div>
              <input
                type={showCurrent ? 'text' : 'password'}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter current password"
                className="w-full pl-10 pr-12 py-3 rounded-xl text-white text-sm focus:outline-none"
                style={{ 
                  background: 'var(--color-bg)', 
                  border: '1px solid var(--color-border)' 
                }}
              />
              <button
                type="button"
                onClick={() => setShowCurrent(!showCurrent)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1"
                style={{ color: 'var(--color-text-muted)' }}
              >
                {showCurrent ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>
        </div>

        {/* New Password */}
        <div className="rounded-2xl p-5 space-y-4" 
          style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
          <div>
            <label className="text-sm font-semibold text-white mb-2 block">
              New Password
            </label>
            <div className="relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2">
                <Lock size={18} style={{ color: 'var(--color-text-muted)' }} />
              </div>
              <input
                type={showNew ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password"
                className="w-full pl-10 pr-12 py-3 rounded-xl text-white text-sm focus:outline-none"
                style={{ 
                  background: 'var(--color-bg)', 
                  border: '1px solid var(--color-border)' 
                }}
              />
              <button
                type="button"
                onClick={() => setShowNew(!showNew)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1"
                style={{ color: 'var(--color-text-muted)' }}
              >
                {showNew ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>

            {/* Password Strength */}
            {newPassword && (
              <div className="mt-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    Password Strength
                  </span>
                  <span className="text-xs font-semibold" style={{ color: passwordStrength.color }}>
                    {passwordStrength.label}
                  </span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--color-bg)' }}>
                  <div 
                    className="h-full transition-all duration-300"
                    style={{ 
                      width: `${(passwordStrength.strength / 5) * 100}%`,
                      background: passwordStrength.color
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Requirements */}
          {newPassword && (
            <div className="space-y-2">
              <p className="text-xs font-semibold" style={{ color: 'var(--color-text-muted)' }}>
                Password Requirements:
              </p>
              {requirements.map((req) => (
                <div key={req.label} className="flex items-center gap-2">
                  <div 
                    className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ 
                      background: req.met ? 'var(--color-primary)' : 'var(--color-border)' 
                    }}
                  >
                    {req.met && <Check size={10} className="text-white" />}
                  </div>
                  <span 
                    className="text-xs"
                    style={{ color: req.met ? 'var(--color-primary)' : 'var(--color-text-muted)' }}
                  >
                    {req.label}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Confirm Password */}
        <div className="rounded-2xl p-5" 
          style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
          <label className="text-sm font-semibold text-white mb-2 block">
            Confirm New Password
          </label>
          <div className="relative">
            <div className="absolute left-3 top-1/2 -translate-y-1/2">
              <Lock size={18} style={{ color: 'var(--color-text-muted)' }} />
            </div>
            <input
              type={showConfirm ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
              className="w-full pl-10 pr-12 py-3 rounded-xl text-white text-sm focus:outline-none"
              style={{ 
                background: 'var(--color-bg)', 
                border: '1px solid var(--color-border)' 
              }}
            />
            <button
              type="button"
              onClick={() => setShowConfirm(!showConfirm)}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1"
              style={{ color: 'var(--color-text-muted)' }}
            >
              {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          
          {confirmPassword && newPassword !== confirmPassword && (
            <p className="text-xs mt-2" style={{ color: 'var(--color-secondary)' }}>
              Passwords do not match
            </p>
          )}
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isLoading || !currentPassword || !newPassword || !confirmPassword || newPassword !== confirmPassword}
          className="w-full py-3.5 rounded-xl font-bold text-black transition-opacity disabled:opacity-50"
          style={{ background: 'var(--color-secondary)' }}
        >
          {isLoading ? 'Updating...' : 'Change Password'}
        </button>
      </motion.form>

      {/* Security Tips */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="rounded-2xl p-5"
        style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}
      >
        <h3 className="text-white font-semibold text-sm mb-3 flex items-center gap-2">
          <Lock size={16} style={{ color: 'var(--color-primary)' }} />
          Security Tips
        </h3>
        <ul className="space-y-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
          <li>• Use a unique password you don't use elsewhere</li>
          <li>• Make it at least 12 characters long</li>
          <li>• Include numbers, symbols, and mixed case letters</li>
          <li>• Avoid personal information like birthdays or names</li>
          <li>• Consider using a password manager</li>
        </ul>
      </motion.div>
    </div>
  );
}
