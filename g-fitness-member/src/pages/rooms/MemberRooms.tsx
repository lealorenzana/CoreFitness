import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChalkboardTeacher, Lock } from '@phosphor-icons/react';
import { Page, PageTitle } from '../../components/ui/page';
import { LineRow, NocButton, Panel, SectionHead, StatusPill } from '../../components/ui/noc';
import { Field, TextInput } from '../../components/ui/Field';
import { SkeletonList } from '../../components/ui/Skeleton';
import { toast } from '../../components/ui/Toast';
import { errorMessage } from '../../utils/errorMessage';
import { joinRoom, myRooms, syncRooms, type Room } from '../../lib/api/rooms';

const KIND: Record<Room['kind'], string> = { class: 'Class', pt: '1-on-1', group: 'Coaching group' };

/**
 * The member's rooms (0128): one for each class they book, one with their
 * 1-on-1 coach, and any coaching group they joined with a code. A shared
 * invite link lands here as /member/rooms?code=ABCDEF with the code filled in.
 */
export default function MemberRooms() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [rooms, setRooms] = useState<Room[] | null | undefined>(null);
  const [code, setCode] = useState(() => (params.get('code') ?? '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 6));
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => { await syncRooms(); setRooms(await myRooms()); }, []);
  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  const join = async () => {
    setBusy(true);
    try {
      const id = await joinRoom(code);
      toast.success('You are in.');
      navigate(`/member/rooms/${id}`);
    } catch (e) {
      toast.error(errorMessage(e, 'That code did not work'));
    } finally {
      setBusy(false);
    }
  };

  if (rooms === null) return <Page><PageTitle back title="Rooms" /><SkeletonList /></Page>;
  if (rooms === undefined) {
    return (
      <Page>
        <PageTitle back title="Rooms" />
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Rooms are not switched on at your gym yet.</p>
      </Page>
    );
  }
  const open = rooms.filter((r) => !r.archived);
  const closed = rooms.filter((r) => r.archived);
  const full = rooms.length === 0 || rooms.some((r) => r.fullAccess);

  return (
    <Page>
      <PageTitle back title="Rooms" subtitle="Your coach's posts, classwork and feedback" />

      {open.length === 0 ? (
        <Panel>
          <p className="flex items-center" style={{ gap: 8, fontSize: 14, fontWeight: 700, color: 'var(--color-text-primary)' }}>
            <ChalkboardTeacher size={20} aria-hidden /> No rooms yet
          </p>
          <p style={{ fontSize: 13, marginTop: 6, color: 'var(--color-text-secondary)' }}>
            Book a class or a 1-on-1 and its room appears here. A coach can also give you a code for a coaching group.
          </p>
        </Panel>
      ) : (
        <section>
          <SectionHead title="Your rooms" meta={`${open.length}`} />
          {open.map((r, i) => (
            <LineRow key={r.id} title={r.name} last={i === open.length - 1}
              meta={`${KIND[r.kind]} · ${r.trainerName}${r.postCount ? ` · ${r.postCount} post${r.postCount === 1 ? '' : 's'}` : ''}`}
              action={r.dueSoon > 0 ? <StatusPill label={`${r.dueSoon} due`} tone="action" />
                : !r.fullAccess ? <Lock size={16} aria-label="Read only on your plan" style={{ color: 'var(--color-text-muted)' }} /> : undefined}
              onClick={() => navigate(`/member/rooms/${r.id}`)} />
          ))}
        </section>
      )}

      <section>
        <SectionHead title="Join a coaching group" />
        {full ? (
          <>
            <Field label="Group code" hint="Six letters — your coach gives it to you.">
              <TextInput value={code} placeholder="ABCDEF" aria-label="Group code" style={{ letterSpacing: '0.2em' }}
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 6))} />
            </Field>
            <NocButton variant="action" className="w-full" disabled={busy || code.length !== 6} onClick={() => void join()}>Join</NocButton>
          </>
        ) : (
          <p className="flex items-center" style={{ gap: 8, fontSize: 13, color: 'var(--color-text-secondary)' }}>
            <Lock size={16} aria-hidden /> Coaching groups are part of a paid plan. Ask the front desk about upgrading.
          </p>
        )}
      </section>

      {closed.length > 0 && (
        <section>
          <SectionHead title="Closed" />
          {closed.map((r, i) => (
            <LineRow key={r.id} title={r.name} meta={`${KIND[r.kind]} · ${r.trainerName}`} dim last={i === closed.length - 1}
              onClick={() => navigate(`/member/rooms/${r.id}`)} />
          ))}
        </section>
      )}
    </Page>
  );
}
