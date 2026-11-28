import { useCallback, useEffect, useMemo, useState } from 'react';
import { ExternalLink, Trash2, Eye, EyeOff, Search, Link2, Pencil, Bookmark, Play, FileText, Info } from 'lucide-react';
import Modal from '../components/ui/Modal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import ImageField from '../components/ui/ImageField';
import './attendance/att.css';
import { showToast } from '../utils/toast';
import { recordReason, REASON_FIELD } from '../lib/api/reasons';
import {
  listWorkoutResources, createWorkoutResource, updateWorkoutResource, deleteWorkoutResource, linkHost, hasPreview, getResourceSaveCounts,
  type WorkoutResourceRow,
} from '../lib/api/workoutResources';
import type { ClassLevel } from '../types/db';
import SkelRows from '../components/ui/SkelRows';
import ChoicePicker from '../components/ChoicePicker';

/**
 * Resources — the free-workout library (0019/0061/0090, redrawn 2026-10-20 to
 * the approved mock-up): paste a link, and what can honestly be filled in is —
 * the site as the provider, and for YouTube the video's own thumbnail (a
 * browser cannot read another site's title, so that is typed). Tiles show who
 * saved and finished each one; Edit, Hide and Remove sit on each.
 *
 * Links out, never copies: the routines belong to whoever wrote them. Never
 * locked by a plan — the library exists for members who cannot pay (0019).
 * Hide, don't delete, is the default: it keeps the description and members' saves.
 */

const LEVELS: ClassLevel[] = ['all_levels', 'beginner', 'intermediate', 'advanced'];
const levelWord = (l: string) => l.replace('_', ' ').replace(/^./, (c) => c.toUpperCase());
const emptyForm = { title: '', provider: '', url: '', imageUrl: '', description: '', category: '', level: 'all_levels' as ClassLevel, sortOrder: '100' };
type Form = typeof emptyForm;

/** A YouTube video's id, from any of its link shapes. */
function youTubeId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname === 'youtu.be') return u.pathname.slice(1) || null;
    if (/(^|\.)youtube\.com$/.test(u.hostname)) return u.searchParams.get('v') ?? (u.pathname.match(/^\/(?:shorts|embed)\/([\w-]+)/)?.[1] ?? null);
  } catch { /* not a link */ }
  return null;
}
/** What a pasted link can honestly fill in: who made it (from the site), and YouTube's thumbnail. */
function fromLink(url: string, f: Form): Form {
  const host = linkHost(url);
  const yt = youTubeId(url);
  const provider = f.provider || (yt ? 'YouTube' : host.split('.').slice(-2, -1)[0]?.replace(/^./, (c) => c.toUpperCase()) ?? '');
  return { ...f, url, provider, imageUrl: f.imageUrl || (yt ? `https://img.youtube.com/vi/${yt}/hqdefault.jpg` : '') };
}

function Thumb({ r, fill }: { r: WorkoutResourceRow; fill?: boolean }) {
  const [broken, setBroken] = useState(false);
  const yt = !!youTubeId(r.url);
  // Inside a reveal tile the picture is the whole tile; the tile draws the ground and the video tag.
  if (fill) return hasPreview(r) && !broken ? <img src={r.image_url as string} alt="" loading="lazy" onError={() => setBroken(true)} style={{ objectPosition: 'top' }} /> : yt ? <Play size={34} /> : <FileText size={34} />;
  return (
    <div style={{ height: 120, borderRadius: 12, position: 'relative', overflow: 'hidden', display: 'grid', placeItems: 'center', color: '#ffffff99',
      background: 'var(--raised-solid, #1E1B30)' }}>
      {hasPreview(r) && !broken ? <img src={r.image_url as string} alt="" loading="lazy" onError={() => setBroken(true)} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }} />
        : yt ? <Play size={30} /> : <FileText size={30} />}
      {yt && <span style={{ position: 'absolute', bottom: 6, right: 6, fontSize: 10, fontWeight: 700, background: '#000a', borderRadius: 6, padding: '2px 6px', color: '#fff', display: 'flex', gap: 3, alignItems: 'center' }}><Play size={9} />video</span>}
    </div>
  );
}

