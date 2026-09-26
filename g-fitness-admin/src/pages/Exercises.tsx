import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Dumbbell, EyeOff, Eye, AlertTriangle, BookOpen, Video } from 'lucide-react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import ExerciseGuideEditor from '../components/ExerciseGuideEditor';
import { showToast } from '../utils/toast';
import { supabase } from '../lib/supabaseClient';
import { listExerciseMedia, photoUsage, saveExerciseMedia, type ExerciseMedia } from '../lib/api/exerciseMedia';

/**
 * The exercise catalogue (migration 0050).
 *
 * ## Why the gym owns this list
 *
 * The tracker could have taken free text. It would then have collected "Bench
 * Press", "bench" and "Benchpress" as three different exercises, and the
 * strength history that justifies the whole feature would silently plot a third
 * of the data. Same reasoning as the achievement catalogue (0038) and the
 * check-in activity options (0040): the rules are data the gym edits.
 *
 * ## Deactivate, never delete
 *
 * There is no delete button, and the database would refuse one anyway
 * (`on delete restrict`). Removing an exercise members have logged would
 * rewrite their history. Deactivating takes it out of the member's picker and
 * leaves every past set intact.
 *
 * ## Library rows and your rows (0121)
 *
 * The 36 standard exercises are one shared row each, read by every gym. Since
 * 0121 only the platform edits them, so on this page they are labelled
 * "Core Fitness library" and hiding one writes **this gym's** overlay
 * (`gym_exercise_media.hidden`) - before 0121, Gym #1 hiding "Deadlift" hid it
 * in every gym. Exercises the gym added are "Yours" and keep the `is_active`
 * toggle. Either kind takes the gym's own guide: photo, video, cues, steps.
 *
 * The page works before 0121 is pasted: it asks for the new columns and falls
 * back to the old list, without the guide buttons, if they are not there yet.
 */

interface ExerciseRow {
  id: string;
  name: string;
  muscle_group: string;
  equipment: string;
  is_timed: boolean;
  is_active: boolean;
  sort_order: number;
  /** NULL = the shared library (0098). Absent before 0121's select succeeds. */
  gym_id?: string | null;
  cues?: string[];
  steps?: string[];
}

const GROUPS = ['chest', 'back', 'legs', 'shoulders', 'arms', 'core', 'full_body', 'cardio'];
const EQUIPMENT = ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'other'];

const emptyForm = { name: '', muscle_group: 'full_body', equipment: 'other', is_timed: false };

