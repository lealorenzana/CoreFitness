import { useEffect, useState } from 'react';
import { Navigate, useLocation, useParams } from 'react-router-dom';
import { Page, PageTitle } from '../../components/ui/page';
import { SkeletonList } from '../../components/ui/Skeleton';
import { myCoachings } from '../../lib/api/coaching';
import { myConversations } from '../../lib/api/chat';

/**
 * Old coach links (simplify, 2026-10-28) — bookmarks and notification rows
 * written before a trainee had one place: a room (`/trainer/rooms/:roomId`), a
 * chat (`/trainer/messages/:conversationId`), Your trainees (`/trainer/members`,
 * `?open=<member>`), Coaching (`/trainer/coaching`). Each lands on that person's
 * place, or on Personal training — never a blank page.
 */
export default function TrainerOldLink() {
  const { roomId, conversationId } = useParams();
  const { pathname, search } = useLocation();
  const [to, setTo] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const q = new URLSearchParams(search);
      let dest = '/trainer/home?view=pt';
      if (pathname.startsWith('/trainer/coaching')) dest = `/trainer/packages${search}`;
      else if (pathname.startsWith('/trainer/members') && q.get('open')) dest = `/trainer/pt/${q.get('open')}?tab=about`;
      else if (roomId) {
        const c = (await myCoachings().catch(() => null))?.find((x) => x.roomId === roomId);
        const tab = q.get('tab');
        if (c) dest = `/trainer/pt/${c.memberId}${tab === 'classwork' || tab === 'progress' ? `?tab=${tab}` : ''}`;
      } else if (conversationId) {
        const conv = (await myConversations().catch(() => undefined))?.find((x) => x.id === conversationId);
        if (conv) dest = `/trainer/pt/${conv.otherId}`;
      }
      if (alive) setTo(dest);
    })();
    return () => { alive = false; };
  }, [pathname, search, roomId, conversationId]);

  if (to) return <Navigate to={to} replace />;
  return <Page><PageTitle back fallback="/trainer/home" title="Opening…" /><SkeletonList count={2} /></Page>;
}
