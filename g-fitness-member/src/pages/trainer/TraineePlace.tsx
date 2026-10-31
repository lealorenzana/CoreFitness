import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Page, PageTitle } from '../../components/ui/page';
import { NocButton, TextTabs } from '../../components/ui/noc';
import { SkeletonList } from '../../components/ui/Skeleton';
import { toast } from '../../components/ui/Toast';
import TimelineTab from '../../components/rooms/TimelineTab';
import ClassworkTab from '../../components/rooms/ClassworkTab';
import ProgressTab from '../../components/rooms/ProgressTab';
import TraineeAbout from '../../components/trainer/TraineeAbout';
import { myRooms, setArchived, updateRoom, type Room } from '../../lib/api/rooms';
import { getCoachingSettings, monthsLabel, myCoachings, type Coaching } from '../../lib/api/coaching';
import { myConversations } from '../../lib/api/chat';
import { listMyTrainerMembers } from '../../lib/api/trainerRoster';
import { errorMessage } from '../../utils/errorMessage';

type Tab = 'chat' | 'classwork' | 'progress' | 'about';
const fmt = (ymd: string | null) => (ymd ? new Date(`${ymd}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }) : '');

/**
 * A trainee's place (simplify, 2026-10-28): everything between a coach and one
 * person, in one screen. A package trainee has their room — Chat · Classwork ·
 * Progress · About; someone who books single sessions has Chat · About. The tab
 * is in the address, so Back returns to it, and old room links land here.
 */
export default function TraineePlace() {
  const { memberId = '' } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [state, setState] = useState<{ name: string; coaching: Coaching | null; room: Room | null } | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  /** The gym lets coaches offer packages (0181 coach_invites). */
  const [canOffer, setCanOffer] = useState(false);
  useEffect(() => { void getCoachingSettings().then((s) => setCanOffer(!!s?.modes.includes('coach_invites'))).catch(() => undefined); }, []);

  const load = useCallback(async () => {
    const [list, rooms, convs, roster] = await Promise.all([
      myCoachings().catch(() => null), myRooms().catch(() => undefined),
      myConversations().catch(() => undefined), listMyTrainerMembers().catch(() => []),
    ]);
    // Their package with me: the running one, else the latest that had a room.
    const mine = (list ?? []).filter((c) => c.iAm !== 'member' && c.memberId === memberId);
    const coaching = mine.find((c) => c.status === 'active') ?? mine.filter((c) => c.roomId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
    const room = coaching?.roomId ? (rooms ?? []).find((r) => r.id === coaching.roomId) ?? null : null;
    const name = coaching?.memberName ?? convs?.find((c) => c.otherId === memberId)?.otherName
      ?? roster.find((r) => r.member_id === memberId)?.name ?? null;
    setState(name ? { name, coaching, room } : null);
  }, [memberId]);
  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  const fallback = '/trainer/home?view=pt';
  if (state === undefined) return <Page><PageTitle back fallback={fallback} title="Personal training" /><SkeletonList /></Page>;
  if (state === null) {
    return (
      <Page>
        <PageTitle back fallback={fallback} title="Personal training" />
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>This person does not train with you, or they are no longer at the gym.</p>
      </Page>
    );
  }

  const { name, coaching, room } = state;
  const tabs: { id: Tab; label: string }[] = [
    { id: 'chat', label: 'Chat' },
    ...(room ? [{ id: 'classwork' as Tab, label: room.toReview ? `Classwork · ${room.toReview}` : 'Classwork' }, { id: 'progress' as Tab, label: 'Progress' }] : []),
    { id: 'about', label: 'About' },
  ];
  const wanted = params.get('tab') as Tab | null;
  const tab: Tab = tabs.some((t) => t.id === wanted) ? (wanted as Tab) : 'chat';
  const subtitle = coaching?.status === 'active'
    ? `Package · ${monthsLabel(coaching.months)}${coaching.endsOn ? ` · until ${fmt(coaching.endsOn)}` : ''}`
    : room ? `Package ended${coaching?.endsOn ? ` ${fmt(coaching.endsOn)}` : ''} · the room is kept, read-only`
    : 'Single sessions';
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try { await fn(); toast.success(ok); await load(); }
    catch (e) { toast.error(errorMessage(e, 'That did not work')); }
    finally { setBusy(false); }
  };

  return (
    <Page className="noc-slide-in">
      <div data-trainee-place={room ? 'package' : 'single'}>
        <PageTitle back fallback={fallback} title={name} subtitle={subtitle} />
      </div>
      <TextTabs<Tab> label={`With ${name.split(' ')[0]}`} tabs={tabs} active={tab}
        onChange={(t) => setParams(t === 'chat' ? {} : { tab: t }, { replace: true })} />

      {tab === 'chat' && <TimelineTab room={room} mode="trainer" with={{ id: memberId, name }} />}
      {tab === 'classwork' && room && <ClassworkTab room={room} mode="trainer" />}
      {tab === 'progress' && room && <ProgressTab room={room} />}
      {tab === 'about' && (
        <>
          <TraineeAbout member={{ id: memberId, name }} onChat={() => setParams({}, { replace: true })} />
          {/* The package's room (0128/0169/0220): the coach closes it or turns comments off; it is never deleted. */}
          {room?.isMine && (
            <div className="flex flex-col" data-room-options style={{ gap: 8, marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--color-separator)' }}>
              <NocButton variant="ghost" disabled={busy}
                onClick={() => void run(() => updateRoom(room.id, { commentsOn: !room.commentsOn }), room.commentsOn ? 'Comments are off in this room.' : 'Comments are on.')}>
                {room.commentsOn ? 'Turn comments off' : 'Turn comments on'}
              </NocButton>
              <NocButton variant="ghost" disabled={busy}
                onClick={() => void run(() => setArchived(room.id, !room.archived),
                  room.archived ? 'The room is open again.' : 'The room is closed. It stays readable, and nothing new can be posted.')}>
                {room.archived ? 'Reopen the room' : 'Close the room'}
              </NocButton>
            </div>
          )}
          {!room && canOffer && (
            <NocButton variant="ghost" className="w-full" style={{ marginTop: 14 }} onClick={() => navigate('/trainer/packages?offer=' + memberId)}>
              Offer {name.split(' ')[0]} a package
            </NocButton>
          )}
        </>
      )}
    </Page>
  );
}
