import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Crown, ImagePlus, Plus, Sparkles, Trash2 } from 'lucide-react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import { showToast } from '../utils/toast';
import { supabase } from '../lib/supabaseClient';
import { removeContentPhoto, uploadContentPhoto } from '../lib/api/exerciseMedia';
import {
  copyStarterProgram, listPrograms, listWorkouts, saveProgram, saveWorkout, setProgramDay, setProgramPublished,
  type GymProgram, type GymWorkout, type Level, type StarterKey, type WorkoutItem,
} from '../lib/api/programs';

/**
 * Training → Programs (0122): the gym's own workouts and multi-week programs.
 *
 * Members follow a program in the phone app; each day runs in the ordinary
 * workout player, so points, badges and history need nothing from this page.
 * Programs are built here, by the owner — a six-week grid is a desk job, not a
 * phone one. Trainers build workouts in their app, and theirs show here too.
 *
 * Everything starts as a Draft; members see a program once it is Published.
 * Premium locks a program to plans that include "Premium programs" (Membership
 * Plans decides which); a free member still sees it, with the reason.
 */

const MUTED = 'var(--color-text-muted)';
const FIELD = { background: 'var(--color-surface-high)', border: '1px solid var(--color-border)' };
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const LEVELS: { value: Level; label: string }[] = [
  { value: 'all_levels', label: 'All levels' }, { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' }, { value: 'advanced', label: 'Advanced' },
];
const STARTERS: { key: StarterKey; label: string; blurb: string }[] = [
  { key: 'beginner_full_body', label: '3-Day Beginner Full Body', blurb: 'Two alternating full-body workouts, Mon · Wed · Fri, four weeks.' },
  { key: 'push_pull_legs', label: 'Push / Pull / Legs', blurb: 'The classic three-day split, four weeks.' },
];

interface Ex { id: string; name: string; is_timed: boolean }

export default function Programs() {
  const [tab, setTab] = useState<'programs' | 'workouts'>('programs');
  const [programs, setPrograms] = useState<GymProgram[] | null | undefined>(undefined);
  const [workouts, setWorkouts] = useState<GymWorkout[]>([]);
  const [exercises, setExercises] = useState<Ex[]>([]);
  const [editingProgram, setEditingProgram] = useState<string | 'new' | null>(null);
  const [editingWorkout, setEditingWorkout] = useState<string | 'new' | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [p, w, ex] = await Promise.all([
      listPrograms(), listWorkouts(),
      supabase.from('exercises').select('id, name, is_timed').eq('is_active', true).order('name'),
    ]);
    setPrograms(p);
    setWorkouts(w ?? []);
    setExercises((ex.data ?? []) as Ex[]);
  }, []);

  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  const copy = async (key: StarterKey) => {
    setBusy(true);
    try {
      const id = await copyStarterProgram(key);
      await load();
      setEditingProgram(id);
      showToast('Added as a draft. Check it over, then publish it.', 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'That could not be added', 'error');
    } finally {
      setBusy(false);
    }
  };

  if (programs === undefined) return <div className="text-sm" style={{ color: MUTED }}>Loading programs…</div>;
  if (programs === null) {
    return (
      <Card className="!p-4">
        <div className="flex items-start gap-2">
          <AlertTriangle size={14} className="mt-0.5" style={{ color: 'var(--color-secondary)' }} />
          <p className="text-xs text-white">
            Programs need migration 0122_gym_programs.sql, which is not pasted yet (or the list could not load).
          </p>
        </div>
      </Card>
    );
  }

  const program = editingProgram && editingProgram !== 'new' ? programs.find((p) => p.id === editingProgram) ?? null : null;
  const workout = editingWorkout && editingWorkout !== 'new' ? workouts.find((w) => w.id === editingWorkout) ?? null : null;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white">Programs</h1>
        <p className="text-xs mt-1" style={{ color: MUTED }}>
          Week-by-week training your members follow in the app · {programs.filter((p) => p.published).length} published
        </p>
      </div>

      <div className="flex gap-2">
        {(['programs', 'workouts'] as const).map((k) => (
          <button key={k} onClick={() => setTab(k)} className="px-3 py-1.5 rounded-lg text-xs font-semibold"
            style={{ background: tab === k ? 'var(--color-primary)' : 'var(--color-surface-high)', color: '#fff' }}>
            {k === 'programs' ? 'Programs' : 'Workouts'}
          </button>
        ))}
      </div>

      {tab === 'programs' ? (
        <>
          <Card className="!p-4">
            <div className="flex items-center gap-2">
              <Sparkles size={14} style={{ color: 'var(--color-primary)' }} />
              <p className="text-xs font-bold text-white">Start from a ready-made program</p>
            </div>
            <p className="text-[10px] mt-1" style={{ color: MUTED }}>
              Copied into your gym as a draft, built from the standard exercises. Change anything before you publish.
            </p>
            <div className="grid grid-cols-2 gap-2 mt-3">
              {STARTERS.map((s) => (
                <button key={s.key} onClick={() => void copy(s.key)} disabled={busy} aria-label={`Add ${s.label}`}
                  className="text-left rounded-lg px-3 py-2.5" style={FIELD}>
                  <p className="text-xs font-semibold text-white">{s.label}</p>
                  <p className="text-[10px] mt-0.5" style={{ color: MUTED }}>{s.blurb}</p>
                </button>
              ))}
            </div>
          </Card>

          {editingProgram && (
            <ProgramEditor key={editingProgram} program={program} workouts={workouts}
              onSaved={async (id) => { await load(); setEditingProgram(id); }}
              onClose={() => setEditingProgram(null)} />
          )}

          <Card className="!p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-white">Your programs</p>
              <Button size="sm" variant="outline" onClick={() => setEditingProgram('new')}><Plus size={12} /> New program</Button>
            </div>
            {programs.length === 0 ? (
              <p className="text-xs mt-3" style={{ color: MUTED }}>No programs yet. Start from a ready-made one above, or build your own.</p>
            ) : (
              <div className="grid grid-cols-2 gap-2 mt-3">
                {programs.map((p) => (
                  <div key={p.id} className="rounded-lg px-3 py-2.5 flex items-start justify-between gap-2" style={FIELD}>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-white truncate">
                        {p.name} {p.premium && <Crown size={11} className="inline" style={{ color: 'var(--color-secondary)' }} aria-label="Premium" />}
                      </p>
                      <p className="text-[10px] mt-0.5" style={{ color: MUTED }}>
                        {p.published ? 'Published' : 'Draft'} · {p.weeks} week{p.weeks === 1 ? '' : 's'} · {p.days.length} training days
                      </p>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => setEditingProgram(p.id)} aria-label={`Edit ${p.name}`}>Edit</Button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      ) : (
        <>
          {editingWorkout && (
            <WorkoutEditor key={editingWorkout} workout={workout} exercises={exercises}
              onSaved={async () => { await load(); setEditingWorkout(null); }}
              onClose={() => setEditingWorkout(null)} />
          )}
          <Card className="!p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-white">Workouts</p>
              <Button size="sm" variant="outline" onClick={() => setEditingWorkout('new')}><Plus size={12} /> New workout</Button>
            </div>
            <p className="text-[10px] mt-1" style={{ color: MUTED }}>
              A workout is one session: exercises with sets, reps or time, and rest. Programs put them on days.
            </p>
            {workouts.length === 0 ? (
              <p className="text-xs mt-3" style={{ color: MUTED }}>No workouts yet.</p>
            ) : (
              <div className="grid grid-cols-3 gap-2 mt-3">
                {workouts.map((w) => {
                  const used = programs.filter((p) => p.days.some((d) => d.workoutId === w.id)).length;
                  return (
                    <div key={w.id} className="rounded-lg px-3 py-2 flex items-center justify-between gap-2" style={FIELD}>
                      <div className="min-w-0">
                        <p className="text-xs text-white truncate">{w.name}</p>
                        <p className="text-[10px]" style={{ color: MUTED }}>
                          {w.items.length} exercise{w.items.length === 1 ? '' : 's'}{used ? ` · in ${used} program${used === 1 ? '' : 's'}` : ''}
                        </p>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => setEditingWorkout(w.id)} aria-label={`Edit workout ${w.name}`}>Edit</Button>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function ProgramEditor({ program, workouts, onSaved, onClose }: {
  program: GymProgram | null;
  workouts: GymWorkout[];
  onSaved: (id: string) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(program?.name ?? '');
  const [description, setDescription] = useState(program?.description ?? '');
  const [level, setLevel] = useState<Level>(program?.level ?? 'all_levels');
  const [weeks, setWeeks] = useState(program?.weeks ?? 4);
  const [premium, setPremium] = useState(program?.premium ?? false);
  const [cover, setCover] = useState<string | null>(program?.coverUrl ?? null);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); } catch (e) { showToast(e instanceof Error ? e.message : 'That did not work', 'error'); }
    finally { setBusy(false); }
  };

  const save = () => run(async () => {
    if (!name.trim()) throw new Error('The program needs a name.');
    const id = await saveProgram(program?.id ?? null, { name, description, coverUrl: cover, level, weeks, premium });
    const old = program?.coverUrl ?? null;
    if (old && old !== cover) await removeContentPhoto(old).catch(() => {});
    showToast('Program saved.', 'success');
    await onSaved(id);
  });

  const publish = (on: boolean) => run(async () => {
    if (!program) return;
    if (on && program.days.length === 0) throw new Error('Put at least one workout on a day before publishing.');
    await setProgramPublished(program.id, on);
    showToast(on ? 'Published. Your members can follow it now.' : 'Back to draft. Members no longer see it.', 'success');
    await onSaved(program.id);
  });

  const setDay = (week: number, day: number, workoutId: string) => run(async () => {
    if (!program) return;
    await setProgramDay(program.id, week, day, workoutId || null);
    await onSaved(program.id);
  });

  const pickCover = (file: File | undefined) => run(async () => {
    if (!file) return;
    setCover(await uploadContentPhoto(file));
  });

  const cell = (week: number, day: number) => program?.days.find((d) => d.week === week && d.day === day)?.workoutId ?? '';

  return (
    <Card className="!p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-white">{program ? program.name : 'New program'}</h2>
          <p className="text-[10px] mt-0.5" style={{ color: MUTED }}>
            {program ? (program.published ? 'Published — members can follow it.' : 'Draft — only you and your staff see it.') : 'Save it, then fill in the weeks.'}
          </p>
        </div>
        <div className="flex gap-2">
          {program && (
            <Button size="sm" variant={program.published ? 'outline' : 'secondary'} disabled={busy}
              onClick={() => void publish(!program.published)}>
              {program.published ? 'Unpublish' : 'Publish'}
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onClose}>Close</Button>
        </div>
      </div>

      <div className="grid gap-3 mt-4" style={{ gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)' }}>
        <div className="space-y-2">
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} aria-label="Program name"
            placeholder="e.g. 6-Week Beginner Strength" className="w-full h-10 px-3 rounded-lg text-xs text-white" style={FIELD} />
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} rows={3}
            aria-label="Description" placeholder="Who it is for and what it does."
            className="w-full px-3 py-2 rounded-lg text-xs text-white" style={FIELD} />
          <div className="flex flex-wrap items-center gap-3">
            <select value={level} onChange={(e) => setLevel(e.target.value as Level)} aria-label="Level"
              className="h-9 px-2 rounded-lg text-xs text-white" style={FIELD}>
              {LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
            <select value={weeks} onChange={(e) => setWeeks(Number(e.target.value))} aria-label="Weeks"
              className="h-9 px-2 rounded-lg text-xs text-white" style={FIELD}>
              {Array.from({ length: 16 }, (_, i) => i + 1).map((w) => <option key={w} value={w}>{w} week{w === 1 ? '' : 's'}</option>)}
            </select>
            <label className="flex items-center gap-2 text-xs text-white">
              <input type="checkbox" checked={premium} onChange={(e) => setPremium(e.target.checked)} aria-label="Premium members only" />
              Premium members only
            </label>
          </div>
          {premium && (
            <p className="text-[10px]" style={{ color: MUTED }}>
              Members whose plan does not include "Premium programs" (Membership Plans) see it with a lock and the reason, never hidden.
            </p>
          )}
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => void save()}>Save program</Button>
        </div>
        <div>
          {cover ? (
            <div className="relative">
              <img src={cover} alt="Program cover" className="w-full rounded-lg object-cover" style={{ maxHeight: 130 }} />
              <button onClick={() => setCover(null)} className="absolute top-1.5 right-1.5 p-1 rounded-md"
                style={{ background: 'rgba(0,0,0,0.6)', color: '#fff' }} aria-label="Remove cover"><Trash2 size={12} /></button>
            </div>
          ) : (
            <label className="flex flex-col items-center justify-center gap-1 rounded-lg cursor-pointer" style={{ ...FIELD, height: 110 }}>
              <ImagePlus size={16} style={{ color: MUTED }} />
              <span className="text-[11px] text-white">Cover photo</span>
              <span className="text-[10px]" style={{ color: MUTED }}>Optional · one photo slot</span>
              <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" disabled={busy}
                onChange={(e) => void pickCover(e.target.files?.[0])} />
            </label>
          )}
        </div>
      </div>

      {program && (
        <div className="mt-5 overflow-x-auto">
          <p className="text-[10px] font-semibold uppercase mb-2" style={{ color: MUTED }}>
            The weeks — pick a workout for each training day; leave the rest as Rest
          </p>
          {workouts.length === 0 && (
            <p className="text-[11px] mb-2" style={{ color: 'var(--color-secondary)' }}>
              No workouts yet. Build one on the Workouts tab first.
            </p>
          )}
          <table className="w-full text-[11px]" style={{ borderCollapse: 'separate', borderSpacing: 4 }}>
            <thead>
              <tr>
                <th />
                {DAYS.map((d) => <th key={d} className="font-semibold text-left" style={{ color: MUTED }}>{d}</th>)}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: program.weeks }, (_, i) => i + 1).map((wk) => (
                <tr key={wk}>
                  <td className="font-semibold text-white pr-2 whitespace-nowrap">Week {wk}</td>
                  {DAYS.map((d, di) => (
                    <td key={d}>
                      <select value={cell(wk, di + 1)} aria-label={`Week ${wk}, ${d}`} disabled={busy}
                        onChange={(e) => void setDay(wk, di + 1, e.target.value)}
                        className="w-full h-8 px-1 rounded-md text-[11px] text-white"
                        style={{ ...FIELD, opacity: cell(wk, di + 1) ? 1 : 0.6 }}>
                        <option value="">Rest</option>
                        {workouts.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                      </select>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function WorkoutEditor({ workout, exercises, onSaved, onClose }: {
  workout: GymWorkout | null;
  exercises: Ex[];
  onSaved: () => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(workout?.name ?? '');
  const [notes, setNotes] = useState(workout?.notes ?? '');
  const [level, setLevel] = useState<Level>(workout?.level ?? 'all_levels');
  const [items, setItems] = useState<WorkoutItem[]>(workout?.items ?? []);
  const [busy, setBusy] = useState(false);

  const timed = (id: string) => exercises.find((e) => e.id === id)?.is_timed ?? false;
  const patch = (i: number, p: Partial<WorkoutItem>) => setItems((prev) => prev.map((it, n) => (n === i ? { ...it, ...p } : it)));
  const num = (v: string) => (v.trim() === '' ? null : Math.max(0, Math.round(Number(v)) || 0));

  const save = async () => {
    if (!name.trim()) { showToast('The workout needs a name.', 'error'); return; }
    const clean = items.filter((it) => it.exerciseId);
    if (clean.length === 0) { showToast('Add at least one exercise.', 'error'); return; }
    setBusy(true);
    try {
      await saveWorkout(workout?.id ?? null, {
        name, notes, level,
        items: clean.map((it) => timed(it.exerciseId)
          ? { ...it, targetReps: null, targetSeconds: it.targetSeconds ?? 30 }
          : { ...it, targetSeconds: null }),
      });
      showToast('Workout saved.', 'success');
      await onSaved();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'The workout could not be saved', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="!p-4">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-sm font-bold text-white">{workout ? workout.name : 'New workout'}</h2>
        <Button size="sm" variant="ghost" onClick={onClose}>Close</Button>
      </div>
      <div className="flex flex-wrap gap-2 mt-3">
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} aria-label="Workout name"
          placeholder="e.g. Leg Day A" className="h-10 px-3 rounded-lg text-xs text-white flex-1 min-w-0" style={FIELD} />
        <select value={level} onChange={(e) => setLevel(e.target.value as Level)} aria-label="Workout level"
          className="h-10 px-2 rounded-lg text-xs text-white" style={FIELD}>
          {LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
        </select>
      </div>
      <input value={notes ?? ''} onChange={(e) => setNotes(e.target.value)} maxLength={500} aria-label="Workout notes"
        placeholder="Notes for members (optional) — warm up first, etc."
        className="w-full h-9 px-3 rounded-lg text-xs text-white mt-2" style={FIELD} />

      <div className="space-y-1.5 mt-3">
        {items.map((it, i) => {
          const n = i + 1;
          const isTimed = timed(it.exerciseId);
          return (
            <div key={i} className="grid items-center gap-2"
              style={{ gridTemplateColumns: 'minmax(0, 3fr) repeat(3, minmax(0, 1fr)) auto' }}>
              <select value={it.exerciseId} aria-label={`Exercise ${n}`} onChange={(e) => patch(i, { exerciseId: e.target.value })}
                className="h-9 px-2 rounded-lg text-xs text-white" style={FIELD}>
                <option value="">Choose an exercise…</option>
                {exercises.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
              <input type="number" min={1} max={20} value={it.targetSets} aria-label={`Sets ${n}`}
                onChange={(e) => patch(i, { targetSets: num(e.target.value) ?? 1 })}
                className="h-9 px-2 rounded-lg text-xs text-white" style={FIELD} title="Sets" />
              {isTimed ? (
                <input type="number" min={1} value={it.targetSeconds ?? ''} aria-label={`Seconds ${n}`} placeholder="sec"
                  onChange={(e) => patch(i, { targetSeconds: num(e.target.value) })}
                  className="h-9 px-2 rounded-lg text-xs text-white" style={FIELD} />
              ) : (
                <input type="number" min={1} value={it.targetReps ?? ''} aria-label={`Reps ${n}`} placeholder="reps"
                  onChange={(e) => patch(i, { targetReps: num(e.target.value) })}
                  className="h-9 px-2 rounded-lg text-xs text-white" style={FIELD} />
              )}
              <input type="number" min={0} max={600} value={it.restSeconds} aria-label={`Rest ${n}`}
                onChange={(e) => patch(i, { restSeconds: num(e.target.value) ?? 0 })}
                className="h-9 px-2 rounded-lg text-xs text-white" style={FIELD} title="Rest, seconds" />
              <button onClick={() => setItems((prev) => prev.filter((_, k) => k !== i))} aria-label={`Remove row ${n}`}
                className="p-1.5 rounded-lg" style={{ color: MUTED }}><Trash2 size={12} /></button>
            </div>
          );
        })}
        {items.length > 0 && (
          <p className="text-[10px]" style={{ color: MUTED }}>Sets · reps (or seconds) · rest in seconds</p>
        )}
      </div>

      <div className="flex gap-2 mt-3">
        <Button size="sm" variant="outline"
          onClick={() => setItems((prev) => [...prev, { exerciseId: '', targetSets: 3, targetReps: 10, targetSeconds: null, restSeconds: 90 }])}>
          <Plus size={12} /> Add an exercise
        </Button>
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => void save()}>Save workout</Button>
      </div>
    </Card>
  );
}
