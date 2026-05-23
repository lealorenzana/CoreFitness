import { motion } from 'framer-motion';
import { useState } from 'react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Modal from '../components/ui/Modal';
import {
  Settings as SettingsIcon, User, Bell, Shield, Palette, Globe, Save,
  UserPlus, X, Eye, EyeOff, Building2, CreditCard, Database, Clock,
  MapPin, Phone, Mail, Trash2, Download, Upload, RotateCcw,
} from 'lucide-react';
import { showToast } from '../utils/toast';

type TabId = 'profile' | 'gym' | 'membership' | 'notifications' | 'security' | 'appearance' | 'admins' | 'backup';

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

  // Gym Info
  const [gymInfo, setGymInfo] = useState(() => {
    const saved = localStorage.getItem('admin_gym_info');
    return saved ? JSON.parse(saved) : {
      name: 'Core Fitness', address: 'Mamburao, Occidental Mindoro', phone: '+63 912 345 6789',
      email: 'info@corefitness.com', openTime: '06:00', closeTime: '22:00',
      description: 'A modern fitness facility offering strength training, cardio, group classes, and personal training services.',
      maxCapacity: '50', wifiPassword: 'CoreFit2024',
    };
  });

  // Membership Plans
  const [plans, setPlans] = useState(() => {
    const saved = localStorage.getItem('admin_membership_plans');
    return saved ? JSON.parse(saved) : [
      { id: '1', name: 'Basic', price: 800, duration: '1 month', features: 'Gym access, Locker use' },
      { id: '2', name: 'Standard', price: 1500, duration: '1 month', features: 'Gym access, Locker, Group classes, 2 PT sessions' },
      { id: '3', name: 'Premium', price: 2500, duration: '1 month', features: 'Unlimited access, All classes, 8 PT sessions, Sauna' },
    ];
  });
  const [editingPlan, setEditingPlan] = useState<any>(null);

  // Backup settings
  const [autoBackup, setAutoBackup] = useState(() => {
    const saved = localStorage.getItem('admin_auto_backup');
    return saved ? JSON.parse(saved) : { enabled: true, frequency: 'daily', lastBackup: '2026-05-23 02:00 AM' };
  });

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

  const handleSaveGymInfo = () => {
    localStorage.setItem('admin_gym_info', JSON.stringify(gymInfo));
    showToast('Gym information updated', 'success');
  };

  const handleSavePlans = () => {
    localStorage.setItem('admin_membership_plans', JSON.stringify(plans));
    showToast('Membership plans saved', 'success');
  };

  const handleDeletePlan = (id: string) => {
    const updated = plans.filter((p: any) => p.id !== id);
    setPlans(updated);
    localStorage.setItem('admin_membership_plans', JSON.stringify(updated));
    showToast('Plan removed', 'success');
  };

  const handleAddPlan = () => {
    const newPlan = { id: `plan-${Date.now()}`, name: '', price: 0, duration: '1 month', features: '' };
    setPlans([...plans, newPlan]);
    setEditingPlan(newPlan);
  };

  const handleExportData = () => {
    showToast('Data exported successfully! Check your downloads folder.', 'success');
  };

  const handleClearCache = () => {
    showToast('Cache cleared successfully', 'success');
  };

  const tabs: { id: TabId; label: string; icon: any }[] = [
    { id: 'profile',       label: 'Profile',           icon: User },
    { id: 'gym',           label: 'Gym Information',   icon: Building2 },
    { id: 'membership',    label: 'Membership Plans',  icon: CreditCard },
    { id: 'notifications', label: 'Notifications',     icon: Bell },
    { id: 'security',      label: 'Security',          icon: Shield },
    { id: 'appearance',    label: 'Appearance',        icon: Palette },
    { id: 'admins',        label: 'Admin Accounts',    icon: UserPlus },
    { id: 'backup',        label: 'Backup & Data',     icon: Database },
  ];

  return (
    <div className="h-[calc(100vh-5rem)] flex gap-0 overflow-hidden rounded-xl" style={{ border: '1px solid var(--color-border)' }}>
      {/* Left Sidebar Navigation */}
      <div className="w-52 flex-shrink-0 flex flex-col py-5 px-3 overflow-y-auto"
        style={{ background: 'var(--color-surface)', borderRight: '1px solid var(--color-border)' }}>
        <h1 className="text-lg font-bold text-white mb-4 px-2">Settings</h1>
        <nav className="space-y-0.5">
          {tabs.map((t) => {
            const Icon = t.icon;
            const isActive = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-medium transition-colors text-left"
                style={{
                  background: isActive ? 'var(--color-primary-light)' : 'transparent',
                  color: isActive ? VIOLET : 'var(--color-text-secondary)',
                }}
              >
                <Icon size={14} style={{ color: isActive ? VIOLET : TEXT_MUTED }} />
                {t.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Right Content Panel */}
      <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-dark-border" style={{ background: 'var(--color-bg)' }}>

      {/* Profile */}
      {activeTab === 'profile' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5 max-w-2xl">
          <div>
            <h2 className="text-base font-bold text-white">Profile</h2>
            <p className="text-[11px]" style={{ color: TEXT_MUTED }}>Set your account details</p>
          </div>
          <div className="flex items-start gap-5">
            <div className="flex-1 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] block mb-1 uppercase font-medium" style={{ color: TEXT_MUTED }}>First Name</label>
                  <Input value={profileData.firstName} onChange={(e) => setProfileData({ ...profileData, firstName: e.target.value })} />
                </div>
                <div>
                  <label className="text-[10px] block mb-1 uppercase font-medium" style={{ color: TEXT_MUTED }}>Last Name</label>
                  <Input value={profileData.lastName} onChange={(e) => setProfileData({ ...profileData, lastName: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="text-[10px] block mb-1 uppercase font-medium" style={{ color: TEXT_MUTED }}>Email</label>
                <Input type="email" value={profileData.email} onChange={(e) => setProfileData({ ...profileData, email: e.target.value })} />
              </div>
              <div>
                <label className="text-[10px] block mb-1 uppercase font-medium" style={{ color: TEXT_MUTED }}>Phone</label>
                <Input type="tel" value={profileData.phone} onChange={(e) => setProfileData({ ...profileData, phone: e.target.value })} />
              </div>
              <div>
                <label className="text-[10px] block mb-1 uppercase font-medium" style={{ color: TEXT_MUTED }}>Role</label>
                <Input value={profileData.role} disabled />
              </div>
            </div>
            <div className="flex flex-col items-center gap-2 flex-shrink-0">
              <div className="w-16 h-16 rounded-full flex items-center justify-center text-white font-bold text-lg"
                style={{ background: VIOLET }}>
                {profileData.firstName[0]}{profileData.lastName[0]}
              </div>
              <button className="text-[9px] font-semibold px-3 py-1 rounded-full"
                style={{ background: 'var(--color-surface-raised)', border: `1px solid ${BORDER}`, color: 'var(--color-text-secondary)' }}>
                Change Photo
              </button>
            </div>
          </div>
          <Button variant="secondary" onClick={handleSaveProfile}><Save size={13} /> Save Changes</Button>
        </motion.div>
      )}

      {/* Gym Information */}
      {activeTab === 'gym' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5 max-w-2xl">
          <div>
            <h2 className="text-base font-bold text-white">Gym Information</h2>
            <p className="text-[11px]" style={{ color: TEXT_MUTED }}>Manage your gym's public details and operating hours</p>
          </div>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] block mb-1 uppercase font-medium" style={{ color: TEXT_MUTED }}>Gym Name</label>
                <Input value={gymInfo.name} onChange={(e) => setGymInfo({ ...gymInfo, name: e.target.value })} />
              </div>
              <div>
                <label className="text-[10px] block mb-1 uppercase font-medium" style={{ color: TEXT_MUTED }}>Max Capacity</label>
                <Input type="number" value={gymInfo.maxCapacity} onChange={(e) => setGymInfo({ ...gymInfo, maxCapacity: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="text-[10px] block mb-1 uppercase font-medium" style={{ color: TEXT_MUTED }}>
                <MapPin size={10} className="inline mr-1" />Address
              </label>
              <Input value={gymInfo.address} onChange={(e) => setGymInfo({ ...gymInfo, address: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] block mb-1 uppercase font-medium" style={{ color: TEXT_MUTED }}>
                  <Phone size={10} className="inline mr-1" />Phone
                </label>
                <Input value={gymInfo.phone} onChange={(e) => setGymInfo({ ...gymInfo, phone: e.target.value })} />
              </div>
              <div>
                <label className="text-[10px] block mb-1 uppercase font-medium" style={{ color: TEXT_MUTED }}>
                  <Mail size={10} className="inline mr-1" />Email
                </label>
                <Input value={gymInfo.email} onChange={(e) => setGymInfo({ ...gymInfo, email: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="text-[10px] block mb-1 uppercase font-medium" style={{ color: TEXT_MUTED }}>Description</label>
              <textarea value={gymInfo.description} onChange={(e) => setGymInfo({ ...gymInfo, description: e.target.value })}
                rows={3} className="w-full px-3 py-2 rounded-xl text-xs text-white focus:outline-none resize-none"
                style={{ background: 'var(--color-surface-raised)', border: `1px solid ${BORDER}` }} />
            </div>
          </div>

          {/* Operating Hours */}
          <div className="pt-2" style={{ borderTop: `1px solid ${BORDER}` }}>
            <h3 className="text-xs font-semibold text-white mb-3 flex items-center gap-1.5">
              <Clock size={12} style={{ color: VIOLET }} /> Operating Hours
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] block mb-1 uppercase font-medium" style={{ color: TEXT_MUTED }}>Opening Time</label>
                <Input type="time" value={gymInfo.openTime} onChange={(e) => setGymInfo({ ...gymInfo, openTime: e.target.value })} />
              </div>
              <div>
                <label className="text-[10px] block mb-1 uppercase font-medium" style={{ color: TEXT_MUTED }}>Closing Time</label>
                <Input type="time" value={gymInfo.closeTime} onChange={(e) => setGymInfo({ ...gymInfo, closeTime: e.target.value })} />
              </div>
            </div>
          </div>

          {/* WiFi */}
          <div className="pt-2" style={{ borderTop: `1px solid ${BORDER}` }}>
            <h3 className="text-xs font-semibold text-white mb-3">WiFi for Members</h3>
            <div>
              <label className="text-[10px] block mb-1 uppercase font-medium" style={{ color: TEXT_MUTED }}>WiFi Password</label>
              <Input value={gymInfo.wifiPassword} onChange={(e) => setGymInfo({ ...gymInfo, wifiPassword: e.target.value })} placeholder="Enter WiFi password" />
            </div>
          </div>

          <Button variant="secondary" onClick={handleSaveGymInfo}><Save size={13} /> Save Gym Info</Button>
        </motion.div>
      )}

      {/* Membership Plans */}
      {activeTab === 'membership' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4 max-w-2xl">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-white">Membership Plans</h2>
              <p className="text-[11px]" style={{ color: TEXT_MUTED }}>Configure pricing and plan features</p>
            </div>
            <Button variant="primary" size="sm" onClick={handleAddPlan}>
              <CreditCard size={13} /> Add Plan
            </Button>
          </div>

          <div className="space-y-3">
            {plans.map((plan: any) => (
              <div key={plan.id} className="p-4 rounded-xl"
                style={{ background: 'var(--color-surface-raised)', border: `1px solid ${BORDER}` }}>
                {editingPlan?.id === plan.id ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="text-[9px] block mb-0.5 uppercase" style={{ color: TEXT_MUTED }}>Plan Name</label>
                        <Input value={editingPlan.name} onChange={(e) => setEditingPlan({ ...editingPlan, name: e.target.value })} placeholder="e.g. Premium" />
                      </div>
                      <div>
                        <label className="text-[9px] block mb-0.5 uppercase" style={{ color: TEXT_MUTED }}>Price (₱)</label>
                        <Input type="number" value={editingPlan.price} onChange={(e) => setEditingPlan({ ...editingPlan, price: Number(e.target.value) })} />
                      </div>
                      <div>
                        <label className="text-[9px] block mb-0.5 uppercase" style={{ color: TEXT_MUTED }}>Duration</label>
                        <Input value={editingPlan.duration} onChange={(e) => setEditingPlan({ ...editingPlan, duration: e.target.value })} placeholder="1 month" />
                      </div>
                    </div>
                    <div>
                      <label className="text-[9px] block mb-0.5 uppercase" style={{ color: TEXT_MUTED }}>Features (comma-separated)</label>
                      <Input value={editingPlan.features} onChange={(e) => setEditingPlan({ ...editingPlan, features: e.target.value })} placeholder="Gym access, Locker, Classes" />
                    </div>
                    <div className="flex gap-2 pt-1">
                      <Button variant="secondary" size="sm" onClick={() => {
                        const updated = plans.map((p: any) => p.id === editingPlan.id ? editingPlan : p);
                        setPlans(updated);
                        localStorage.setItem('admin_membership_plans', JSON.stringify(updated));
                        setEditingPlan(null);
                        showToast('Plan saved', 'success');
                      }}><Save size={11} /> Save</Button>
                      <Button variant="ghost" size="sm" onClick={() => setEditingPlan(null)}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                        style={{ background: 'var(--color-primary-light)' }}>
                        <CreditCard size={16} style={{ color: VIOLET }} />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-white">{plan.name || 'Untitled Plan'}</p>
                        <p className="text-[10px]" style={{ color: TEXT_MUTED }}>₱{plan.price?.toLocaleString()} / {plan.duration}</p>
                        <p className="text-[9px] mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>{plan.features}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => setEditingPlan({ ...plan })}
                        className="p-1.5 rounded-lg" style={{ background: 'var(--color-primary-light)', color: VIOLET }}>
                        <Save size={11} />
                      </button>
                      <button onClick={() => handleDeletePlan(plan.id)}
                        className="p-1.5 rounded-lg" style={{ background: 'var(--color-secondary-light)', color: 'var(--color-secondary)' }}>
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Notifications */}
      {activeTab === 'notifications' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4 max-w-2xl">
          <div>
            <h2 className="text-base font-bold text-white">Notifications</h2>
            <p className="text-[11px]" style={{ color: TEXT_MUTED }}>Choose what alerts you receive</p>
          </div>
          <div className="space-y-2">
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
                    <p className="text-xs text-white font-medium">{item.label}</p>
                    <p className="text-[10px]" style={{ color: TEXT_MUTED }}>{item.desc}</p>
                  </div>
                  <button onClick={() => setNotifications({ ...notifications, [item.key]: !enabled })}
                    className="relative inline-block w-9 h-5 rounded-full transition-colors flex-shrink-0"
                    style={{ background: enabled ? VIOLET : 'var(--color-border)' }}>
                    <span className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform"
                      style={{ transform: enabled ? 'translateX(16px)' : 'translateX(0)' }} />
                  </button>
                </div>
              );
            })}
          </div>
          <Button variant="secondary" onClick={handleSaveNotifications}><Save size={13} /> Save Preferences</Button>
        </motion.div>
      )}

      {/* Security */}
      {activeTab === 'security' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4 max-w-md">
          <div>
            <h2 className="text-base font-bold text-white">Change Password</h2>
            <p className="text-[11px]" style={{ color: TEXT_MUTED }}>Update your account password</p>
          </div>
          <div className="space-y-3">
            {[
              { label: 'Current Password', key: 'currentPassword', show: showPw.current, toggle: () => setShowPw((p) => ({ ...p, current: !p.current })) },
              { label: 'New Password', key: 'newPassword', show: showPw.new, toggle: () => setShowPw((p) => ({ ...p, new: !p.new })) },
              { label: 'Confirm New Password', key: 'confirmPassword', show: showPw.confirm, toggle: () => setShowPw((p) => ({ ...p, confirm: !p.confirm })) },
            ].map((f) => (
              <div key={f.key}>
                <label className="text-[10px] block mb-1 uppercase font-medium" style={{ color: TEXT_MUTED }}>{f.label}</label>
                <div className="relative">
                  <Input type={f.show ? 'text' : 'password'} placeholder="••••••••"
                    value={(passwordData as any)[f.key]}
                    onChange={(e) => setPasswordData({ ...passwordData, [f.key]: e.target.value })}
                    className="pr-10" />
                  <button type="button" onClick={f.toggle}
                    className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: TEXT_MUTED }}>
                    {f.show ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>
            ))}
          </div>
          <Button variant="secondary" onClick={handleChangePassword}>Update Password</Button>
        </motion.div>
      )}

      {/* Appearance */}
      {activeTab === 'appearance' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5 max-w-xl">
          <div>
            <h2 className="text-base font-bold text-white">Themes</h2>
            <p className="text-[11px]" style={{ color: TEXT_MUTED }}>Choose your style or customize your theme</p>
          </div>
          {/* Theme cards with mini previews */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { id: 'Light', label: 'Light Mode', bg: '#f8f9fa', fg: '#e2e8f0', accent: '#cbd5e1' },
              { id: 'Dark', label: 'Dark Mode', bg: '#1a1a2e', fg: '#2d2d44', accent: '#3d3d5c' },
              { id: 'Auto', label: 'System', bg: '#1a1a2e', fg: '#2d2d44', accent: '#3d3d5c' },
            ].map((theme) => (
              <button key={theme.id} onClick={() => setAppearance({ ...appearance, theme: theme.id })}
                className="rounded-xl overflow-hidden transition-all"
                style={{ border: `2px solid ${appearance.theme === theme.id ? VIOLET : BORDER}` }}>
                <div className="p-2.5 h-20" style={{ background: theme.bg }}>
                  <div className="flex gap-1 mb-2">
                    <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#ef4444' }} />
                    <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#f59e0b' }} />
                    <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#22c55e' }} />
                  </div>
                  <div className="space-y-1.5">
                    <div className="h-2 rounded" style={{ background: theme.fg, width: '80%' }} />
                    <div className="h-2 rounded" style={{ background: theme.fg, width: '60%' }} />
                    <div className="h-2 rounded" style={{ background: theme.accent, width: '40%' }} />
                  </div>
                </div>
                <div className="px-3 py-2 flex items-center gap-2" style={{ background: 'var(--color-surface-raised)' }}>
                  <div className="w-4 h-4 rounded-full flex items-center justify-center"
                    style={{ border: `2px solid ${appearance.theme === theme.id ? VIOLET : BORDER}`, background: appearance.theme === theme.id ? VIOLET : 'transparent' }}>
                    {appearance.theme === theme.id && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </div>
                  <span className="text-[10px] font-semibold text-white">{theme.label}</span>
                </div>
              </button>
            ))}
          </div>

          {/* Accent Colors */}
          <div>
            <h3 className="text-xs font-semibold text-white mb-1">Accent Colors</h3>
            <p className="text-[9px] mb-2" style={{ color: TEXT_MUTED }}>Use system or custom accent colors</p>
            <div className="flex items-center gap-2.5">
              {['#7C3AED', '#ef4444', '#22c55e', '#06b6d4', '#f59e0b', '#ec4899'].map(color => (
                <button key={color} className="w-6 h-6 rounded-full transition-transform hover:scale-110"
                  style={{ background: color, border: '2px solid rgba(255,255,255,0.15)' }}
                  onClick={() => showToast('Accent color is fixed for this prototype', 'success')} />
              ))}
            </div>
          </div>

          {/* Language */}
          <div>
            <h3 className="text-xs font-semibold text-white mb-1">Language</h3>
            <select value={appearance.language} onChange={(e) => setAppearance({ ...appearance, language: e.target.value })}
              className="w-full max-w-xs px-3 py-2 rounded-xl text-xs focus:outline-none"
              style={{ background: 'var(--color-surface-raised)', border: `1px solid ${BORDER}`, color: '#fff' }}>
              <option>English</option>
              <option>Filipino</option>
            </select>
          </div>

          <Button variant="secondary" onClick={handleSaveAppearance}><Save size={13} /> Save Preferences</Button>
        </motion.div>
      )}

      {/* Admins */}
      {activeTab === 'admins' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4 max-w-2xl">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-white">Admin Accounts</h2>
              <p className="text-[11px]" style={{ color: TEXT_MUTED }}>Manage who has admin access</p>
            </div>
            <Button variant="primary" size="sm" onClick={() => setShowCreateAdmin(true)}>
              <UserPlus size={13} /> Add Admin
            </Button>
          </div>
          <div className="space-y-2">
            {admins.map((admin) => (
              <div key={admin.id} className="flex items-center justify-between p-3 rounded-xl"
                style={{ background: 'var(--color-surface-raised)', border: `1px solid ${BORDER}` }}>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-[10px]"
                    style={{ background: VIOLET }}>
                    {admin.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                  </div>
                  <div>
                    <p className="text-xs text-white font-semibold">{admin.name}</p>
                    <p className="text-[10px]" style={{ color: TEXT_MUTED }}>{admin.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[9px] px-2 py-0.5 rounded-full font-semibold"
                    style={{ background: 'var(--color-primary-light)', color: VIOLET }}>{admin.role}</span>
                  {admin.id !== '1' && (
                    <button onClick={() => handleDeleteAdmin(admin.id)}
                      className="w-6 h-6 rounded-full flex items-center justify-center"
                      style={{ color: 'var(--color-secondary)', background: 'var(--color-secondary-light)' }}>
                      <X size={11} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          <Modal isOpen={showCreateAdmin} onClose={() => setShowCreateAdmin(false)}
            title="Create Admin Account" subtitle="Grant a new user admin access"
            confirmLabel="Create Account" onConfirm={handleCreateAdmin}>
            <div className="space-y-3">
              <div>
                <label className="text-[10px] block mb-1 uppercase" style={{ color: TEXT_MUTED }}>Full Name</label>
                <Input value={newAdmin.name} onChange={(e) => setNewAdmin({ ...newAdmin, name: e.target.value })} placeholder="Juan Dela Cruz" />
              </div>
              <div>
                <label className="text-[10px] block mb-1 uppercase" style={{ color: TEXT_MUTED }}>Email</label>
                <Input type="email" value={newAdmin.email} onChange={(e) => setNewAdmin({ ...newAdmin, email: e.target.value })} placeholder="juan@corefitness.com" />
              </div>
              <div>
                <label className="text-[10px] block mb-1 uppercase" style={{ color: TEXT_MUTED }}>Role</label>
                <select value={newAdmin.role} onChange={(e) => setNewAdmin({ ...newAdmin, role: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl text-xs focus:outline-none"
                  style={{ background: 'var(--color-bg)', border: `1px solid ${BORDER}`, color: '#fff' }}>
                  <option value="Super Admin">Super Admin</option>
                  <option value="Admin">Admin</option>
                  <option value="Staff">Staff</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] block mb-1 uppercase" style={{ color: TEXT_MUTED }}>Password</label>
                <div className="relative">
                  <Input type={showNewPw ? 'text' : 'password'} value={newAdmin.password}
                    onChange={(e) => setNewAdmin({ ...newAdmin, password: e.target.value })}
                    placeholder="Min. 6 characters" className="pr-10" />
                  <button type="button" onClick={() => setShowNewPw(!showNewPw)}
                    className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: TEXT_MUTED }}>
                    {showNewPw ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>
            </div>
          </Modal>
        </motion.div>
      )}

      {/* Backup & Data */}
      {activeTab === 'backup' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5 max-w-2xl">
          <div>
            <h2 className="text-base font-bold text-white">Backup & Data</h2>
            <p className="text-[11px]" style={{ color: TEXT_MUTED }}>Manage data exports, backups, and system maintenance</p>
          </div>

          {/* Auto Backup */}
          <div className="p-4 rounded-xl space-y-3" style={{ background: 'var(--color-surface-raised)', border: `1px solid ${BORDER}` }}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-white">Automatic Backup</p>
                <p className="text-[10px]" style={{ color: TEXT_MUTED }}>Automatically backup data on schedule</p>
              </div>
              <button onClick={() => {
                const updated = { ...autoBackup, enabled: !autoBackup.enabled };
                setAutoBackup(updated);
                localStorage.setItem('admin_auto_backup', JSON.stringify(updated));
              }}
                className="relative inline-block w-9 h-5 rounded-full transition-colors flex-shrink-0"
                style={{ background: autoBackup.enabled ? VIOLET : 'var(--color-border)' }}>
                <span className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform"
                  style={{ transform: autoBackup.enabled ? 'translateX(16px)' : 'translateX(0)' }} />
              </button>
            </div>
            {autoBackup.enabled && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[9px] block mb-1 uppercase" style={{ color: TEXT_MUTED }}>Frequency</label>
                  <select value={autoBackup.frequency} onChange={(e) => {
                    const updated = { ...autoBackup, frequency: e.target.value };
                    setAutoBackup(updated);
                    localStorage.setItem('admin_auto_backup', JSON.stringify(updated));
                  }}
                    className="w-full px-3 py-2 rounded-xl text-xs focus:outline-none"
                    style={{ background: 'var(--color-bg)', border: `1px solid ${BORDER}`, color: '#fff' }}>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>
                <div>
                  <label className="text-[9px] block mb-1 uppercase" style={{ color: TEXT_MUTED }}>Last Backup</label>
                  <p className="text-xs text-white font-medium mt-2">{autoBackup.lastBackup}</p>
                </div>
              </div>
            )}
          </div>

          {/* Export Data */}
          <div className="p-4 rounded-xl space-y-3" style={{ background: 'var(--color-surface-raised)', border: `1px solid ${BORDER}` }}>
            <h3 className="text-xs font-semibold text-white">Export Data</h3>
            <p className="text-[10px]" style={{ color: TEXT_MUTED }}>Download your gym data as CSV or JSON files</p>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={handleExportData}
                className="flex items-center justify-center gap-2 p-3 rounded-xl text-[11px] font-semibold text-white transition-colors"
                style={{ background: 'var(--color-bg)', border: `1px solid ${BORDER}` }}>
                <Download size={13} style={{ color: VIOLET }} /> Export Members
              </button>
              <button onClick={handleExportData}
                className="flex items-center justify-center gap-2 p-3 rounded-xl text-[11px] font-semibold text-white transition-colors"
                style={{ background: 'var(--color-bg)', border: `1px solid ${BORDER}` }}>
                <Download size={13} style={{ color: VIOLET }} /> Export Payments
              </button>
              <button onClick={handleExportData}
                className="flex items-center justify-center gap-2 p-3 rounded-xl text-[11px] font-semibold text-white transition-colors"
                style={{ background: 'var(--color-bg)', border: `1px solid ${BORDER}` }}>
                <Download size={13} style={{ color: VIOLET }} /> Export Attendance
              </button>
              <button onClick={handleExportData}
                className="flex items-center justify-center gap-2 p-3 rounded-xl text-[11px] font-semibold text-white transition-colors"
                style={{ background: 'var(--color-bg)', border: `1px solid ${BORDER}` }}>
                <Download size={13} style={{ color: VIOLET }} /> Export All Data
              </button>
            </div>
          </div>

          {/* Import Data */}
          <div className="p-4 rounded-xl space-y-3" style={{ background: 'var(--color-surface-raised)', border: `1px solid ${BORDER}` }}>
            <h3 className="text-xs font-semibold text-white">Import Data</h3>
            <p className="text-[10px]" style={{ color: TEXT_MUTED }}>Restore data from a previous backup file</p>
            <button onClick={() => showToast('Import feature available in production', 'success')}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-[11px] font-semibold text-white transition-colors"
              style={{ background: 'var(--color-bg)', border: `1px solid ${BORDER}` }}>
              <Upload size={13} style={{ color: 'var(--color-secondary)' }} /> Upload Backup File
            </button>
          </div>

          {/* Danger Zone */}
          <div className="p-4 rounded-xl space-y-3" style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.2)' }}>
            <h3 className="text-xs font-semibold" style={{ color: '#ef4444' }}>Danger Zone</h3>
            <p className="text-[10px]" style={{ color: TEXT_MUTED }}>These actions are irreversible. Proceed with caution.</p>
            <div className="flex gap-2">
              <button onClick={handleClearCache}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-semibold transition-colors"
                style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444' }}>
                <RotateCcw size={11} /> Clear Cache
              </button>
              <button onClick={() => showToast('Reset requires confirmation from Super Admin', 'error')}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-semibold transition-colors"
                style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444' }}>
                <Trash2 size={11} /> Reset All Data
              </button>
            </div>
          </div>
        </motion.div>
      )}
      </div>
    </div>
  );
}
