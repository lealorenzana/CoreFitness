import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { 
  ArrowLeft, 
  Bell, 
  Lock, 
  Globe, 
  Moon, 
  Shield, 
  HelpCircle, 
  FileText, 
  Info,
  ChevronRight,
  Mail,
  MessageSquare,
  Smartphone,
  Volume2,
  Check,
  X
} from 'lucide-react';

export default function Settings() {
  const navigate = useNavigate();
  const memberEmail = localStorage.getItem('memberEmail') || 'eya.lorenzana@email.com';

  // Modal states
  const [showLanguageModal, setShowLanguageModal] = useState(false);
  const [showAboutModal, setShowAboutModal] = useState(false);

  // Settings state
  const [pushNotifications, setPushNotifications] = useState(() => {
    const saved = localStorage.getItem(`settings_push_${memberEmail}`);
    return saved ? JSON.parse(saved) : true;
  });

  const [emailNotifications, setEmailNotifications] = useState(() => {
    const saved = localStorage.getItem(`settings_email_${memberEmail}`);
    return saved ? JSON.parse(saved) : true;
  });

  const [smsNotifications, setSmsNotifications] = useState(() => {
    const saved = localStorage.getItem(`settings_sms_${memberEmail}`);
    return saved ? JSON.parse(saved) : false;
  });

  const [soundEnabled, setSoundEnabled] = useState(() => {
    const saved = localStorage.getItem(`settings_sound_${memberEmail}`);
    return saved ? JSON.parse(saved) : true;
  });

  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem(`settings_darkmode_${memberEmail}`);
    return saved ? JSON.parse(saved) : true;
  });

  const [language, setLanguage] = useState(() => {
    return localStorage.getItem(`settings_language_${memberEmail}`) || 'English';
  });

  const togglePush = () => {
    const newValue = !pushNotifications;
    setPushNotifications(newValue);
    localStorage.setItem(`settings_push_${memberEmail}`, JSON.stringify(newValue));
  };

  const toggleEmail = () => {
    const newValue = !emailNotifications;
    setEmailNotifications(newValue);
    localStorage.setItem(`settings_email_${memberEmail}`, JSON.stringify(newValue));
  };

  const toggleSms = () => {
    const newValue = !smsNotifications;
    setSmsNotifications(newValue);
    localStorage.setItem(`settings_sms_${memberEmail}`, JSON.stringify(newValue));
  };

  const toggleSound = () => {
    const newValue = !soundEnabled;
    setSoundEnabled(newValue);
    localStorage.setItem(`settings_sound_${memberEmail}`, JSON.stringify(newValue));
  };

  const toggleDarkMode = () => {
    const newValue = !darkMode;
    setDarkMode(newValue);
    localStorage.setItem(`settings_darkmode_${memberEmail}`, JSON.stringify(newValue));
  };

  const changeLanguage = (lang: string) => {
    setLanguage(lang);
    localStorage.setItem(`settings_language_${memberEmail}`, lang);
    setShowLanguageModal(false);
  };

  const languages = ['English', 'Filipino', 'Spanish', 'Chinese', 'Japanese'];

  const settingsSections = [
    {
      title: 'Notifications',
      items: [
        {
          icon: Bell,
          label: 'Push Notifications',
          description: 'Receive push notifications',
          type: 'toggle',
          value: pushNotifications,
          action: togglePush,
        },
        {
          icon: Mail,
          label: 'Email Notifications',
          description: 'Receive email updates',
          type: 'toggle',
          value: emailNotifications,
          action: toggleEmail,
        },
        {
          icon: MessageSquare,
          label: 'SMS Notifications',
          description: 'Receive text messages',
          type: 'toggle',
          value: smsNotifications,
          action: toggleSms,
        },
        {
          icon: Volume2,
          label: 'Sound',
          description: 'Enable notification sounds',
          type: 'toggle',
          value: soundEnabled,
          action: toggleSound,
        },
      ],
    },
    {
      title: 'Appearance',
      items: [
        {
          icon: Moon,
          label: 'Dark Mode',
          description: 'Use dark theme',
          type: 'toggle',
          value: darkMode,
          action: toggleDarkMode,
        },
        {
          icon: Globe,
          label: 'Language',
          description: language,
          type: 'navigate',
          action: () => setShowLanguageModal(true),
        },
      ],
    },
    {
      title: 'Security & Privacy',
      items: [
        {
          icon: Lock,
          label: 'Change Password',
          description: 'Update your password',
          type: 'navigate',
          action: () => navigate('/member/change-password'),
        },
        {
          icon: Shield,
          label: 'Privacy Settings',
          description: 'Manage your privacy',
          type: 'navigate',
          action: () => navigate('/member/privacy'),
        },
      ],
    },
    {
      title: 'Support & About',
      items: [
        {
          icon: HelpCircle,
          label: 'Help Center',
          description: 'Get help and support',
          type: 'navigate',
          action: () => navigate('/member/chatbot'),
        },
        {
          icon: FileText,
          label: 'Terms of Service',
          description: 'Read our terms',
          type: 'navigate',
          action: () => navigate('/member/terms'),
        },
        {
          icon: FileText,
          label: 'Privacy Policy',
          description: 'Read our privacy policy',
          type: 'navigate',
          action: () => navigate('/member/privacy'),
        },
        {
          icon: Info,
          label: 'About',
          description: 'App version 1.0.0',
          type: 'navigate',
          action: () => setShowAboutModal(true),
        },
      ],
    },
  ];

  return (
    <div className="space-y-5 pb-4">
      {/* Header */}
      <motion.div 
        initial={{ opacity: 0, y: -16 }} 
        animate={{ opacity: 1, y: 0 }} 
        className="flex items-center gap-3"
      >
        <button
          onClick={() => navigate('/member/profile')}
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
          <h1 className="text-2xl font-bold text-white">Settings</h1>
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            Manage your preferences
          </p>
        </div>
      </motion.div>

      {/* Settings Sections */}
      {settingsSections.map((section, sectionIndex) => (
        <motion.div
          key={section.title}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 + sectionIndex * 0.05 }}
          className="space-y-3"
        >
          <h2 className="text-sm font-semibold uppercase tracking-wider px-1" 
            style={{ color: 'var(--color-text-muted)' }}>
            {section.title}
          </h2>

          <div className="rounded-2xl overflow-hidden" 
            style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
            {section.items.map((item, index) => {
              const Icon = item.icon;
              return (
                <div key={item.label}>
                  <button
                    onClick={item.action}
                    className="w-full p-4 flex items-center gap-4 transition-colors"
                    style={{ 
                      background: 'transparent',
                      borderBottom: index < section.items.length - 1 ? '1px solid var(--color-border)' : 'none'
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <div 
                      className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: 'var(--color-primary-light)' }}
                    >
                      <Icon size={20} style={{ color: 'var(--color-primary)' }} />
                    </div>
                    
                    <div className="flex-1 text-left">
                      <p className="text-white font-semibold text-sm">{item.label}</p>
                      <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                        {item.description}
                      </p>
                    </div>

                    {item.type === 'toggle' ? (
                      <div
                        className="relative w-12 h-6 rounded-full transition-colors flex-shrink-0"
                        style={{ 
                          background: item.value ? 'var(--color-primary)' : 'var(--color-border)' 
                        }}
                      >
                        <div
                          className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform"
                          style={{ 
                            transform: item.value ? 'translateX(26px)' : 'translateX(2px)' 
                          }}
                        />
                      </div>
                    ) : (
                      <ChevronRight size={18} style={{ color: 'var(--color-text-muted)' }} />
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </motion.div>
      ))}

      {/* App Version Footer */}
      <div className="text-center pt-4">
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          G-Fitness Member App
        </p>
        <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
          Version 1.0.0
        </p>
      </div>

      {/* Language Selection Modal */}
      <AnimatePresence>
        {showLanguageModal && createPortal(
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowLanguageModal(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm z-50"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[60] w-[85%] max-w-sm"
            >
              <div className="bg-[rgba(10,8,0,0.95)] border-2 rounded-3xl p-6 shadow-2xl relative"
                style={{ borderColor: 'var(--color-primary)' }}>
                <button
                  onClick={() => setShowLanguageModal(false)}
                  className="absolute top-3 right-3 p-2 rounded-lg bg-gray-800 text-white/40 hover:text-white transition-colors"
                >
                  <X size={18} />
                </button>
                
                <h3 className="text-white font-bold text-lg mb-1">Select Language</h3>
                <p className="text-white/60 text-xs mb-4">Choose your preferred language</p>
                
                <div className="space-y-2">
                  {languages.map((lang) => (
                    <button
                      key={lang}
                      onClick={() => changeLanguage(lang)}
                      className="w-full p-3 rounded-xl flex items-center justify-between transition-colors"
                      style={{ 
                        background: language === lang ? 'var(--color-primary-light)' : 'var(--color-surface-raised)',
                        border: `1px solid ${language === lang ? 'var(--color-primary)' : 'var(--color-border)'}`
                      }}
                    >
                      <span className="text-white font-medium text-sm">{lang}</span>
                      {language === lang && (
                        <Check size={18} style={{ color: 'var(--color-primary)' }} />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          </>,
          document.getElementById('modal-root')!
        )}
      </AnimatePresence>

      {/* About Modal */}
      <AnimatePresence>
        {showAboutModal && createPortal(
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAboutModal(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm z-50"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[60] w-[85%] max-w-sm"
            >
              <div className="bg-[rgba(10,8,0,0.95)] border-2 rounded-3xl p-6 shadow-2xl relative text-center"
                style={{ borderColor: 'var(--color-primary)' }}>
                <button
                  onClick={() => setShowAboutModal(false)}
                  className="absolute top-3 right-3 p-2 rounded-lg bg-gray-800 text-white/40 hover:text-white transition-colors"
                >
                  <X size={18} />
                </button>
                
                <div className="mb-4">
                  <img src="/logo.png" alt="G-Fitness" className="w-20 h-20 mx-auto mb-3" />
                  <h3 className="text-white font-bold text-xl mb-1">G-Fitness</h3>
                  <p className="text-white/60 text-sm">Member App</p>
                </div>
                
                <div className="space-y-3 text-left">
                  <div className="p-3 rounded-xl" style={{ background: 'var(--color-surface-raised)' }}>
                    <p className="text-white/60 text-xs mb-1">Version</p>
                    <p className="text-white font-semibold text-sm">1.0.0</p>
                  </div>
                  
                  <div className="p-3 rounded-xl" style={{ background: 'var(--color-surface-raised)' }}>
                    <p className="text-white/60 text-xs mb-1">Developer</p>
                    <p className="text-white font-semibold text-sm">G-Fitness Team</p>
                  </div>
                  
                  <div className="p-3 rounded-xl" style={{ background: 'var(--color-surface-raised)' }}>
                    <p className="text-white/60 text-xs mb-1">Contact</p>
                    <p className="text-white font-semibold text-sm">support@gfitness.com</p>
                  </div>
                </div>
                
                <p className="text-white/40 text-xs mt-4">
                  © 2024 G-Fitness. All rights reserved.
                </p>
              </div>
            </motion.div>
          </>,
          document.getElementById('modal-root')!
        )}
      </AnimatePresence>
    </div>
  );
}
