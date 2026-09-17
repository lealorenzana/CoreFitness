import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from '../../components/ui/Toast';
import Modal from '../../components/ui/Modal';
import { errorMessage } from '../../utils/errorMessage';
import { logout } from '../../utils/auth';
import { playNotificationSound } from '../../utils/notificationSound';
import { getMyPrefs, updateMyPrefs, DEFAULT_PREFS, type NotificationPrefs } from '../../lib/api/notificationPrefs';
import { getGymSettings, type GymSettingsRow } from '../../lib/api/settings';
import { Page, PageTitle } from '../../components/ui/page';
import { LineRow, NocButton, SectionHead } from '../../components/ui/noc';

const APP_VERSION = '1.0.0';

/**
 * Trainer settings — drawn like the member Settings screen (Nocturne,
 * 2026-09-18): sections of rows on the page, a real switch, About at the foot.
 *
 * Written against the same rule as the member page: a control that writes a
 * flag nothing reads is a lie, so this one carries only what is wired.
 *
 * **Sound is here** because it is genuinely live — the bell reads
 * `notification_prefs.sound_enabled` and chimes when a row arrives (0025 is
 * what gives it something to chime *for*).
 *
 * **Push is deliberately absent**, and the footnote says so. The `send-push`
 * Edge Function only accepts admin/staff/trainer callers, so a member's phone
 * cannot ask it to alert a trainer, and 0025 writes rows from a trigger that has
 * no business making an HTTP call inside a booking transaction. **Category
 * switches are absent** for the same reason: they gate a push that never comes.
 *
 * **About** was a modal with "Core Fitness Mamburao" and the town typed in. It
 * now reads `gym_settings`, like the member page — gym names are never typed in.
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
          transition: 'transform 0.3s var(--ease-spring), background-color 0.2s ease',
        }}
      />
    </span>
  );
}

export default function TrainerSettings() {
  const navigate = useNavigate();

  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS);
  const [busy, setBusy] = useState(false);
  const [gym, setGym] = useState<GymSettingsRow | null>(null);
  const [confirmLogout, setConfirmLogout] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getMyPrefs()
      .then((p) => { if (!cancelled) setPrefs(p); })
      .catch(() => {});
    getGymSettings()
      .then((g) => { if (!cancelled) setGym(g); })
      .catch(() => { /* About shows only what it could read */ });
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

  const sections: { title: string; items: { label: string; description: string; to: string }[] }[] = [
    {
      title: 'Coaching',
      items: [
        { label: 'Bookable hours', description: 'When members can book you 1-on-1', to: '/trainer/availability' },
      ],
    },
    {
      title: 'Account',
      items: [
        { label: 'Edit profile', description: 'Photo, bio and specialisation', to: '/trainer/profile/edit' },
        { label: 'Change email', description: 'The address you sign in with', to: '/trainer/change-email' },
        { label: 'Change password', description: 'Update your password', to: '/trainer/change-password' },
        { label: 'Privacy policy', description: 'How your data is handled', to: '/privacy' },
        { label: 'Terms of service', description: 'Read our terms', to: '/terms' },
      ],
    },
  ];

  // A missed lookup renders nothing — never a typed-in fallback.
  const about = ([
    ['Version', APP_VERSION],
    ['Gym', gym?.gym_name ?? null],
    ['Address', gym?.address ?? null],
    ['Phone', gym?.phone ?? null],
    ['Email', gym?.email ?? null],
  ] as [string, string | null][]).filter((r): r is [string, string] => Boolean(r[1]));

  return (
    <Page>
      <PageTitle back fallback="/trainer/profile" title="Settings" subtitle="Sound, account and about" />

      <section>
        <SectionHead title="Notifications" />
        <div style={{ marginTop: 4 }}>
          <button
            role="switch"
            aria-checked={prefs.soundEnabled}
            onClick={toggleSound}
            disabled={busy}
            className="w-full flex items-center text-left disabled:opacity-60"
            style={{ gap: 14, padding: '13px 0' }}
          >
            <span className="flex-1 min-w-0">
              <span className="block" style={{ fontSize: 14.5, color: 'var(--color-text-primary)' }}>Sound</span>
              <span className="block" style={{ fontSize: 12, marginTop: 2, lineHeight: 1.45, color: 'var(--color-text-secondary)' }}>
                A chime when a booking arrives while the app is open
              </span>
            </span>
            <Switch on={prefs.soundEnabled} busy={busy} />
          </button>
        </div>
        {/* Saying why the obvious switch isn't here. An unexplained gap gets
            filled in by the reader, usually wrongly. */}
        <p style={{ fontSize: 12.5, marginTop: 10, lineHeight: 1.55, color: 'var(--color-text-muted)' }}>
          Booking requests appear in your bell. There is no push switch yet because nothing sends a
          push to a trainer — a member's phone isn't allowed to trigger one, so a switch here would
          subscribe you to a channel with nothing on it.
        </p>
      </section>

      {sections.map((section) => (
        <section key={section.title}>
          <SectionHead title={section.title} />
          <div style={{ marginTop: 4 }}>
            {section.items.map((item, i) => (
              <LineRow key={item.label} title={item.label} meta={item.description} action="Open" actionTone="structure"
                onClick={() => navigate(item.to)} last={i === section.items.length - 1} />
            ))}
          </div>
        </section>
      ))}

      <section>
        <SectionHead title="About" meta="Core Fitness trainer app" />
        <div style={{ marginTop: 4 }}>
          {about.map(([k, v], i) => (
            <LineRow key={k} gutter={k} gutterWidth={72} title={v} last={i === about.length - 1} />
          ))}
        </div>
      </section>

      <NocButton variant="ghost" className="w-full" onClick={() => setConfirmLogout(true)}>
        Log out
      </NocButton>

      <Modal
        isOpen={confirmLogout}
        onClose={() => setConfirmLogout(false)}
        title="Log out"
        subtitle="You will need your email and password to get back in."
        confirmLabel="Log out"
        cancelLabel="Stay signed in"
        onConfirm={() => void handleLogout()}
      >
        <span />
      </Modal>
    </Page>
  );
}
