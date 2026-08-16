import { motion, AnimatePresence } from 'framer-motion';
import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { Plus, X, ExternalLink, Trash2, Eye, EyeOff, BookOpen } from 'lucide-react';
import { showToast } from '../utils/toast';
import {
  listWorkoutResources,
  createWorkoutResource,
  updateWorkoutResource,
  deleteWorkoutResource,
  linkHost,
  type WorkoutResourceRow,
} from '../lib/api/workoutResources';
import type { ClassLevel } from '../types/db';

/**
 * The free-workout library the member app links to (migration 0019).
 *
 * Links out, never copies. The routines belong to whoever wrote them, and a copy
 * held here would go stale the moment they revised it — so this page curates
 * destinations rather than content.
 *
 * Hide, don't delete, is the default: a resource that's temporarily unsuitable
 * comes back with one click, and deleting loses the description someone wrote.
 */

const LEVELS: ClassLevel[] = ['all_levels', 'beginner', 'intermediate', 'advanced'];

const emptyForm = {
  title: '',
  provider: '',
  url: '',
  description: '',
  category: '',
  level: 'all_levels' as ClassLevel,
  sortOrder: '100',
};

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] font-semibold uppercase tracking-wide block mb-1"
        style={{ color: 'var(--color-text-muted)' }}>
        {label}
        {hint && <span className="normal-case font-normal tracking-normal opacity-70"> · {hint}</span>}
      </span>
      {children}
    </label>
  );
}

