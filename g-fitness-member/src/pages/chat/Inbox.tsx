import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { BellSlash, ChatsCircle } from '@phosphor-icons/react';
import Avatar from '../../components/ui/Avatar';
import { Page, PageTitle } from '../../components/ui/page';
import { LineRow, Panel, SectionHead, StatusPill } from '../../components/ui/noc';
import { SkeletonList } from '../../components/ui/Skeleton';
import { toast } from '../../components/ui/Toast';
import { errorMessage } from '../../utils/errorMessage';
import { myCoaches, myConversations, openConversation, type Conversation } from '../../lib/api/chat';

function when(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Messages (0131): the member's chats with their coaches, or a coach's with
 * their trainees. Private to the two people in each — the gym's owner and desk
 * cannot read them. A member starts a new chat with any coach they train with.
 */
export default function Inbox() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const base = pathname.startsWith('/trainer') ? '/trainer/messages' : '/member/messages';
  const isMember = base.startsWith('/member');
  const [list, setList] = useState<Conversation[] | null | undefined>(null);
  const [coaches, setCoaches] = useState<{ id: string; name: string; photoUrl: string | null }[]>([]);

  const load = useCallback(async () => {
    const [c, k] = await Promise.all([myConversations(), isMember ? myCoaches() : Promise.resolve([])]);
    setList(c); setCoaches(k);
  }, [isMember]);
  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  const start = async (id: string) => {
    try { navigate(`${base}/${await openConversation(id)}`); }
    catch (e) { toast.error(errorMessage(e, 'That chat could not be opened')); }
  };

  if (list === null) return <Page><PageTitle back title="Messages" /><SkeletonList /></Page>;
  if (list === undefined) {
    return <Page><PageTitle back title="Messages" /><p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Messages are not switched on at your gym yet.</p></Page>;
  }
  const withChat = new Set(list.map((c) => c.otherId));
  const fresh = coaches.filter((c) => !withChat.has(c.id));

  return (
    <Page>
      <PageTitle back fallback={isMember ? '/member/home' : '/trainer/home'} title="Messages"
        subtitle={isMember ? 'Private, between you and your coach' : 'Private, between you and each trainee'} />

      {list.length === 0 && fresh.length === 0 && (
        <Panel>
          <p className="flex items-center" style={{ gap: 8, fontSize: 14, fontWeight: 700, color: 'var(--color-text-primary)' }}>
            <ChatsCircle size={20} aria-hidden /> No chats yet
          </p>
          <p style={{ fontSize: 13, marginTop: 6, color: 'var(--color-text-secondary)' }}>
            {isMember ? 'Book a class or a 1-on-1 and you can message that coach here.'
              : 'Open a room and tap Message beside a member to start a chat.'}
          </p>
        </Panel>
      )}

      {list.length > 0 && (
        <section>
          {list.map((c, i) => (
            <LineRow key={c.id} last={i === list.length - 1}
              gutter={<Avatar name={c.otherName} photoUrl={c.otherPhoto} size={36} />} gutterWidth={48}
              title={c.otherName}
              meta={c.lastMessage ? `${c.lastFromMe ? 'You: ' : ''}${c.lastMessage.slice(0, 60)}${c.lastMessage.length > 60 ? '…' : ''}` : 'No messages yet'}
              action={c.unread > 0 ? <StatusPill label={`${c.unread} new`} tone="action" />
                : c.muted ? <BellSlash size={16} aria-label="Muted" style={{ color: 'var(--color-text-muted)' }} />
                : <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{when(c.lastMessageAt)}</span>}
              onClick={() => navigate(`${base}/${c.id}`)} />
          ))}
        </section>
      )}

      {isMember && fresh.length > 0 && (
        <section>
          <SectionHead title="Message a coach" />
          {fresh.map((c, i) => (
            <LineRow key={c.id} last={i === fresh.length - 1}
              gutter={<Avatar name={c.name} photoUrl={c.photoUrl} size={36} />} gutterWidth={48}
              title={c.name} meta="You train with this coach" onClick={() => void start(c.id)} />
          ))}
        </section>
      )}
    </Page>
  );
}
