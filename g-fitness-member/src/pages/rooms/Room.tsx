import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Page, PageTitle } from '../../components/ui/page';
import { NocButton, TextTabs } from '../../components/ui/noc';
import { SkeletonList } from '../../components/ui/Skeleton';
import { toast } from '../../components/ui/Toast';
import { errorMessage } from '../../utils/errorMessage';
import StreamTab from '../../components/rooms/StreamTab';
import ClassworkTab from '../../components/rooms/ClassworkTab';
import PeopleTab from '../../components/rooms/PeopleTab';
import ProgressTab from '../../components/rooms/ProgressTab';
import { leaveRoom, myRooms, setArchived, updateRoom, type Room as RoomT } from '../../lib/api/rooms';

type Tab = 'stream' | 'classwork' | 'people' | 'progress';
const KIND: Record<RoomT['kind'], string> = { class: 'Class', pt: '1-on-1', group: 'Coaching group' };

/**
 * One room, Google Classroom style (0128/0129). The same screen serves the
 * trainer (/trainer/rooms/:id — Stream, Classwork, People, Progress) and the
 * member (/member/rooms/:id — Stream, Classwork, People). The tab is in the
 * URL, so Back returns to the tab you were on.
 */
export default function Room() {
  const { roomId = '' } = useParams();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const mode: 'trainer' | 'member' = pathname.startsWith('/trainer') ? 'trainer' : 'member';
  const [room, setRoom] = useState<RoomT | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const all = await myRooms();
    setRoom(all?.find((r) => r.id === roomId) ?? null);
  }, [roomId]);
  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  const fallback = mode === 'trainer' ? '/trainer/rooms' : '/member/rooms';
  if (room === undefined) return <Page><PageTitle back fallback={fallback} title="Room" /><SkeletonList /></Page>;
  if (room === null) {
    return (
      <Page>
        <PageTitle back fallback={fallback} title="Room" />
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>This room is not one of yours, or it no longer exists.</p>
      </Page>
    );
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'stream', label: 'Stream' }, { id: 'classwork', label: 'Classwork' }, { id: 'people', label: 'People' },
    ...(mode === 'trainer' ? [{ id: 'progress' as Tab, label: 'Progress' }] : []),
  ];
  const wanted = params.get('tab') as Tab | null;
  const tab: Tab = tabs.some((t) => t.id === wanted) ? (wanted as Tab) : 'stream';
  const isTrainer = mode === 'trainer' && room.isMine;

  const run = async (fn: () => Promise<unknown>, ok: string, after?: () => void) => {
    setBusy(true);
    try { await fn(); toast.success(ok); if (after) after(); else await load(); }
    catch (e) { toast.error(errorMessage(e, 'That did not work')); }
    finally { setBusy(false); }
  };

  return (
    <Page>
      <PageTitle back fallback={fallback} title={room.name}
        subtitle={`${KIND[room.kind]}${mode === 'member' ? ` · ${room.trainerName}` : ` · ${room.memberCount} member${room.memberCount === 1 ? '' : 's'}`}${room.archived ? ' · closed' : ''}`} />
      {room.description && <p style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{room.description}</p>}

      <TextTabs label="Room sections" tabs={tabs} active={tab}
        onChange={(t) => setParams(t === 'stream' ? {} : { tab: t }, { replace: true })} />

      {tab === 'stream' && (
        <StreamTab room={room} canPost={isTrainer} canComment={isTrainer || (mode === 'member' && room.fullAccess)} />
      )}
      {tab === 'classwork' && <ClassworkTab room={room} mode={mode} />}
      {tab === 'people' && <PeopleTab room={room} mode={isTrainer ? 'trainer' : 'member'} onChanged={() => void load()} />}
      {tab === 'progress' && isTrainer && <ProgressTab room={room} />}

      {tab === 'people' && isTrainer && (
        <div className="flex flex-col" style={{ gap: 8 }}>
          <NocButton variant="ghost" disabled={busy}
            onClick={() => void run(() => updateRoom(room.id, { commentsOn: !room.commentsOn }),
              room.commentsOn ? 'Comments are off in this room.' : 'Comments are on.')}>
            {room.commentsOn ? 'Turn comments off' : 'Turn comments on'}
          </NocButton>
          {room.kind === 'group' && (
            <NocButton variant="ghost" disabled={busy}
              onClick={() => void run(() => setArchived(room.id, !room.archived),
                room.archived ? 'The group is open again.' : 'The group is closed. It stays readable.')}>
              {room.archived ? 'Reopen the group' : 'Close the group'}
            </NocButton>
          )}
        </div>
      )}
      {tab === 'people' && mode === 'member' && room.kind === 'group' && (
        <NocButton variant="ghost" disabled={busy}
          onClick={() => void run(() => leaveRoom(room.id), 'You left the group.', () => navigate('/member/rooms'))}>
          Leave the group
        </NocButton>
      )}
    </Page>
  );
}
