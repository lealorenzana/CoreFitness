import { motion } from 'framer-motion';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, User, Mail, Phone, Lock, Save } from 'lucide-react';

export default function EditProfile() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    firstName: 'Juan',
    lastName: 'Dela Cruz',
    email: 'juan.delacruz@email.com',
    phone: '+63 912 345 6789',
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    // Clear error for this field
    if (errors[e.target.name]) {
      setErrors({ ...errors, [e.target.name]: '' });
    }
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.firstName.trim()) {
      newErrors.firstName = 'First name is required';
    }
    if (!formData.lastName.trim()) {
      newErrors.lastName = 'Last name is required';
    }
    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Email is invalid';
    }
    if (!formData.phone.trim()) {
      newErrors.phone = 'Phone number is required';
    } else if (!/^\+63\s?\d{3}\s?\d{3}\s?\d{4}$/.test(formData.phone)) {
      newErrors.phone = 'Phone number must be in format +63 XXX XXX XXXX';
    }

    // Password validation (only if user wants to change password)
    if (formData.currentPassword || formData.newPassword || formData.confirmPassword) {
      if (!formData.currentPassword) {
        newErrors.currentPassword = 'Current password is required';
      }
      if (!formData.newPassword) {
        newErrors.newPassword = 'New password is required';
      } else if (formData.newPassword.length < 6) {
        newErrors.newPassword = 'Password must be at least 6 characters';
      }
      if (formData.newPassword !== formData.confirmPassword) {
        newErrors.confirmPassword = 'Passwords do not match';
      }
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
    setSuccessMessage('');

    // Simulate API call
    setTimeout(() => {
      setIsLoading(false);
      setSuccessMessage('Profile updated successfully!');
      
      // Clear password fields
      setFormData({
        ...formData,
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      });

      // Navigate back after 2 seconds
      setTimeout(() => {
        navigate('/member/profile');
      }, 2000);
    }, 1500);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-4"
      >
        <button
          onClick={() => navigate('/member/profile')}
          className="w-10 h-10 rounded-xl bg-dark-lighter border border-dark-border flex items-center justify-center text-gray-400 hover:text-white hover:border-primary-start transition-all duration-200"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-3xl font-orbitron font-bold text-gradient">Edit Profile</h1>
          <p className="text-gray-400 mt-1">Update your personal information</p>
        </div>
      </motion.div>

      {/* Success Message */}
      {successMessage && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-green-500/10 border border-green-500/30 rounded-2xl p-4 text-green-400 text-center"
        >
          {successMessage}
        </motion.div>
      )}

      {/* Form */}
      <motion.form
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        onSubmit={handleSubmit}
        className="space-y-6"
      >
        {/* Personal Information */}
        <div className="bg-dark-lighter border border-dark-border rounded-2xl p-6 space-y-4">
          <h2 className="text-white font-semibold text-lg flex items-center gap-2">
            <User size={20} className="text-primary-start" />
            Personal Information
          </h2>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-gray-400 text-sm block mb-2">First Name</label>
              <input
                type="text"
                name="firstName"
                value={formData.firstName}
                onChange={handleChange}
                className={`w-full bg-dark border ${errors.firstName ? 'border-red-500' : 'border-dark-border'} rounded-xl px-4 py-3 text-white focus:outline-none focus:border-primary-start transition-colors`}
              />
              {errors.firstName && (
                <p className="text-red-400 text-xs mt-1">{errors.firstName}</p>
              )}
            </div>

            <div>
              <label className="text-gray-400 text-sm block mb-2">Last Name</label>
              <input
                type="text"
                name="lastName"
                value={formData.lastName}
                onChange={handleChange}
                className={`w-full bg-dark border ${errors.lastName ? 'border-red-500' : 'border-dark-border'} rounded-xl px-4 py-3 text-white focus:outline-none focus:border-primary-start transition-colors`}
              />
              {errors.lastName && (
                <p className="text-red-400 text-xs mt-1">{errors.lastName}</p>
              )}
            </div>
          </div>
        </div>

        {/* Contact Information */}
        <div className="bg-dark-lighter border border-dark-border rounded-2xl p-6 space-y-4">
          <h2 className="text-white font-semibold text-lg flex items-center gap-2">
            <Mail size={20} className="text-primary-start" />
            Contact Information
          </h2>

          <div>
            <label className="text-gray-400 text-sm block mb-2">Email Address</label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              className={`w-full bg-dark border ${errors.email ? 'border-red-500' : 'border-dark-border'} rounded-xl px-4 py-3 text-white focus:outline-none focus:border-primary-start transition-colors`}
            />
            {errors.email && (
              <p className="text-red-400 text-xs mt-1">{errors.email}</p>
            )}
          </div>

          <div>
            <label className="text-gray-400 text-sm block mb-2">Phone Number</label>
            <input
              type="tel"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              placeholder="+63 XXX XXX XXXX"
              className={`w-full bg-dark border ${errors.phone ? 'border-red-500' : 'border-dark-border'} rounded-xl px-4 py-3 text-white focus:outline-none focus:border-primary-start transition-colors`}
            />
            {errors.phone && (
              <p className="text-red-400 text-xs mt-1">{errors.phone}</p>
            )}
          </div>
        </div>

        {/* Change Password */}
        <div className="bg-dark-lighter border border-dark-border rounded-2xl p-6 space-y-4">
          <h2 className="text-white font-semibold text-lg flex items-center gap-2">
            <Lock size={20} className="text-primary-start" />
            Change Password
          </h2>
          <p className="text-gray-400 text-sm">Leave blank if you don't want to change your password</p>

          <div>
            <label className="text-gray-400 text-sm block mb-2">Current Password</label>
            <input
              type="password"
              name="currentPassword"
              value={formData.currentPassword}
              onChange={handleChange}
              className={`w-full bg-dark border ${errors.currentPassword ? 'border-red-500' : 'border-dark-border'} rounded-xl px-4 py-3 text-white focus:outline-none focus:border-primary-start transition-colors`}
            />
            {errors.currentPassword && (
              <p className="text-red-400 text-xs mt-1">{errors.currentPassword}</p>
            )}
          </div>

          <div>
            <label className="text-gray-400 text-sm block mb-2">New Password</label>
            <input
              type="password"
              name="newPassword"
              value={formData.newPassword}
              onChange={handleChange}
              className={`w-full bg-dark border ${errors.newPassword ? 'border-red-500' : 'border-dark-border'} rounded-xl px-4 py-3 text-white focus:outline-none focus:border-primary-start transition-colors`}
            />
            {errors.newPassword && (
              <p className="text-red-400 text-xs mt-1">{errors.newPassword}</p>
            )}
          </div>

          <div>
            <label className="text-gray-400 text-sm block mb-2">Confirm New Password</label>
            <input
              type="password"
              name="confirmPassword"
              value={formData.confirmPassword}
              onChange={handleChange}
              className={`w-full bg-dark border ${errors.confirmPassword ? 'border-red-500' : 'border-dark-border'} rounded-xl px-4 py-3 text-white focus:outline-none focus:border-primary-start transition-colors`}
            />
            {errors.confirmPassword && (
              <p className="text-red-400 text-xs mt-1">{errors.confirmPassword}</p>
            )}
          </div>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isLoading}
          className="w-full bg-gradient-to-r from-primary-start to-primary-end text-white font-semibold py-4 rounded-2xl hover:shadow-lg hover:shadow-primary-start/30 transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? (
            <>
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              Saving...
            </>
          ) : (
            <>
              <Save size={20} />
              Save Changes
            </>
          )}
        </button>
      </motion.form>
    </div>
  );
}