export default function Resources() {
  const [rows, setRows] = useState<WorkoutResourceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<{ id: string | null; f: Form } | null>(null);
  const [toDelete, setToDelete] = useState<WorkoutResourceRow | null>(null);
  const [search, setSearch] = useState('');
  const [paste, setPaste] = useState('');
  const [cat, setCat] = useState<'all' | 'hidden' | string>('all');
  const [saves, setSaves] = useState<Map<string, { saved: number; done: number }> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // false — the admin needs to see hidden ones in order to bring them back.
      const [list, counts] = await Promise.all([listWorkoutResources(false), getResourceSaveCounts()]);
      setRows(list); setSaves(counts);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to load resources', 'error');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  const categories = useMemo(() => [...new Set(rows.map((r) => r.category).filter((c): c is string => !!c))].sort(), [rows]);
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => (cat === 'all' ? true : cat === 'hidden' ? !r.is_active : r.category === cat))
      .filter((r) => !q || [r.title, r.provider, r.category ?? '', linkHost(r.url)].some((x) => x.toLowerCase().includes(q)));
  }, [rows, search, cat]);

  const openNew = (url = '') => setEditing({ id: null, f: url ? fromLink(url, emptyForm) : { ...emptyForm } });
  const openEdit = (r: WorkoutResourceRow) => setEditing({ id: r.id, f: { title: r.title, provider: r.provider, url: r.url, imageUrl: r.image_url ?? '', description: r.description ?? '',
    category: r.category ?? '', level: r.level as ClassLevel, sortOrder: String(r.sort_order ?? 100) } });
  const handlePaste = () => {
    const url = paste.trim();
    if (!url) return;
    try { new URL(url); } catch { showToast('That is not a link: include https://', 'error'); return; }
    openNew(url);
    setPaste('');
  };

  const save = async () => {
    if (!editing) return;
    const f = editing.f;
    if (!f.title.trim() || !f.provider.trim() || !f.url.trim()) { showToast('Title, provider and link are all required', 'error'); return; }
    // Catch a typo here rather than shipping a dead link to every member's phone.
    try { new URL(f.url.trim()); } catch { showToast('That link isn\'t a valid URL: include https://', 'error'); return; }
    setSaving(true);
    const row = { title: f.title.trim(), provider: f.provider.trim(), url: f.url.trim(),
      // Empty means "no preview", a supported state — never an empty string that renders as a broken image.
      image_url: f.imageUrl.trim() || null, description: f.description.trim() || null, category: f.category.trim() || null, level: f.level, sort_order: Number(f.sortOrder) || 100 };
    try {
      if (editing.id) { await updateWorkoutResource(editing.id, row); showToast('Saved', 'success'); }
      else { await createWorkoutResource({ ...row, is_active: true }); showToast('Added: members see it under Workouts', 'success'); }
      setEditing(null);
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not save that resource', 'error');
    } finally {
      setSaving(false);
    }
  };
  const toggleActive = async (r: WorkoutResourceRow) => {
    try { await updateWorkoutResource(r.id, { is_active: !r.is_active }); await load(); }
    catch (err) { showToast(err instanceof Error ? err.message : 'Could not update that resource', 'error'); }
  };
  const handleDelete = async (why?: string) => {
    if (!toDelete) return;
    try { await deleteWorkoutResource(toDelete.id);
      if (why) await recordReason({ action: 'resource.removed', subjectType: 'resource', subjectId: null, summary: `Removed a resource`, reason: why });
      showToast('Resource removed', 'success'); setToDelete(null); await load(); }
    catch (err) { showToast(err instanceof Error ? err.message : 'Could not remove that resource', 'error'); }
  };

  const hidden = rows.filter((r) => !r.is_active).length;
  const set = (p: Partial<Form>) => setEditing((e) => (e ? { ...e, f: { ...e.f, ...p } } : e));
  const fld = 'w-full rounded-xl px-3 py-2.5 text-white text-sm outline-none';
  const fldStyle = { background: 'var(--color-bg)', border: '1px solid var(--color-border)' };

  return (
    <div className="att" data-resources>
      <div className="a-head">
        <div className="min-w-0"><h1>Resources</h1><p>Free videos and guides members find under Workouts: never locked, for members who cannot pay</p></div>
        <button type="button" className="a-btn violet" style={{ marginLeft: 'auto' }} onClick={() => openNew()}><Link2 size={15} />Add a link</button>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flex: 'none', flexWrap: 'wrap' }}>
        <label className="a-input big" style={{ flex: 1, maxWidth: 560, padding: '10px 14px', fontSize: 13 }}><Link2 size={15} />
          <input value={paste} onChange={(e) => setPaste(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handlePaste(); } }}
            placeholder="Paste a YouTube or website link, then press Enter" aria-label="Paste a link" /></label>
        <button type="button" className={`a-chip ${cat === 'all' ? 'v' : ''}`} onClick={() => setCat('all')}>All <em>{rows.length}</em></button>
        {categories.map((c) => <button key={c} type="button" className={`a-chip ${cat === c ? 'v' : ''}`} onClick={() => setCat(c)}>{c}</button>)}
        <button type="button" className={`a-chip ${cat === 'hidden' ? 'v' : ''}`} onClick={() => setCat('hidden')}>Hidden <em>{hidden}</em></button>
        <label className="a-input" style={{ padding: '7px 11px', fontSize: 12, width: 190, marginLeft: 'auto' }}><Search size={14} />
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search title, provider, site…" aria-label="Search resources" /></label>
      </div>

      <div className="a-card" style={{ flex: 1 }} data-resource-grid>
        <div className="a-scroll grow">
          {loading ? <SkelRows label="Loading…" /> : rows.length === 0 ? (
            <div className="v3-emptyart"><img src="/art/empty-kettlebell.webp" alt="" /><b>No resources yet</b><span className="a-sub">Paste a YouTube or website link above, or press Add a link.</span></div>
          ) : visible.length === 0 ? (
            <p className="a-sub" style={{ padding: '10px 0' }}>Nothing matches{search ? ` “${search}”` : ''}: {rows.length} resources in the library.</p>
          ) : (
            <div className="a-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 12 }}>
              {visible.map((r) => {
                const s = saves?.get(r.id);
                return (
                  <div key={r.id} className={`rv ${hasPreview(r) ? '' : 'rv-flat'}`} style={{ height: 236, opacity: r.is_active ? 1 : 0.55 }} data-resource={r.title}>
                    <div className="rv-art"><Thumb r={r} fill /></div>
                    <div className="rv-corner">
                      <span style={{ display: 'flex', gap: 6 }}>{!!youTubeId(r.url) && <span className="rv-tag"><Play size={11} />video</span>}{!r.is_active && <span className="rv-tag"><EyeOff size={11} />hidden</span>}</span>
                    </div>
                    <div className="rv-body">
                      <span className="rv-title">{r.title}</span>
                      <span className="rv-sub">{r.provider} · {levelWord(r.level)}</span>
                      <div className="rv-more"><div>
                        {r.category && <span className="rv-sub">{r.category}</span>}
                        {saves && <span className="rv-sub" style={{ display: 'flex', gap: 5, alignItems: 'center' }}><Bookmark size={11} />{s?.saved ? `saved by ${s.saved} · done by ${s.done}` : 'not saved by anyone yet'}</span>}
                        <div className="rv-acts">
                          <a className="rv-act go" href={r.url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${r.title}`}><ExternalLink size={13} />Open</a>
                          <button type="button" className="rv-act" onClick={() => openEdit(r)} aria-label={`Edit ${r.title}`}><Pencil size={13} /></button>
                          <button type="button" className="rv-act" onClick={() => void toggleActive(r)} aria-label={`${r.is_active ? 'Hide' : 'Show'} ${r.title}`}>{r.is_active ? <EyeOff size={13} /> : <Eye size={13} />}</button>
                          <button type="button" className="rv-act" style={{ marginLeft: 'auto' }} onClick={() => setToDelete(r)} aria-label={`Remove ${r.title}`}><Trash2 size={13} /></button>
                        </div>
                      </div></div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <Modal isOpen={!!editing} onClose={() => !saving && setEditing(null)} title={editing?.id ? 'Edit resource' : 'Add a link'}
        subtitle="Links out to the source: nothing is copied into your library." size="md"
        footer={<>
          <button type="button" className="px-4 py-2 rounded-lg text-[13px]" style={{ color: 'var(--color-text-secondary)' }} onClick={() => setEditing(null)}>Cancel</button>
          <button type="button" className="px-4 py-2 rounded-lg text-[13px] font-semibold text-white disabled:opacity-50" style={{ background: 'var(--color-primary)' }} disabled={saving} onClick={() => void save()} data-save-resource>
            {saving ? 'Saving…' : editing?.id ? 'Save' : 'Add it'}</button>
        </>}>
        {editing && (
          <div className="space-y-3">
            <label className="block text-[12px]" style={{ color: 'var(--color-text-secondary)' }}>Link
              <input className={fld} style={fldStyle} type="url" value={editing.f.url} placeholder="https://…" aria-label="Link"
                onChange={(e) => set({ url: e.target.value })} onBlur={(e) => { if (e.target.value.trim()) setEditing((x) => (x ? { ...x, f: fromLink(e.target.value.trim(), x.f) } : x)); }} /></label>
            <label className="block text-[12px]" style={{ color: 'var(--color-text-secondary)' }}>Title <span style={{ color: 'var(--color-text-muted)' }}>· what members read</span>
              <input className={fld} style={fldStyle} value={editing.f.title} placeholder="e.g. Beginner bodyweight workout" aria-label="Title" onChange={(e) => set({ title: e.target.value })} /></label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-[12px]" style={{ color: 'var(--color-text-secondary)' }}>Provider
                <input className={fld} style={fldStyle} value={editing.f.provider} placeholder="e.g. Darebee" aria-label="Provider" onChange={(e) => set({ provider: e.target.value })} /></label>
              <label className="block text-[12px]" style={{ color: 'var(--color-text-secondary)' }}>Level
                <select className={fld} style={fldStyle} value={editing.f.level} aria-label="Level" onChange={(e) => set({ level: e.target.value as ClassLevel })}>
                  {LEVELS.map((l) => <option key={l} value={l}>{levelWord(l)}</option>)}</select></label>
            </div>
            <ImageField value={editing.f.imageUrl} onChange={(imageUrl) => set({ imageUrl })} kind="resources" label="Preview image"
              hint="A YouTube link fills this with the video's own thumbnail. Blank shows the site's address instead, which is better than a wrong picture." />
            <label className="block text-[12px]" style={{ color: 'var(--color-text-secondary)' }}>Description <span style={{ color: 'var(--color-text-muted)' }}>· optional, one line</span>
              <input className={fld} style={fldStyle} value={editing.f.description} placeholder="What a member gets from it" aria-label="Description" onChange={(e) => set({ description: e.target.value })} /></label>
            <div className="grid grid-cols-2 gap-3">
              <div className="block text-[12px]" role="group" aria-label="Category" style={{ color: 'var(--color-text-secondary)' }}>Category <span style={{ color: 'var(--color-text-muted)' }}>· groups the list</span>
                <ChoicePicker kind="resource" label="Category" value={editing.f.category} onChange={(v) => set({ category: v })} /></div>
              <label className="block text-[12px]" style={{ color: 'var(--color-text-secondary)' }}>Order <span style={{ color: 'var(--color-text-muted)' }}>· lower shows first</span>
                <input className={fld} style={fldStyle} type="number" value={editing.f.sortOrder} aria-label="Sort order" onChange={(e) => set({ sortOrder: e.target.value })} /></label>
            </div>
            <p className="text-[12px] flex gap-1.5" style={{ color: 'var(--color-text-muted)' }}><Info size={13} className="flex-none mt-0.5" />Every resource is free for every member: this library is never locked by a plan.</p>
          </div>
        )}
      </Modal>

      <ConfirmDialog isOpen={!!toDelete} onClose={() => setToDelete(null)} onConfirm={(why) => void handleDelete(why)} reason={REASON_FIELD} title="Remove resource"
        message={`Remove "${toDelete?.title}" from the library?${toDelete && saves?.get(toDelete.id)?.saved
          ? ` ${saves.get(toDelete.id)!.saved} member${saves.get(toDelete.id)!.saved === 1 ? ' has' : 's have'} it saved: it disappears from their Saved list too.`
          : ''} If you only want it out of the member app for now, Hide keeps it: and members' saves: and brings it back with one click.`}
        confirmText="Remove" type="danger" />
    </div>
  );
}
