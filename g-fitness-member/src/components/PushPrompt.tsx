import { useEffect, useState } from 'react';
import { BellRinging } from '@phosphor-icons/react';
import { NocButton } from './ui/noc';
import { toast } from './ui/Toast';
import { enablePush, isPushEnabled, pushSupport, refreshPushKey } from '../lib/api/push';
import { errorMessage } from '../utils/errorMessage';
import { useT } from '../lib/i18n';
import './push-prompt.css';

/** "Not now" lasts until the app is opened again — memory only, never storage. */
let dismissedThisSession = false;

/**
 * Asks this phone to receive notifications, on the home screen.
 *
 * Every notification already lands in the bell, and from 0170 the database
 * pushes each one — but a push needs this device's subscription, and the only
 * way to give it was a toggle deep in Settings, so no phone had one (0 in the
 * whole system on 2026-10-09). Shown until the device is subscribed; says how to
 * unblock it when the phone has refused, rather than offering a button that
 * cannot work.
 */
export default function PushPrompt() {
  const t = useT();
  const [state, setState] = useState<'hidden' | 'ask' | 'blocked'>('hidden');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (dismissedThisSession || !pushSupport().supported) return;
    void (async () => {
      await refreshPushKey();   // a subscription from an older key is replaced quietly (keys rotated 2026-11-14)
      if (await isPushEnabled()) return;
      const perm = typeof Notification !== 'undefined' ? Notification.permission : 'default';
      setState(perm === 'denied' ? 'blocked' : 'ask');
    })();
  }, []);

  if (state === 'hidden') return null;

  const turnOn = async () => {
    setBusy(true);
    try {
      await enablePush();
      setState('hidden');
      toast.success(t('Notifications are on for this phone'));
    } catch (err) {
      const perm = typeof Notification !== 'undefined' ? Notification.permission : 'default';
      if (perm === 'denied') setState('blocked');
      else toast.error(errorMessage(err, t('Could not turn notifications on')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="member-push-prompt" data-push-prompt aria-label={t('Turn on notifications')}>
      <div className="member-push-art" aria-hidden="true"><span /><BellRinging size={34} weight="duotone" /></div>
      <div className="member-push-copy">
        <div className="min-w-0 flex-1">
          <p style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--color-text-primary)' }}>
            {state === 'blocked' ? t('Notifications are blocked on this phone') : t('Turn on notifications')}
          </p>
          <p style={{ fontSize: 12.5, marginTop: 3, lineHeight: 1.5, color: 'var(--color-text-secondary)' }}>
            {state === 'blocked'
              ? t('Open your phone’s Settings → Apps → this app → Notifications, and allow them. Until then everything still arrives in the bell.')
              : t('Booking updates, coach messages and gym reminders—even when the app is closed.')}
          </p>
          {state === 'ask' && (
            <div className="member-push-actions">
              <NocButton variant="fill" disabled={busy} onClick={() => void turnOn()} style={{ height: 44, padding: '0 18px' }}>
                {busy ? t('Turning on…') : t('Turn on')}
              </NocButton>
              <NocButton variant="ghost" disabled={busy} style={{ height: 44, padding: '0 14px' }}
                onClick={() => { dismissedThisSession = true; setState('hidden'); }}>
                {t('Not now')}
              </NocButton>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
