import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useGymApp } from '../hooks/useGymApp';
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
import { getGymSettings, type GymSettingsRow } from '../lib/api/settings';
import { getCurrentMemberId } from '../services/bookingService';
import { Page, PageTitle } from '../components/ui/page';
import { Chip, LineRow, NocButton, SectionHead } from '../components/ui/noc';
import Avatar from '../components/ui/Avatar';
import Modal from '../components/ui/Modal';
import { BellRinging, DownloadSimple, Phone, EnvelopeSimple, SignOut } from '@phosphor-icons/react';
import { exportMemberData, downloadExport } from '../lib/memberDataExport';
import { loadCoachDirectory, type CoachCard } from '../services/coachDirectoryService';
import { logout } from '../utils/auth';
import { saveLanguagePreference, useLanguage, useT, type Lang } from '../lib/i18n';

/** Enforced in the database by `trainer_may_see()` (0032), not by this screen. */
const SHARE_ROWS: { key: keyof SharePrefs; label: string; description: string }[] = [
  { key: 'shareMeasurements', label: 'Body measurements', description: 'Weight, body fat and tape measurements' },
  { key: 'shareGoals', label: 'Goals', description: 'What you are working towards' },
  // 0086: saved routines follow this switch too — they are how workouts are logged now.
  { key: 'shareWorkouts', label: 'Workouts and routines', description: 'Sessions you log and the routines you build' },
];

const APP_VERSION = '1.0.0';

/** A link drawn as the ghost button — a real <a>, never a <button> inside one. */
const linkBtn: React.CSSProperties = {
  height: 46, gap: 7, borderRadius: 'var(--radius-btn)', fontSize: 14, fontWeight: 600,
  color: 'var(--color-text-secondary)', border: '1px solid var(--color-hairline)',
};

/**
 * Settings (Nocturne redesign).
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
 * Reworked 2026-09-19: a **test** for this device's alerts; the coaches the
 * sharing switches actually apply to, by name; **Your data** — a download of
 * everything the gym holds about you (RA 10173's right to a copy; the desk
 * exports the same file from the member drawer); the gym's phone and email as
 * tap-to-call and tap-to-mail; and Log out.
 *
 * **About** was a modal with "Core Fitness Mamburao" and the address typed in.
 * It is now a section at the foot of the page reading `gym_settings`, so the
 * admin's Settings screen is the one place those words are written — and a
 * section is one fewer overlay that can trap a tap.
 */

/** A switch: violet when on (what you have), a hairline track when off. */
function Switch({ on, busy }: { on: boolean; busy?: boolean }) {
  return (
    <span
      aria-hidden
      className="relative flex-none transition-colors"
      style={{
        width: 44, height: 26, borderRadius: 13,
        background: on ? 'var(--color-primary)' : 'transparent',
        border: `1px solid ${on ? 'var(--color-primary)' : 'var(--color-hairline)'}`,
        boxShadow: on ? '0 0 12px -4px var(--color-primary)' : 'none',
        opacity: busy ? 0.5 : 1,
      }}
    >
      <span
        className="absolute rounded-full"
        style={{
          top: 3, left: 3, width: 18, height: 18,
          background: on ? '#fff' : 'var(--color-text-muted)',
          transform: on ? 'translateX(18px)' : 'translateX(0)',
          // A little overshoot, so the knob lands rather than slides.
          transition: 'transform 0.3s var(--ease-spring), background-color 0.2s ease',
        }}
      />
    </span>
  );
}

/** One switch row: the whole row is the button, the switch shows its state. */
function SwitchRow({
  label, description, on, busy, disabled, onToggle, last,
}: {
  label: string;
  description: string;
  on: boolean;
  busy?: boolean;
  disabled?: boolean;
  onToggle: () => void;
  last?: boolean;
}) {
  return (
    <div>
      <button
        role="switch"
        aria-checked={on}
        onClick={onToggle}
        disabled={disabled}
        className="w-full flex items-center text-left disabled:opacity-60"
        style={{ gap: 14, padding: '13px 0' }}
      >
        <span className="flex-1 min-w-0">
          <span className="block" style={{ fontSize: 14.5, color: 'var(--color-text-primary)' }}>{label}</span>
          <span className="block" style={{ fontSize: 12, marginTop: 2, lineHeight: 1.45, color: 'var(--color-text-secondary)' }}>
            {description}
          </span>
        </span>
        <Switch on={on} busy={busy} />
      </button>
      {!last && <div className="hair" />}
    </div>
  );
}

