import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, User, Mail, Lock, Save, Camera } from 'lucide-react';
import { showSuccessToast, showErrorToast } from '../utils/errorHandler';
import { errorMessage } from '../utils/errorMessage';
import { supabase } from '../lib/supabaseClient';
import { getMyProfile, updateMyProfile } from '../lib/api/profiles';
import { Field, TextInput, FieldError } from '../components/ui/Field';
import Avatar from '../components/ui/Avatar';
import { uploadMyAvatar, removeMyAvatar } from '../lib/api/avatars';

export default function EditProfile() {
  const navigate = useNavigate();

  // Loaded from `profiles`. The old version read SharedStorage and, failing
  // that, pre-filled the form with "Eya Lorenzana" — so saving wrote a
  // stranger's name onto whoever was signed in.
  const [formData, setFormData] = useState({
    firstName: '', lastName: '', email: '', phone: '',
    currentPassword: '', newPassword: '', confirmPassword: '',
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const profile = await getMyProfile().catch(() => null);
      if (!profile || cancelled) return;
      setFormData((prev) => ({
        ...prev,
        firstName: profile.first_name,
        lastName: profile.last_name,
        email: profile.email,
        phone: profile.phone ?? '',
      }));
      setProfilePhoto(profile.photo_url ?? null);
    })();
    return () => { cancelled = true; };
  }, []);

  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);

  /**
   * Uploads immediately rather than waiting for Save.
   *
   * The previous version read the file into component state and Save never sent
   * it, so choosing a photo did nothing at all. Uploading on pick also means
   * the member sees the real stored image — not a local preview that might
   * differ from what the server kept after resizing.
   */
  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // let the same file be re-picked after an error
    if (!file) return;

    setPhotoBusy(true);
    try {
      const { publicUrl } = await uploadMyAvatar(file);
      setProfilePhoto(publicUrl);
      showSuccessToast('Photo updated');
    } catch (err) {
      showErrorToast({ type: 'validation', message: errorMessage(err, 'Could not upload that photo'), details: '' });
    } finally {
      setPhotoBusy(false);
    }
  };

  const handleRemovePhoto = async () => {
    setPhotoBusy(true);
    try {
      await removeMyAvatar();
      setProfilePhoto(null);
      showSuccessToast('Photo removed');
    } catch (err) {
      showErrorToast({ type: 'validation', message: errorMessage(err, 'Could not remove that photo'), details: '' });
    } finally {
      setPhotoBusy(false);
    }
  };

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
      showErrorToast({ type: 'validation', message: 'Please fix the errors in the form' });
      return;
    }

    setIsLoading(true);

    try {
      // Name and phone only. Email is the login identity — changing it means
      // changing `auth.users`, which needs a confirmation round-trip, so it is
      // shown read-only rather than silently desynced from `profiles.email`.
      await updateMyProfile({
        first_name: formData.firstName,
        last_name: formData.lastName,
        phone: formData.phone || null,
      });

      if (formData.newPassword) {
        // Supabase has no verify-password endpoint, so the current password is
        // proven by signing in with it first. Without this, anyone who walked
        // up to an unlocked phone could change the password.
        const { error: reauthError } = await supabase.auth.signInWithPassword({
          email: formData.email,
          password: formData.currentPassword,
        });
        if (reauthError) throw new Error('Your current password is incorrect.');

        const { error: pwError } = await supabase.auth.updateUser({ password: formData.newPassword });
        if (pwError) throw pwError;
      }

      showSuccessToast(formData.newPassword ? 'Profile and password updated' : 'Profile updated successfully!');
      setFormData({ ...formData, currentPassword: '', newPassword: '', confirmPassword: '' });
      setTimeout(() => navigate('/member/profile'), 800);
    } catch (err) {
      showErrorToast({ type: 'validation', message: errorMessage(err, 'Could not update your profile') });
    } finally {
      setIsLoading(false);
    }
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
          className="w-10 h-10 rounded-xl border flex items-center justify-center text-white/40 hover:text-white transition-all duration-200"
          style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-3xl font-orbitron font-bold text-gradient">Edit Profile</h1>
          <p className="text-white/40 mt-1">Update your personal information</p>
        </div>
      </motion.div>

      {/* Form */}
      <motion.form
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        onSubmit={handleSubmit}
        className="space-y-6"
      >
        {/* Profile Photo */}
        <div className="glass-card rounded-2xl p-6">
          <h2 className="text-white font-semibold text-lg flex items-center gap-2 mb-4">
            <Camera size={20} style={{ color: 'var(--color-primary)' }} />
            Profile Photo
          </h2>
          
          <div className="flex items-center gap-6">
            <div className="relative" style={{ opacity: photoBusy ? 0.5 : 1 }}>
              <Avatar
                name={`${formData.firstName} ${formData.lastName}`.trim()}
                photoUrl={profilePhoto}
                size={96}
                className="border-2"
              />
              <label htmlFor="photo-upload"
                className="absolute bottom-0 right-0 w-8 h-8 rounded-full flex items-center justify-center cursor-pointer border-2"
                style={{ background: 'var(--color-secondary)', borderColor: 'var(--color-surface)' }}>
                <Camera size={14} className="text-black" />
              </label>
              <input
                id="photo-upload"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handlePhotoChange}
                disabled={photoBusy}
                className="hidden"
              />
            </div>

            <div className="flex-1">
              <p className="text-white font-medium mb-1">Profile picture</p>
              {/* Honest about what the server actually accepts: the bucket
                  rejects GIF, and caps at 2 MB after the client resizes. */}
              <p className="text-white/40 text-sm mb-3">
                JPG, PNG or WebP. Large photos are resized automatically.
              </p>
              <div className="flex items-center gap-2">
                <label htmlFor="photo-upload"
                  className="inline-block px-4 py-2 rounded-full text-sm font-semibold cursor-pointer border transition-colors"
                  style={{
                    background: 'var(--color-surface)',
                    borderColor: 'var(--color-border)',
                    color: 'var(--color-text-secondary)',
                  }}>
                  {photoBusy ? 'Uploading…' : profilePhoto ? 'Change photo' : 'Choose photo'}
                </label>
                {profilePhoto && !photoBusy && (
                  <button type="button" onClick={handleRemovePhoto}
                    className="px-4 py-2 rounded-full text-sm font-semibold border transition-colors"
                    style={{ background: 'transparent', borderColor: 'var(--color-border)', color: '#f87171' }}>
                    Remove
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Personal Information */}
        <div className="glass-card rounded-2xl p-6 space-y-4">
          <h2 className="text-white font-semibold text-lg flex items-center gap-2">
            <User size={20} style={{ color: 'var(--color-primary)' }} />
            Personal Information
          </h2>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Field label="First Name">
                <TextInput type="text" name="firstName" value={formData.firstName} onChange={handleChange}
                  className={errors.firstName ? 'border-red-500' : undefined} />
              </Field>
              {errors.firstName && <FieldError>{errors.firstName}</FieldError>}
            </div>

            <div>
              <Field label="Last Name">
                <TextInput type="text" name="lastName" value={formData.lastName} onChange={handleChange}
                  className={errors.lastName ? 'border-red-500' : undefined} />
              </Field>
              {errors.lastName && <FieldError>{errors.lastName}</FieldError>}
            </div>
          </div>
        </div>

        {/* Contact Information */}
        <div className="glass-card rounded-2xl p-6 space-y-4">
          <h2 className="text-white font-semibold text-lg flex items-center gap-2">
            <Mail size={20} style={{ color: 'var(--color-primary)' }} />
            Contact Information
          </h2>

          <div>
            {/* Read-only here because this is the login identity: changing it
                needs a password check and an email confirmation round-trip,
                which is a screen of its own. The hint used to say "Ask the
                front desk" — they had no way to do it either. */}
            <Field label="Email Address">
              <TextInput type="email" name="email" value={formData.email} readOnly disabled
                className="cursor-not-allowed" />
            </Field>
            <button
              type="button"
              onClick={() => navigate('/member/change-email')}
              className="text-xs font-semibold mt-1.5"
              style={{ color: 'var(--color-secondary)' }}
            >
              Change email
            </button>
          </div>

          <div>
            <Field label="Phone Number">
              <TextInput type="tel" name="phone" value={formData.phone} onChange={handleChange}
                placeholder="+63 XXX XXX XXXX"
                className={errors.phone ? 'border-red-500' : undefined} />
            </Field>
            {errors.phone && <FieldError>{errors.phone}</FieldError>}
          </div>
        </div>

        {/* Change Password */}
        <div className="glass-card rounded-2xl p-6 space-y-4">
          <h2 className="text-white font-semibold text-lg flex items-center gap-2">
            <Lock size={20} style={{ color: 'var(--color-primary)' }} />
            Change Password
          </h2>
          <p className="text-white/40 text-sm">Leave blank if you don't want to change your password</p>

          <div>
            <Field label="Current Password">
              <TextInput type="password" name="currentPassword" value={formData.currentPassword} onChange={handleChange}
                className={errors.currentPassword ? 'border-red-500' : undefined} />
            </Field>
            {errors.currentPassword && <FieldError>{errors.currentPassword}</FieldError>}
          </div>

          <div>
            <Field label="New Password">
              <TextInput type="password" name="newPassword" value={formData.newPassword} onChange={handleChange}
                className={errors.newPassword ? 'border-red-500' : undefined} />
            </Field>
            {errors.newPassword && <FieldError>{errors.newPassword}</FieldError>}
          </div>

          <div>
            <Field label="Confirm New Password">
              <TextInput type="password" name="confirmPassword" value={formData.confirmPassword} onChange={handleChange}
                className={errors.confirmPassword ? 'border-red-500' : undefined} />
            </Field>
            {errors.confirmPassword && <FieldError>{errors.confirmPassword}</FieldError>}
          </div>
        </div>

        {/* Submit Button — flat yellow */}
        <button
          type="submit"
          disabled={isLoading}
          className="w-full font-semibold py-3.5 rounded-xl flex items-center justify-center gap-2 disabled:opacity-60 text-black"
          style={{ background: 'var(--color-secondary)' }}
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