export default function Resources() {
  const [rows, setRows] = useState<WorkoutResourceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [toDelete, setToDelete] = useState<WorkoutResourceRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // false — the admin needs to see hidden ones in order to bring them back.
      setRows(await listWorkoutResources(false));
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to load resources', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!form.title.trim() || !form.provider.trim() || !form.url.trim()) {
      return showToast('Title, provider and link are all required', 'error');
    }
    // Catch a typo here rather than shipping a dead link to every member's phone.
    try {
      new URL(form.url.trim());
    } catch {
      return showToast('That link isn\'t a valid URL — include https://', 'error');
    }

    setSaving(true);
    try {
      await createWorkoutResource({
        title: form.title.trim(),
        provider: form.provider.trim(),
        url: form.url.trim(),
        description: form.description.trim() || null,
        category: form.category.trim() || null,
        level: form.level,
        is_active: true,
        sort_order: Number(form.sortOrder) || 100,
      });
      showToast('Resource added', 'success');
      setShowModal(false);
      setForm(emptyForm);
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not add that resource', 'error');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (r: WorkoutResourceRow) => {
    try {
      await updateWorkoutResource(r.id, { is_active: !r.is_active });
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not update that resource', 'error');
    }
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    try {
      await deleteWorkoutResource(toDelete.id);
      showToast('Resource removed', 'success');
      setToDelete(null);
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not remove that resource', 'error');
    }
  };

  const panel = { background: 'var(--color-surface)', border: '1px solid var(--color-border)' };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Workout Resources</h1>
          <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
            Free training material members see under Workouts
          </p>
        </div>
        <Button variant="primary" onClick={() => setShowModal(true)}>
          <Plus size={16} className="mr-1.5" /> Add Resource
        </Button>
      </div>

      {loading ? (
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Loading…</p>
      ) : rows.length === 0 ? (
        <div className="rounded-xl p-10 text-center" style={panel}>
          <BookOpen size={26} className="mx-auto mb-2 opacity-40" style={{ color: 'var(--color-text-muted)' }} />
          <p className="text-sm text-white mb-1">No resources yet</p>
          <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
            Add a link and it appears in the member app straight away.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((r, i) => (
            <motion.div key={r.id}
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.03, 0.25) }}
              className="rounded-xl p-4 flex items-center gap-4"
              style={{ ...panel, opacity: r.is_active ? 1 : 0.5 }}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-white">{r.title}</p>
                  <span className="text-[9px] px-2 py-0.5 rounded-full font-medium capitalize"
                    style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary)' }}>
                    {r.level.replace('_', ' ')}
                  </span>
                  {r.category && (
                    <span className="text-[9px] px-2 py-0.5 rounded-full font-medium"
                      style={{ background: 'var(--color-secondary-light)', color: 'var(--color-secondary)' }}>
                      {r.category}
                    </span>
                  )}
                  {!r.is_active && (
                    <span className="text-[9px] px-2 py-0.5 rounded-full font-medium"
                      style={{ background: 'rgba(148,163,184,0.15)', color: 'var(--color-text-muted)' }}>
                      hidden
                    </span>
                  )}
                </div>
                <p className="text-[11px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                  {r.provider}{r.description ? ` · ${r.description}` : ''}
                </p>
                <a href={r.url} target="_blank" rel="noopener noreferrer"
                  className="text-[10px] mt-1 inline-flex items-center gap-1 hover:underline"
                  style={{ color: 'var(--color-secondary)' }}>
                  <ExternalLink size={9} /> {linkHost(r.url)}
                </a>
              </div>

              <div className="flex gap-2 flex-shrink-0">
                <Button variant="ghost" size="sm" className="!text-[10px]" onClick={() => toggleActive(r)}>
                  {r.is_active ? <><EyeOff size={12} className="mr-1" /> Hide</> : <><Eye size={12} className="mr-1" /> Show</>}
                </Button>
                <Button variant="ghost" size="sm" className="!text-[10px]" onClick={() => setToDelete(r)}>
                  <Trash2 size={12} className="mr-1" style={{ color: '#ef4444' }} /> Delete
                </Button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {createPortal(
        <AnimatePresence>
          {showModal && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
              style={{ background: 'rgba(0,0,0,0.6)' }}
              onClick={() => !saving && setShowModal(false)}>
              <motion.div initial={{ scale: 0.96, y: 8 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96, y: 8 }}
                className="w-full max-w-md rounded-2xl overflow-hidden"
                style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
                onClick={(e) => e.stopPropagation()}>
                <div className="p-5 flex items-center justify-between" style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <div>
                    <h2 className="text-base font-bold text-white">Add Resource</h2>
                    <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                      Links out to the source — nothing is copied into Core Fitness.
                    </p>
                  </div>
                  <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-white">
                    <X size={20} />
                  </button>
                </div>

                <div className="p-5 space-y-3 max-h-[65vh] overflow-y-auto">
                  <Field label="Title">
                    <Input type="text" value={form.title} placeholder="e.g. Beginner bodyweight workout"
                      onChange={(e) => setForm({ ...form, title: e.target.value })} />
                  </Field>
                  <Field label="Provider" hint="Who made it — members see this">
                    <Input type="text" value={form.provider} placeholder="e.g. Darebee"
                      onChange={(e) => setForm({ ...form, provider: e.target.value })} />
                  </Field>
                  <Field label="Link" hint="Include https://">
                    <Input type="url" value={form.url} placeholder="https://…"
                      onChange={(e) => setForm({ ...form, url: e.target.value })} />
                  </Field>
                  <Field label="Description" hint="Optional, one line">
                    <Input type="text" value={form.description} placeholder="What a member gets from it"
                      onChange={(e) => setForm({ ...form, description: e.target.value })} />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Category" hint="Groups the list">
                      <Input type="text" value={form.category} placeholder="e.g. Bodyweight"
                        onChange={(e) => setForm({ ...form, category: e.target.value })} />
                    </Field>
                    <Field label="Level">
                      <select value={form.level}
                        onChange={(e) => setForm({ ...form, level: e.target.value as ClassLevel })}
                        className="w-full rounded-xl px-3 py-2.5 text-white text-sm capitalize"
                        style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
                        {LEVELS.map((l) => <option key={l} value={l}>{l.replace('_', ' ')}</option>)}
                      </select>
                    </Field>
                  </div>
                  <Field label="Sort order" hint="Lower shows first">
                    <Input type="number" value={form.sortOrder}
                      onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} />
                  </Field>
                </div>

                <div className="p-5 flex gap-3" style={{ borderTop: '1px solid var(--color-border)' }}>
                  <Button variant="ghost" className="flex-1" onClick={() => setShowModal(false)}>Cancel</Button>
                  <Button variant="primary" className="flex-1" onClick={handleCreate} disabled={saving}>
                    {saving ? 'Adding…' : 'Add Resource'}
                  </Button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}

      <ConfirmDialog
        isOpen={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={handleDelete}
        title="Remove Resource"
        message={`Remove "${toDelete?.title}" from the library? If you only want it out of the member app for now, Hide keeps the description and brings it back with one click.`}
        confirmText="Remove"
        type="danger"
      />
    </div>
  );
}
