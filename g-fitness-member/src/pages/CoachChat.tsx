import { useEffect, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { Page, PageTitle } from '../components/ui/page';
import { SkeletonList } from '../components/ui/Skeleton';
import TimelineTab from '../components/rooms/TimelineTab';
import { myRooms } from '../lib/api/rooms';
import { listPublicTrainers, trainerName } from '../lib/api/directory';

/**
 * The chat with one coach (simplify, 2026-10-28): what a session row on Train →
 * Coach opens. A coach you have a package with has one place for you both —
 * the package's room, opened on its chat — so this goes there. Anyone else you
 * have trained with gets the chat on its own: single sessions keep their chat.
 */
export default function CoachChat() {
  const { trainerId = '' } = useParams();
  const [state, setState] = useState<{ roomId: string | null; name: string | null } | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const [rooms, coaches] = await Promise.all([myRooms().catch(() => null), listPublicTrainers().catch(() => [])]);
      const room = (rooms ?? []).find((r) => r.kind === 'pt' && r.trainerId === trainerId && !r.archived) ?? null;
      const coach = coaches.find((c) => c.id === trainerId);
      if (alive) setState({ roomId: room?.id ?? null, name: coach ? trainerName(coach) : null });
    })();
    return () => { alive = false; };
  }, [trainerId]);

  if (state === undefined) return <Page><PageTitle back fallback="/member/book-class?tab=coach" title="Chat" /><SkeletonList count={3} /></Page>;
  if (state.roomId) return <Navigate to={`/member/rooms/${state.roomId}`} replace />;
  return (
    <Page>
      <PageTitle back fallback="/member/book-class?tab=coach" title={state.name ?? 'Your coach'} subtitle="Single sessions" />
      <div data-coach-chat={trainerId}>
        <TimelineTab room={null} mode="member" with={{ id: trainerId, name: state.name ?? 'Your coach' }} />
      </div>
    </Page>
  );
}
