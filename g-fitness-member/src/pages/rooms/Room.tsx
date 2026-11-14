import { useCallback, useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Page, PageTitle } from '../../components/ui/page';
import { LineRow, TextTabs } from '../../components/ui/noc';
import GlassSheet from '../../components/ui/GlassSheet';
import { BellSimple, BellSimpleSlash, DotsThreeVertical, Handshake, LockSimple, SignOut } from '@phosphor-icons/react';
import { SkeletonList } from '../../components/ui/Skeleton';
import { toast } from '../../components/ui/Toast';
import { errorMessage } from '../../utils/errorMessage';
import StreamTab from '../../components/rooms/StreamTab';
import ClassworkTab from '../../components/rooms/ClassworkTab';
import PeopleTab from '../../components/rooms/PeopleTab';
import ProgressTab from '../../components/rooms/ProgressTab';
import TimelineTab from '../../components/rooms/TimelineTab';
import { leaveRoom, myRooms, setArchived, updateRoom, type Room as RoomT } from '../../lib/api/rooms';

type Tab = 'together' | 'stream' | 'classwork' | 'people' | 'progress';
const KIND: Record<RoomT['kind'], string> = { class: 'Class', pt: 'Package', group: 'Coaching group' };

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
  /** Chat settings (2026-11-14): mute, the package, and — for a room that is not a package — leaving it. */
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mute, setMute] = useState<{ muted: boolean; toggle: () => void } | null>(null);

  const load = useCallback(async () => {
    const all = await myRooms();
    setRoom(all?.find((r) => r.id === roomId) ?? null);
  }, [roomId]);
  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  const fallback = mode === 'trainer' ? (room?.kind === 'pt' ? '/trainer/home' : `/trainer/rooms?room=${roomId}`) : '/member/book-class?tab=coach';
  if (room === undefined) return <Page><PageTitle back fallback={fallback} title="Room" /><SkeletonList /></Page>;
  // A member's room that is gone (a class or group room, deleted by 0220) lands on Train → Coach.
  if (room === null && mode === 'member') return <Navigate to="/member/book-class?tab=coach" replace />;
  if (room === null) {
    return (
      <Page>
        <PageTitle back fallback={fallback} title="Room" />
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>This room is not one of yours, or it no longer exists.</p>
      </Page>
    );
  }

  // A 1-on-1 room is the member and coach's ONE place (0174): Together first —
  // chat, notes and the coach's routines in one timeline — then classwork.
  const pt = room.kind === 'pt';
  const tabs: { id: Tab; label: string }[] = pt
    ? [{ id: 'together', label: 'Chat' }, { id: 'classwork', label: 'Classwork' },
       ...(mode === 'trainer' ? [{ id: 'progress' as Tab, label: 'Progress' }] : [])]
    : [{ id: 'stream', label: 'Stream' }, { id: 'classwork', label: 'Classwork' }, { id: 'people', label: 'People' },
       ...(mode === 'trainer' ? [{ id: 'progress' as Tab, label: 'Progress' }] : [])];
  const first: Tab = pt ? 'together' : 'stream';
  const wanted = params.get('tab') as Tab | null;
  const tab: Tab = tabs.some((t) => t.id === wanted) ? (wanted as Tab) : first;
  const isTrainer = mode === 'trainer' && room.isMine;

  const run = async (fn: () => Promise<unknown>, ok: string, after?: () => void) => {
    if (busy) return;   // one tap at a time
    setBusy(true);
    try { await fn(); toast.success(ok); if (after) after(); else await load(); }
    catch (e) { toast.error(errorMessage(e, 'That did not work')); }
    finally { setBusy(false); }
  };

  // A chat screen, Messenger style (2026-11-14): the header and tabs stay put, the messages scroll between them and
  // the box to type in, docked at the bottom. Settings (⋮) hold mute and the package — a package room is never
  // "left": leaving it means ending the package, which Manage package does with its reason.
  const sheetRow = { gap: 0 };
  return (
    <div className="noc-chat" data-room={room.id}>
      <div className="noc-chat-head">
        <PageTitle back fallback={fallback} title={room.name}
          subtitle={`${KIND[room.kind]}${mode === 'member' ? ` · ${room.trainerName}` : ` · ${room.memberCount} member${room.memberCount === 1 ? '' : 's'}`}${room.archived ? ' · closed' : ''}`}
          action={(
            <button type="button" onClick={() => setSettingsOpen(true)} aria-label="Chat settings" data-room-settings
              className="grid place-items-center noc-press" style={{ width: 40, height: 40, borderRadius: 20, color: 'var(--color-text-secondary)',
                border: '1px solid rgb(var(--hair-rgb, 233 233 237) / 0.12)' }}>
              <DotsThreeVertical size={20} weight="bold" />
            </button>
          )} />
        <TextTabs label="Room sections" tabs={tabs} active={tab}
          onChange={(t) => setParams(t === first ? {} : { tab: t }, { replace: true })} />
      </div>

      {tab === 'together'
        ? <TimelineTab room={room} mode={mode} docked onMute={setMute} />
        : (
          <div className="noc-chat-scroll flex flex-col" style={{ gap: 'var(--stack)' }}>
            {room.description && <p style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{room.description}</p>}
            {tab === 'stream' && (
              <StreamTab room={room} canPost={isTrainer} canComment={isTrainer || (mode === 'member' && room.fullAccess)} />
            )}
            {tab === 'classwork' && <ClassworkTab room={room} mode={mode} />}
            {tab === 'people' && <PeopleTab room={room} mode={isTrainer ? 'trainer' : 'member'} onChanged={() => void load()} />}
            {tab === 'progress' && isTrainer && <ProgressTab room={room} />}
          </div>
        )}

      <GlassSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} title="Chat settings"
        subtitle={mode === 'member' ? `${KIND[room.kind]} with ${room.trainerName}` : room.name}>
        <div data-room-settings-sheet style={sheetRow}>
          {mute && (
            <LineRow icon={mute.muted ? BellSimpleSlash : BellSimple}
              title={mute.muted ? 'Alerts are muted' : 'Mute alerts from this chat'}
              meta={mute.muted ? 'Tap to turn them back on' : 'Messages still arrive here, without a notification'}
              onClick={() => mute.toggle()} />
          )}
          {mode === 'member' && pt && (
            <LineRow icon={Handshake} title="Manage package" meta="Stand-in coach, switch coach, end package"
              onClick={() => { setSettingsOpen(false); navigate('/member/book-class?tab=coach&manage=1'); }} last />
          )}
          {isTrainer && (
            <>
              <LineRow icon={LockSimple} title={room.commentsOn ? 'Turn comments off' : 'Turn comments on'}
                onClick={() => void run(() => updateRoom(room.id, { commentsOn: !room.commentsOn }),
                  room.commentsOn ? 'Comments are off in this room.' : 'Comments are on.')} />
              <LineRow icon={LockSimple} title={room.archived ? 'Reopen this room' : 'Close this room'} last
                onClick={() => void run(() => setArchived(room.id, !room.archived),
                  room.archived ? 'The room is open again.' : 'The room is closed. It stays readable, and nothing new can be posted.')} />
            </>
          )}
          {mode === 'member' && !pt && (
            <LineRow icon={SignOut} title="Leave this room" meta="It disappears from your rooms" last
              onClick={() => {
                if (!window.confirm(`Leave "${room.name}"? It disappears from your rooms.`)) return;
                setSettingsOpen(false);
                void run(() => leaveRoom(room.id), 'You left the room.', () => navigate('/member/book-class?tab=coach'));
              }} />
          )}
        </div>
      </GlassSheet>
    </div>
  );
}
