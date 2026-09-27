import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Barbell, ChatCircleText, Lock, Plus } from '@phosphor-icons/react';
import { LineRow, NocButton, Panel, SectionHead, StatusPill } from '../ui/noc';
import { Field, TextArea, TextInput } from '../ui/Field';
import { SkeletonList } from '../ui/Skeleton';
import { toast } from '../ui/Toast';
import { errorMessage } from '../../utils/errorMessage';
import { addDays, todayKey } from '../../utils/dates';
import AssignSheet from './AssignSheet';
import { addPhoto, submitPhotoCheckin } from '../../lib/api/photos';
import {
  WORK_STATUS as STATUS, dueLabel, roomClasswork, startAssignment, submitCheckin, type Classwork, type Room,
} from '../../lib/api/rooms';

/**
 * A room's Classwork (0129). The trainer sees each piece with its hand-in
 * counts and opens one to review; a member sees only what is set for them,
 * with their own status, and does it from here.
 */
export default function ClassworkTab({ room, mode }: { room: Room; mode: 'trainer' | 'member' }) {
  const navigate = useNavigate();
  const [work, setWork] = useState<Classwork[] | null | undefined>(null);
  const [assigning, setAssigning] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => { setWork(await roomClasswork(room.id)); }, [room.id]);
  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  if (mode === 'member' && !room.fullAccess) {
    return (
      <Panel>
        <p className="flex items-center" style={{ gap: 8, fontSize: 14, fontWeight: 700, color: 'var(--color-text-primary)' }}>
          <Lock size={18} aria-hidden /> Classwork is part of a paid plan
        </p>
        <p style={{ fontSize: 13, marginTop: 6, color: 'var(--color-text-secondary)' }}>
          Your coach sets workouts and check-ins here, and gives you feedback on each. Ask the front desk about
          upgrading — you can still read your coach's posts in Stream.
        </p>
      </Panel>
    );
  }
  if (work === null) return <SkeletonList />;
  if (work === undefined) return <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Classwork is not switched on at your gym yet.</p>;

  const today = todayKey();
  const groups = [
    { title: 'Due soon', items: work.filter((w) => w.dueOn >= today && w.dueOn <= addDays(today, 6)) },
    { title: 'Upcoming', items: work.filter((w) => w.dueOn > addDays(today, 6)) },
    { title: 'Past', items: work.filter((w) => w.dueOn < today) },
  ].filter((g) => g.items.length > 0);

  // A photo check-in (0132): the photo joins their private album and is
  // handed in, which shows that one photo to this room's coach only.
  const handInPhoto = async (w: Classwork, file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const id = await addPhoto(file, 'front', null, w.title.slice(0, 200));
      await submitPhotoCheckin(w.id, id);
      toast.success('Photo handed in. Only your coach sees it.');
      setOpen(null);
      await load();
    } catch (e) {
      toast.error(errorMessage(e, 'That photo could not be handed in'));
    } finally {
      setBusy(false);
    }
  };

  const act = async (w: Classwork) => {
    setBusy(true);
    try {
      if (w.kind === 'workout') {
        navigate(`/member/track/session/${await startAssignment(w.id)}`);
        return;
      }
      const n = w.checkinType === 'weight' ? Number(answer.replace(',', '.')) : null;
      await submitCheckin(w.id, w.checkinType === 'weight' ? null : answer, n);
      toast.success('Turned in. Your coach has been told.');
      setAnswer(''); setOpen(null);
      await load();
    } catch (e) {
      toast.error(errorMessage(e, 'That could not be turned in'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col" style={{ gap: 14 }}>
      {mode === 'trainer' && !room.archived && (
        <NocButton variant="action" icon={<Plus size={16} />} onClick={() => setAssigning(true)}>Assign</NocButton>
      )}
      {work.length === 0 && (
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
          {mode === 'trainer' ? 'Nothing set yet. Assign a workout or a check-in — each member turns it in and you return it with a comment.'
            : 'Nothing set for you yet.'}
        </p>
      )}

      {groups.map((g) => (
        <section key={g.title}>
          <SectionHead title={g.title} meta={`${g.items.length}`} />
          {g.items.map((w, i) => {
            const icon = w.kind === 'workout' ? <Barbell size={18} aria-hidden /> : <ChatCircleText size={18} aria-hidden />;
            if (mode === 'trainer') {
              return (
                <LineRow key={w.id} gutter={icon} gutterWidth={28} title={w.title} last={i === g.items.length - 1}
                  meta={`Due ${dueLabel(w.dueOn)} · ${w.turnedIn} of ${w.targets} turned in${w.missing ? ` · ${w.missing} missing` : ''}${w.wholeRoom ? '' : ' · some members'}`}
                  action={w.toReview > 0 ? <StatusPill label={`${w.toReview} to review`} tone="action" /> : undefined}
                  onClick={() => navigate(`/trainer/rooms/${room.id}/work/${w.id}`)} />
              );
            }
            const st = w.myStatus ? STATUS[w.myStatus] : null;
            const expanded = open === w.id;
            return (
              <div key={w.id}>
                <LineRow gutter={icon} gutterWidth={28} title={w.title} last={i === g.items.length - 1 && !expanded}
                  meta={`Due ${dueLabel(w.dueOn)}${w.myPoints > 0 ? ` · +${w.myPoints} points` : ''}`}
                  action={st ? <StatusPill label={st.label} tone={st.tone} /> : undefined}
                  onClick={() => { setOpen(expanded ? null : w.id); setAnswer(w.myAnswerText ?? (w.myAnswerNumber?.toString() ?? '')); }} />
                {expanded && (
                  <Panel style={{ marginTop: 8, marginBottom: 8 }}>
                    {w.instructions && <p style={{ fontSize: 13, whiteSpace: 'pre-wrap', color: 'var(--color-text-secondary)' }}>{w.instructions}</p>}
                    {w.myReturnComment && (
                      <p style={{ fontSize: 13, marginTop: 8, color: 'var(--color-primary-300)' }}>
                        Your coach: <span style={{ color: 'var(--color-text-primary)' }}>{w.myReturnComment}</span>
                      </p>
                    )}
                    {w.kind === 'workout' ? (
                      w.myStatus === 'assigned' || w.myStatus === 'missing' ? (
                        <NocButton variant="action" className="w-full" style={{ marginTop: 10 }} disabled={busy} onClick={() => void act(w)}>
                          Start {w.workoutName ?? 'workout'}
                        </NocButton>
                      ) : <p style={{ fontSize: 13, marginTop: 8, color: 'var(--color-text-muted)' }}>Logged — it turned in by itself.</p>
                    ) : w.checkinType === 'photo' ? (
                      w.myStatus === 'returned' ? (
                        <p style={{ fontSize: 13, marginTop: 8, color: 'var(--color-text-muted)' }}>You handed in a photo.</p>
                      ) : (
                        <label className="flex items-center justify-center noc-press" style={{ marginTop: 10, height: 44, borderRadius: 12,
                          cursor: 'pointer', border: '1px solid var(--color-secondary)', color: 'var(--color-secondary)', fontWeight: 600,
                          fontSize: 14, opacity: busy ? 0.5 : 1 }}>
                          {w.myStatus === 'turned_in' || w.myStatus === 'late' ? 'Hand in a different photo' : 'Take or choose a photo'}
                          <input type="file" accept="image/*" capture="environment" className="hidden" disabled={busy}
                            aria-label={`Photo for ${w.title}`} onChange={(e) => { void handInPhoto(w, e.target.files?.[0]); e.target.value = ''; }} />
                        </label>
                      )
                    ) : w.myStatus === 'returned' ? (
                      <p style={{ fontSize: 13, marginTop: 8, color: 'var(--color-text-muted)' }}>
                        You answered: {w.myAnswerNumber != null ? `${w.myAnswerNumber} kg` : w.myAnswerText}
                      </p>
                    ) : (
                      <>
                        <Field label={w.checkinType === 'weight' ? 'Your weight (kg)' : 'Your answer'} className="mt-3">
                          {w.checkinType === 'weight'
                            ? <TextInput inputMode="decimal" value={answer} aria-label="Your weight in kg"
                                onChange={(e) => setAnswer(e.target.value.replace(/[^0-9.,]/g, '').slice(0, 6))} />
                            : <TextArea rows={3} value={answer} aria-label="Your answer" onChange={(e) => setAnswer(e.target.value.slice(0, 2000))} />}
                        </Field>
                        <NocButton variant="action" className="w-full" style={{ marginTop: 10 }} disabled={busy || !answer.trim()}
                          onClick={() => void act(w)}>
                          {w.myStatus === 'turned_in' || w.myStatus === 'late' ? 'Update' : 'Turn in'}
                        </NocButton>
                      </>
                    )}
                  </Panel>
                )}
              </div>
            );
          })}
        </section>
      ))}

      {mode === 'trainer' && (
        <AssignSheet roomId={room.id} open={assigning} onClose={() => setAssigning(false)}
          onDone={() => { setAssigning(false); void load(); }} />
      )}
    </div>
  );
}
