import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft, Bell, Volume2, CalendarCheck, CreditCard, Shield as ShieldIcon, Ticket,
  Lock, Mail, Shield, HelpCircle, FileText, Info, ChevronRight, X,
  type LucideIcon,
} from 'lucide-react';
import { toast } from '../components/ui/Toast';
import { errorMessage } from '../utils/errorMessage';
import { playNotificationSound } from '../utils/notificationSound';
import { enablePush, disablePush, isPushEnabled, pushSupport, hasServiceWorker } from '../lib/api/push';
import {
  getMyPrefs, updateMyPrefs, DEFAULT_PREFS, type NotificationPrefs,
} from '../lib/api/notificationPrefs';
import {
  getSharePrefs, saveSharePrefs, SHARE_ALL, type SharePrefs,
} from '../lib/api/sharePrefs';
import { getCurrentMemberId } from '../services/bookingService';
import SectionHeader from '../components/ui/SectionHeader';
import { panelStyle } from '../components/ui/Card';
import { Ruler, Target, Dumbbell, Sparkles } from 'lucide-react';

/** Enforced in the database by `trainer_may_see()` (0032), not by this screen. */
const SHARE_ROWS: { key: keyof SharePrefs; icon: LucideIcon; label: string; description: string }[] = [
  { key: 'shareMeasurements', icon: Ruler, label: 'Body measurements', description: 'Weight, body fat and tape measurements' },
  { key: 'shareGoals', icon: Target, label: 'Goals', description: 'What you are working towards' },
  { key: 'shareWorkouts', icon: Dumbbell, label: 'Workout log', description: 'Sessions you record yourself' },
];

