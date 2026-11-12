import { useEffect, useState } from 'react';
import { chatUnread } from '../lib/api/gymChat';
import { useGymApp } from './useGymApp';

/**
 * The gym chat's badge (0246): messages from others since this person last
 * looked, re-read every 30 seconds while the app is on screen.
 *
 * `on` is true only when the gym has said the chat is on — an unknown answer
 * (an older database, a failed read) shows no chat button, because a button
 * that opens "the chat did not load" is worse than none. The count is 0, never
 * an error, when the read fails.
 */
export function useChatUnread(): { on: boolean; unread: number } {
  const app = useGymApp();
  const on = app?.modules?.gym_chat === true;
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!on) return;
    let alive = true;
    const read = () => { void (async () => { const n = await chatUnread(); if (alive) setUnread(n); })(); };
    read();
    const timer = setInterval(() => { if (document.visibilityState === 'visible') read(); }, 30_000);
    const onVisible = () => { if (document.visibilityState === 'visible') read(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { alive = false; clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [on]);

  return { on, unread: on ? unread : 0 };
}
