import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { showSuccessToast, showErrorToast } from '../utils/errorHandler';
import { errorMessage } from '../utils/errorMessage';
import { supabase } from '../lib/supabaseClient';
import { getMyProfile, updateMyProfile } from '../lib/api/profiles';
import { Field, TextInput, FieldError } from '../components/ui/Field';
import Avatar from '../components/ui/Avatar';
import { uploadMyAvatar, removeMyAvatar } from '../lib/api/avatars';
import { Page, PageTitle } from '../components/ui/page';
import { NocButton, SectionHead } from '../components/ui/noc';

/**
 * Edit the member's own name, phone, photo and (optionally) password
 * (Nocturne redesign — sections on the page rather than four glass cards).
 *
 * The password section keeps its place, and now asks for **eight** characters,
 * not six: Change Password asks for eight, and two screens that change the same
 * password under different rules is a rule nobody can state.
 */
export default function EditProfile() {
  const navigate = useNavigate();

  // Loaded from `profiles`. The old version read SharedStorage and, failing
  // that, pre-filled the form with "Eya Lorenzana" — so saving wrote a
  // stranger's name onto whoever was signed in.
  const [formData, setFormData] = useState({
    firstName: '', lastName: '', email: '', phone: '',
    currentPassword: '', newPassword: '', confirmPassword: '',
  });

  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);

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
    if (errors[e.target.name]) {
      setErrors({ ...errors, [e.target.name]: '' });
    }
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.firstName.trim()) newErrors.firstName = 'First name is required';
    if (!formData.lastName.trim()) newErrors.lastName = 'Last name is required';
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

    // Password validation (only if the member wants to change it)
    if (formData.currentPassword || formData.newPassword || formData.confirmPassword) {
      if (!formData.currentPassword) newErrors.currentPassword = 'Current password is required';
      if (!formData.newPassword) {
        newErrors.newPassword = 'New password is required';
      } else if (formData.newPassword.length < 8) {
        newErrors.newPassword = 'Password must be at least 8 characters';
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

      showSuccessToast(formData.newPassword ? 'Profile and password updated' : 'Profile updated');
      setFormData({ ...formData, currentPassword: '', newPassword: '', confirmPassword: '' });
      setTimeout(() => navigate('/member/profile'), 800);
    } catch (err) {
      showErrorToast({ type: 'validation', message: errorMessage(err, 'Could not update your profile') });
    } finally {
      setIsLoading(false);
    }
  };

  /** An error edge in the action colour — the design system has no red. */
  const edge = (key: string) => (errors[key] ? { borderColor: 'var(--color-secondary)' } : undefined);

  return (
    <Page>
      <PageTitle back fallback="/member/profile" title="Edit profile" subtitle="Your name, photo and how the gym reaches you" />

      <form onSubmit={handleSubmit} className="flex flex-col" style={{ gap: 'var(--stack)' }}>
        {/* Photo */}
        <section className="flex items-center" style={{ gap: 16 }}>
          <label htmlFor="photo-upload" className="flex-none cursor-pointer" style={{ opacity: photoBusy ? 0.5 : 1 }}
            aria-label="Choose a profile photo">
            <Avatar name={`${formData.firstName} ${formData.lastName}`.trim()} photoUrl={profilePhoto} size={76} />
          </label>
          <input
            id="photo-upload"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handlePhotoChange}
            disabled={photoBusy}
            className="hidden"
          />
          <div className="flex-1 min-w-0">
            <p style={{ fontSize: 15, color: 'var(--color-text-primary)' }}>Profile photo</p>
            {/* Honest about what the server actually accepts: the bucket
                rejects GIF, and caps at 2 MB after the client resizes. */}
            <p style={{ fontSize: 12, marginTop: 2, lineHeight: 1.45, color: 'var(--color-text-muted)' }}>
              JPG, PNG or WebP. Large photos are resized automatically.
            </p>
            <div className="flex items-center" style={{ gap: 16, marginTop: 8, fontSize: 13 }}>
              <label htmlFor="photo-upload" className="cursor-pointer" style={{ color: 'var(--color-secondary)' }}>
                {photoBusy ? 'Uploading…' : profilePhoto ? 'Change photo' : 'Choose photo'}
              </label>
              {profilePhoto && !photoBusy && (
                <button type="button" onClick={handleRemovePhoto} style={{ color: 'var(--color-text-secondary)' }}>
                  Remove
                </button>
              )}
            </div>
          </div>
        </section>

        <div className="rule" style={{ marginTop: -8 }} />

        {/* Name */}
        <section className="flex flex-col" style={{ gap: 14 }}>
          <SectionHead title="Name" />
          <div className="grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
            <div>
              <Field label="First name">
                <TextInput type="text" name="firstName" autoComplete="given-name" value={formData.firstName}
                  onChange={handleChange} style={edge('firstName')} />
              </Field>
              {errors.firstName && <FieldError>{errors.firstName}</FieldError>}
            </div>
            <div>
              <Field label="Last name">
                <TextInput type="text" name="lastName" autoComplete="family-name" value={formData.lastName}
                  onChange={handleChange} style={edge('lastName')} />
              </Field>
              {errors.lastName && <FieldError>{errors.lastName}</FieldError>}
            </div>
          </div>
        </section>

        {/* Contact */}
        <section className="flex flex-col" style={{ gap: 14 }}>
          <SectionHead title="Contact" />
          <div>
            {/* Read-only here because this is the login identity: changing it
                needs a password check and an email confirmation round-trip,
                which is a screen of its own. The hint used to say "Ask the
                front desk" — they had no way to do it either. */}
            <Field label="Email address">
              <TextInput type="email" name="email" value={formData.email} readOnly disabled
                className="cursor-not-allowed" style={{ color: 'var(--color-text-secondary)' }} />
            </Field>
            <button type="button" onClick={() => navigate('/member/change-email')}
              style={{ fontSize: 13, marginTop: 8, color: 'var(--color-primary-300)' }}>
              Change email
            </button>
          </div>
          <div>
            <Field label="Phone number">
              <TextInput type="tel" name="phone" autoComplete="tel" value={formData.phone} onChange={handleChange}
                placeholder="+63 XXX XXX XXXX" style={edge('phone')} />
            </Field>
            {errors.phone && <FieldError>{errors.phone}</FieldError>}
          </div>
        </section>

        {/* Password */}
        <section className="flex flex-col" style={{ gap: 14 }}>
          <SectionHead title="Password" meta="Leave blank to keep it" />
          <div>
            <Field label="Current password">
              <TextInput type="password" name="currentPassword" autoComplete="current-password"
                value={formData.currentPassword} onChange={handleChange} style={edge('currentPassword')} />
            </Field>
            {errors.currentPassword && <FieldError>{errors.currentPassword}</FieldError>}
          </div>
          <div>
            <Field label="New password" hint="At least 8 characters.">
              <TextInput type="password" name="newPassword" autoComplete="new-password"
                value={formData.newPassword} onChange={handleChange} style={edge('newPassword')} />
            </Field>
            {errors.newPassword && <FieldError>{errors.newPassword}</FieldError>}
          </div>
          <div>
            <Field label="Confirm new password">
              <TextInput type="password" name="confirmPassword" autoComplete="new-password"
                value={formData.confirmPassword} onChange={handleChange} style={edge('confirmPassword')} />
            </Field>
            {errors.confirmPassword && <FieldError>{errors.confirmPassword}</FieldError>}
          </div>
        </section>

        <NocButton type="submit" variant="action" disabled={isLoading} className="w-full">
          {isLoading ? 'Saving…' : 'Save changes'}
        </NocButton>
      </form>
    </Page>
  );
}
