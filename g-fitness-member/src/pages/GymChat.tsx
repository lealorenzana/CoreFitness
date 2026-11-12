import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import GymChatView from '../components/gymchat/GymChatView';
import { useGymChat } from '../hooks/useGymChat';
import { useGymApp } from '../hooks/useGymApp';
import { toast } from '../components/ui/Toast';
import { useT } from '../lib/i18n';

/**
 * The gym chat (0246), on the phone: `/member/gym-chat` for members and
 * `/trainer/gym-chat` for coaches — the same screen (`GymChatView`, identical
 * in the admin app), filling the page with its own list scrolling inside.
 *
 * Who may open it, post in it or moderate it is the server's answer every few
 * seconds, so a member whose plan lapses mid-conversation sees it close with
 * the reason rather than a button that fails.
 */
export default function GymChat({ fallback }: { fallback: string }) {
  const navigate = useNavigate();
  const app = useGymApp();
  const t = useT();
  const chat = useGymChat(true);
  // Back undoes the last step; a cold open (a notification) goes to the fallback.
  const back = useCallback(() => {
    if (window.history.length > 1) navigate(-1); else navigate(fallback);
  }, [navigate, fallback]);
  const say = useCallback((message: string, kind?: 'success' | 'error') => {
    if (kind === 'error') toast.error(message); else toast.success(message);
  }, []);

  return (
    <div data-gym-chat-page style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', paddingTop: 'env(safe-area-inset-top, 0px)' }}>
      <GymChatView chat={chat} toast={say} t={t} title={app?.shortName || app?.gymName || t('Gym chat')}
        lead={<button type="button" className="gc-icon" aria-label={t('Back')} onClick={back}><ChevronLeft size={22} /></button>} />
    </div>
  );
}
