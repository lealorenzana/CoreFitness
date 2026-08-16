import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Volume2, Clock, UserCog, Lock, Mail, Shield, FileText, Info,
  Bot, ChevronRight, X, LogOut, type LucideIcon,
} from 'lucide-react';
import { panelStyle } from '../../components/ui/Card';
import { toast } from '../../components/ui/Toast';
import { errorMessage } from '../../utils/errorMessage';
import { logout } from '../../utils/auth';
import { playNotificationSound } from '../../utils/notificationSound';
import { getMyPrefs, updateMyPrefs, DEFAULT_PREFS, type NotificationPrefs } from '../../lib/api/notificationPrefs';

/**
 * Trainer settings.
 *
 * Written against the same rule as the member Settings page: a control that
 * writes a flag nothing reads is a lie. That page had to have six such switches
 * deleted from it, so this one starts with only what is wired.
 *
 * **Sound is here** because it is genuinely live — the notification bell in
 * TrainerLayout is the same component the member app uses, it reads
 * `notification_prefs.sound_enabled`, and it plays the chime when a new row
 * arrives. Migration 0025 is what gives it something to chime *for*: until
 * then no code path ever wrote a notification row addressed to a trainer, and
 * the bell was decoration.
 *
 * **Push is deliberately absent**, and the note at the bottom of the section
 * says so rather than leaving a gap the reader has to explain to themselves.
 * The `send-push` Edge Function only accepts admin/staff/trainer callers, so a
 * member's phone cannot ask it to alert a trainer, and 0025 writes rows from a
 * database trigger which has no business making an HTTP call inside a booking
 * transaction. A push switch here would subscribe the device to a channel that
 * nothing sends on.
 *
 * **Category switches are absent** for the same reason: they are checked by
 * `send-push` and gate delivery of a push, so with no push to a trainer they
 * would toggle nothing.
 *
 * Also absent, as on the member page: dark mode (there is no light theme),
 * language (no i18n layer), email and SMS (no provider, and every Philippine
 * SMS gateway charges per message).
 */

type Row = {
  icon: LucideIcon;
  label: string;
  description: string;
  action: () => void;
};

function Switch({ on, busy }: { on: boolean; busy?: boolean }) {
  return (
    <span
      className="relative w-12 h-6 rounded-full flex-shrink-0 transition-colors"
      style={{ background: on ? 'var(--color-primary)' : 'var(--color-border)', opacity: busy ? 0.5 : 1 }}
    >
      <span
        className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform"
        style={{ transform: on ? 'translateX(26px)' : 'translateX(2px)' }}
      />
    </span>
  );
}

