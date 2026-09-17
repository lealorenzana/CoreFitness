import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
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
import { LineRow, SectionHead } from '../components/ui/noc';

/** Enforced in the database by `trainer_may_see()` (0032), not by this screen. */
const SHARE_ROWS: { key: keyof SharePrefs; label: string; description: string }[] = [
  { key: 'shareMeasurements', label: 'Body measurements', description: 'Weight, body fat and tape measurements' },
  { key: 'shareGoals', label: 'Goals', description: 'What you are working towards' },
  { key: 'shareWorkouts', label: 'Workout log', description: 'Sessions you record yourself' },
];

const APP_VERSION = '1.0.0';

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
  const navigate = useNavigate();

  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS);
  const [pushOn, setPushOn] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [swReady, setSwReady] = useState<boolean | null>(null);
  // Defaults to sharing everything, which is what a member with no row has —
  // the same state the app was in before these switches existed.
  const [share, setShare] = useState<SharePrefs>(SHARE_ALL);
  const [gym, setGym] = useState<GymSettingsRow | null>(null);
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

  const about = [
    ['Version', APP_VERSION],
    ['Gym', gym?.gym_name ?? null],
    ['Address', gym?.address ?? null],
    ['Phone', gym?.phone ?? null],
    ['Email', gym?.email ?? null],
  ].filter((r): r is [string, string] => Boolean(r[1]));

  return (
    <Page>
      <PageTitle back fallback="/member/profile" title="Settings" subtitle="Alerts, privacy and your account" />

      {/* Notifications — every switch here does something observable. */}
      <section>
        <SectionHead title="Notifications" />
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
        </Footnote>
      </section>

      {/* What your trainer sees.
          Enforced by RLS (migration 0032), not by hiding a panel: switching one
          off removes those rows from every trainer's queries. The wording names
          trainers specifically, because gym staff are deliberately not gated and
          a switch implying otherwise would be the same lie as the six dead ones
          this page used to carry. */}
      <section>
        <SectionHead title="What your trainer sees" />
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
        <Footnote>
          Your name, membership and gym check-ins are always visible to gym staff — that is how the
          front desk runs. These switches cover the personal logs you keep in Progress.
        </Footnote>
      </section>

      <section>
        <SectionHead title="Account & app" />
        <div style={{ marginTop: 2 }}>
          {links.map((l, i) => (
            <LineRow key={l.label} title={l.label} meta={l.description} action="Open" actionTone="structure"
              onClick={() => navigate(l.to)} last={i === links.length - 1} />
          ))}
        </div>
      </section>

      <section>
        <SectionHead title="About" meta="Core Fitness member app" />
        <div style={{ marginTop: 2 }}>
          {about.map(([k, v], i) => (
            <LineRow key={k} gutter={k} gutterWidth={72} title={v} last={i === about.length - 1} />
          ))}
        </div>
      </section>
    </Page>
  );
}
