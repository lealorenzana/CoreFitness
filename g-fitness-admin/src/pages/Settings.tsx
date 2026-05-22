import { motion } from 'framer-motion';
import { useState } from 'react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Modal from '../components/ui/Modal';
import {
  Settings as SettingsIcon, User, Bell, Shield, Palette, Globe, Save,
  UserPlus, X, Eye, EyeOff,
} from 'lucide-react';
import { showToast } from '../utils/toast';

type TabId = 'profile' | 'notifications' | 'security' | 'appearance' | 'admins';

const VIOLET = 'var(--color-primary)';
const TEXT_MUTED = 'var(--color-text-muted)';
const BORDER = 'var(--color-border)';

export default function Settings() {
  const [activeTab, setActiveTab] = useState<TabId>('profile');

  const [profileData, setProfileData] = useState(() => {
    const saved = localStorage.getItem('admin_profile');
    return saved ? JSON.parse(saved) : { firstName: 'Admin', lastName: 'User', email: 'admin@gfitness.com', phone: '+63 912 345 6789', role: 'Administrator' };
  });

  const [notifications, setNotifications] = useState(() => {
    const saved = localStorage.getItem('admin_notifications');
    return saved ? JSON.parse(saved) : { newMember: true, paymentReceived: true, membershipExpiring: true, lowAttendance: true, systemUpdates: true };
  });

  const [passwordData, setPasswordData] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [showPw, setShowPw] = useState({ current: false, new: false, confirm: false });

  const [appearance, setAppearance] = useState(() => {
    const saved = localStorage.getItem('admin_appearance');
    return saved ? JSON.parse(saved) : { theme: 'Dark', language: 'English' };
  });

  const [admins, setAdmins] = useState<any[]>(() => {
    const saved = localStorage.getItem('admin_accounts');
    return saved ? JSON.parse(saved) : [
      { id: '1', name: 'Admin User', email: 'admin@gfitness.com', role: 'Super Admin', createdAt: '2024-01-01' },
    ];
  });
  const [showCreateAdmin, setShowCreateAdmin] = useState(false);
  const [newAdmin, setNewAdmin] = useState({ name: '', email: '', role: 'Staff', password: '' });
  const [showNewPw, setShowNewPw] = useState(false);

  const handleSaveProfile = () => {
    localStorage.setItem('admin_profile', JSON.stringify(profileData));
    showToast('Profile updated', 'success');
  };
  const handleSaveNotifications = () => {
    localStorage.setItem('admin_notifications', JSON.stringify(notifications));
    showToast('Notification preferences saved', 'success');
  };
  const handleChangePassword = () => {
    if (!passwordData.currentPassword || !passwordData.newPassword || !passwordData.confirmPassword)
      return showToast('Please fill in all password fields', 'error');
    if (passwordData.newPassword !== passwordData.confirmPassword)
      return showToast('New passwords do not match', 'error');
    if (passwordData.newPassword.length < 6)
      return showToast('Password must be at least 6 characters', 'error');
    localStorage.setItem('admin_password', passwordData.newPassword);
    setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
    showToast('Password updated', 'success');
  };
  const handleSaveAppearance = () => {
    localStorage.setItem('admin_appearance', JSON.stringify(appearance));
    showToast('Appearance saved', 'success');
  };
  const handleCreateAdmin = () => {
    if (!newAdmin.name.trim() || !newAdmin.email.trim() || !newAdmin.password.trim())
      return showToast('Name, email and password are required', 'error');
    if (!/\S+@\S+\.\S+/.test(newAdmin.email))
      return showToast('Invalid email address', 'error');
    if (newAdmin.password.length < 6)
      return showToast('Password must be at least 6 characters', 'error');
    const created = { id: `admin-${Date.now()}`, name: newAdmin.name, email: newAdmin.email, role: newAdmin.role, createdAt: new Date().toISOString().split('T')[0] };
    const updated = [...admins, created];
    setAdmins(updated);
    localStorage.setItem('admin_accounts', JSON.stringify(updated));
    setNewAdmin({ name: '', email: '', role: 'Staff', password: '' });
    setShowCreateAdmin(false);
    showToast(`Admin account created for ${created.name}`, 'success');
  };
  const handleDeleteAdmin = (id: string) => {
    if (id === '1') return showToast('Cannot delete the primary admin account', 'error');
    const updated = admins.filter((a) => a.id !== id);
    setAdmins(updated);
    localStorage.setItem('admin_accounts', JSON.stringify(updated));
    showToast('Admin account removed', 'success');
  };

  const tabs: { id: TabId; label: string; icon: any }[] = [
    { id: 'profile',       label: 'Profile',         icon: User },
    { id: 'notifications', label: 'Notifications',   icon: Bell },
    { id: 'security',      label: 'Security',        icon: Shield },
    { id: 'appearance',    label: 'Appearance',      icon: Palette },
    { id: 'admins',        label: 'Admin Accounts',  icon: UserPlus },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <SettingsIcon size={22} style={{ color: VIOLET }} /> Settings
        </h1>
        <p className="text-sm mt-1" style={{ color: TEXT_MUTED }}>
          Manage your account and system preferences
        </p>
      </motion.div>

      {/* Tab strip — pill style like PeakPlanner */}
      <div className="flex gap-2 flex-wrap">
        {tabs.map((t) => {
          const Icon = t.icon;
          const isActive = activeTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold transition-colors"
              style={{
                background: isActive ? VIOLET : 'transparent',
                color: isActive ? '#fff' : 'var(--color-text-secondary)',
                border: `1px solid ${isActive ? VIOLET : BORDER}`,
              }}
            >
              <Icon size={13} /> {t.label}
            </button>
          );
        })}
      </div>

      {/* Profile */}
      {activeTab === 'profile' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
          {/* Profile section */}
          <div className="flex gap-8">
            <div className="w-48 flex-shrink-0">
              <h2 className="text-base font-semibold text-white">Profile</h2>
              <p className="text-xs mt-1" style={{ color: TEXT_MUTED }}>Set your account details</p>
            </div>
            <div className="flex-1 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[11px] block mb-1.5" style={{ color: TEXT_MUTED }}>Name</label>
                  <Input value={profileData.firstName} onChange={(e) => setProfileData({ ...profileData, firstName: e.target.value })} />
                </div>
                <div>
                  <label className="text-[11px] block mb-1.5" style={{ color: TEXT_MUTED }}>Surname</label>
                  <Input value={profileData.lastName} onChange={(e) => setProfileData({ ...profileData, lastName: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="text-[11px] block mb-1.5" style={{ color: TEXT_MUTED }}>Email</label>
                <Input type="email" value={profileData.email} onChange={(e) => setProfileData({ ...profileData, email: e.target.value })} />
              </div>
              <div>
                <label className="text-[11px] block mb-1.5" style={{ color: TEXT_MUTED }}>Phone</label>
                <Input type="tel" value={profileData.phone} onChange={(e) => setProfileData({ ...profileData, phone: e.target.value })} />
              </div>
            </div>
            {/* Avatar */}
            <div className="flex-shrink-0 flex flex-col items-center gap-2">
              <div className="w-16 h-16 rounded-full flex items-center justify-center text-white font-bold text-lg"
                style={{ background: VIOLET }}>
                {profileData.firstName[0]}{profileData.lastName[0]}
              </div>
              <button className="text-[10px] font-semibold px-3 py-1 rounded-full"
                style={{ background: 'var(--color-surface-raised)', border: `1px solid ${BORDER}`, color: 'var(--color-text-secondary)' }}>
                Edit photo
              </button>
            </div>
          </div>

          <div style={{ borderTop: `1px solid ${BORDER}` }} />

          {/* Contact & Role section */}
          <div className="flex gap-8">
            <div className="w-48 flex-shrink-0">
              <h2 className="text-base font-semibold text-white">Role & Access</h2>
              <p className="text-xs mt-1" style={{ color: TEXT_MUTED }}>Your admin role and permissions</p>
            </div>
            <div className="flex-1 space-y-4">
              <div>
                <label className="text-[11px] block mb-1.5" style={{ color: TEXT_MUTED }}>Role</label>
                <Input value={profileData.role} disabled />
              </div>
              <Button variant="secondary" onClick={handleSaveProfile}>
                <Save size={14} /> Save Changes
              </Button>
            </div>
          </div>
        </motion.div>
      )}

      {/* Notifications */}
      {activeTab === 'notifications' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <div className="flex gap-8">
            <div className="w-48 flex-shrink-0">
              <h2 className="text-base font-semibold text-white">Notifications</h2>
              <p className="text-xs mt-1" style={{ color: TEXT_MUTED }}>Choose what alerts you receive</p>
            </div>
            <div className="flex-1 space-y-2">
              {[
                { key: 'newMember',          label: 'New Member Registration',  desc: 'Get notified when a new member joins' },
                { key: 'paymentReceived',    label: 'Payment Received',         desc: 'Receive alerts for successful payments' },
                { key: 'membershipExpiring', label: 'Membership Expiring',      desc: 'Alert when memberships are about to expire' },
                { key: 'lowAttendance',      label: 'Low Attendance',           desc: 'Notify when member attendance drops' },
                { key: 'systemUpdates',      label: 'System Updates',           desc: 'Important system and feature updates' },
              ].map((item) => {
                const enabled = notifications[item.key as keyof typeof notifications];
                return (
                  <div key={item.key} className="flex items-center justify-between p-3 rounded-xl"
                    style={{ background: 'var(--color-surface-raised)', border: `1px solid ${BORDER}` }}>
                    <div>
                      <p className="text-sm text-white font-medium">{item.label}</p>
                      <p className="text-[11px]" style={{ color: TEXT_MUTED }}>{item.desc}</p>
                    </div>
                    <button
                      onClick={() => setNotifications({ ...notifications, [item.key]: !enabled })}
                      className="relative inline-block w-10 h-5 rounded-full transition-colors flex-shrink-0"
                      style={{ background: enabled ? VIOLET : 'var(--color-border)' }}
                    >
                      <span
                        className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform"
                        style={{ transform: enabled ? 'translateX(20px)' : 'translateX(0)' }}
                      />
                    </button>
                  </div>
                );
              })}
              <div className="pt-3">
                <Button variant="secondary" onClick={handleSaveNotifications}>
                  <Save size={14} /> Save Preferences
                </Button>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* Security */}
      {activeTab === 'security' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <div className="flex gap-8">
            <div className="w-48 flex-shrink-0">
              <h2 className="text-base font-semibold text-white">Change Password</h2>
              <p className="text-xs mt-1" style={{ color: TEXT_MUTED }}>Update your account password</p>
            </div>
            <div className="flex-1 space-y-4 max-w-md">
              {[
                { label: 'Current Password',     key: 'currentPassword', show: showPw.current,  toggle: () => setShowPw((p) => ({ ...p, current: !p.current })) },
                { label: 'New Password',         key: 'newPassword',     show: showPw.new,      toggle: () => setShowPw((p) => ({ ...p, new: !p.new })) },
                { label: 'Confirm New Password', key: 'confirmPassword', show: showPw.confirm,  toggle: () => setShowPw((p) => ({ ...p, confirm: !p.confirm })) },
              ].map((f) => (
                <div key={f.key}>
                  <label className="text-[11px] block mb-1.5" style={{ color: TEXT_MUTED }}>{f.label}</label>
                  <div className="relative">
                    <Input type={f.show ? 'text' : 'password'} placeholder="••••••••"
                      value={(passwordData as any)[f.key]}
                      onChange={(e) => setPasswordData({ ...passwordData, [f.key]: e.target.value })}
                      className="pr-10" />
                    <button type="button" onClick={f.toggle}
                      className="absolute right-3 top-1/2 -translate-y-1/2"
                      style={{ color: TEXT_MUTED }}>
                      {f.show ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>
              ))}
              <Button variant="secondary" onClick={handleChangePassword}>Update Password</Button>
            </div>
          </div>
        </motion.div>
      )}

      {/* Appearance */}
      {activeTab === 'appearance' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <div className="flex gap-8">
            <div className="w-48 flex-shrink-0">
              <h2 className="text-base font-semibold text-white">Appearance</h2>
              <p className="text-xs mt-1" style={{ color: TEXT_MUTED }}>Customize the look and feel</p>
            </div>
            <div className="flex-1 space-y-6 max-w-xl">
              <div>
                <label className="text-[11px] block mb-2" style={{ color: TEXT_MUTED }}>Theme</label>
                <div className="grid grid-cols-3 gap-2">
                  {['Dark', 'Light', 'Auto'].map((theme) => (
                    <button key={theme} onClick={() => setAppearance({ ...appearance, theme })}
                      className="p-3 rounded-xl text-xs font-semibold transition-colors"
                      style={{
                        background: appearance.theme === theme ? 'var(--color-primary-light)' : 'var(--color-surface-raised)',
                        border: `1px solid ${appearance.theme === theme ? VIOLET : BORDER}`,
                        color: appearance.theme === theme ? VIOLET : '#fff',
                      }}>
                      {theme}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[11px] block mb-2" style={{ color: TEXT_MUTED }}>Language</label>
                <select value={appearance.language} onChange={(e) => setAppearance({ ...appearance, language: e.target.value })}
                  className="w-full px-4 rounded-xl text-sm focus:outline-none"
                  style={{ height: 40, background: 'var(--color-surface-raised)', border: `1px solid ${BORDER}`, color: '#fff' }}>
                  <option>English</option>
                  <option>Filipino</option>
                </select>
              </div>
              <Button variant="secondary" onClick={handleSaveAppearance}>
                <Save size={14} /> Save Preferences
              </Button>
            </div>
          </div>
        </motion.div>
      )}

      {/* Admins */}
      {activeTab === 'admins' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <div className="flex gap-8">
            <div className="w-48 flex-shrink-0">
              <h2 className="text-base font-semibold text-white">Admin Accounts</h2>
              <p className="text-xs mt-1" style={{ color: TEXT_MUTED }}>Manage who has admin access</p>
            </div>
            <div className="flex-1 space-y-3">
              <div className="flex justify-end">
                <Button variant="primary" size="sm" onClick={() => setShowCreateAdmin(true)}>
                  <UserPlus size={13} /> Add New Admin
                </Button>
              </div>
              {admins.map((admin) => (
                <div key={admin.id}
                  className="flex items-center justify-between p-3 rounded-xl"
                  style={{ background: 'var(--color-surface-raised)', border: `1px solid ${BORDER}` }}>
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-[11px]"
                      style={{ background: VIOLET }}>
                      {admin.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                    </div>
                    <div>
                      <p className="text-sm text-white font-semibold">{admin.name}</p>
                      <p className="text-[11px]" style={{ color: TEXT_MUTED }}>{admin.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                      style={{ background: 'var(--color-primary-light)', color: VIOLET }}>
                      {admin.role}
                    </span>
                    {admin.id !== '1' && (
                      <button onClick={() => handleDeleteAdmin(admin.id)}
                        className="w-7 h-7 rounded-full flex items-center justify-center"
                        style={{ color: 'var(--color-secondary)', background: 'var(--color-secondary-light)' }}>
                        <X size={12} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <Modal
            isOpen={showCreateAdmin}
            onClose={() => setShowCreateAdmin(false)}
            title="Create Admin Account"
            subtitle="Grant a new user admin access"
            confirmLabel="Create Account"
            onConfirm={handleCreateAdmin}
          >
            <div className="space-y-3">
              <div>
                <label className="text-xs block mb-1.5" style={{ color: TEXT_MUTED }}>Full Name</label>
                <Input value={newAdmin.name} onChange={(e) => setNewAdmin({ ...newAdmin, name: e.target.value })}
                  placeholder="Juan Dela Cruz" />
              </div>
              <div>
                <label className="text-xs block mb-1.5" style={{ color: TEXT_MUTED }}>Email Address</label>
                <Input type="email" value={newAdmin.email} onChange={(e) => setNewAdmin({ ...newAdmin, email: e.target.value })}
                  placeholder="juan@gfitness.com" />
              </div>
              <div>
                <label className="text-xs block mb-1.5" style={{ color: TEXT_MUTED }}>Role</label>
                <select value={newAdmin.role} onChange={(e) => setNewAdmin({ ...newAdmin, role: e.target.value })}
                  className="w-full px-4 rounded-full text-sm focus:outline-none"
                  style={{ height: 40, background: 'var(--color-surface)', border: `1px solid ${BORDER}`, color: '#fff' }}>
                  <option value="Super Admin">Super Admin</option>
                  <option value="Admin">Admin</option>
                  <option value="Staff">Staff</option>
                </select>
              </div>
              <div>
                <label className="text-xs block mb-1.5" style={{ color: TEXT_MUTED }}>Password</label>
                <div className="relative">
                  <Input type={showNewPw ? 'text' : 'password'} value={newAdmin.password}
                    onChange={(e) => setNewAdmin({ ...newAdmin, password: e.target.value })}
                    placeholder="Min. 6 characters" className="pr-10" />
                  <button type="button" onClick={() => setShowNewPw(!showNewPw)}
                    className="absolute right-3 top-1/2 -translate-y-1/2"
                    style={{ color: TEXT_MUTED }}>
                    {showNewPw ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>
            </div>
          </Modal>
        </motion.div>
      )}
    </div>
  );
}
