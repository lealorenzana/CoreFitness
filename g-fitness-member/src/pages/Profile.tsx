import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { User, Mail, Phone, MapPin, Calendar, LogOut, Bell, Shield, Edit, Moon, Sun, CreditCard, ArrowLeft } from 'lucide-react';

export default function Profile() {
  const navigate = useNavigate();
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  // Prevent body scroll when dialog is open
  useEffect(() => {
    if (showLogoutConfirm) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [showLogoutConfirm]);

  // Load theme preference on mount
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
      setIsDarkMode(savedTheme === 'dark');
    }
  }, []);

  const member = {
    name: 'Juan Dela Cruz',
    email: 'juan.delacruz@email.com',
    phone: '+63 912 345 6789',
    gym: 'Core Fitness Mamburao',
    joinDate: 'January 15, 2024',
  };

  const menuItems = [
    { label: 'Payment History', icon: CreditCard, color: 'from-green-500 to-emerald-500', action: () => navigate('/member/payments') },
    { label: 'Membership Details', icon: Shield, color: 'from-purple-500 to-pink-500', action: () => navigate('/member/membership') },
    { label: 'Attendance History', icon: Calendar, color: 'from-blue-500 to-cyan-500', action: () => navigate('/member/attendance-history') },
    { label: 'Notifications', icon: Bell, color: 'from-yellow-500 to-orange-500', action: () => alert('Notification settings coming soon!') },
  ];

  const handleLogout = () => {
    localStorage.removeItem('isLoggedIn');
    localStorage.removeItem('memberId');
    navigate('/');
  };

  const toggleTheme = () => {
    const newMode = !isDarkMode;
    setIsDarkMode(newMode);
    
    // Store theme preference
    localStorage.setItem('theme', newMode ? 'dark' : 'light');
    
    // Apply theme to document
    if (newMode) {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    } else {
      document.documentElement.classList.add('light');
      document.documentElement.classList.remove('dark');
    }
  };

  return (
    <div className="space-y-6 relative">
      {/* Header with Back Button */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-4"
      >
        <button
          onClick={() => navigate('/member/home')}
          className="w-10 h-10 rounded-xl bg-gray-800 border-2 border-gray-600 flex items-center justify-center text-gray-400 hover:text-white hover:border-primary-start transition-all shadow-lg"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <h1 className="text-3xl font-orbitron font-bold text-gradient">Profile</h1>
          <p className="text-gray-400 mt-1">Manage your account</p>
        </div>
      </motion.div>

      {/* Profile Card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.1 }}
        className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary-start via-primary-end to-secondary p-6 shadow-2xl"
      >
        <div className="relative z-10 text-center">
          <div className="w-24 h-24 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center mx-auto mb-4">
            <User size={48} className="text-white" />
          </div>
          <h2 className="text-2xl font-bold text-white">{member.name}</h2>
          <p className="text-white/80 text-sm mt-1">Premium Member</p>
          
          {/* Edit Profile Button */}
          <button
            onClick={() => navigate('/member/profile/edit')}
            className="mt-4 bg-white/20 backdrop-blur-sm hover:bg-white/30 text-white font-semibold px-6 py-2 rounded-full transition-all duration-200 flex items-center gap-2 mx-auto"
          >
            <Edit size={16} />
            Edit Profile
          </button>
        </div>

        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/10 rounded-full blur-3xl"></div>
      </motion.div>

      {/* Info Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-gray-800 border-2 border-gray-600 rounded-2xl p-6 space-y-4 shadow-lg"
      >
        <div className="flex items-center gap-3">
          <Mail size={20} className="text-gray-400" />
          <div>
            <p className="text-gray-400 text-xs">Email</p>
            <p className="text-white">{member.email}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Phone size={20} className="text-gray-400" />
          <div>
            <p className="text-gray-400 text-xs">Phone</p>
            <p className="text-white">{member.phone}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <MapPin size={20} className="text-gray-400" />
          <div>
            <p className="text-gray-400 text-xs">Home Gym</p>
            <p className="text-white">{member.gym}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Calendar size={20} className="text-gray-400" />
          <div>
            <p className="text-gray-400 text-xs">Member Since</p>
            <p className="text-white">{member.joinDate}</p>
          </div>
        </div>
      </motion.div>

      {/* Theme Toggle */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="bg-gray-800 border-2 border-gray-600 rounded-2xl p-4 shadow-lg"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${isDarkMode ? 'from-indigo-500 to-purple-500' : 'from-yellow-500 to-orange-500'} flex items-center justify-center`}>
              {isDarkMode ? <Moon size={24} className="text-white" /> : <Sun size={24} className="text-white" />}
            </div>
            <div>
              <p className="text-white font-semibold">Theme</p>
              <p className="text-gray-400 text-sm">{isDarkMode ? 'Dark Mode' : 'Light Mode'}</p>
            </div>
          </div>
          <button
            onClick={toggleTheme}
            className={`relative w-14 h-8 rounded-full transition-colors ${isDarkMode ? 'bg-primary-start' : 'bg-gray-600'}`}
          >
            <motion.div
              animate={{ x: isDarkMode ? 24 : 2 }}
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              className="absolute top-1 w-6 h-6 bg-white rounded-full shadow-lg"
            />
          </button>
        </div>
      </motion.div>

      {/* Menu Items */}
      <div className="space-y-3">
        {menuItems.map((item, index) => {
          const Icon = item.icon;
          return (
            <motion.button
              key={item.label}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.4 + index * 0.1 }}
              onClick={item.action}
              className="w-full bg-gray-800 border-2 border-gray-600 rounded-2xl p-4 flex items-center gap-4 hover:border-primary-start transition-all duration-200 shadow-lg"
            >
              <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${item.color} flex items-center justify-center`}>
                <Icon size={24} className="text-white" />
              </div>
              <span className="text-white font-semibold flex-1 text-left">{item.label}</span>
              <div className="text-gray-400">→</div>
            </motion.button>
          );
        })}
      </div>

      {/* Logout Button */}
      <motion.button
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.7 }}
        onClick={() => setShowLogoutConfirm(true)}
        className="w-full bg-red-600/20 border-2 border-red-500 rounded-2xl p-4 flex items-center justify-center gap-3 text-red-400 hover:bg-red-600/30 transition-all duration-200 shadow-lg"
      >
        <LogOut size={20} />
        <span className="font-semibold">Logout</span>
      </motion.button>

      {/* Logout Confirmation Dialog */}
      {showLogoutConfirm && createPortal(
        <div className="absolute inset-0 flex items-center justify-center p-4 pointer-events-auto">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setShowLogoutConfirm(false)}
          />
          
          {/* Dialog */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative bg-gray-800 border-2 border-gray-600 rounded-2xl p-6 max-w-[280px] w-full shadow-2xl z-10"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-white font-bold text-xl mb-2">Confirm Logout</h3>
            <p className="text-gray-400 mb-6 text-sm">Are you sure you want to logout from your account?</p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="flex-1 bg-gray-700 border-2 border-gray-600 text-white py-3 rounded-xl font-semibold hover:border-primary-start transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleLogout}
                className="flex-1 bg-red-500 text-white py-3 rounded-xl font-semibold hover:bg-red-600 transition-all"
              >
                Logout
              </button>
            </div>
          </motion.div>
        </div>,
        document.getElementById('modal-root')!
      )}
    </div>
  );
}
