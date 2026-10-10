import { useEffect, useState } from 'react';
import { Navigate, useLocation, useParams } from 'react-router-dom';
import { Page, PageTitle } from '../components/ui/page';
import { SkeletonList } from '../components/ui/Skeleton';
import { supabase } from '../lib/supabaseClient';
import { myConversations } from '../lib/api/chat';
import { myRooms } from '../lib/api/rooms';

/**
 * Messages and Coach notes became the 1-on-1 room's Together tab (2026-10-10,
 * 0174). Every link that used to open them — a chat notification
 * (/member/messages/<conversation>), a bookmark, "Coach notes" — lands here and
 * goes on to the room with that coach: the one 1-on-1 room when there is one,
 * the room for that conversation's coach, or the list of rooms.
 */
export default function CoachPlaceRedirect() {
  const { conversationId } = useParams();
  const { pathname } = useLocation();
  const base = pathname.startsWith('/trainer') ? '/trainer' : '/member';
  const [to, setTo] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      let roomId: string | null = null;
      if (conversationId) {
        const conv = (await myConversations())?.find((c) => c.id === conversationId);
        if (conv) {
          const { data } = await supabase.rpc('pt_room_with', { p_other: conv.otherId });
          roomId = (data as string | null) ?? null;
        }
      }
      if (!roomId) {
        const pt = (await myRooms())?.filter((r) => r.kind === 'pt' && !r.archived) ?? [];
        if (pt.length === 1) roomId = pt[0].id;
      }
      if (alive) setTo(roomId ? `${base}/rooms/${roomId}` : `${base}/rooms`);
    })();
    return () => { alive = false; };
  }, [base, conversationId]);

  if (to) return <Navigate to={to} replace />;
  return <Page><PageTitle back title="Opening…" /><SkeletonList count={2} /></Page>;
}
