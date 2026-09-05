import { motion, AnimatePresence } from 'framer-motion';
import ImageField from '../components/ui/ImageField';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import {
  Plus, X, ExternalLink, Trash2, Eye, EyeOff, BookOpen, Search, ImageOff,
} from 'lucide-react';
import { showToast } from '../utils/toast';
import {
  listWorkoutResources,
  createWorkoutResource,
  updateWorkoutResource,
  deleteWorkoutResource,
  linkHost,
  hasPreview,
  type WorkoutResourceRow,
} from '../lib/api/workoutResources';
import type { ClassLevel } from '../types/db';

/**
 * The free-workout library the member app links to (migration 0019).
 *
 * Links out, never copies. The routines belong to whoever wrote them, and a copy
 * held here would go stale the moment they revised it — so this page curates
 * destinations rather than content. The preview images (0061) are the one
 * exception and stay within that rule: a screenshot of the top of a page is a
 * link preview, the same artefact any messaging app generates, not a copy of
 * the routine underneath it.
 *
 * Hide, don't delete, is the default: a resource that's temporarily unsuitable
 * comes back with one click, and deleting loses the description someone wrote.
 */

const LEVELS: ClassLevel[] = ['all_levels', 'beginner', 'intermediate', 'advanced'];

const emptyForm = {
  title: '',
  provider: '',
  url: '',
  imageUrl: '',
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

/**
 * The banner at the top of a resource card.
 *
 * Three states, and the third is the point: a file that 404s falls back to the
 * same "no preview" tile as a NULL column rather than leaving the browser's
 * broken-image glyph on the page. The preview files live in this app's own
 * `public/`, so a path that works in the member app can still be missing here
 * — checking is cheaper than remembering to copy.
 *
 * Declared at module level, never inside the page's render body: a component
 * defined during render is a new type on every pass and remounts its whole
 * subtree, which is how the image would flicker on each keystroke in search.
 */
function ResourceThumb({ resource }: { resource: WorkoutResourceRow }) {
  const [broken, setBroken] = useState(false);
  const show = hasPreview(resource) && !broken;

  return (
    <div className="relative w-full overflow-hidden"
      style={{ aspectRatio: '3 / 1', background: 'var(--color-bg)' }}>
      {show ? (
        <img
          src={resource.image_url as string}
          alt=""
          loading="lazy"
          onError={() => setBroken(true)}
          className="w-full h-full object-cover object-top"
        />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center gap-1.5"
          style={{ background: 'var(--color-primary-light)' }}>
          <ImageOff size={18} style={{ color: 'var(--color-primary)' }} />
          <span className="text-[11px] font-medium" style={{ color: 'var(--color-primary)' }}>
            {linkHost(resource.url)}
          </span>
        </div>
      )}
    </div>
  );
}

export default function Resources() {
  const [rows, setRows] = useState<WorkoutResourceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [toDelete, setToDelete] = useState<WorkoutResourceRow | null>(null);
  const [search, setSearch] = useState('');

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

  // Title, provider, category and host — the four things someone actually has
  // in mind when they come looking. The host matters because "the YouTube ones"
  // is how the desk talks about three of these and no other field says it.
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.title, r.provider, r.category ?? '', linkHost(r.url)]
        .some((field) => field.toLowerCase().includes(q))
    );
  }, [rows, search]);

  const counts = useMemo(() => ({
    total: rows.length,
    hidden: rows.filter((r) => !r.is_active).length,
    previews: rows.filter(hasPreview).length,
  }), [rows]);

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
        // Empty means "no preview", which is a supported state — not an empty
        // string that would render as a broken image on every member's phone.
        image_url: form.imageUrl.trim() || null,
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
      <div className="flex items-center justify-between gap-4">
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

      {/* Search and the three counts worth knowing at a glance. "Without a
          preview" is one of them because it is the only quality gap on this
          page that is invisible from a list of titles. */}
      {!loading && rows.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[220px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: 'var(--color-text-muted)' }} />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search title, provider, category or site…"
              className="w-full rounded-xl pl-9 pr-3 py-2.5 text-white text-sm"
              style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
            />
          </div>
          <div className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
            <span className="px-2.5 py-1.5 rounded-lg" style={panel}>
              <b className="text-white">{counts.total}</b> total
            </span>
            <span className="px-2.5 py-1.5 rounded-lg" style={panel}>
              <b className="text-white">{counts.hidden}</b> hidden
            </span>
            <span className="px-2.5 py-1.5 rounded-lg" style={panel}>
              <b className="text-white">{counts.total - counts.previews}</b> without a preview
            </span>
          </div>
        </div>
      )}

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
      ) : visible.length === 0 ? (
        // A filtered-to-nothing list says so in its own words. "Nothing here"
        // would read as an empty library, which is a different fact.
        <div className="rounded-xl p-10 text-center" style={panel}>
          <Search size={26} className="mx-auto mb-2 opacity-40" style={{ color: 'var(--color-text-muted)' }} />
          <p className="text-sm text-white mb-1">Nothing matches “{search}”</p>
          <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
            {counts.total} resources in the library — clear the search to see them all.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3">
          {visible.map((r, i) => (
            <motion.div key={r.id}
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.03, 0.25) }}
              className="rounded-xl overflow-hidden flex flex-col"
              style={{ ...panel, opacity: r.is_active ? 1 : 0.55 }}>

              <ResourceThumb resource={r} />

              <div className="p-4 flex flex-col gap-2 flex-1">
                <div className="flex items-start gap-2">
                  <p className="text-sm font-semibold text-white flex-1 leading-snug">{r.title}</p>
                  {!r.is_active && (
                    <span className="text-[9px] px-2 py-0.5 rounded-full font-medium flex-shrink-0"
                      style={{ background: 'rgba(148,163,184,0.15)', color: 'var(--color-text-muted)' }}>
                      hidden
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
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
                </div>

                {r.description && (
                  <p className="text-[11px] leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
                    {r.description}
                  </p>
                )}

                {/* mt-auto pins the link and the buttons to the bottom, so cards
                    in the same row line up however long their descriptions are. */}
                <div className="mt-auto pt-2 flex items-center justify-between gap-2">
                  <a href={r.url} target="_blank" rel="noopener noreferrer"
                    className="text-[11px] inline-flex items-center gap-1 hover:underline min-w-0"
                    style={{ color: 'var(--color-secondary)' }}>
                    <ExternalLink size={10} className="flex-shrink-0" />
                    <span className="truncate">{r.provider} · {linkHost(r.url)}</span>
                  </a>
                  <div className="flex gap-1 flex-shrink-0">
                    <Button variant="ghost" size="sm" className="!text-[10px]" onClick={() => toggleActive(r)}>
                      {r.is_active ? <><EyeOff size={12} className="mr-1" /> Hide</> : <><Eye size={12} className="mr-1" /> Show</>}
                    </Button>
                    <Button variant="ghost" size="sm" className="!text-[10px]" onClick={() => setToDelete(r)}>
                      <Trash2 size={12} style={{ color: 'var(--color-secondary)' }} />
                    </Button>
                  </div>
                </div>
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
                  {/* This asked for `/resource-previews/example.jpeg` — a path
                      into a folder inside the app's source. The only way to put
                      a file there is to commit one and redeploy, so the gym
                      could never actually use it. Uploads to storage now (0065);
                      the "use a link" box still accepts those seeded paths so
                      the nine 0061 rows stay editable. */}
                  <ImageField
                    value={form.imageUrl}
                    onChange={(imageUrl) => setForm({ ...form, imageUrl })}
                    kind="resources"
                    label="Preview image"
                    hint="Blank shows the site's address instead, which is better than a wrong picture."
                  />
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
