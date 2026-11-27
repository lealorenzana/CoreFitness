import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { ArrowRight, Check, Copy, Download, Mail, MessageSquare, Printer, Smartphone, UserPlus, X } from 'lucide-react';
import { getGymApp, type GymApp } from '../lib/api/gymApp';
import SkelRows from './ui/SkelRows';
import JoinPoster from './JoinPoster';
import { rampFor } from '../lib/gymTheme';

export const MEMBER_APP = 'https://corefitness-gym.vercel.app';
/**
 * The Android app. It is a TWA (docs/DEPLOYMENT.md): a thin shell around the
 * member app, so one file serves every gym — the gym is chosen by the link or
 * the code, not by the download. Put the signed .apk at
 * g-fitness-member/public/core-fitness.apk and deploy; `/get-app` explains it.
 */
export const APP_PAGE = `${MEMBER_APP}/get-app`;

/**
 * Every way a member gets into this gym, in one place on the Members page. Since 2026-11-27 (owner) the same
 * floating window as Add member (`am-*` in v2.css): a panel in the gym's colour with the QR code to show at the
 * desk and a mascot, the link, code and app beside it, one amber button (copy a ready message). A gym that signs
 * members up only at the desk has nothing to share, and the window says so with the two ways forward.
 */
export default function InviteMembersPanel({ onClose, onAddWalkIn }: { onClose: () => void; onAddWalkIn?: () => void }) {
  const [app, setApp] = useState<GymApp | null | undefined>(undefined);
  const [copied, setCopied] = useState<string | null>(null);
  const [poster, setPoster] = useState(false);

  useEffect(() => {
    let alive = true;
    void getGymApp().then((a) => { if (alive) setApp(a); });
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    // While the poster is open, Escape is the poster's.
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !poster) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, poster]);

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
  const open = !!app && app.join_policy !== 'closed';

  const field = (key: string, label: string, value: string, big?: boolean) => (
    <div className="iv-field">
      <span>{label}</span>
      <div><b className={big ? 'big' : ''}>{value}</b>
        <button type="button" className="am-btn sm" onClick={() => copy(key, value)} aria-label={`Copy the ${label.toLowerCase()}`}>
          {copied === key ? <Check size={13} /> : <Copy size={13} />}{copied === key ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
  const more = (to: string, icon: React.ReactNode, title: string, sub: string, external?: boolean) => {
    const inner = <>{icon}<span className="flex-1 min-w-0"><b>{title}</b><small>{sub}</small></span><ArrowRight size={14} className="go" /></>;
    return external
      ? <a href={to} target="_blank" rel="noreferrer" className="iv-more">{inner}</a>
      : <Link to={to} onClick={onClose} className="iv-more">{inner}</Link>;
  };

  // The poster takes the screen while it is open (its own print layout); closing it comes back here.
  if (poster && app) {
    return (
      <JoinPoster gymName={app.gym_name} tagline={app.tagline} logoUrl={app.logo_url} joinLink={joinLink}
        /* A listed gym has no code, so the poster leaves that half out rather than printing a blank box. */
        joinCode={app.join_policy === 'code' ? app.join_code : null}
        accent={rampFor(app.accent, 'violet').base} onClose={() => setPoster(false)} />
    );
  }

  return createPortal((
    <div className="am-root" role="dialog" aria-modal="true" aria-label="Invite members" data-invite-panel>
      <div className="am-scrim" onClick={onClose} />
      <div className="am-win iv-win">
        <aside className="am-side">
          <div>
            <h2>Invite members</h2>
            <p>{open ? 'Send the link, show the code at the desk, or give the code to someone who already has the app.'
              : 'How people get into your gym, and what to hand them.'}</p>
          </div>
          {open && (
            <div className="iv-qr" data-invite-qr>
              <div className="card"><QRCodeSVG value={app.join_code ? codeLink : joinLink} size={148} /></div>
              <small>Scanning opens the sign-up for {app.gym_name}</small>
            </div>
          )}
          <div className="am-buddy" aria-hidden>
            <p className="am-say">{app === undefined ? 'Getting your gym’s join details.'
              : !app ? 'I could not read your join details. Reload and try again.'
              : open ? 'Show the code at the desk, or send the link. They wait for your approval under Sign-ups.'
              : 'Members join only at the desk right now, so there is nothing to share yet.'}</p>
            <img src={open || app === undefined ? '/mockup-art/phone-journey-mascot.webp' : '/images/admin-art/mascot-map.webp'} alt="" className={open ? 'small' : ''} />
          </div>
        </aside>

        <section className="am-main">
          <button type="button" aria-label="Close" onClick={onClose} className="am-x"><X size={16} /></button>
          <div className="am-form iv-body">
            {app === undefined && <SkelRows label="Loading" />}
            {app === null && <p className="am-hint">Your gym's join details could not be read. Reload the page to try again.</p>}

            {app && !open && (
              <div className="iv-closed" data-invite-closed>
                <h3>Your gym signs members up at the desk only</h3>
                <p className="am-hint">There is no link or code to share while it does. Let people join from the app under <b>Your app, How they join</b>, or add them at the desk.</p>
                <div className="flex gap-2 flex-wrap">
                  <Link to="/gym-app" onClick={onClose} className="am-btn go"><Smartphone size={14} />Change how they join</Link>
                  {onAddWalkIn && <button type="button" className="am-btn" onClick={() => { onClose(); onAddWalkIn(); }}><UserPlus size={14} />Add a walk-in</button>}
                </div>
              </div>
            )}

            {app && open && (
              <div className="iv-share">
                <h3>Share it</h3>
                {app.join_code && field('code', 'Join code', app.join_code, true)}
                {field('link', 'Join link', joinLink)}
                {field('app', 'Android app', APP_PAGE)}
                <button type="button" className="am-btn go iv-send" onClick={() => copy('message', message)} data-copy-message>
                  {copied === 'message' ? <Check size={15} /> : <MessageSquare size={15} />}
                  {copied === 'message' ? 'Copied. Paste it in Messenger or a text' : 'Copy a ready-to-send message'}
                </button>
                <p className="am-hint">
                  {app.join_policy === 'open'
                    ? 'Your gym is listed, so people can also find it by name in the app.'
                    : 'Your gym is not listed: people join only with this link or code. Nobody can find it by searching.'}
                  {' '}Anyone who joins this way waits for the desk to approve them under Sign-ups.
                </p>
              </div>
            )}

            {app !== undefined && (
              <div className="iv-mores">
                <h3>More ways</h3>
                {more(APP_PAGE, <Download size={16} />, 'Android app page', 'Where members download the app', true)}
                {more('/invitations', <Mail size={16} />, 'Invite one person by email', 'They get a login straight away')}
                {/* The poster lives on Your app, but only while people can join from the app; it opens right here too. */}
                {open && (
                  <button type="button" className="iv-more w-full text-left" onClick={() => setPoster(true)} data-print-poster>
                    <Printer size={16} /><span className="flex-1 min-w-0"><b>Print a poster</b><small>The QR and the code, for the wall by the desk</small></span><ArrowRight size={14} className="go" />
                  </button>
                )}
                {more('/gym-app', <Smartphone size={16} />, 'Joining rules', open ? 'Who may join, and whether you approve each one' : 'Let people join from the app; the poster comes with it')}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  ), document.body);
}
