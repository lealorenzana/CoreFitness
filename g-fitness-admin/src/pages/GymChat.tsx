import PageGuide from '../components/guides/PageGuide';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import GymChatView from '../components/gymchat/GymChatView';
import { useGymChat } from '../hooks/useGymChat';
import { useGymModules, moduleOn } from '../hooks/useGymModules';
import { getGymContext } from '../lib/gymContext';
import { showToast } from '../utils/toast';
import './attendance/att.css';

/**
 * Gym chat (0246): the gym's one group chat, from the owner's and the desk's
 * side. The same screen the phone shows (`GymChatView`, identical in both
 * apps) — here inside a page that holds the screen: the chat's own list
 * scrolls, never the page.
 *
 * The owner and desk moderate from inside it: a message's menu removes or pins
 * it, the flag opens members' reports, People stops someone posting and (the
 * owner) makes the chat announcements-only. What each may do is the server's
 * answer, not this page's.
 *
 * The admin app has no push, so the owner and desk learn of new messages from
 * the dashboard's Needs you (reports) and by opening this page.
 */
export default function GymChat() {
  const modules = useGymModules();
  const on = moduleOn(modules, 'gym_chat');
  const [gymName, setGymName] = useState('Gym chat');
  useEffect(() => {
    let alive = true;
    void (async () => {
      const ctx = await getGymContext().catch(() => null);
      if (alive && ctx?.gymName) setGymName(ctx.gymName);
    })();
    return () => { alive = false; };
  }, []);

  return (
    <div className="att" data-gym-chat-page>
      <div className="a-head">
        <div className="min-w-0"><h1>Gym chat</h1><p>One group chat for your whole gym — members, coaches, the front desk and you</p></div>
        <PageGuide id="gym-chat" />
      </div>
      {on ? <Chat title={gymName} /> : (
        <div className="a-card" style={{ flex: 1 }}>
          <p className="a-sub" style={{ padding: '10px 0' }} data-gym-chat-off>
            The gym chat is switched off. Turn it on in <Link to="/gym-app?tab=runs" style={{ color: 'var(--a-p300)', fontWeight: 600 }}>Your app → What you run</Link>.
          </p>
        </div>
      )}
    </div>
  );
}

/** Mounted only while the chat is on, so a gym that never switched it on does not poll. */
function Chat({ title }: { title: string }) {
  const chat = useGymChat(true);
  const [params] = useSearchParams();
  return (
    <div className="a-card" style={{ flex: 1, minHeight: 0, padding: 0, overflow: 'hidden', maxWidth: 860, width: '100%', alignSelf: 'center' }}>
      <GymChatView chat={chat} toast={showToast} title={title} startOnReports={params.get('reports') === '1'} />
    </div>
  );
}