function Footnote({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: 12.5, marginTop: 10, lineHeight: 1.55, color: 'var(--color-text-muted)' }}>{children}</p>
  );
}

export default function Settings() {
  // The test alert is shown by this gym's app, so it carries this gym's name.
  const gymApp = useGymApp();
  const t = useT();
  const lang = useLanguage();
  const chooseLanguage = async (next: Lang) => {
    const id = await getCurrentMemberId();
    if (!id) return;
    try {
      await saveLanguagePreference(id, next);
      toast.success(next === 'fil' ? 'Naka-Filipino na ang app' : 'The app is in English');
    } catch (err) {
      toast.error(errorMessage(err, 'Could not change the language'));
    }
  };
  const navigate = useNavigate();

  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS);
  const [pushOn, setPushOn] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [swReady, setSwReady] = useState<boolean | null>(null);
  // Defaults to sharing everything, which is what a member with no row has —
  // the same state the app was in before these switches existed.
  const [share, setShare] = useState<SharePrefs>(SHARE_ALL);
  const [gym, setGym] = useState<GymSettingsRow | null>(null);
  /** Coaches you train with — the ones "What your trainer sees" applies to (0082). Null while unknown. */
  const [coaches, setCoaches] = useState<CoachCard[] | null>(null);
  const [exporting, setExporting] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const support = pushSupport();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [p, enabled, sw] = await Promise.all([getMyPrefs(), isPushEnabled(), hasServiceWorker()]);
      if (cancelled) return;
      setPrefs(p);
      setPushOn(enabled);
      setSwReady(sw);

      // Separate from the batch above: a failure here must not blank the
      // notification switches.
      getGymSettings().then((g) => { if (!cancelled) setGym(g); }).catch(() => {});
      const id = await getCurrentMemberId().catch(() => null);
      if (!id || cancelled) return;
      const s = await getSharePrefs(id).catch(() => SHARE_ALL);
      if (!cancelled) setShare(s);
      const directory = await loadCoachDirectory(id).catch(() => null);
      if (!cancelled) setCoaches(directory ? directory.filter((c) => c.yours) : null);
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

  /**
   * A test alert on this device. With push on, the service worker shows a real
   * system notification — what an alert will look like; otherwise the sound
   * and an in-app note, and the reason push is off.
   */
  const testAlert = async () => {
    if (prefs.soundEnabled) playNotificationSound();
    try {
      const reg = pushOn && 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
      if (reg && Notification.permission === 'granted') {
        await reg.showNotification(gymApp?.gymName ?? 'Your gym', { body: 'This is how an alert looks on this device.', tag: 'settings-test' });
        toast.success('Sent — check your notifications');
        return;
      }
    } catch { /* fall through to the in-app note */ }
    toast.success(pushOn ? 'Alerts are on — this device did not show a system notification'
      : 'Push is off on this device — alerts still arrive in Updates');
  };

  const downloadMyData = async () => {
    setExporting(true);
    try {
      const id = await getCurrentMemberId();
      if (!id) throw new Error('Not signed in');
      const exp = await exportMemberData(id);
      const who = (exp.data.profiles?.[0] as { first_name?: string; last_name?: string } | undefined);
      downloadExport(exp, `${who?.first_name ?? ''}-${who?.last_name ?? ''}`);
      const missing = Object.keys(exp.unavailable).length;
      toast.success(missing ? `Downloaded — ${missing} section${missing === 1 ? '' : 's'} could not be read and are listed in the file` : 'Downloaded');
    } catch (err) {
      toast.error(errorMessage(err, 'Could not prepare your data'));
    } finally {
      setExporting(false);
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

  const categoryRows: { key: keyof NotificationPrefs; label: string; description: string }[] = [
    { key: 'booking', label: 'Bookings', description: 'Class and PT approvals' },
    { key: 'payment', label: 'Payments', description: 'Receipts and dues' },
    { key: 'membership', label: 'Membership', description: 'Renewals and expiry' },
    { key: 'event', label: 'Events', description: 'What the gym has coming up' },
  ];

  /** Where to go from here. Each row is the button; the right word says so. */
  const links: { label: string; description: string; to: string }[] = [
    // Onboarding had no way back into it. Now that experience level and
    // interests drive what Train recommends, "I picked the wrong thing" needed an
    // answer other than "make a new account" — and 0036 marked every earlier
    // member onboarded, so their interests are empty until they get back here.
    { label: 'Interests & experience', description: 'Change what we recommend you', to: '/onboarding' },
    // Was the one account detail nobody could change.
    { label: 'Change email', description: 'The address you sign in with', to: '/member/change-email' },
    { label: 'Change password', description: 'Update your password', to: '/member/change-password' },
    { label: 'Help', description: 'Ask the in-app assistant', to: '/member/chatbot' },
    { label: 'Privacy policy', description: 'How your data is handled', to: '/privacy' },
    { label: 'Terms of service', description: 'Refunds, freezes and the rest of the rules', to: '/terms' },
  ];

  const clock = (t: string | null | undefined) => {
    if (!t) return null;
    const [h, m] = t.split(':').map(Number);
    return `${h % 12 === 0 ? 12 : h % 12}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h >= 12 ? 'PM' : 'AM'}`;
  };
  const hours = gym?.opening_time && gym?.closing_time ? `${clock(gym.opening_time)} – ${clock(gym.closing_time)}` : null;
  const about = [
    ['Gym', gym?.gym_name ?? null],
    ['Open', hours],
    ['Address', gym?.address ?? null],
    ['Version', APP_VERSION],
  ].filter((r): r is [string, string] => Boolean(r[1]));

  return (
    <Page>
      <PageTitle back fallback="/member/profile" title={t('Settings')} subtitle={t('Alerts, privacy and your account')} />

      {/* Notifications — every switch here does something observable. */}
      <section>
        <SectionHead title={t('Notifications')} />
        <div style={{ marginTop: 2 }}>
          <SwitchRow
            label="Push notifications"
            // Says what is actually true of THIS device, rather than implying a
            // setting that follows the member everywhere.
            description={unavailableReason ?? (busy === 'push' ? 'Working…' : 'On this device')}
            on={pushOn}
            busy={busy === 'push'}
            disabled={unavailableReason !== null || busy === 'push'}
            onToggle={togglePush}
          />
          <SwitchRow
            label="Sound"
            description="A chime when something arrives in the app"
            on={prefs.soundEnabled}
            busy={busy === 'soundEnabled'}
            disabled={busy === 'soundEnabled'}
            onToggle={() => togglePref('soundEnabled')}
          />
          {categoryRows.map((row, i) => (
            <SwitchRow
              key={row.key}
              label={row.label}
              description={row.description}
              on={Boolean(prefs[row.key])}
              busy={busy === row.key}
              disabled={busy === row.key}
              onToggle={() => togglePref(row.key)}
              last={i === categoryRows.length - 1}
            />
          ))}
        </div>
        <Footnote>
          Muting a category stops the alert, not the record — everything still appears in Updates.
          Coach notes, reminders, reward and renewal replies are always kept in Updates.
        </Footnote>
        <NocButton variant="ghost" className="w-full" style={{ marginTop: 12 }} icon={<BellRinging size={16} />}
          onClick={() => void testAlert()}>
          Send a test alert to this device
        </NocButton>
      </section>

      {/* What your trainer sees.
          Enforced by RLS (migration 0032), not by hiding a panel: switching one
          off removes those rows from every trainer's queries. The wording names
          trainers specifically, because gym staff are deliberately not gated and
          a switch implying otherwise would be the same lie as the six dead ones
          this page used to carry. */}
      <section>
        <SectionHead title={t('What your trainer sees')} />
        <div style={{ marginTop: 2 }}>
          {SHARE_ROWS.map((row, i) => (
            <SwitchRow
              key={row.key}
              label={row.label}
              description={row.description}
              on={share[row.key]}
              busy={busy === row.key}
              disabled={busy === row.key}
              onToggle={() => toggleShare(row.key)}
              last={i === SHARE_ROWS.length - 1}
            />
          ))}
        </div>
        {/* Named, so "my trainer" is somebody specific. A trainer sees only
            their own trainees (0082) — the coaches you have trained with. */}
        {coaches && (
          <div style={{ marginTop: 12 }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-primary-300)' }}>
              {coaches.length === 0 ? 'No coach has trained you yet' : 'Coaches these switches apply to'}
            </p>
            {coaches.length > 0 && (
              <div className="flex flex-wrap" style={{ gap: 10, marginTop: 8 }}>
                {coaches.map((c) => (
                  <span key={c.trainer.id} className="inline-flex items-center" style={{ gap: 6, fontSize: 13, color: 'var(--color-text-primary)' }}>
                    <Avatar name={c.name} photoUrl={c.trainer.photo_url} size={24} /> {c.name}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
        <Footnote>
          Your name, membership and gym check-ins are always visible to gym staff — that is how the
          front desk runs. Your training plan is visible to your coaches too, so they can plan around it.
          These switches cover the personal logs you keep in Progress.
        </Footnote>
      </section>

      {/* ── Your data (RA 10173) ── */}
      <section>
        <SectionHead title={t('Your data')} />
        <p style={{ fontSize: 13, marginTop: 8, lineHeight: 1.55, color: 'var(--color-text-secondary)' }}>
          Download a copy of everything the gym holds about you — membership, payments, visits, bookings,
          workouts, goals, points and notes — as one file. The front desk can give you the same file.
        </p>
        <NocButton variant="structure" className="w-full" style={{ marginTop: 12 }} disabled={exporting}
          icon={<DownloadSimple size={16} />} onClick={() => void downloadMyData()}>
          {exporting ? 'Preparing…' : 'Download my data'}
        </NocButton>
        <Footnote>
          Something wrong? Most details you can fix yourself in Edit profile; for the rest, ask at the desk.
        </Footnote>
      </section>

      <section>
        <SectionHead title={t('Language')} />
        {/* English or Filipino for the main screens (lib/i18n.ts, 0095). Saved
            to the member's row, so it follows them to a new phone. */}
        <div className="flex" style={{ gap: 8, marginTop: 10 }}>
          {([['en', 'English'], ['fil', 'Filipino']] as [Lang, string][]).map(([code, name]) => (
            <Chip key={code} label={name} on={lang === code} onClick={() => void chooseLanguage(code)} />
          ))}
        </div>
        <p style={{ fontSize: 12, marginTop: 8, lineHeight: 1.5, color: 'var(--color-text-muted)' }}>
          {lang === 'fil'
            ? 'Naka-Filipino ang mga pangunahing screen. Nasa English pa ang ibang bahagi.'
            : 'Filipino covers the main screens — navigation, check-in and Settings. The rest stays in English for now.'}
        </p>
      </section>

      <section>
        <SectionHead title={t('Account & app')} />
        <div style={{ marginTop: 2 }}>
          {links.map((l) => (
            <LineRow key={l.label} title={l.label} meta={l.description} action="Open" actionTone="structure"
              onClick={() => navigate(l.to)} />
          ))}
          <button onClick={() => setConfirmLogout(true)} className="w-full flex items-center text-left noc-press-soft"
            style={{ gap: 10, padding: '13px 0', fontSize: 14.5, color: 'var(--color-text-secondary)' }}>
            <SignOut size={17} aria-hidden /> {t('Log out')}
          </button>
        </div>
      </section>

      <section>
        <SectionHead title={t('About')} meta="Core Fitness member app" />
        <div style={{ marginTop: 2 }}>
          {about.map(([k, v]) => (
            <LineRow key={k} gutter={k} gutterWidth={72} title={v} />
          ))}
        </div>
        {/* The gym's own contact details, from gym_settings — tap to call or write. */}
        {(gym?.phone || gym?.email) && (
          <div className="flex" style={{ gap: 9, marginTop: 12 }}>
            {gym?.phone && (
              <a href={`tel:${gym.phone.replace(/\s+/g, '')}`} className="flex-1 flex items-center justify-center noc-press" style={linkBtn}>
                <Phone size={15} aria-hidden /> Call the gym
              </a>
            )}
            {gym?.email && (
              <a href={`mailto:${gym.email}`} className="flex-1 flex items-center justify-center noc-press" style={linkBtn}>
                <EnvelopeSimple size={15} aria-hidden /> Email
              </a>
            )}
          </div>
        )}
      </section>

      <Modal
        isOpen={confirmLogout}
        onClose={() => setConfirmLogout(false)}
        title="Log out"
        subtitle="You will need your email and password to get back in."
        confirmLabel="Log out"
        cancelLabel="Stay signed in"
        onConfirm={async () => { await logout(); navigate('/'); }}
      >
        <span />
      </Modal>
    </Page>
  );
}