export default function Exercises() {
  const [rows, setRows] = useState<ExerciseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  /** exercise → routines using it (0090). Null before 0090, so no count is shown. */
  const [usage, setUsage] = useState<Map<string, { routines: number; members: number }> | null>(null);
  /** This gym's guides (0121), by exercise. */
  const [media, setMedia] = useState<Map<string, ExerciseMedia>>(new Map());
  /** Whether 0121 is live - the guide buttons need it. */
  const [guides, setGuides] = useState(false);
  const [photos, setPhotos] = useState<{ used: number; cap: number | null } | null>(null);
  const [editing, setEditing] = useState<ExerciseRow | null>(null);

  /** Fetch and apply. `loading` is owned by the caller, so this is safe to
   *  call again from a button without flashing the whole screen away. */
  const load = async () => {
    // 0121's columns first; before it is pasted they do not exist, and the
    // page falls back to the list it always showed.
    const BASE = 'id, name, muscle_group, equipment, is_timed, is_active, sort_order';
    const full = await supabase.from('exercises').select(`${BASE}, gym_id, cues, steps`)
      .order('muscle_group').order('sort_order');
    const live = !full.error;
    const { data, error } = live
      ? full
      : await supabase.from('exercises').select(BASE).order('muscle_group').order('sort_order');
    setGuides(live);
    if (live) {
      const [m, p] = await Promise.all([listExerciseMedia(), photoUsage()]);
      setMedia(m);
      setPhotos(p);
    }
    if (error) {
      setFailed(true);
    } else {
      setRows((data ?? []) as ExerciseRow[]);
      setFailed(false);
    }
    // Members' routines (0086) that include each exercise — counts only.
    const counts = await supabase.rpc('exercise_routine_counts');
    setUsage(counts.error ? null : new Map(((counts.data ?? []) as { exercise_id: string; routines: number; members: number }[])
      .map((r) => [r.exercise_id, { routines: r.routines, members: r.members }])));
  };

  useEffect(() => {
    let alive = true;
    // The first statement is an await, so every setState below it is deferred
    // rather than synchronous — which is what react-hooks/set-state-in-effect
    // is actually asking for, and it is better code besides.
    (async () => {
      await load();
      if (!alive) return;
      setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  const add = async () => {
    if (!form.name.trim()) {
      showToast('Name is required', 'error');
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('exercises').insert({
      name: form.name.trim(),
      muscle_group: form.muscle_group,
      equipment: form.equipment,
      is_timed: form.is_timed,
      // Sorted to the end of its group. The seeded list uses tens, so a new
      // entry never lands between two existing ones by accident.
      sort_order: 900,
    });
    setSaving(false);
    if (error) {
      // The unique index is case-folded, so this is the message that matters.
      showToast(
        /unique|duplicate/i.test(error.message)
          ? 'That exercise already exists (names are matched ignoring case)'
          : error.message,
        'error'
      );
      return;
    }
    showToast('Exercise added', 'success');
    setForm(emptyForm);
    setAdding(false);
    await load();
  };

  /** A library row is hidden per gym, in the overlay; the gym's own row by is_active. */
  const isLibrary = (r: ExerciseRow) => guides && r.gym_id === null;
  const shown = (r: ExerciseRow) => (isLibrary(r) ? !media.get(r.id)?.hidden : r.is_active);

  const toggleShown = async (row: ExerciseRow) => {
    if (!isLibrary(row)) { await toggleActive(row); return; }
    const hide = shown(row);
    try {
      await saveExerciseMedia(row.id, { hidden: hide });
      setMedia(await listExerciseMedia());
      showToast(hide ? `${row.name} is hidden from your members. Other gyms are not affected.`
        : `${row.name} is back in your members' list.`, 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'That could not be changed', 'error');
    }
  };

  const toggleActive = async (row: ExerciseRow) => {
    const { data, error } = await supabase
      .from('exercises')
      .update({ is_active: !row.is_active })
      .eq('id', row.id)
      .select('id');
    if (error) { showToast(error.message, 'error'); return; }
    // A zero-row update reports success (CLAUDE.md) — staff cannot edit this list.
    if (!data || data.length === 0) { showToast('Only an admin can change the exercise list', 'error'); return; }
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, is_active: !r.is_active } : r)));
    // Hiding takes it out of the picker; routines that already have it keep
    // running it. Say so, so "hidden" is not mistaken for "removed".
    const used = usage?.get(row.id);
    if (row.is_active && used && used.routines > 0) {
      showToast(`Hidden from the picker. ${used.routines} saved routine${used.routines === 1 ? '' : 's'} (${used.members} member${used.members === 1 ? '' : 's'}) still include it and keep working.`, 'info');
    }
  };

  if (loading) {
    return <div className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Loading exercises…</div>;
  }

  if (failed) {
    return (
      <Card className="!p-4">
        <div className="flex items-start gap-2">
          <AlertTriangle size={14} className="mt-0.5" style={{ color: 'var(--color-secondary)' }} />
          <div>
            <p className="text-xs font-semibold text-white">Couldn&apos;t load the exercise catalogue</p>
            <p className="text-[10px] mt-1" style={{ color: 'var(--color-text-muted)' }}>
              A connection problem, not an empty catalogue. Reload to try again.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  const byGroup = GROUPS.map((g) => ({ group: g, items: rows.filter((r) => r.muscle_group === g) }))
    .filter((s) => s.items.length > 0);
  const orphans = rows.filter((r) => !GROUPS.includes(r.muscle_group));
  if (orphans.length) byGroup.push({ group: 'other', items: orphans });

  return (
    <div className="space-y-5">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
                  className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Exercises</h1>
          <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
            What members can choose when tracking a workout · {rows.filter(shown).length} shown
            {photos && ` · ${photos.used}${photos.cap !== null ? ` of ${photos.cap}` : ''} photos`}
          </p>
        </div>
        <Button variant="secondary" onClick={() => setAdding((v) => !v)}>
          <Plus size={16} /> Add Exercise
        </Button>
      </motion.div>

      {adding && (
        <Card className="!p-4">
          <div className="grid grid-cols-4 gap-3">
            <label className="col-span-2">
              <span className="text-[10px] font-semibold uppercase" style={{ color: 'var(--color-text-muted)' }}>Name</span>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Hip Thrust"
                className="w-full h-10 px-3 rounded-lg text-xs text-white mt-1"
                style={{ background: 'var(--color-surface-high)', border: '1px solid var(--color-border)' }} />
            </label>
            <label>
              <span className="text-[10px] font-semibold uppercase" style={{ color: 'var(--color-text-muted)' }}>Muscle group</span>
              <select value={form.muscle_group} onChange={(e) => setForm({ ...form, muscle_group: e.target.value })}
                className="w-full h-10 px-3 rounded-lg text-xs text-white mt-1"
                style={{ background: 'var(--color-surface-high)', border: '1px solid var(--color-border)' }}>
                {GROUPS.map((g) => <option key={g} value={g}>{g.replace('_', ' ')}</option>)}
              </select>
            </label>
            <label>
              <span className="text-[10px] font-semibold uppercase" style={{ color: 'var(--color-text-muted)' }}>Equipment</span>
              <select value={form.equipment} onChange={(e) => setForm({ ...form, equipment: e.target.value })}
                className="w-full h-10 px-3 rounded-lg text-xs text-white mt-1"
                style={{ background: 'var(--color-surface-high)', border: '1px solid var(--color-border)' }}>
                {EQUIPMENT.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </label>
          </div>
          <label className="flex items-center gap-2 mt-3 cursor-pointer">
            <input type="checkbox" checked={form.is_timed}
              onChange={(e) => setForm({ ...form, is_timed: e.target.checked })} />
            <span className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
              Measured in time, not reps — the member is asked for minutes and seconds
              instead of reps and weight (planks, treadmill, rowing).
            </span>
          </label>
          <div className="flex gap-2 mt-3">
            <Button variant="secondary" onClick={add} disabled={saving}>
              {saving ? 'Adding…' : 'Add'}
            </Button>
            <Button variant="ghost" onClick={() => { setAdding(false); setForm(emptyForm); }}>Cancel</Button>
          </div>
        </Card>
      )}

      {editing && (
        <ExerciseGuideEditor
          key={editing.id}
          exerciseId={editing.id}
          name={editing.name}
          libraryCues={editing.cues ?? []}
          librarySteps={editing.steps ?? []}
          media={media.get(editing.id) ?? null}
          onSaved={() => { void (async () => {
            const [m, p] = await Promise.all([listExerciseMedia(), photoUsage()]);
            setMedia(m); setPhotos(p); setEditing(null);
          })(); }}
          onClose={() => { setEditing(null); void photoUsage().then(setPhotos); }}
        />
      )}

      <Card className="!p-4">
        <p className="text-[10px] mb-3 leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
          An exercise members have already logged cannot be deleted — that would rewrite
          their training history. Hide it instead and every past set stays intact. Hiding
          removes it from the member app's picker and exercise list; routines members already
          built with it keep it.
        </p>
        <div className="space-y-4">
          {byGroup.map(({ group, items }) => (
            <div key={group}>
              <p className="text-[10px] font-semibold uppercase mb-1.5"
                 style={{ color: 'var(--color-primary)' }}>{group.replace('_', ' ')}</p>
              <div className="grid grid-cols-3 gap-2">
                {items.map((r) => (
                  <div key={r.id} className="flex items-center justify-between px-3 py-2 rounded-lg"
                       style={{ background: 'var(--color-surface-high)',
                                border: '1px solid var(--color-border)',
                                opacity: shown(r) ? 1 : 0.45 }}>
                    <div className="min-w-0">
                      <p className="text-xs text-white truncate">
                        {r.name}
                        {media.get(r.id)?.videoUrl && <Video size={10} className="inline ml-1" style={{ color: 'var(--color-primary)' }} aria-label="has a video" />}
                      </p>
                      <p className="text-[9px]" style={{ color: 'var(--color-text-muted)' }}>
                        {guides && (isLibrary(r) ? 'Core Fitness library · ' : 'Yours · ')}
                        {r.equipment}{r.is_timed ? ' · timed' : ''}
                        {usage && (usage.get(r.id)?.routines ?? 0) > 0 && ` · in ${usage.get(r.id)!.routines} routine${usage.get(r.id)!.routines === 1 ? '' : 's'}`}
                      </p>
                    </div>
                    <div className="flex items-center flex-shrink-0">
                      {guides && (
                        <button onClick={() => setEditing(r)}
                          aria-label={`Guide for ${r.name}`} data-tip="Photo, video and cues"
                          className="p-1.5 rounded-lg" style={{ color: 'var(--color-text-muted)' }}>
                          <BookOpen size={12} />
                        </button>
                      )}
                      <button onClick={() => void toggleShown(r)}
                        aria-label={`${shown(r) ? 'Hide' : 'Show'} ${r.name} ${shown(r) ? 'from' : 'to'} members`}
                        data-tip={shown(r) ? 'Hide from members' : 'Show to members'}
                        className="p-1.5 rounded-lg"
                        style={{ color: 'var(--color-text-muted)' }}>
                        {shown(r) ? <Eye size={12} /> : <EyeOff size={12} />}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        {rows.length === 0 && (
          <div className="text-center py-6">
            <Dumbbell size={22} className="mx-auto mb-2" style={{ color: 'var(--color-text-muted)' }} />
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>No exercises yet.</p>
          </div>
        )}
      </Card>
    </div>
  );
}
