import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from '@phosphor-icons/react';
import { Page } from '../../components/ui/page';
import { LineRow, NocButton, Panel, SectionHead, SeeAll, StatusPill } from '../../components/ui/noc';
import { Field, TextArea, TextInput } from '../../components/ui/Field';
import GlassSheet from '../../components/ui/GlassSheet';
import { SkeletonList } from '../../components/ui/Skeleton';
import { toast } from '../../components/ui/Toast';
import { errorMessage } from '../../utils/errorMessage';
import { createGroup, myRooms, reviewQueue, syncRooms, type ReviewItem, type Room } from '../../lib/api/rooms';

const SECTIONS: { kind: Room['kind']; title: string; empty: string }[] = [
  { kind: 'class', title: 'Classes', empty: 'Each recurring class you run gets a room.' },
  { kind: 'group', title: 'Coaching groups', empty: 'Start a group — members join with a code.' },
  { kind: 'pt', title: '1-on-1', empty: 'Each 1-on-1 trainee gets a room.' },
];

/**
 * The trainer's Rooms tab (0128/0129) — their Google Classroom home. What is
 * waiting to be returned comes first; then a room for every class, coaching
 * group and 1-on-1 trainee. The roster this tab replaced is one tap away
 * ("All my members"), unchanged.
 */
export default function TrainerRooms() {
  const navigate = useNavigate();
  const [rooms, setRooms] = useState<Room[] | null | undefined>(null);
  const [queue, setQueue] = useState<ReviewItem[]>([]);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [about, setAbout] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    await syncRooms();
    const [r, q] = await Promise.all([myRooms(), reviewQueue()]);
    setRooms(r);
    setQueue(q);
  }, []);
  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  const create = async () => {
    setBusy(true);
    try {
      const id = await createGroup(name, about);
      toast.success('Group started. Share its code from People.');
      setCreating(false); setName(''); setAbout('');
      navigate(`/trainer/rooms/${id}?tab=people`);
    } catch (e) {
      toast.error(errorMessage(e, 'The group could not be started'));
    } finally {
      setBusy(false);
    }
  };

  if (rooms === null) return <Page><SkeletonList /></Page>;
  if (rooms === undefined) {
    return (
      <Page>
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Rooms are not switched on at your gym yet.</p>
        <LineRow title="All my members" meta="Progress and notes" onClick={() => navigate('/trainer/members')} last />
      </Page>
    );
  }

  return (
    <Page>
      {queue.length > 0 && (
        <Panel glow="action">
          <p style={{ fontSize: 15, fontWeight: 800, color: 'var(--color-text-primary)' }}>
            {queue.length} to review
          </p>
          <p style={{ fontSize: 12.5, marginTop: 2, color: 'var(--color-text-secondary)' }}>Turned in and waiting for your comment.</p>
          <div style={{ marginTop: 8 }}>
            {queue.map((q, i) => (
              <LineRow key={q.submissionId} title={`${q.memberName} · ${q.title}`} last={i === queue.length - 1}
                meta={`${q.roomName}${q.late ? ' · late' : ''}`}
                onClick={() => navigate(`/trainer/rooms/${q.roomId}/work/${q.assignmentId}`)} />
            ))}
          </div>
        </Panel>
      )}

      {/* "All my members" is the tab's rail pill, under the header. */}
      <NocButton variant="action" icon={<Plus size={16} />} onClick={() => setCreating(true)}>New group</NocButton>

      {SECTIONS.map((s) => {
        const list = rooms.filter((r) => r.kind === s.kind && !r.archived);
        const shown = s.kind === 'pt' ? list.slice(0, 6) : list;
        return (
          <section key={s.kind}>
            <SectionHead title={s.title} meta={list.length ? `${list.length}` : undefined} />
            {list.length === 0 && <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>{s.empty}</p>}
            {shown.map((r, i) => (
              <LineRow key={r.id} title={r.name} last={i === shown.length - 1}
                meta={`${r.memberCount} member${r.memberCount === 1 ? '' : 's'}${r.dueSoon ? ` · ${r.dueSoon} due this week` : ''}`}
                action={r.toReview > 0 ? <StatusPill label={`${r.toReview} to review`} tone="action" /> : undefined}
                onClick={() => navigate(`/trainer/rooms/${r.id}`)} />
            ))}
            {s.kind === 'pt' && list.length > shown.length && (
              <SeeAll count={list.length} onClick={() => navigate('/trainer/members')} />
            )}
          </section>
        );
      })}

      {rooms.some((r) => r.archived) && (
        <section>
          <SectionHead title="Closed" />
          {rooms.filter((r) => r.archived).map((r, i, arr) => (
            <LineRow key={r.id} title={r.name} dim last={i === arr.length - 1} onClick={() => navigate(`/trainer/rooms/${r.id}`)} />
          ))}
        </section>
      )}

      <GlassSheet open={creating} onClose={() => setCreating(false)} title="New coaching group"
        subtitle="Members join with a 6-letter code"
        footer={<NocButton variant="action" className="w-full" disabled={busy || name.trim().length < 2} onClick={() => void create()}>Start the group</NocButton>}>
        <div className="flex flex-col" style={{ gap: 14 }}>
          <Field label="Name">
            <TextInput value={name} maxLength={80} placeholder="e.g. 8-week fat loss" aria-label="Group name" onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="What it is for (optional)">
            <TextArea value={about} rows={3} aria-label="Group description" onChange={(e) => setAbout(e.target.value.slice(0, 500))}
              placeholder="Two check-ins a week, one workout, weigh-in on Mondays." />
          </Field>
        </div>
      </GlassSheet>
    </Page>
  );
}
