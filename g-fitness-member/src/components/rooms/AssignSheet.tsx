import { useEffect, useState } from 'react';
import GlassSheet from '../ui/GlassSheet';
import { Chip, NocButton } from '../ui/noc';
import { Field, Select, TextArea, TextInput } from '../ui/Field';
import { toast } from '../ui/Toast';
import { errorMessage } from '../../utils/errorMessage';
import { addDays, todayKey } from '../../utils/dates';
import {
  assignableWorkouts, createAssignment, roomPeople, type CheckinType, type RoomPerson,
} from '../../lib/api/rooms';

const CHECKIN: { id: CheckinType; label: string; hint: string }[] = [
  { id: 'question', label: 'A question', hint: 'They write an answer — how the week felt, what hurt, what to change.' },
  { id: 'weight', label: 'Body weight', hint: 'They enter their weight in kg. You see the trend in Progress.' },
  { id: 'note', label: 'A note', hint: 'A short update in their own words — a food log, a sleep note.' },
  { id: 'photo', label: 'A progress photo', hint: 'They hand in one photo. Only you see it — not the room, not the desk.' },
];

/**
 * "+ Assign" (0129). A workout is turned in by the database when the member
 * finishes logging it; a check-in when they answer. Everyone in the room, or
 * just the people picked — only people in the room can be picked, and SQL
 * checks that again.
 */
export default function AssignSheet({ roomId, open, onClose, onDone }: {
  roomId: string; open: boolean; onClose: () => void; onDone: () => void;
}) {
  const [kind, setKind] = useState<'workout' | 'checkin'>('workout');
  const [workouts, setWorkouts] = useState<{ id: string; name: string }[]>([]);
  const [workoutId, setWorkoutId] = useState('');
  const [checkin, setCheckin] = useState<CheckinType>('question');
  const [title, setTitle] = useState('');
  const [instructions, setInstructions] = useState('');
  const [due, setDue] = useState(() => addDays(todayKey(), 3));
  const [people, setPeople] = useState<RoomPerson[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [everyone, setEveryone] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    void (async () => {
      const [w, p] = await Promise.all([assignableWorkouts(), roomPeople(roomId).catch(() => [])]);
      if (!alive) return;
      setWorkouts(w);
      setPeople(p.filter((x) => !x.isTrainer));
    })();
    return () => { alive = false; };
  }, [open, roomId]);

  const workoutName = workouts.find((w) => w.id === workoutId)?.name ?? '';
  const ready = title.trim().length > 0 && due >= todayKey() && (kind === 'checkin' || !!workoutId)
    && (everyone || picked.length > 0);

  const save = async () => {
    setBusy(true);
    try {
      await createAssignment({
        roomId, kind, workoutId: kind === 'workout' ? workoutId : null,
        checkinType: kind === 'checkin' ? checkin : null, title, instructions, dueOn: due,
        assignedTo: everyone ? null : picked,
      });
      toast.success('Set. Everyone it is for has been told.');
      setTitle(''); setInstructions(''); setWorkoutId(''); setPicked([]); setEveryone(true);
      onDone();
    } catch (e) {
      toast.error(errorMessage(e, 'That could not be set'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <GlassSheet open={open} onClose={onClose} title="Assign classwork"
      subtitle="A workout turns itself in when they log it"
      footer={<NocButton variant="action" className="w-full" disabled={busy || !ready} onClick={() => void save()}>Assign</NocButton>}>
      <div className="flex flex-col" style={{ gap: 14 }}>
        <div className="flex" style={{ gap: 8 }}>
          <Chip label="Workout" on={kind === 'workout'} onClick={() => setKind('workout')} />
          <Chip label="Check-in" on={kind === 'checkin'} onClick={() => setKind('checkin')} />
        </div>

        {kind === 'workout' ? (
          <Field label="Workout" hint={workouts.length === 0 ? 'No workouts yet — build one under Exercises, or ask the owner to publish one.' : 'The gym\'s workouts and your own.'}>
            <Select value={workoutId} aria-label="Workout" onChange={(e) => {
              setWorkoutId(e.target.value);
              const n = workouts.find((w) => w.id === e.target.value)?.name;
              if (n && !title.trim()) setTitle(n);
            }}>
              <option value="">Choose a workout</option>
              {workouts.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </Select>
          </Field>
        ) : (
          <Field label="What they hand in" hint={CHECKIN.find((c) => c.id === checkin)?.hint}>
            <Select value={checkin} aria-label="Check-in type" onChange={(e) => setCheckin(e.target.value as CheckinType)}>
              {CHECKIN.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </Select>
          </Field>
        )}

        <Field label="Title">
          <TextInput value={title} maxLength={120} aria-label="Title" onChange={(e) => setTitle(e.target.value)}
            placeholder={kind === 'workout' ? (workoutName || 'e.g. Leg day') : 'e.g. How did this week feel?'} />
        </Field>
        <Field label="Instructions (optional)">
          <TextArea value={instructions} rows={3} aria-label="Instructions" onChange={(e) => setInstructions(e.target.value.slice(0, 2000))}
            placeholder="Anything they should know" />
        </Field>
        <Field label="Due" hint="On time means by the end of this day.">
          <TextInput type="date" value={due} min={todayKey()} aria-label="Due date" onChange={(e) => setDue(e.target.value)} />
        </Field>

        <div>
          <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 6 }}>For</p>
          <div className="flex flex-wrap" style={{ gap: 8 }}>
            <Chip label="Everyone in the room" on={everyone} onClick={() => setEveryone(true)} />
            <Chip label="Pick people" on={!everyone} onClick={() => setEveryone(false)} />
          </div>
          {!everyone && (
            <div className="flex flex-wrap" style={{ gap: 8, marginTop: 10 }}>
              {people.length === 0 && <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>No one is in this room yet.</p>}
              {people.map((p) => (
                <Chip key={p.memberId} label={p.name} on={picked.includes(p.memberId)}
                  onClick={() => setPicked((x) => (x.includes(p.memberId) ? x.filter((y) => y !== p.memberId) : [...x, p.memberId]))} />
              ))}
            </div>
          )}
        </div>
      </div>
    </GlassSheet>
  );
}
