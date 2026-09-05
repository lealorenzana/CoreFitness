import { motion } from 'framer-motion';
import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Badge from '../components/ui/Badge';
import Avatar from '../components/ui/Avatar';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import TimePicker from '../components/ui/TimePicker';
import FormField from '../components/ui/FormField';
import {
  User, Shield, Building2, CreditCard, UserPlus, Eye, EyeOff, ChevronRight,
  UserX, UserCheck, Archive, Camera, Trash2, Check,
} from 'lucide-react';
import { showToast } from '../utils/toast';
import { supabase } from '../lib/supabaseClient';
import { updateProfile } from '../lib/api/profiles';
import { uploadMyAvatar, removeMyAvatar } from '../lib/api/avatars';
import ImageField from '../components/ui/ImageField';
import { publishBranding, DEFAULT_BRANDING } from '../hooks/useBranding';
import {
  getGymSettings, updateGymSettings, changePassword, listStaffAccounts, createStaffAccount,
  setStaffStatus,
} from '../lib/api/settings';
import type { ProfileRow, ProfileStatus } from '../types/db';

/**
 * Admin settings — every tab here writes to the database.
 *
 * The previous version was localStorage throughout, and three parts of it were
 * actively misleading rather than merely fake:
 *
 *   - "Change password" did `localStorage.setItem('admin_password', next)`. It
 *     stored the new password in plaintext and never touched the real Supabase
 *     Auth credential, so an admin who rotated their password had changed
 *     nothing.
 *   - "Create admin account" wrote to `localStorage['admin_accounts']`. No auth
 *     user existed; the account could not log in.
 *   - A second membership-plans editor lived here, separate from the real
 *     /membership-plans page. Editing plans here reached nothing, while the real
 *     plans kept billing members.
 *
 * Also removed: Appearance, Notifications preferences and Backup & Data. All
 * three read and wrote localStorage keys that nothing else consumed — the theme
 * never changed, no notification setting was honoured, and "backup" exported
 * nothing. They are gone rather than left as buttons that appear to work.
 */

type TabId = 'profile' | 'gym' | 'security' | 'staff';

const VIOLET = 'var(--color-primary)';
const TEXT_MUTED = 'var(--color-text-muted)';

const TABS: { id: TabId; label: string; icon: typeof User }[] = [
  { id: 'profile', label: 'My Profile', icon: User },
  { id: 'gym', label: 'Gym Information', icon: Building2 },
  { id: 'security', label: 'Security', icon: Shield },
  { id: 'staff', label: 'Staff Accounts', icon: UserPlus },
];

function Field({
  label, value, onChange, type = 'text', placeholder, required, hint, error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
  hint?: string;
  error?: string;
}) {
  return (
    <FormField label={label} required={required} hint={hint} error={error}>
      <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </FormField>
  );
}

/** What a password must clear, shown while it's being typed rather than after. */
function passwordChecks(pw: string) {
  return [
    { ok: pw.length >= 8, label: 'At least 8 characters' },
    { ok: /[a-z]/.test(pw) && /[A-Z]/.test(pw), label: 'Upper and lower case' },
    { ok: /\d/.test(pw), label: 'A number' },
  ];
}

