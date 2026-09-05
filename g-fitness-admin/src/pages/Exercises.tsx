import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Dumbbell, EyeOff, Eye, AlertTriangle } from 'lucide-react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import { showToast } from '../utils/toast';
import { supabase } from '../lib/supabaseClient';

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
 */

interface ExerciseRow {
  id: string;
  name: string;
  muscle_group: string;
  equipment: string;
  is_timed: boolean;
  is_active: boolean;
  sort_order: number;
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

  /** Fetch and apply. `loading` is owned by the caller, so this is safe to
   *  call again from a button without flashing the whole screen away. */
  const load = async () => {
    const { data, error } = await supabase
      .from('exercises')
      .select('id, name, muscle_group, equipment, is_timed, is_active, sort_order')
      .order('muscle_group')
      .order('sort_order');
    if (error) {
      setFailed(true);
    } else {
      setRows((data ?? []) as ExerciseRow[]);
      setFailed(false);
    }
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

  const toggleActive = async (row: ExerciseRow) => {
    const { error } = await supabase
      .from('exercises')
      .update({ is_active: !row.is_active })
      .eq('id', row.id);
    if (error) { showToast(error.message, 'error'); return; }
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, is_active: !r.is_active } : r)));
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
            What members can choose when tracking a workout · {rows.filter((r) => r.is_active).length} active
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

      <Card className="!p-4">
        <p className="text-[10px] mb-3 leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
          An exercise members have already logged cannot be deleted — that would rewrite
          their training history. Hide it instead and every past set stays intact.
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
                                opacity: r.is_active ? 1 : 0.45 }}>
                    <div className="min-w-0">
                      <p className="text-xs text-white truncate">{r.name}</p>
                      <p className="text-[9px]" style={{ color: 'var(--color-text-muted)' }}>
                        {r.equipment}{r.is_timed ? ' · timed' : ''}
                      </p>
                    </div>
                    <button onClick={() => toggleActive(r)}
                      data-tip={r.is_active ? 'Hide from members' : 'Show to members'}
                      className="p-1.5 rounded-lg flex-shrink-0"
                      style={{ color: 'var(--color-text-muted)' }}>
                      {r.is_active ? <Eye size={12} /> : <EyeOff size={12} />}
                    </button>
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
