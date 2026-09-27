import { useCallback, useEffect, useState } from 'react';
import { Copy } from '@phosphor-icons/react';
import Avatar from '../ui/Avatar';
import { LineRow, NocButton, Panel, SectionHead } from '../ui/noc';
import { SkeletonList } from '../ui/Skeleton';
import { toast } from '../ui/Toast';
import { errorMessage } from '../../utils/errorMessage';
import { removeFromRoom, resetCode, roomPeople, type Room, type RoomPerson } from '../../lib/api/rooms';

const HOW: Record<Room['kind'], string> = {
  class: 'Everyone booked into this class in the last 60 days, and anyone booked for an upcoming one.',
  pt: 'Your 1-on-1 trainee.',
  group: 'Members who joined with the code. You can remove anyone.',
};

/**
 * A room's People. Who is in a class or 1-on-1 room is computed from bookings
 * and sessions, never edited; a coaching group's code lives here for its
 * trainer to share or reset.
 */
export default function PeopleTab({ room, mode, onChanged }: { room: Room; mode: 'trainer' | 'member'; onChanged: () => void }) {
  const [people, setPeople] = useState<RoomPerson[] | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setPeople(await roomPeople(room.id)); } catch { setPeople([]); }
  }, [room.id]);
  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try { await fn(); toast.success(ok); await load(); onChanged(); }
    catch (e) { toast.error(errorMessage(e, 'That did not work')); }
    finally { setBusy(false); }
  };

  const link = room.joinCode ? `${window.location.origin}/member/rooms?code=${room.joinCode}` : null;
  const share = async () => {
    if (!link) return;
    try { await navigator.clipboard.writeText(`Join "${room.name}" in the gym app: ${link} (code ${room.joinCode})`); toast.success('Invite copied — send it to your members.'); }
    catch { toast.info(`The code is ${room.joinCode}`); }
  };

  if (people === null) return <SkeletonList />;
  const trainer = people.find((p) => p.isTrainer);
  const members = people.filter((p) => !p.isTrainer);

  return (
    <div className="flex flex-col" style={{ gap: 14 }}>
      {mode === 'trainer' && room.kind === 'group' && room.joinCode && (
        <Panel onClick={() => void share()} ariaLabel="Copy the invite">
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Members join with this code</p>
          <p className="flex items-center tabular-nums" style={{ gap: 10, marginTop: 4, fontSize: 24, fontWeight: 800, letterSpacing: '0.2em', color: 'var(--color-text-primary)' }}>
            {room.joinCode} <Copy size={18} aria-hidden style={{ color: 'var(--color-secondary)' }} />
          </p>
        </Panel>
      )}
      {mode === 'trainer' && room.kind === 'group' && (
        <NocButton variant="ghost" disabled={busy} onClick={() => void run(() => resetCode(room.id), 'New code made. The old one no longer works.')}>
          Make a new code
        </NocButton>
      )}

      {trainer && (
        <section>
          <SectionHead title="Coach" />
          <LineRow gutter={<Avatar name={trainer.name} photoUrl={trainer.photoUrl} size={32} />} gutterWidth={44}
            title={`${trainer.name}${trainer.isMe ? ' (you)' : ''}`} last />
        </section>
      )}
      <section>
        <SectionHead title="Members" meta={`${members.length}`} />
        {mode === 'trainer' && <p style={{ fontSize: 12, marginBottom: 6, color: 'var(--color-text-muted)' }}>{HOW[room.kind]}</p>}
        {members.length === 0 && <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>No one yet.</p>}
        {members.map((m, i) => (
          <LineRow key={m.memberId} gutter={<Avatar name={m.name} photoUrl={m.photoUrl} size={32} />} gutterWidth={44}
            title={`${m.name}${m.isMe ? ' (you)' : ''}`} last={i === members.length - 1}
            action={mode === 'trainer' && room.kind === 'group' ? (
              <button disabled={busy} style={{ fontSize: 12, color: 'var(--color-secondary)' }}
                onClick={() => void run(() => removeFromRoom(room.id, m.memberId), `${m.name} was removed.`)}>Remove</button>
            ) : undefined} />
        ))}
      </section>
    </div>
  );
}