export default function Settings() {
  const [activeTab, setActiveTab] = useState<TabId>('profile');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [me, setMe] = useState<ProfileRow | null>(null);
  const [profileForm, setProfileForm] = useState({ firstName: '', lastName: '', phone: '' });

  const [activityOptions, setActivityOptions] = useState<string[]>([]);
  const [newActivity, setNewActivity] = useState('');
  const [gymForm, setGymForm] = useState({
    gym_name: '', address: '', phone: '', email: '', opening_time: '', closing_time: '',
    // Branding (0067). Blank means "not chosen", which renders the bundled
    // default — never a blank space where a logo should be.
    short_name: '', tagline: '', logo_url: '',
  });

  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [showPw, setShowPw] = useState(false);

  const [accounts, setAccounts] = useState<ProfileRow[]>([]);
  const [newStaff, setNewStaff] = useState({ firstName: '', lastName: '', email: '', phone: '', password: '' });
  const [showStaffPw, setShowStaffPw] = useState(false);
  const [staffAction, setStaffAction] = useState<{ account: ProfileRow; next: ProfileStatus } | null>(null);

  /** Who last changed the gym information, and when — already stored, never shown. */
  const [gymAudit, setGymAudit] = useState<{ at: string; by: string | null } | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const [profileRes, gym, staff] = await Promise.all([
        user ? supabase.from('profiles').select('*').eq('id', user.id).single() : null,
        getGymSettings().catch(() => null),
        listStaffAccounts().catch(() => []),
      ]);

      const profile = (profileRes?.data ?? null) as ProfileRow | null;
      if (profile) {
        setMe(profile);
        setProfileForm({
          firstName: profile.first_name,
          lastName: profile.last_name,
          phone: profile.phone ?? '',
        });
      }
      if (gym) {
        setGymForm({
          gym_name: gym.gym_name ?? '',
          address: gym.address ?? '',
          phone: gym.phone ?? '',
          email: gym.email ?? '',
          opening_time: gym.opening_time ?? '',
          closing_time: gym.closing_time ?? '',
          short_name: gym.short_name ?? '',
          tagline: gym.tagline ?? '',
          logo_url: gym.logo_url ?? '',
        });
        setActivityOptions(gym.activity_options ?? []);
        setGymAudit({ at: gym.updated_at, by: gym.updated_by });
      }
      setAccounts(staff);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to load settings', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSaveProfile = async () => {
    if (!me) return;
    if (!profileForm.firstName.trim() || !profileForm.lastName.trim()) {
      return showToast('First and last name are required', 'error');
    }
    setSaving(true);
    try {
      await updateProfile(me.id, {
        first_name: profileForm.firstName.trim(),
        last_name: profileForm.lastName.trim(),
        phone: profileForm.phone.trim() || null,
      });
      showToast('Profile updated', 'success');
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to update profile', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveGym = async () => {
    if (!gymForm.gym_name.trim()) return showToast('Gym name is required', 'error');
    // Closing before opening is a typo, not a policy. Equal times are refused too
    // — a zero-length day would flag every class as out-of-hours on Schedule.
    if (gymForm.opening_time && gymForm.closing_time && gymForm.closing_time <= gymForm.opening_time) {
      return showToast('Closing time must be after opening time', 'error');
    }
    setSaving(true);
    try {
      await updateGymSettings({
        gym_name: gymForm.gym_name.trim(),
        address: gymForm.address.trim() || null,
        phone: gymForm.phone.trim() || null,
        email: gymForm.email.trim() || null,
        opening_time: gymForm.opening_time.trim() || null,
        closing_time: gymForm.closing_time.trim() || null,
        short_name: gymForm.short_name.trim() || null,
        tagline: gymForm.tagline.trim() || null,
        logo_url: gymForm.logo_url.trim() || null,
        activity_options: activityOptions,
      });
      // Repaint the sidebar and header now rather than on the next full reload.
      // Saving a new gym name and watching the old one stay in the corner is
      // how an admin concludes the save did not work.
      publishBranding({
        gym_name: gymForm.gym_name.trim(),
        short_name: gymForm.short_name.trim() || null,
        tagline: gymForm.tagline.trim() || null,
        logo_url: gymForm.logo_url.trim() || null,
        address: gymForm.address.trim() || null,
      });
      showToast('Gym information saved', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to save gym information', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (!pw.current || !pw.next) return showToast('Enter your current and new password', 'error');
    if (pw.next.length < 8) return showToast('New password must be at least 8 characters', 'error');
    if (pw.next !== pw.confirm) return showToast('New passwords do not match', 'error');
    setSaving(true);
    try {
      await changePassword(pw.current, pw.next);
      setPw({ current: '', next: '', confirm: '' });
      showToast('Password changed. Use it next time you sign in.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to change password', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateStaff = async () => {
    const { firstName, lastName, email, password } = newStaff;
    if (!firstName.trim() || !lastName.trim() || !email.trim() || !password) {
      return showToast('Name, email and password are required', 'error');
    }
    if (password.length < 8) return showToast('Password must be at least 8 characters', 'error');
    setSaving(true);
    try {
      await createStaffAccount({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        phone: newStaff.phone.trim() || undefined,
        password,
      });
      showToast(`${firstName} can now sign in with the password you set.`, 'success');
      setNewStaff({ firstName: '', lastName: '', email: '', phone: '', password: '' });
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to create staff account', 'error');
    } finally {
      setSaving(false);
    }
  };

  /**
   * The admin's own photo. Members and trainers have had this since 0021; the
   * admin was the only role that could not set one, so the header and every
   * "recorded by" surface fell back to initials forever.
   */
  const handlePhoto = async (file: File | undefined) => {
    if (!file) return;
    setUploadingPhoto(true);
    try {
      await uploadMyAvatar(file);
      showToast('Photo updated', 'success');
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not upload that photo', 'error');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleRemovePhoto = async () => {
    setUploadingPhoto(true);
    try {
      await removeMyAvatar();
      showToast('Photo removed', 'success');
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not remove that photo', 'error');
    } finally {
      setUploadingPhoto(false);
    }
  };

  /**
   * Suspend / reactivate / archive a staff account.
   *
   * A front-desk login takes payments and checks members in, so a colleague who
   * leaves keeping one is the same problem the trainer roster had. Nothing here
   * deletes: archive keeps every payment they recorded attributable.
   */
  const handleStaffStatus = async () => {
    if (!staffAction) return;
    const { account, next } = staffAction;
    try {
      await setStaffStatus(account.id, next);
      showToast(
        next === 'active'
          ? `${account.first_name} reactivated`
          : next === 'suspended'
            ? `${account.first_name} suspended — they can no longer sign in`
            : `${account.first_name} archived`,
        'success'
      );
      setStaffAction(null);
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not update that account', 'error');
    }
  };

  const panel = { background: 'var(--color-surface)', border: '1px solid var(--color-border)' };

  return (
    <div className="h-[calc(100vh-5rem)] flex gap-0 overflow-hidden rounded-xl" style={{ border: '1px solid var(--color-border)' }}>
      {/* Sidebar */}
      <div className="w-52 flex-shrink-0 flex flex-col py-5 px-3 overflow-y-auto"
        style={{ background: 'var(--color-surface)', borderRight: '1px solid var(--color-border)' }}>
        <h1 className="text-lg font-bold text-white mb-4 px-2">Settings</h1>
        <nav className="space-y-0.5">
          {TABS.map((t) => {
            const Icon = t.icon;
            const isActive = activeTab === t.id;
            return (
              <button key={t.id} onClick={() => setActiveTab(t.id)}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-medium transition-colors text-left"
                style={{
                  background: isActive ? 'var(--color-primary-light)' : 'transparent',
                  color: isActive ? VIOLET : 'var(--color-text-secondary)',
                }}>
                <Icon size={14} style={{ color: isActive ? VIOLET : TEXT_MUTED }} />
                {t.label}
              </button>
            );
          })}
        </nav>

        {/* Plans used to be edited here too, against localStorage. One editor only. */}
        <Link to="/membership-plans"
          className="mt-4 mx-1 flex items-center gap-2 px-3 py-2.5 rounded-xl text-[11px] font-medium"
          style={{ background: 'var(--color-bg)', color: TEXT_MUTED, border: '1px solid var(--color-border)' }}>
          <CreditCard size={13} />
          <span className="flex-1">Membership Plans</span>
          <ChevronRight size={12} />
        </Link>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6" style={{ background: 'var(--color-bg)' }}>
        {loading ? (
          <p className="text-xs" style={{ color: TEXT_MUTED }}>Loading…</p>
        ) : (
          <motion.div key={activeTab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            /* Was `max-w-xl` — 576px of form on a 1,650px page, with the rest
               left as empty background. 860px fits the two-column field rows
               without letting a single text input run the width of a monitor. */
            className="space-y-4" style={{ maxWidth: 860 }}>

            {activeTab === 'profile' && (
              <div className="rounded-xl p-5 space-y-4" style={panel}>
                <div className="flex items-center gap-4">
                  <div className="relative flex-shrink-0">
                    <Avatar name={`${me?.first_name ?? ''} ${me?.last_name ?? ''}`} photoUrl={me?.photo_url ?? null} size={56} />
                    <label data-tip="Change photo"
                      className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center cursor-pointer"
                      style={{ background: 'var(--color-primary)', color: '#fff', opacity: uploadingPhoto ? 0.5 : 1 }}>
                      <Camera size={11} />
                      <input type="file" accept="image/*" className="hidden" disabled={uploadingPhoto}
                        onChange={(e) => handlePhoto(e.target.files?.[0])} />
                    </label>
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-sm font-bold text-white">My Profile</h2>
                    <p className="text-[10px] mt-0.5 truncate" style={{ color: TEXT_MUTED }}>
                      Signed in as {me?.email} · {me?.role}
                    </p>
                    {me?.photo_url && (
                      <button onClick={handleRemovePhoto} disabled={uploadingPhoto}
                        className="text-[10px] mt-1 flex items-center gap-1" style={{ color: 'var(--color-secondary)' }}>
                        <Trash2 size={10} /> Remove photo
                      </button>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="First Name" value={profileForm.firstName}
                    onChange={(v) => setProfileForm({ ...profileForm, firstName: v })} />
                  <Field label="Last Name" value={profileForm.lastName}
                    onChange={(v) => setProfileForm({ ...profileForm, lastName: v })} />
                </div>
                <Field label="Phone" value={profileForm.phone} placeholder="+63 900 000 0000"
                  onChange={(v) => setProfileForm({ ...profileForm, phone: v })} />
                <p className="text-[10px]" style={{ color: TEXT_MUTED }}>
                  Email and role are not editable here — changing either affects sign-in and access.
                </p>
                <Button variant="primary" onClick={handleSaveProfile} disabled={saving}>
                  {saving ? 'Saving…' : 'Save Profile'}
                </Button>
              </div>
            )}

            {activeTab === 'gym' && (
              <div className="rounded-xl p-5 space-y-4" style={panel}>
                <div>
                  <h2 className="text-sm font-bold text-white">Gym Information</h2>
                  <p className="text-[10px] mt-0.5" style={{ color: TEXT_MUTED }}>
                    Shared across the system — not just this browser.
                  </p>
                  {/* ── Branding ─────────────────────────────────────────
                      The sidebar hardcoded "CORE FITNESS", a tagline and a logo
                      file, and the header hardcoded the name a second time.
                      `gym_name` had been editable here since 0013 and changed
                      nothing on screen. All four are one source now. */}
                  <div className="pt-4 mt-4" style={{ borderTop: '1px solid var(--color-border)' }}>
                    <h3 className="text-xs font-bold text-white">Branding</h3>
                    <p className="text-[10px] mt-0.5 mb-3" style={{ color: TEXT_MUTED }}>
                      What the sidebar and the header show. Leave anything blank
                      to use the built-in default.
                    </p>

                    <div className="grid grid-cols-2 gap-3">
                      <Field
                        label="Short name"
                        value={gymForm.short_name}
                        onChange={(short_name) => setGymForm({ ...gymForm, short_name })}
                        placeholder={DEFAULT_BRANDING.shortName}
                        hint="Shown on the collapsed menu. Blank derives it from the gym name."
                      />
                      <Field
                        label="Tagline"
                        value={gymForm.tagline}
                        onChange={(tagline) => setGymForm({ ...gymForm, tagline })}
                        placeholder={DEFAULT_BRANDING.tagline ?? ''}
                        hint="The small line under the name. Blank hides it."
                      />
                    </div>

                    <div className="mt-3" style={{ maxWidth: 260 }}>
                      <ImageField
                        value={gymForm.logo_url}
                        onChange={(logo_url) => setGymForm({ ...gymForm, logo_url })}
                        kind="resources"
                        label="Logo"
                        aspect={1}
                        hint="Square works best — it renders in a circle. Blank uses the built-in logo."
                      />
                    </div>
                  </div>

                  {/* `updated_at` / `updated_by` have been recorded since 0013 and
                      never shown. Who last changed the gym's phone number is
                      exactly the question you ask when it turns out to be wrong. */}
                  {gymAudit && (
                    <p className="text-[10px] mt-1.5" style={{ color: TEXT_MUTED }}>
                      Last changed {new Date(gymAudit.at).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}
                      {gymAudit.by === me?.id
                        ? ' by you'
                        : gymAudit.by
                          ? ` by ${accounts.find((a) => a.id === gymAudit.by)?.first_name ?? 'another admin'}`
                          : ''}
                    </p>
                  )}
                </div>
                {/* Each field says where it shows up. Until now all four were
                    written here and read by nothing — the receipt is the first
                    thing that consumes them. */}
                <Field label="Gym Name" required value={gymForm.gym_name}
                  hint="Printed at the top of every payment receipt."
                  onChange={(v) => setGymForm({ ...gymForm, gym_name: v })} />
                <Field label="Address" value={gymForm.address} placeholder="Mamburao, Occidental Mindoro"
                  hint="Appears on receipts."
                  onChange={(v) => setGymForm({ ...gymForm, address: v })} />
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Phone" value={gymForm.phone} placeholder="+63 900 000 0000"
                    hint="Receipts show this as the contact number."
                    onChange={(v) => setGymForm({ ...gymForm, phone: v })} />
                  <Field label="Email" type="email" value={gymForm.email}
                    onChange={(v) => setGymForm({ ...gymForm, email: v })} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <FormField label="Opens">
                    <TimePicker value={gymForm.opening_time.slice(0, 5)}
                      onChange={(v) => setGymForm({ ...gymForm, opening_time: v })} />
                  </FormField>
                  <FormField label="Closes"
                    error={
                      gymForm.opening_time && gymForm.closing_time && gymForm.closing_time <= gymForm.opening_time
                        ? 'Must be after opening.'
                        : undefined
                    }>
                    <TimePicker value={gymForm.closing_time.slice(0, 5)}
                      onChange={(v) => setGymForm({ ...gymForm, closing_time: v })} />
                  </FormField>
                </div>
                <p className="text-[10px] -mt-1" style={{ color: TEXT_MUTED }}>
                  Opening hours flag classes scheduled outside them on the Schedule page.
                </p>
                {/* The check-in activity list. Pre-defined at the door so the
                    data can be aggregated, but defined here rather than in code
                    so it describes this gym rather than the one it was built for. */}
                <div className="rounded-xl p-3 space-y-2"
                  style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
                  <div>
                    <p className="text-xs font-semibold text-white">Check-in activities</p>
                    <p className="text-[10px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                      What the front desk can tag a check-in with. Members can always check in without one.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {activityOptions.map((opt) => (
                      <span key={opt} className="px-2.5 py-1 rounded-full text-[10px] font-semibold flex items-center gap-1.5"
                        style={{ background: 'var(--color-secondary-light)', color: 'var(--color-secondary)' }}>
                        {opt}
                        <button onClick={() => setActivityOptions(activityOptions.filter((a) => a !== opt))}
                          data-tip={`Remove ${opt}`} className="opacity-70 hover:opacity-100">×</button>
                      </span>
                    ))}
                    {activityOptions.length === 0 && (
                      <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                        None — the picker is hidden at check-in.
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <input value={newActivity} onChange={(e) => setNewActivity(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key !== 'Enter') return;
                        const v = newActivity.trim();
                        // Silently ignoring a duplicate is friendlier than an error
                        // and keeps the list from growing near-identical entries.
                        if (v && !activityOptions.includes(v)) setActivityOptions([...activityOptions, v]);
                        setNewActivity('');
                      }}
                      placeholder="Add an activity, then press Enter"
                      className="flex-1 px-3 py-2 rounded-xl text-xs text-white"
                      style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }} />
                  </div>
                </div>

                <Button variant="primary" onClick={handleSaveGym} disabled={saving}>
                  {saving ? 'Saving…' : 'Save Gym Information'}
                </Button>
              </div>
            )}

            {activeTab === 'security' && (
              <div className="rounded-xl p-5 space-y-4" style={panel}>
                <div>
                  <h2 className="text-sm font-bold text-white">Change Password</h2>
                  <p className="text-[10px] mt-0.5" style={{ color: TEXT_MUTED }}>
                    Changes your real sign-in password.
                  </p>
                </div>
                <Field label="Current Password" type={showPw ? 'text' : 'password'} value={pw.current}
                  onChange={(v) => setPw({ ...pw, current: v })} />
                <Field label="New Password" type={showPw ? 'text' : 'password'} value={pw.next}
                  onChange={(v) => setPw({ ...pw, next: v })} />
                <Field label="Confirm New Password" type={showPw ? 'text' : 'password'} value={pw.confirm}
                  error={pw.confirm && pw.confirm !== pw.next ? 'Does not match.' : undefined}
                  onChange={(v) => setPw({ ...pw, confirm: v })} />

                {/* Requirements shown while typing rather than as a rejection
                    after submitting — the old page only told you the rule once
                    you had already got it wrong. */}
                {pw.next.length > 0 && (
                  <div className="rounded-xl p-3 space-y-1"
                    style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
                    {passwordChecks(pw.next).map((c) => (
                      <p key={c.label} className="text-[10px] flex items-center gap-1.5"
                        style={{ color: c.ok ? 'var(--color-primary)' : TEXT_MUTED }}>
                        <Check size={10} style={{ opacity: c.ok ? 1 : 0.3 }} /> {c.label}
                      </p>
                    ))}
                  </div>
                )}

                <button type="button" onClick={() => setShowPw(!showPw)}
                  className="flex items-center gap-1.5 text-[10px]" style={{ color: TEXT_MUTED }}>
                  {showPw ? <EyeOff size={12} /> : <Eye size={12} />} {showPw ? 'Hide' : 'Show'} passwords
                </button>
                <p className="text-[10px]" style={{ color: TEXT_MUTED }}>
                  Changing this signs you out of nothing — but you will need the new password next time.
                </p>
                <Button variant="primary" onClick={handleChangePassword} disabled={saving}>
                  {saving ? 'Changing…' : 'Change Password'}
                </Button>
              </div>
            )}

            {activeTab === 'staff' && (
              <>
                <div className="rounded-xl p-5 space-y-3" style={panel}>
                  <h2 className="text-sm font-bold text-white">Accounts</h2>
                  {accounts.length === 0 ? (
                    <p className="text-[11px]" style={{ color: TEXT_MUTED }}>No accounts found.</p>
                  ) : (
                    <div className="space-y-2">
                      {accounts.map((a) => {
                        const isMe = a.id === me?.id;
                        return (
                        <div key={a.id} className="flex items-center gap-3 p-3 rounded-xl group"
                          style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
                          <Avatar name={`${a.first_name} ${a.last_name}`} photoUrl={a.photo_url} size={32} />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-white truncate">
                              {a.first_name} {a.last_name}
                              {/* Without this you cannot tell which row is your own
                                  account — and the one row you must not suspend. */}
                              {isMe && <span className="ml-1.5 font-normal" style={{ color: TEXT_MUTED }}>(you)</span>}
                            </p>
                            <p className="text-[10px] truncate" style={{ color: TEXT_MUTED }}>{a.email}</p>
                          </div>
                          {a.status !== 'active' && (
                            <Badge variant="Suspended" className="!text-[9px] !px-2 !py-0.5">{a.status.replace('_', ' ')}</Badge>
                          )}
                          <Badge variant={a.role === 'admin' ? 'Premium' : 'Standard'} className="!text-[9px] !px-2 !py-0.5 capitalize">
                            {a.role}
                          </Badge>
                          {/* Never offered on your own account: suspending yourself
                              locks you out of the only screen that could undo it. */}
                          {/* Always visible: these are rare but consequential,
                              and a control you have to hover to discover is one
                              the front desk will not find under pressure. */}
                          {!isMe && (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => setStaffAction({ account: a, next: a.status === 'suspended' ? 'active' : 'suspended' })}
                                data-tip={a.status === 'suspended' ? 'Reactivate' : 'Suspend'}
                                className="p-1.5 rounded-lg" style={{ color: 'var(--color-secondary)' }}>
                                {a.status === 'suspended' ? <UserCheck size={12} /> : <UserX size={12} />}
                              </button>
                              <button onClick={() => setStaffAction({ account: a, next: 'archived' })}
                                data-tip="Archive" className="p-1.5 rounded-lg" style={{ color: 'var(--color-secondary)' }}>
                                <Archive size={12} />
                              </button>
                            </div>
                          )}
                        </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="rounded-xl p-5 space-y-4" style={panel}>
                  <div>
                    <h2 className="text-sm font-bold text-white">Add Front-Desk Staff</h2>
                    <p className="text-[10px] mt-0.5" style={{ color: TEXT_MUTED }}>
                      Staff can take payments, check members in and extend memberships. They cannot
                      change plan pricing, manage trainers, or create accounts.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="First Name" value={newStaff.firstName}
                      onChange={(v) => setNewStaff({ ...newStaff, firstName: v })} />
                    <Field label="Last Name" value={newStaff.lastName}
                      onChange={(v) => setNewStaff({ ...newStaff, lastName: v })} />
                  </div>
                  <Field label="Email" type="email" value={newStaff.email}
                    onChange={(v) => setNewStaff({ ...newStaff, email: v })} />
                  <Field label="Phone (optional)" value={newStaff.phone}
                    onChange={(v) => setNewStaff({ ...newStaff, phone: v })} />
                  <Field label="Password" type={showStaffPw ? 'text' : 'password'} value={newStaff.password}
                    placeholder="At least 8 characters"
                    onChange={(v) => setNewStaff({ ...newStaff, password: v })} />
                  <button type="button" onClick={() => setShowStaffPw(!showStaffPw)}
                    className="flex items-center gap-1.5 text-[10px]" style={{ color: TEXT_MUTED }}>
                    {showStaffPw ? <EyeOff size={12} /> : <Eye size={12} />} {showStaffPw ? 'Hide' : 'Show'} password
                  </button>
                  <Button variant="primary" onClick={handleCreateStaff} disabled={saving}>
                    {saving ? 'Creating…' : 'Create Staff Account'}
                  </Button>
                </div>
              </>
            )}
          </motion.div>
        )}
      </div>

      <ConfirmDialog
        isOpen={!!staffAction}
        onClose={() => setStaffAction(null)}
        onConfirm={handleStaffStatus}
        title={
          staffAction?.next === 'active' ? 'Reactivate Account'
            : staffAction?.next === 'suspended' ? 'Suspend Account'
              : 'Archive Account'
        }
        message={
          staffAction
            ? staffAction.next === 'active'
              ? `Let ${staffAction.account.first_name} sign in again? They get their front-desk access back immediately.`
              : staffAction.next === 'suspended'
                ? `Suspend ${staffAction.account.first_name}? A front-desk login takes payments and checks members in, so this stops both at once. Every payment they have already recorded stays exactly as it is, and this is reversible.`
                : `Archive ${staffAction.account.first_name}? They drop off this list and can no longer sign in. Nothing they recorded is deleted — every payment stays attributable to them.`
            : ''
        }
        confirmText={
          staffAction?.next === 'active' ? 'Reactivate'
            : staffAction?.next === 'suspended' ? 'Suspend' : 'Archive'
        }
        type={staffAction?.next === 'active' ? 'info' : staffAction?.next === 'suspended' ? 'warning' : 'danger'}
      />
    </div>
  );
}
