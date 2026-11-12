import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Bell } from '@phosphor-icons/react';

/**
 * A push that arrives while the app is open slides down from the top (owner,
 * 2026-11-12: "it doesn't show … no notification that slides through my screen").
 *
 * The phone's own banner over other apps is the phone's decision — Android shows
 * one only where the app's notifications are set to "Pop on screen" — so inside
 * the app we draw our own: the service worker (`public/push-sw.js`) hands every
 * push to the open window as a message, and this shows it for a few seconds.
 * Tapping it goes where the notification would. Nothing is shown for the screen
 * the person is already on (a chat message while the chat is open).
 */
interface Shown { id: number; title: string; body: string; url: string }

export default function PushBanner() {
  const [shown, setShown] = useState<Shown | null>(null);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onMessage = (e: MessageEvent) => {
      const d = e.data as { type?: string; title?: unknown; body?: unknown; url?: unknown } | null;
      if (!d || d.type !== 'cf-push' || typeof d.title !== 'string') return;
      const url = typeof d.url === 'string' && d.url.startsWith('/') ? d.url : '/member/home';
      if (url === window.location.pathname) return;
      const id = Date.now();
      setShown({ id, title: d.title, body: typeof d.body === 'string' ? d.body : '', url });
      clearTimeout(timer);
      timer = setTimeout(() => setShown((s) => (s?.id === id ? null : s)), 5500);
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => { navigator.serviceWorker.removeEventListener('message', onMessage); clearTimeout(timer); };
  }, []);

  // Going there by any road puts the banner away.
  const here = location.pathname;
  if (!shown || shown.url === here) return null;
  return (
    <button type="button" key={shown.id} className="push-banner" data-push-banner aria-live="polite"
      onClick={() => { const to = shown.url; setShown(null); navigate(to); }}>
      <span className="push-banner__icon on-fill" aria-hidden><Bell size={17} weight="fill" /></span>
      <span className="min-w-0 flex-1 text-left">
        <span className="push-banner__title">{shown.title}</span>
        {shown.body && <span className="push-banner__body">{shown.body}</span>}
      </span>
    </button>
  );
}