export default function TrainerSettings() {
  const navigate = useNavigate();
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS);
  const [busy, setBusy] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getMyPrefs()
      .then((p) => { if (!cancelled) setPrefs(p); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const toggleSound = async () => {
    const next = !prefs.soundEnabled;
    setPrefs({ ...prefs, soundEnabled: next });  // optimistic — a switch must feel instant
    setBusy(true);
    try {
      await updateMyPrefs({ soundEnabled: next });
      // Preview it. A sound setting you can't hear until the next booking
      // arrives is a setting you can't tell you've changed.
      if (next) playNotificationSound();
    } catch (err) {
      setPrefs((p) => ({ ...p, soundEnabled: !next }));  // the server is the truth
      toast.error(errorMessage(err, 'Could not save that setting'));
    } finally {
      setBusy(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    ['isLoggedIn', 'trainerMode', 'user', 'memberId', 'memberEmail', 'memberName']
      .forEach((k) => localStorage.removeItem(k));
    navigate('/login');
  };

  const sections: { title: string; items: Row[]; note?: string }[] = [
    {
      title: 'Coaching',
      items: [
        {
          icon: Clock,
          label: 'Bookable hours',
          description: 'When members can book you 1-on-1',
          action: () => navigate('/trainer/availability'),
        },
        {
          icon: Bot,
          label: 'Training assistant',
          description: 'Programming and coaching questions',
          action: () => navigate('/trainer/chatbot'),
        },
      ],
    },
    {
      title: 'Account',
      items: [
        {
          icon: UserCog,
          label: 'Edit profile',
          description: 'Photo, bio and specialisation',
          action: () => navigate('/trainer/profile/edit'),
        },
        {
          icon: Mail,
          label: 'Change email',
          description: 'The address you sign in with',
          action: () => navigate('/trainer/change-email'),
        },
        {
          icon: Lock,
          label: 'Change password',
          description: 'Update your password',
          action: () => navigate('/trainer/change-password'),
        },
      ],
    },
    {
      title: 'About',
      items: [
        {
          icon: Shield,
          label: 'Privacy policy',
          description: 'How your data is handled',
          action: () => navigate('/privacy'),
        },
        {
          icon: FileText,
          label: 'Terms of service',
          description: 'Read our terms',
          action: () => navigate('/terms'),
        },
        {
          icon: Info,
          label: 'About',
          description: 'Version 1.0.0',
          action: () => setShowAbout(true),
        },
      ],
    },
  ];

  return (
    <div className="space-y-5 pb-4">
      <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3">
        <button
          onClick={() => navigate('/trainer/profile')}
          className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ ...panelStyle, color: 'var(--color-text-secondary)' }}
          aria-label="Back to profile"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="min-w-0">
          <h1 className="display text-xl text-white">Settings</h1>
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Manage your preferences</p>
        </div>
      </motion.div>

      <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
        <h2 className="text-xs font-semibold uppercase tracking-wider px-1 mb-2"
          style={{ color: 'var(--color-text-muted)' }}>
          Notifications
        </h2>

        <div className="overflow-hidden" style={{ ...panelStyle, borderRadius: 'var(--radius-panel)' }}>
          <button
            onClick={toggleSound}
            disabled={busy}
            className="w-full p-3.5 flex items-center gap-3 text-left disabled:opacity-60"
          >
            <span className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'var(--color-primary-light)' }}>
              <Volume2 size={18} style={{ color: 'var(--color-primary)' }} />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-semibold text-white">Sound</span>
              <span className="block text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                A chime when a booking arrives while the app is open
              </span>
            </span>
            <Switch on={prefs.soundEnabled} busy={busy} />
          </button>
        </div>

        {/* Saying why the obvious switch isn't here. An unexplained gap gets
            filled in by the reader, usually wrongly. */}
        <p className="text-xs mt-2 px-1 leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
          Booking requests appear in your bell. There is no push switch yet because nothing sends a
          push to a trainer — a member's phone isn't allowed to trigger one, so a switch here would
          subscribe you to a channel with nothing on it.
        </p>
      </motion.section>

      {sections.map((section, si) => (
        <motion.section
          key={section.title}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 + si * 0.05 }}
        >
          <h2 className="text-xs font-semibold uppercase tracking-wider px-1 mb-2"
            style={{ color: 'var(--color-text-muted)' }}>
            {section.title}
          </h2>

          <div className="overflow-hidden" style={{ ...panelStyle, borderRadius: 'var(--radius-panel)' }}>
            {section.items.map((item, i) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.label}
                  onClick={item.action}
                  className="w-full p-3.5 flex items-center gap-3 text-left"
                  style={{ borderBottom: i < section.items.length - 1 ? '1px solid var(--color-border)' : 'none' }}
                >
                  <span className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: 'var(--color-primary-light)' }}>
                    <Icon size={18} style={{ color: 'var(--color-primary)' }} />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold text-white">{item.label}</span>
                    <span className="block text-xs mt-0.5 truncate" style={{ color: 'var(--color-text-muted)' }}>
                      {item.description}
                    </span>
                  </span>
                  <ChevronRight size={18} className="flex-shrink-0" style={{ color: 'var(--color-text-muted)' }} />
                </button>
              );
            })}
          </div>
        </motion.section>
      ))}

      <button
        onClick={() => setConfirmLogout(true)}
        className="w-full p-4 flex items-center justify-center gap-2 font-semibold text-sm"
        style={{
          background: 'var(--color-secondary-light)',
          border: '1px solid rgba(245,158,11,0.30)',
          color: 'var(--color-secondary)',
          borderRadius: 'var(--radius-btn)',
        }}
      >
        <LogOut size={17} /> Log out
      </button>

      <p className="text-center text-xs pt-1" style={{ color: 'var(--color-text-muted)' }}>
        Core Fitness · Trainer · Version 1.0.0
      </p>

      {createPortal(
        <AnimatePresence>
          {showAbout && (
            <div className="absolute inset-0 flex items-center justify-center p-4 pointer-events-auto">
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="absolute inset-0 bg-black/85"
                onClick={() => setShowAbout(false)}
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
                className="relative p-6 text-center w-full max-w-[320px]"
                style={{
                  background: 'var(--color-surface-raised)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-panel)',
                  boxShadow: 'var(--shadow-panel)',
                }}
              >
                <button
                  onClick={() => setShowAbout(false)}
                  aria-label="Close"
                  className="absolute top-3 right-3 w-9 h-9 rounded-full flex items-center justify-center"
                  style={{ background: 'var(--color-surface-high)', color: 'var(--color-text-secondary)' }}
                >
                  <X size={18} />
                </button>

                <img src="/logo.png" alt="" className="w-16 h-16 mx-auto mb-3" />
                <h3 className="display text-xl text-white">Core Fitness</h3>
                <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>Trainer app</p>

                <div className="mt-4 space-y-2 text-left">
                  {[
                    ['Version', '1.0.0'],
                    ['Gym', 'Core Fitness Mamburao'],
                    ['Location', 'Mamburao, Occidental Mindoro'],
                  ].map(([k, v]) => (
                    <div key={k} className="p-3 rounded-xl flex items-center justify-between gap-3"
                      style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
                      <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{k}</span>
                      <span className="text-xs font-semibold text-white text-right">{v}</span>
                    </div>
                  ))}
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.getElementById('modal-root')!
      )}

      {createPortal(
        <AnimatePresence>
          {confirmLogout && (
            <div className="absolute inset-0 flex items-center justify-center p-4 pointer-events-auto">
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="absolute inset-0 bg-black/80"
                onClick={() => setConfirmLogout(false)}
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
                className="relative p-6 w-full max-w-[300px]"
                style={{
                  background: 'var(--color-surface-raised)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-panel)',
                  boxShadow: 'var(--shadow-panel)',
                }}
              >
                <h3 className="display text-lg text-white mb-1">Log out?</h3>
                <p className="text-xs mb-5" style={{ color: 'var(--color-text-muted)' }}>
                  You'll need your email and password to get back in.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setConfirmLogout(false)}
                    className="flex-1 h-11 rounded-full font-semibold text-sm"
                    style={{
                      background: 'var(--color-bg)',
                      border: '1px solid var(--color-border)',
                      color: 'var(--color-text-secondary)',
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleLogout}
                    className="flex-1 h-11 rounded-full font-semibold text-sm text-black"
                    style={{ background: 'var(--color-secondary)' }}
                  >
                    Log out
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.getElementById('modal-root')!
      )}
    </div>
  );
}
