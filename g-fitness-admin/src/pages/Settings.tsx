import { motion } from 'framer-motion';
import { useState } from 'react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import { Settings as SettingsIcon, User, Bell, Shield, Palette, Globe, Save } from 'lucide-react';

export default function Settings() {
  const [activeTab, setActiveTab] = useState<'profile' | 'notifications' | 'security' | 'appearance'>('profile');

  const tabs = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'security', label: 'Security', icon: Shield },
    { id: 'appearance', label: 'Appearance', icon: Palette },
  ];

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-3xl font-orbitron font-bold text-gradient flex items-center gap-3">
          <SettingsIcon size={32} />
          Settings
        </h1>
        <p className="text-gray-400 mt-1">Manage your account and preferences</p>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar */}
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }}>
          <Card>
            <div className="space-y-2">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                      activeTab === tab.id
                        ? 'bg-gradient-to-r from-primary-start to-primary-end text-white'
                        : 'text-gray-400 hover:bg-dark-border/50 hover:text-white'
                    }`}
                  >
                    <Icon size={20} />
                    <span className="font-medium">{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </Card>
        </motion.div>

        {/* Content */}
        <div className="lg:col-span-3">
          {activeTab === 'profile' && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
              <Card>
                <h2 className="text-xl font-semibold text-white mb-6">Profile Settings</h2>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-gray-400 text-sm block mb-2">First Name</label>
                      <Input defaultValue="Admin" />
                    </div>
                    <div>
                      <label className="text-gray-400 text-sm block mb-2">Last Name</label>
                      <Input defaultValue="User" />
                    </div>
                  </div>
                  <div>
                    <label className="text-gray-400 text-sm block mb-2">Email</label>
                    <Input type="email" defaultValue="admin@gfitness.com" />
                  </div>
                  <div>
                    <label className="text-gray-400 text-sm block mb-2">Phone</label>
                    <Input type="tel" defaultValue="+63 912 345 6789" />
                  </div>
                  <div>
                    <label className="text-gray-400 text-sm block mb-2">Role</label>
                    <Input defaultValue="Administrator" disabled />
                  </div>
                  <Button variant="primary" className="w-full flex items-center justify-center gap-2">
                    <Save size={18} />
                    Save Changes
                  </Button>
                </div>
              </Card>
            </motion.div>
          )}

          {activeTab === 'notifications' && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
              <Card>
                <h2 className="text-xl font-semibold text-white mb-6">Notification Preferences</h2>
                <div className="space-y-4">
                  {[
                    { label: 'New Member Registration', description: 'Get notified when a new member joins' },
                    { label: 'Payment Received', description: 'Receive alerts for successful payments' },
                    { label: 'Membership Expiring', description: 'Alert when memberships are about to expire' },
                    { label: 'Low Attendance', description: 'Notify when member attendance drops' },
                    { label: 'System Updates', description: 'Important system and feature updates' },
                  ].map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between p-4 bg-dark rounded-xl">
                      <div>
                        <p className="text-white font-medium">{item.label}</p>
                        <p className="text-gray-400 text-sm">{item.description}</p>
                      </div>
                      <label className="relative inline-block w-12 h-6">
                        <input type="checkbox" defaultChecked className="sr-only peer" />
                        <div className="w-12 h-6 bg-gray-700 rounded-full peer peer-checked:bg-primary-start transition-all cursor-pointer"></div>
                        <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-all peer-checked:translate-x-6"></div>
                      </label>
                    </div>
                  ))}
                </div>
              </Card>
            </motion.div>
          )}

          {activeTab === 'security' && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
              <Card>
                <h2 className="text-xl font-semibold text-white mb-6">Security Settings</h2>
                <div className="space-y-6">
                  <div>
                    <h3 className="text-white font-medium mb-4">Change Password</h3>
                    <div className="space-y-4">
                      <div>
                        <label className="text-gray-400 text-sm block mb-2">Current Password</label>
                        <Input type="password" placeholder="Enter current password" />
                      </div>
                      <div>
                        <label className="text-gray-400 text-sm block mb-2">New Password</label>
                        <Input type="password" placeholder="Enter new password" />
                      </div>
                      <div>
                        <label className="text-gray-400 text-sm block mb-2">Confirm New Password</label>
                        <Input type="password" placeholder="Confirm new password" />
                      </div>
                      <Button variant="primary" className="w-full">Update Password</Button>
                    </div>
                  </div>

                  <div className="border-t border-dark-border pt-6">
                    <h3 className="text-white font-medium mb-4">Two-Factor Authentication</h3>
                    <div className="flex items-center justify-between p-4 bg-dark rounded-xl">
                      <div>
                        <p className="text-white font-medium">Enable 2FA</p>
                        <p className="text-gray-400 text-sm">Add an extra layer of security</p>
                      </div>
                      <Button variant="ghost">Enable</Button>
                    </div>
                  </div>
                </div>
              </Card>
            </motion.div>
          )}

          {activeTab === 'appearance' && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
              <Card>
                <h2 className="text-xl font-semibold text-white mb-6">Appearance Settings</h2>
                <div className="space-y-6">
                  <div>
                    <h3 className="text-white font-medium mb-4 flex items-center gap-2">
                      <Palette size={20} className="text-primary-start" />
                      Theme
                    </h3>
                    <div className="grid grid-cols-3 gap-4">
                      {['Dark', 'Light', 'Auto'].map((theme) => (
                        <button
                          key={theme}
                          className={`p-4 rounded-xl border-2 transition-all ${
                            theme === 'Dark'
                              ? 'border-primary-start bg-primary-start/10'
                              : 'border-dark-border hover:border-gray-600'
                          }`}
                        >
                          <p className="text-white font-medium">{theme}</p>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-white font-medium mb-4 flex items-center gap-2">
                      <Globe size={20} className="text-primary-start" />
                      Language
                    </h3>
                    <select className="w-full bg-dark border border-dark-border rounded-xl px-4 py-3 text-white focus:outline-none focus:border-primary-start">
                      <option>English</option>
                      <option>Filipino</option>
                    </select>
                  </div>

                  <Button variant="primary" className="w-full flex items-center justify-center gap-2">
                    <Save size={18} />
                    Save Preferences
                  </Button>
                </div>
              </Card>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