/**
 * Settings.
 *
 * This page used to be almost entirely decorative. Six switches — Push, Email,
 * SMS, Sound, Dark Mode — wrote a flag to localStorage that **nothing ever read
 * back**, and a language picker offered five languages in an app with no
 * translations.
 *
 * The switches below are the real thing. Push subscribes this install to a
 * `push_subscriptions` row the send-push Edge Function delivers to; the category
 * switches are checked by that function before it sends; Sound plays the chime
 * it previews when you toggle it. Each one changes something observable.
 *
 * Still absent, on purpose:
 *   • SMS — every Philippine gateway charges per message, so the app does not
 *     offer a channel it cannot deliver on at ₱0.
 *   • Email — needs an external provider and an API key.
 *   • Dark Mode — there is no light theme; every screen is written against dark
 *     tokens, so the switch could only ever have been a no-op.
 *   • Language — no i18n layer exists yet.
 *
 * Preferences gate *delivery*, never the record. A muted category still writes
 * its `notifications` row, because the bell is the history of what happened to
 * your membership and silencing a channel must not erase it.
 *
 * The Terms and Privacy rows pointed at `/member/terms` and `/member/privacy`.
 * Neither route exists — both pages are mounted at the top level — so both rows
 * were dead links onto the catch-all. Also removed:
 * `localStorage.getItem('memberEmail') || 'eya.lorenzana@email.com'`, which
 * namespaced every setting here under one real person's address.
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

export default function Settings() {
  const navigate = useNavigate();
  const [showAboutModal, setShowAboutModal] = useState(false);

  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS);
  const [pushOn, setPushOn] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [swReady, setSwReady] = useState<boolean | null>(null);
  // Defaults to sharing everything, which is what a member with no row has —
  // the same state the app was in before these switches existed.
  const [share, setShare] = useState<SharePrefs>(SHARE_ALL);
  const support = pushSupport();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [p, enabled, sw] = await Promise.all([getMyPrefs(), isPushEnabled(), hasServiceWorker()]);
      if (cancelled) return;
      setPrefs(p);
      setPushOn(enabled);
      setSwReady(sw);

      // Separate from the batch above: it needs the member id first, and a
      // failure here must not blank the notification switches.
      const id = await getCurrentMemberId().catch(() => null);
      if (!id || cancelled) return;
      const s = await getSharePrefs(id).catch(() => SHARE_ALL);
      if (!cancelled) setShare(s);
    })();
    return () => { cancelled = true; };
  }, []);

  // Capability alone isn't enough: on the dev server the browser reports full
  // push support while no service worker is registered, so the switch would be
  // live but could never succeed. Say so on the row rather than on tap.
  const unavailableReason = !support.supported
    ? support.reason
    : swReady === false
      ? 'Only in the installed app — not on the dev server'
      : null;

  const togglePush = async () => {
    setBusy('push');
    try {
      if (pushOn) {
        await disablePush();
        setPushOn(false);
        toast.success('Push notifications turned off');
      } else {
        await enablePush();
        setPushOn(true);
        toast.success('Push notifications are on for this device');
      }
    } catch (err) {
      toast.error(errorMessage(err, 'Could not change that setting'));
      // Re-read rather than assume: the browser may have granted permission and
      // then failed to store the subscription, leaving the two out of step.
      setPushOn(await isPushEnabled());
    } finally {
      setBusy(null);
    }
  };

  const toggleShare = async (key: keyof SharePrefs) => {
    const next = { ...share, [key]: !share[key] };
    setShare(next);            // optimistic — the switch must feel instant
    setBusy(key);
    try {
      const id = await getCurrentMemberId();
      if (!id) throw new Error('Not signed in');
      await saveSharePrefs(id, next);
    } catch (err) {
      setShare(share);         // put it back; the server is the truth
      toast.error(errorMessage(err, 'Could not save that setting'));
    } finally {
      setBusy(null);
    }
  };

  const togglePref = async (key: keyof NotificationPrefs) => {
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);            // optimistic — the switch must feel instant
    setBusy(key);
    try {
      await updateMyPrefs({ [key]: next[key] });
      if (key === 'soundEnabled' && next.soundEnabled) playNotificationSound();
    } catch (err) {
      setPrefs(prefs);         // put it back; the server is the truth
      toast.error(errorMessage(err, 'Could not save that setting'));
    } finally {
      setBusy(null);
    }
  };

  const categoryRows: { key: keyof NotificationPrefs; icon: LucideIcon; label: string; description: string }[] = [
    { key: 'booking', icon: CalendarCheck, label: 'Bookings', description: 'Class and PT approvals' },
    { key: 'payment', icon: CreditCard, label: 'Payments', description: 'Receipts and dues' },
    { key: 'membership', icon: ShieldIcon, label: 'Membership', description: 'Renewals and expiry' },
    { key: 'event', icon: Ticket, label: 'Events', description: 'What the gym has coming up' },
  ];

  const sections: { title: string; items: Row[] }[] = [
    {
      title: 'Training preferences',
      items: [
        {
          // Onboarding had no way back into it. That was survivable while its
          // answers went nowhere; now that experience level and interests drive
          // what Book a Session recommends, "I picked the wrong thing" needed an
          // answer other than "make a new account".
          //
          // It also matters because migration 0036 marks every member who
          // registered before it as already onboarded — correct, so the flow
          // stops replaying, but it means their interests are empty until they
          // can get back here.
          icon: Sparkles,
          label: 'Interests & experience',
          description: 'Change what we recommend you',
          action: () => navigate('/onboarding'),
        },
      ],
    },
    {
      title: 'Security & privacy',
      items: [
        {
          // Was the one account detail nobody could change: Edit Profile
          // rendered the field disabled under "Ask the front desk", and the
          // front desk had no way to do it either.
          icon: Mail,
          label: 'Change email',
          description: 'The address you sign in with',
          action: () => navigate('/member/change-email'),
        },
        {
          icon: Lock,
          label: 'Change password',
          description: 'Update your password',
          action: () => navigate('/member/change-password'),
        },
        {
          icon: Shield,
          label: 'Privacy policy',
          description: 'How your data is handled',
          action: () => navigate('/privacy'),
        },
      ],
    },
    {
      title: 'Support & about',
      items: [
        {
          icon: HelpCircle,
          label: 'Help',
          description: 'Ask the in-app assistant',
          action: () => navigate('/member/chatbot'),
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
          action: () => setShowAboutModal(true),
        },
      ],
    },
  ];

  return (
    <div className="space-y-5 pb-4">
      <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3">
        <button
          onClick={() => navigate('/member/profile')}
          className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
          style={{
            background: 'var(--color-surface-raised)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-text-secondary)',
          }}
        >
          <ArrowLeft size={18} />
        </button>
        <div className="min-w-0">
          <h1 className="display text-xl text-white">Settings</h1>
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Manage your preferences</p>
        </div>
      </motion.div>

      {/* Notifications — every switch here does something observable. */}
      <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
        <h2 className="text-xs font-semibold uppercase tracking-wider px-1 mb-2"
          style={{ color: 'var(--color-text-muted)' }}>
          Notifications
        </h2>

        <div className="overflow-hidden" style={{
          background: 'var(--color-surface-raised)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-panel)',
        }}>
          <button
            onClick={togglePush}
            disabled={unavailableReason !== null || busy === 'push'}
            className="w-full p-3.5 flex items-center gap-3 text-left disabled:opacity-60"
            style={{ borderBottom: '1px solid var(--color-border)' }}
          >
            <span className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'var(--color-primary-light)' }}>
              <Bell size={18} style={{ color: 'var(--color-primary)' }} />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-semibold text-white">Push notifications</span>
              <span className="block text-xs mt-0.5 leading-snug" style={{ color: 'var(--color-text-muted)' }}>
                {/* Says what is actually true of THIS device, rather than
                    implying a setting that follows the member everywhere. */}
                {unavailableReason ?? (busy === 'push' ? 'Working…' : 'On this device')}
              </span>
            </span>
            <Switch on={pushOn} busy={busy === 'push'} />
          </button>

          <button
            onClick={() => togglePref('soundEnabled')}
            disabled={busy === 'soundEnabled'}
            className="w-full p-3.5 flex items-center gap-3 text-left disabled:opacity-60"
            style={{ borderBottom: '1px solid var(--color-border)' }}
          >
            <span className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'var(--color-primary-light)' }}>
              <Volume2 size={18} style={{ color: 'var(--color-primary)' }} />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-semibold text-white">Sound</span>
              <span className="block text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                A chime when something arrives in the app
              </span>
            </span>
            <Switch on={prefs.soundEnabled} busy={busy === 'soundEnabled'} />
          </button>

          {categoryRows.map((row, i) => {
            const Icon = row.icon;
            return (
              <button
                key={row.key}
                onClick={() => togglePref(row.key)}
                disabled={busy === row.key}
                className="w-full p-3.5 flex items-center gap-3 text-left disabled:opacity-60"
                style={{ borderBottom: i < categoryRows.length - 1 ? '1px solid var(--color-border)' : 'none' }}
              >
                <span className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: 'var(--color-surface-high)' }}>
                  <Icon size={18} style={{ color: 'var(--color-text-secondary)' }} />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold text-white">{row.label}</span>
                  <span className="block text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                    {row.description}
                  </span>
                </span>
                <Switch on={Boolean(prefs[row.key])} busy={busy === row.key} />
              </button>
            );
          })}
        </div>

        <p className="text-xs mt-2 px-1 leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
          Muting a category stops the alert, not the record — everything still
          appears in your notifications bell.
        </p>
      </motion.section>

      {/* What your trainer sees.
          These are enforced by RLS (migration 0032), not by hiding a panel:
          switching one off removes those rows from every trainer's queries.
          The wording names trainers specifically, because gym staff are
          deliberately not gated and a switch implying otherwise would be the
          same lie as the six dead ones this page used to carry. */}
      <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.14 }}>
        <SectionHeader title="What your trainer sees" />
        <div
          className="overflow-hidden"
          style={{ ...panelStyle, borderRadius: 'var(--radius-panel)' }}
        >
          {SHARE_ROWS.map((row, i) => {
            const Icon = row.icon;
            return (
              <button
                key={row.key}
                onClick={() => toggleShare(row.key)}
                disabled={busy === row.key}
                className="w-full p-3.5 flex items-center gap-3 text-left disabled:opacity-60"
                style={{ borderBottom: i < SHARE_ROWS.length - 1 ? '1px solid var(--color-border)' : 'none' }}
              >
                <span className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: 'var(--color-primary-light)' }}>
                  <Icon size={18} style={{ color: 'var(--color-primary)' }} />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold text-white">{row.label}</span>
                  <span className="block text-xs mt-0.5 leading-snug" style={{ color: 'var(--color-text-muted)' }}>
                    {row.description}
                  </span>
                </span>
                <Switch on={share[row.key]} busy={busy === row.key} />
              </button>
            );
          })}
        </div>

        <p className="text-xs mt-2 px-1 leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
          Your name, membership and gym check-ins are always visible to gym staff — that is how the
          front desk runs. These switches cover the personal logs you keep in Progress.
        </p>
      </motion.section>

      {sections.map((section, sectionIndex) => (
        <motion.section
          key={section.title}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 + sectionIndex * 0.05 }}
        >
          <h2
            className="text-xs font-semibold uppercase tracking-wider px-1 mb-2"
            style={{ color: 'var(--color-text-muted)' }}
          >
            {section.title}
          </h2>

          <div
            className="overflow-hidden"
            style={{
              background: 'var(--color-surface-raised)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-panel)',
            }}
          >
            {section.items.map((item, index) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.label}
                  onClick={item.action}
                  className="w-full p-3.5 flex items-center gap-3 text-left"
                  style={{
                    borderBottom: index < section.items.length - 1 ? '1px solid var(--color-border)' : 'none',
                  }}
                >
                  <span
                    className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: 'var(--color-primary-light)' }}
                  >
                    <Icon size={18} style={{ color: 'var(--color-primary)' }} />
                  </span>

                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold text-white">{item.label}</span>
                    <span className="block text-xs mt-0.5 truncate" style={{ color: 'var(--color-text-muted)' }}>
                      {item.description}
                    </span>
                  </span>

                  <ChevronRight size={18} style={{ color: 'var(--color-text-muted)' }} className="flex-shrink-0" />
                </button>
              );
            })}
          </div>
        </motion.section>
      ))}

      <p className="text-center text-xs pt-2" style={{ color: 'var(--color-text-muted)' }}>
        Core Fitness · Version 1.0.0
      </p>

      <AnimatePresence>
        {showAboutModal && createPortal(
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowAboutModal(false)}
              className="absolute inset-0 bg-black/85 backdrop-blur-sm z-50 pointer-events-auto"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[60] w-[85%] max-w-sm pointer-events-auto"
            >
              <div
                className="p-6 text-center relative"
                style={{
                  background: 'var(--color-surface-raised)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-panel)',
                  boxShadow: 'var(--shadow-panel)',
                }}
              >
                <button
                  onClick={() => setShowAboutModal(false)}
                  aria-label="Close"
                  className="absolute top-3 right-3 w-9 h-9 rounded-full flex items-center justify-center"
                  style={{ background: 'var(--color-surface-high)', color: 'var(--color-text-secondary)' }}
                >
                  <X size={18} />
                </button>

                <img src="/logo.png" alt="" className="w-16 h-16 mx-auto mb-3" />
                <h3 className="display text-xl text-white">Core Fitness</h3>
                <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>Member app</p>

                <div className="mt-4 space-y-2 text-left">
                  {[
                    ['Version', '1.0.0'],
                    ['Gym', 'Core Fitness Mamburao'],
                    ['Location', 'Mamburao, Occidental Mindoro'],
                  ].map(([k, v]) => (
                    <div
                      key={k}
                      className="p-3 rounded-xl flex items-center justify-between gap-3"
                      style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}
                    >
                      <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{k}</span>
                      <span className="text-xs font-semibold text-white text-right">{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          </>,
          document.getElementById('modal-root')!
        )}
      </AnimatePresence>
    </div>
  );
}
