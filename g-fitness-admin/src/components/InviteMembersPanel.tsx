import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { Copy, Download, Mail, Smartphone, X } from 'lucide-react';
import Button from './ui/Button';
import { getGymApp, type GymApp } from '../lib/api/gymApp';

export const MEMBER_APP = 'https://corefitness-gym.vercel.app';
/**
 * The Android app. It is a TWA (docs/DEPLOYMENT.md): a thin shell around the
 * member app, so one file serves every gym — the gym is chosen by the link or
 * the code, not by the download. Put the signed .apk at
 * g-fitness-member/public/core-fitness.apk and deploy; `/get-app` explains it.
 */
export const APP_PAGE = `${MEMBER_APP}/get-app`;

/**
 * Every way a member gets into this gym, in one place on the Members page —
 * where an owner looks for it. Until now the link and code lived only on
 * "Your app", and Members offered a walk-in form and nothing else.
 */
export default function InviteMembersPanel({ onClose }: { onClose: () => void }) {
  const [app, setApp] = useState<GymApp | null | undefined>(undefined);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void getGymApp().then((a) => { if (alive) setApp(a); });
    return () => { alive = false; };
  }, []);

  const copy = (key: string, text: string) => {
    void navigator.clipboard.writeText(text).then(() => setCopied(key), () => setCopied(null));
  };
  const joinLink = app ? `${MEMBER_APP}/join/${app.slug}` : '';
  const codeLink = app?.join_code ? `${MEMBER_APP}/join?code=${app.join_code}` : '';
  const message = app ? [
    `Join ${app.gym_name} on our app:`,
    joinLink,
    app.join_code ? `Already have the app? Open it, tap "Have a join code?" and type ${app.join_code}.` : null,
    `Android app: ${APP_PAGE}`,
  ].filter(Boolean).join('\n') : '';

  const row = (key: string, label: string, value: string) => (
    <div className="rounded-lg border p-3" style={{ borderColor: 'var(--color-border)' }}>
      <p className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>{label}</p>
      <div className="mt-1 flex items-center gap-2">
        <span className="flex-1 min-w-0 break-all text-sm" style={{ color: 'var(--color-text-primary)' }}>{value}</span>
        <Button variant="outline" size="sm" onClick={() => copy(key, value)}>
          <Copy size={13} /> {copied === key ? 'Copied' : 'Copy'}
        </Button>
      </div>
    </div>
  );

  return createPortal((
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}
      onMouseDown={onClose}>
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border p-5"
        style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
        onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label="Invite members">
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <h2 className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>Invite members</h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
              Send the link, show the QR code at the desk, or give the code to someone who already has the app.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" style={{ color: 'var(--color-text-muted)' }}><X size={18} /></button>
        </div>

        {app === undefined && <p className="mt-4 text-sm" style={{ color: 'var(--color-text-muted)' }}>Loading…</p>}
        {app === null && <p className="mt-4 text-sm" style={{ color: 'var(--color-text-muted)' }}>Your gym's join details could not be read.</p>}

        {app && app.join_policy === 'closed' && (
          <p className="mt-4 rounded-lg p-3 text-sm" style={{ background: 'var(--color-secondary-light, rgba(245,158,11,0.1))', color: 'var(--color-text-primary)' }}>
            Your gym signs members up only at the desk, so there is no link or code to share. Change it under{' '}
            <Link to="/gym-app" className="underline">Your app → How they join</Link>, or add a walk-in here.
          </p>
        )}

        {app && app.join_policy !== 'closed' && (
          <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
            <div className="space-y-2.5 min-w-0">
              {row('link', 'Join link', joinLink)}
              {app.join_code && row('code', 'Join code', app.join_code)}
              {row('app', 'Android app', APP_PAGE)}
              <Button className="w-full" onClick={() => copy('message', message)}>
                <Copy size={14} /> {copied === 'message' ? 'Message copied — paste it in Messenger or SMS' : 'Copy a ready-to-send message'}
              </Button>
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                {app.join_policy === 'open'
                  ? 'Your gym is listed, so people can also find it by name in the app.'
                  : 'Your gym is not listed: people join only with this link or code. Nobody can find it by searching.'}
                {' '}Anyone who joins this way waits for the desk to approve them under Pending.
              </p>
            </div>
            <div className="flex flex-col items-center gap-2">
              <div className="rounded-xl bg-white p-3"><QRCodeSVG value={app.join_code ? codeLink : joinLink} size={150} /></div>
              <span className="text-[11px] text-center" style={{ color: 'var(--color-text-muted)', maxWidth: 170 }}>
                Scanning opens the sign-up for {app.gym_name}
              </span>
            </div>
          </div>
        )}

        <div className="mt-5 grid gap-2 sm:grid-cols-3">
          <a href={APP_PAGE} target="_blank" rel="noreferrer"
            className="flex items-center gap-2 rounded-lg border p-3 text-sm" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}>
            <Download size={16} /> Android app page
          </a>
          <Link to="/invitations" onClick={onClose}
            className="flex items-center gap-2 rounded-lg border p-3 text-sm" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}>
            <Mail size={16} /> Invite one person by email
          </Link>
          <Link to="/gym-app" onClick={onClose}
            className="flex items-center gap-2 rounded-lg border p-3 text-sm" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}>
            <Smartphone size={16} /> Poster and joining rules
          </Link>
        </div>
      </div>
    </div>
  ), document.body);
}
