import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Crown, ImagePlus, Plus, Sparkles, Trash2, CalendarRange, Dumbbell, Eye, EyeOff, Check } from 'lucide-react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Popover from '../components/ui/Popover';
import './attendance/att.css';
import { showToast } from '../utils/toast';
import { supabase } from '../lib/supabaseClient';
import { removeContentPhoto, uploadContentPhoto } from '../lib/api/exerciseMedia';
import {
  copyStarterProgram, listPrograms, listWorkouts, saveProgram, saveWorkout, setProgramDay, setProgramPublished,
  type GymProgram, type GymWorkout, type Level, type ProgressKind, type StarterKey, type WorkoutItem,
} from '../lib/api/programs';

/**
 * Training → Programs (0122/0173, redrawn 2026-10-20 to the approved mock-up):
 * the programs (and the workouts they are made of) on the left, the one open
 * on the right — its details, and the weeks as a grid where each training day
 * shows its workout in that workout's colour and a tap changes it.
 *
 * Members follow a program in the phone app; each day runs in the ordinary
 * workout player, so points, badges and history need nothing from this page.
 * Everything starts as a Draft; members see a program once it is Published.
 * Premium locks a program to plans that include "Premium programs"; a free
 * member still sees it, with the reason.
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
const levelWord = (l: Level) => LEVELS.find((x) => x.value === l)?.label ?? l;

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
    // Open the first program when nothing is open yet, so the right side is never empty for no reason.
    setEditingProgram((cur) => cur ?? p?.[0]?.id ?? null);
  }, []);
  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  const copy = async (key: StarterKey) => {
    setBusy(true);
    try {
      const id = await copyStarterProgram(key);
      await load();
      setTab('programs');
      setEditingProgram(id);
      showToast('Added as a draft. Check it over, then publish it.', 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'That could not be added', 'error');
    } finally {
      setBusy(false);
    }
  };

  if (programs === undefined) return <div className="att"><p className="a-sub">Loading programs…</p></div>;
  if (programs === null) return <div className="att"><div className="a-card"><p className="a-sub">Programs need migration 0122_gym_programs.sql, which is not pasted yet (or the list could not load).</p></div></div>;

  const program = editingProgram && editingProgram !== 'new' ? programs.find((p) => p.id === editingProgram) ?? null : null;
  const workout = editingWorkout && editingWorkout !== 'new' ? workouts.find((w) => w.id === editingWorkout) ?? null : null;
  const published = programs.filter((p) => p.published).length;

  return (
    <div className="att" data-programs>
      <div className="a-head">
        <div className="min-w-0"><h1>Programs</h1><p>Multi-week plans members follow — a workout for each training day · {published} published</p></div>
        <nav className="a-tabs" aria-label="Programs or workouts" data-rd-tabs style={{ marginLeft: 'auto' }}>
          <button type="button" className={tab === 'programs' ? 'on' : ''} onClick={() => setTab('programs')}><CalendarRange size={14} />Programs <em>{programs.length}</em></button>
          <button type="button" className={tab === 'workouts' ? 'on' : ''} onClick={() => setTab('workouts')} data-tab="workouts"><Dumbbell size={14} />Workouts <em>{workouts.length}</em></button>
        </nav>
        <button type="button" className="a-btn violet" onClick={() => (tab === 'programs' ? setEditingProgram('new') : setEditingWorkout('new'))}>
          <Plus size={15} />{tab === 'programs' ? 'New program' : 'New workout'}</button>
      </div>
      {programs.length > 0 && published === 0 && (
        <div className="a-hint" style={{ flex: 'none' }}><AlertTriangle size={14} /><span>Members cannot see any of your programs yet — open one and press Publish.</span></div>
      )}

      <div className="a-grid" style={{ gridTemplateColumns: '300px minmax(0, 1fr)', flex: 1 }}>
        <div className="a-card" data-program-list>
          {tab === 'programs' ? (<>
            <div className="a-ct"><h3><CalendarRange size={16} />Your programs</h3><small>{programs.length}</small></div>
            <div className="a-scroll grow" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {programs.length === 0 && <p className="a-sub">No programs yet — start from a ready-made one below, or build your own.</p>}
              {programs.map((p) => (
                <button key={p.id} type="button" className={`a-tile ${editingProgram === p.id ? 'on' : ''}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
                  onClick={() => setEditingProgram(p.id)} data-program={p.name}>
                  <span style={{ height: 46, width: 56, borderRadius: 10, flex: 'none', display: 'grid', placeItems: 'center', overflow: 'hidden', background: 'linear-gradient(135deg,#2a2050,#14323a)', color: '#ffffff99' }}>
                    {p.coverUrl ? <img src={p.coverUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Dumbbell size={20} />}
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <b className="truncate" style={{ display: 'block' }}>{p.name} {p.premium && <Crown size={11} style={{ display: 'inline', color: 'var(--a-a300)' }} aria-label="Premium" />}</b>
                    <small style={{ display: 'block' }}>{p.weeks} week{p.weeks === 1 ? '' : 's'} · {levelWord(p.level).toLowerCase()} · {p.days.length} training days</small>
                    <small style={{ color: p.published ? 'var(--a-p300)' : 'var(--a-a300)' }}>{p.published ? 'published — members see it' : 'draft — members cannot see it'}</small>
                  </span>
                </button>
              ))}
              <div className="a-lbl" style={{ margin: '10px 0 2px', display: 'flex', gap: 6, alignItems: 'center' }}><Sparkles size={13} />Start from a ready-made one</div>
              {STARTERS.map((s) => (
                <button key={s.key} type="button" className="a-tile" style={{ borderStyle: 'dashed' }} disabled={busy} onClick={() => void copy(s.key)} aria-label={`Add ${s.label}`}>
                  <b>{s.label}</b><small>{s.blurb}</small>
                </button>
              ))}
            </div>
          </>) : (<>
            <div className="a-ct"><h3><Dumbbell size={16} />Workouts</h3><small>one session each</small></div>
            <div className="a-scroll grow" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {workouts.length === 0 && <p className="a-sub">No workouts yet. A workout is one session: exercises with sets, reps or time, and rest. Programs put them on days.</p>}
              {workouts.map((w) => {
                const used = programs.filter((p) => p.days.some((d) => d.workoutId === w.id)).length;
                return (
                  <button key={w.id} type="button" className={`a-tile ${editingWorkout === w.id ? 'on' : ''}`} onClick={() => setEditingWorkout(w.id)} aria-label={`Edit workout ${w.name}`}>
                    <b>{w.name}</b><small>{w.items.length} exercise{w.items.length === 1 ? '' : 's'} · {levelWord(w.level).toLowerCase()}{used ? ` · in ${used} program${used === 1 ? '' : 's'}` : ''}</small>
                  </button>
                );
              })}
            </div>
          </>)}
        </div>

        <div className="a-card glow" style={{ overflowY: 'auto' }} data-program-editor>
          {tab === 'programs' ? (editingProgram ? (
            <ProgramEditor key={editingProgram} program={program} workouts={workouts} exercises={exercises}
              onEditWorkout={(id) => { setTab('workouts'); setEditingWorkout(id); }}
              onSaved={async (id) => { await load(); setEditingProgram(id); }} onClose={() => setEditingProgram(programs[0]?.id ?? null)} />
          ) : (
            <div style={{ margin: 'auto', textAlign: 'center' }}><CalendarRange size={28} style={{ color: 'var(--a-p300)', margin: '0 auto 8px' }} />
              <b>How members get a program</b>
              <div className="a-sub" style={{ marginTop: 6, maxWidth: 460 }}>Build workouts, put one on each training day of each week, then Publish. Members find it under Train → Programs; Today shows their next day with a Start button, and each finished day counts for points, streaks and badges.</div></div>
          )) : (editingWorkout ? (
            <WorkoutEditor key={editingWorkout} workout={workout} exercises={exercises}
              onSaved={async () => { await load(); setEditingWorkout(null); }} onClose={() => setEditingWorkout(null)} />
          ) : (
            <div style={{ margin: 'auto', textAlign: 'center' }}><Dumbbell size={28} style={{ color: 'var(--a-p300)', margin: '0 auto 8px' }} />
              <b>Pick a workout, or make a new one</b><div className="a-sub" style={{ marginTop: 6 }}>Coaches build workouts in their app too; theirs show here.</div></div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ProgramEditor({ program, workouts, exercises, onSaved, onClose, onEditWorkout }: {
  program: GymProgram | null;
  workouts: GymWorkout[];
  exercises: Ex[];
  onSaved: (id: string) => Promise<void>;
  onClose: () => void;
  /** Opens a workout on the Workouts tab — its name and exercises are edited there (2026-10-25). */
  onEditWorkout: (id: string) => void;
}) {
  const [name, setName] = useState(program?.name ?? '');
  const [description, setDescription] = useState(program?.description ?? '');
  const [level, setLevel] = useState<Level>(program?.level ?? 'all_levels');
  const [weeks, setWeeks] = useState(program?.weeks ?? 4);
  const [premium, setPremium] = useState(program?.premium ?? false);
  // A lighter week every N weeks (0173): back to week 1's load, so the body recovers.
  const [deloadEvery, setDeloadEvery] = useState<number | null>(program?.deloadEvery ?? null);
  const [cover, setCover] = useState<string | null>(program?.coverUrl ?? null);
  const [busy, setBusy] = useState(false);
  const [cellAt, setCellAt] = useState<{ at: HTMLElement; week: number; day: number } | null>(null);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); } catch (e) { showToast(e instanceof Error ? e.message : 'That did not work', 'error'); }
    finally { setBusy(false); }
  };
  const save = () => run(async () => {
    if (!name.trim()) throw new Error('The program needs a name.');
    const id = await saveProgram(program?.id ?? null, { name, description, coverUrl: cover, level, weeks, premium, deloadEvery });
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
    setCellAt(null);
    await setProgramDay(program.id, week, day, workoutId || null);
    await onSaved(program.id);
  });
  const pickCover = (file: File | undefined) => run(async () => {
    if (!file) return;
    setCover(await uploadContentPhoto(file));
  });

  const cell = (week: number, day: number) => program?.days.find((d) => d.week === week && d.day === day)?.workoutId ?? '';
  // Each workout used in the program keeps one colour across the grid and the legend.
  const used = program ? [...new Set(program.days.map((d) => d.workoutId))] : [];
  const tone = (id: string) => `t${used.indexOf(id) % 6}`;
  const wName = (id: string) => workouts.find((w) => w.id === id)?.name ?? 'Workout';
  const exName = (id: string) => exercises.find((e) => e.id === id)?.name ?? 'an exercise';
  const lighter = (wk: number) => !!deloadEvery && wk % deloadEvery === 0;

  return (<>
    <div className="a-ct">
      <div className="min-w-0"><h3 style={{ fontSize: 17 }}>{program ? program.name : 'New program'}</h3>
        <div className="a-sub">{program ? `${program.published ? 'Published — members can follow it' : 'Draft — only you and your staff see it'} · ${program.days.length} training days over ${program.weeks} weeks` : 'Save it, then fill in the weeks.'}</div></div>
      <div style={{ display: 'flex', gap: 6 }}>
        {program && <button type="button" className={`a-btn sm ${program.published ? '' : 'amber'}`} disabled={busy} onClick={() => void publish(!program.published)} data-publish>
          {program.published ? <><EyeOff size={13} />Unpublish</> : <><Eye size={13} />Publish</>}</button>}
        <button type="button" className="a-btn violet sm" disabled={busy} onClick={() => void save()} data-save-program><Check size={13} />Save</button>
        {!program && <button type="button" className="a-btn ghost sm" onClick={onClose}>Cancel</button>}
      </div>
    </div>

    <div className="a-grid" style={{ gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: 12 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <input className="a-in" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} aria-label="Program name" placeholder="e.g. 6-Week Beginner Strength" />
        <textarea className="a-in" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} rows={2} aria-label="Description" placeholder="Who it is for and what it does." />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <select className="a-chip v" value={level} onChange={(e) => setLevel(e.target.value as Level)} aria-label="Level">{LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}</select>
          <select className="a-chip" value={weeks} onChange={(e) => setWeeks(Number(e.target.value))} aria-label="Weeks">{Array.from({ length: 16 }, (_, i) => i + 1).map((w) => <option key={w} value={w}>{w} week{w === 1 ? '' : 's'}</option>)}</select>
          <select className="a-chip" value={deloadEvery ?? ''} onChange={(e) => setDeloadEvery(e.target.value ? Number(e.target.value) : null)} aria-label="Lighter week"
            data-tip="A lighter week goes back to week 1's load, so the body recovers before the next step up">
            <option value="">No lighter week</option>{[3, 4, 5, 6].map((n) => <option key={n} value={n}>Lighter every {n === 3 ? '3rd' : `${n}th`} week</option>)}
          </select>
          <button type="button" className={`a-chip ${premium ? 'on' : ''}`} aria-pressed={premium} aria-label="Premium members only" onClick={() => setPremium(!premium)}><Crown size={12} style={{ display: 'inline' }} /> Premium only</button>
        </div>
        {premium && <div className="a-sub">Members whose plan does not include "Premium programs" (Plans) see it with a lock and the reason, never hidden.</div>}
        {program && (weeks !== program.weeks || deloadEvery !== program.deloadEvery || level !== program.level || premium !== program.premium || name !== program.name) && <div className="a-sub" style={{ color: 'var(--a-a300)' }}>Changes are not saved yet — press Save.</div>}
      </div>
      <div>
        {cover ? (
          <div style={{ position: 'relative' }}>
            <img src={cover} alt="Program cover" style={{ width: '100%', borderRadius: 12, objectFit: 'cover', maxHeight: 120 }} />
            <button type="button" onClick={() => setCover(null)} aria-label="Remove cover" style={{ position: 'absolute', top: 6, right: 6, padding: 4, borderRadius: 6, background: 'rgba(0,0,0,0.6)', color: '#fff' }}><Trash2 size={12} /></button>
          </div>
        ) : (
          <label className="a-tile" style={{ height: 110, alignItems: 'center', justifyContent: 'center', borderStyle: 'dashed', cursor: 'pointer' }}>
            <ImagePlus size={16} /><b>Cover photo</b><small>Optional · one photo slot</small>
            <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" disabled={busy} onChange={(e) => void pickCover(e.target.files?.[0])} />
          </label>
        )}
      </div>
    </div>

    {program && (<>
      <div className="a-lbl" style={{ margin: '14px 0 8px' }}>The weeks <span style={{ fontWeight: 500 }}>· tap a day to put a workout on it, or leave it as rest</span></div>
      {workouts.length === 0 && <div className="a-hint" style={{ marginBottom: 8 }}><AlertTriangle size={14} /><span>No workouts yet. Build one on the Workouts tab first.</span></div>}
      <div className="a-wkg" data-week-grid>
        <div />{DAYS.map((d) => <div key={d} className="h">{d}</div>)}
        {Array.from({ length: program.weeks }, (_, i) => i + 1).map((wk) => [
          <div key={`w${wk}`} className="w">Week {wk}</div>,
          ...DAYS.map((d, di) => {
            const id = cell(wk, di + 1);
            const w = workouts.find((x) => x.id === id);
            return (
              <button key={`${wk}-${d}`} type="button" className={`d ${id ? tone(id) : 'rest'}`} disabled={busy} aria-label={`Week ${wk}, ${d}`}
                onClick={(e) => setCellAt({ at: e.currentTarget, week: wk, day: di + 1 })}>
                {id ? <>{wName(id)}<small>{lighter(wk) ? 'lighter' : wk === 1 && w ? `${w.items.length} exercises` : ' '}</small></> : 'rest'}
              </button>
            );
          }),
        ])}
      </div>
      <Popover anchor={cellAt?.at ?? null} open={!!cellAt} onClose={() => setCellAt(null)} width={240}>
        {cellAt && (
          <div className="p-1.5 flex flex-col max-h-72 overflow-y-auto" role="listbox" aria-label="Workout for the day">
            <button type="button" className="text-left px-3 py-2 rounded-lg text-[13px] hover:bg-white/5" style={{ color: MUTED }} onClick={() => void setDay(cellAt.week, cellAt.day, '')}>Rest</button>
            {workouts.map((w) => (
              <button key={w.id} type="button" role="option" aria-selected={cell(cellAt.week, cellAt.day) === w.id} className="text-left px-3 py-2 rounded-lg text-[13px] text-white hover:bg-white/5"
                style={cell(cellAt.week, cellAt.day) === w.id ? { background: 'rgba(124,58,237,0.2)' } : undefined}
                onClick={() => void setDay(cellAt.week, cellAt.day, w.id)}>{w.name} <span style={{ color: MUTED }}>· {w.items.length}</span></button>
            ))}
          </div>
        )}
      </Popover>
      {used.length > 0 && <div className="a-lbl" style={{ margin: '14px 0 0' }}>The workouts in it <span style={{ fontWeight: 500 }}>· tap one to rename it or choose its exercises</span></div>}
      {used.length > 0 && (
        <div className="a-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', marginTop: 8, gap: 8 }}>
          {used.map((id) => {
            const w = workouts.find((x) => x.id === id);
            const names = (w?.items ?? []).map((it) => exName(it.exerciseId));
            return (
              // Each workout on the grid opens its editor: rename it, choose its exercises (members asked what "Full body A" was).
              <button key={id} type="button" className="a-tile" onClick={() => onEditWorkout(id)} aria-label={`Edit workout ${wName(id)}`} data-tip="Rename it or choose its exercises">
                <b className={`a-wkg-name ${tone(id)}`}>{wName(id)}</b>
                {names.length === 0
                  ? <small style={{ color: 'var(--a-a300)' }}>No exercises yet — tap to choose them</small>
                  : <small>{names.slice(0, 3).join(' · ')}{names.length > 3 ? ` · +${names.length - 3}` : ''}</small>}
              </button>
            );
          })}
        </div>
      )}
      {deloadEvery && <div className="a-sub" style={{ marginTop: 8 }}>Every {deloadEvery === 3 ? '3rd' : `${deloadEvery}th`} week is lighter: it goes back to week 1's load.</div>}
    </>)}
  </>);
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
              {/* Progressive overload (0173): the starting load, and how much more each week. */}
              <div className="flex flex-wrap items-center gap-2 text-[11px]" style={{ gridColumn: '1 / -1', color: MUTED }} data-progression={n}>
                {!isTimed && (
                  <label className="flex items-center gap-1">Start at
                    <input type="number" min={0} step={0.5} value={it.targetWeightKg ?? ''} aria-label={`Starting weight ${n}`} placeholder="kg"
                      onChange={(e) => patch(i, { targetWeightKg: e.target.value === '' ? null : Number(e.target.value) })}
                      className="h-8 w-16 px-2 rounded-lg text-xs text-white" style={FIELD} /> kg
                  </label>
                )}
                <label className="flex items-center gap-1">Each week
                  <select value={it.progressKind} aria-label={`Each week ${n}`}
                    onChange={(e) => patch(i, { progressKind: e.target.value as ProgressKind,
                      progressStep: it.progressStep || (e.target.value === 'weight' ? 2.5 : e.target.value === 'seconds' ? 5 : 1) })}
                    className="h-8 px-2 rounded-lg text-xs text-white" style={FIELD}>
                    <option value="none">stays the same</option>
                    {!isTimed && <option value="weight">add weight</option>}
                    {!isTimed && <option value="reps">add reps</option>}
                    <option value="sets">add sets</option>
                    {isTimed && <option value="seconds">add seconds</option>}
                  </select>
                </label>
                {it.progressKind !== 'none' && (
                  <label className="flex items-center gap-1">+
                    <input type="number" min={0} step={it.progressKind === 'weight' ? 0.5 : 1} value={it.progressStep} aria-label={`Step ${n}`}
                      onChange={(e) => patch(i, { progressStep: Number(e.target.value) || 0 })}
                      className="h-8 w-16 px-2 rounded-lg text-xs text-white" style={FIELD} />
                    {it.progressKind === 'weight' ? 'kg' : it.progressKind === 'seconds' ? 's' : it.progressKind}
                  </label>
                )}
              </div>
            </div>
          );
        })}
        {items.length > 0 && (
          <p className="text-[10px]" style={{ color: MUTED }}>Sets · reps (or seconds) · rest in seconds. In a program, "each week" makes every week build on the last.</p>
        )}
      </div>

      <div className="flex gap-2 mt-3">
        <Button size="sm" variant="outline"
          onClick={() => setItems((prev) => [...prev, { exerciseId: '', targetSets: 3, targetReps: 10, targetSeconds: null, restSeconds: 90,
            targetWeightKg: null, progressKind: 'none', progressStep: 0 }])}>
          <Plus size={12} /> Add an exercise
        </Button>
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => void save()}>Save workout</Button>
      </div>
    </Card>
  );
}
