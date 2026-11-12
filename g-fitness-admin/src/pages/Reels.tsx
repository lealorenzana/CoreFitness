import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, ExternalLink, Trash2, Eye, EyeOff, Search, Link2, Pencil, Play, Heart, Info, Upload, ImagePlus, Clapperboard, RefreshCw } from 'lucide-react';
import Modal from '../components/ui/Modal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import './attendance/att.css';
import { showToast } from '../utils/toast';
import { moduleOn, useGymModules } from '../hooks/useGymModules';
import {
  listReels, reelUploadLimit, postLinkReel, postUploadedReel, editReel, removeReel, reelFileProblem, REEL_VIDEO_TYPES,
  type Reel,
} from '../lib/api/reels';
import { reelLinkSource, reelEmbedUrl, REEL_SOURCE_WORDS, REEL_LINK_HINT } from '../lib/reelEmbed';

/**
 * Reels (0245) — short videos the gym puts up for its members: a pasted link
 * (YouTube, TikTok, Facebook, Instagram) or a small uploaded video. Built on
 * Resources' shape (a paste box, chips, a grid that scrolls inside its card).
 *
 * The owner changes any reel; the front desk and coaches only their own — the
 * feed says which on each row (`canManage`), and the buttons follow it. The
 * database is the rule; a refusal there is shown word for word.
 *
 * A link that cannot play inside the app (a short share link hides the video's
 * id) says so on its tile, so nobody posts one expecting it to play on Today.
 */

type Filter = 'all' | 'links' | 'uploads' | 'hidden';
type Mode = 'link' | 'upload';
interface AddForm { mode: Mode; url: string; title: string; caption: string; cover: File | null; file: File | null }
const emptyAdd: AddForm = { mode: 'link', url: '', title: '', caption: '', cover: null, file: null };

const day = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};
const megabytes = (bytes: number) => `${(bytes / 1048576).toFixed(1)} MB`;

/** The picture before it plays. No cover (or one that will not load): a solid tile naming the source — never a broken image. */
function Cover({ r, height }: { r: Reel; height?: number }) {
  const [broken, setBroken] = useState(false);
  const shown = !!r.cover && !broken;
  return (
    <div className="on-fill" data-reel-cover={shown ? 'image' : 'plain'}
      style={{ ...(height ? { height } : { aspectRatio: '9 / 14' }), borderRadius: 12, position: 'relative', overflow: 'hidden', display: 'grid', placeItems: 'center',
        background: 'var(--fill-primary, var(--color-primary))', color: '#FFFFFF' }}>
      {shown
        ? <img src={r.cover as string} alt="" loading="lazy" onError={() => setBroken(true)} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
        : <span style={{ display: 'grid', justifyItems: 'center', gap: 6, fontSize: 12, fontWeight: 700 }}><Play size={30} />{REEL_SOURCE_WORDS[r.source]}</span>}
    </div>
  );
}

export default function Reels() {
  const on = moduleOn(useGymModules(), 'reels');
  const [rows, setRows] = useState<Reel[]>([]);
  const [limit, setLimit] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [paste, setPaste] = useState('');
  const [adding, setAdding] = useState<AddForm | null>(null);
  const [linkError, setLinkError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<{ id: string; title: string; caption: string; hidden: boolean } | null>(null);
  const [preview, setPreview] = useState<Reel | null>(null);
  const [toDelete, setToDelete] = useState<Reel | null>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const coverInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // The limit is a label on a chip: failing to read it must not hide the reels.
      const [list, max] = await Promise.all([listReels(), reelUploadLimit().catch(() => null)]);
      setRows(list); setLimit(max); setFailed(null);
    } catch (err) {
      setFailed(err instanceof Error ? err.message : 'The reels could not be read.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { if (on) void (async () => { await load(); })(); }, [load, on]);

  const links = rows.filter((r) => r.source !== 'upload').length;
  const uploads = rows.length - links;
  const hidden = rows.filter((r) => r.hidden).length;
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter((r) => (filter === 'all' ? true : filter === 'hidden' ? r.hidden : filter === 'uploads' ? r.source === 'upload' : r.source !== 'upload'))
      .filter((r) => !q || [r.title, r.author].some((x) => x.toLowerCase().includes(q)));
  }, [rows, search, filter]);

  const openAdd = (url = '') => { setLinkError(false); setAdding({ ...emptyAdd, url }); };
  const handlePaste = () => {
    const url = paste.trim();
    if (!url) return;
    openAdd(url);
    setPaste('');
  };
  const setAdd = (p: Partial<AddForm>) => setAdding((a) => (a ? { ...a, ...p } : a));
  const fileProblem = adding?.file ? reelFileProblem(adding.file) : null;

  const post = async () => {
    if (!adding) return;
    const title = adding.title.trim();
    const caption = adding.caption.trim();
    if (adding.mode === 'link') {
      if (!reelLinkSource(adding.url)) { setLinkError(true); showToast(REEL_LINK_HINT, 'error'); return; }
    } else if (!adding.file) { showToast('Choose a video first', 'error'); return; }
    else if (fileProblem) { showToast(fileProblem, 'error'); return; }
    if (!title) { showToast('Give the reel a title', 'error'); return; }
    setBusy(true);
    try {
      if (adding.mode === 'link') await postLinkReel({ title, caption, url: adding.url.trim(), cover: adding.cover });
      else await postUploadedReel({ title, caption, file: adding.file as File });
      showToast('Posted — members see it on Today and in More', 'success');
      setAdding(null);
      await load();
    } catch (err) {
      // The database's refusals are written for people (the upload limit, a link it does not take): say them as they are.
      showToast(err instanceof Error ? err.message : 'Could not post that reel', 'error');
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = async () => {
    if (!editing) return;
    if (!editing.title.trim()) { showToast('Give the reel a title', 'error'); return; }
    setBusy(true);
    try {
      await editReel(editing.id, { title: editing.title.trim(), caption: editing.caption.trim(), hidden: editing.hidden });
      showToast('Saved', 'success');
      setEditing(null);
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not save that reel', 'error');
    } finally {
      setBusy(false);
    }
  };
  const toggleHidden = async (r: Reel) => {
    try { await editReel(r.id, { title: r.title, caption: r.caption ?? '', hidden: !r.hidden }); await load(); }
    catch (err) { showToast(err instanceof Error ? err.message : 'Could not update that reel', 'error'); }
  };
  const handleDelete = async () => {
    if (!toDelete) return;
    try { await removeReel(toDelete.id); showToast('Reel removed', 'success'); setToDelete(null); await load(); }
    catch (err) { showToast(err instanceof Error ? err.message : 'Could not remove that reel', 'error'); }
  };

  const fld = 'w-full rounded-xl px-3 py-2.5 text-white text-sm outline-none';
  const fldStyle = { background: 'var(--color-bg)', border: '1px solid var(--color-border)' };
  const lbl = { color: 'var(--color-text-secondary)' };
  const muted = { color: 'var(--color-text-muted)' };
  const previewEmbed = preview && preview.source !== 'upload' ? reelEmbedUrl(preview.url) : null;

  if (!on) {
    return (
      <div className="att" data-reels>
        <div className="a-head"><div className="min-w-0"><h1>Reels</h1><p>Short videos your gym posts for its members</p></div></div>
        <div className="a-card" style={{ flex: 1 }} data-reels-off>
          <p style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--a-text2)' }}><Clapperboard size={16} />
            <span>Reels are switched off. Turn them on in <Link to="/gym-app?tab=runs" style={{ color: 'var(--a-p300)', fontWeight: 600, textDecoration: 'underline' }}>Your app → What you run</Link>.</span></p>
        </div>
      </div>
    );
  }

  return (
    <div className="att" data-reels>
      <div className="a-head">
        <div className="min-w-0"><h1>Reels</h1><p>Short videos your gym posts for its members — a link from YouTube, TikTok, Facebook or Instagram, or a small video of your own</p></div>
        <button type="button" className="a-btn violet" style={{ marginLeft: 'auto' }} onClick={() => openAdd()} data-add-reel><Plus size={15} />Add a reel</button>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flex: 'none', flexWrap: 'wrap' }}>
        <label className="a-input big" style={{ flex: 1, maxWidth: 560, padding: '10px 14px', fontSize: 13 }}><Link2 size={15} />
          <input value={paste} onChange={(e) => setPaste(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handlePaste(); } }}
            placeholder="Paste a YouTube, TikTok, Facebook or Instagram link, then press Enter" aria-label="Paste a link" /></label>
        <button type="button" className={`a-chip ${filter === 'all' ? 'v' : ''}`} onClick={() => setFilter('all')} data-chip="all">All <em>{rows.length}</em></button>
        <button type="button" className={`a-chip ${filter === 'links' ? 'v' : ''}`} onClick={() => setFilter('links')} data-chip="links">Links <em>{links}</em></button>
        <button type="button" className={`a-chip ${filter === 'uploads' ? 'v' : ''}`} onClick={() => setFilter('uploads')} data-chip="uploads">Uploads <em>{limit === null ? uploads : `${uploads} of ${limit}`}</em></button>
        <button type="button" className={`a-chip ${filter === 'hidden' ? 'v' : ''}`} onClick={() => setFilter('hidden')} data-chip="hidden">Hidden <em>{hidden}</em></button>
        <label className="a-input" style={{ padding: '7px 11px', fontSize: 12, width: 190, marginLeft: 'auto' }}><Search size={14} />
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search title or who posted…" aria-label="Search reels" /></label>
      </div>

      <div className="a-card" style={{ flex: 1 }} data-reel-grid>
        <div className="a-scroll grow">
          {loading && rows.length === 0 ? <p className="a-sub" data-reels-loading>Loading the reels…</p>
          : failed ? (
            <div data-reels-failed style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start', padding: '10px 0' }}>
              <b>The reels did not load.</b>
              <p className="a-sub">{failed} Nothing was changed — this is not an empty list.</p>
              <button type="button" className="a-btn sm" onClick={() => void load()}><RefreshCw size={13} />Try again</button>
            </div>
          ) : rows.length === 0 ? (
            <div data-reels-empty style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start', padding: '10px 0', maxWidth: 520 }}>
              <b style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Clapperboard size={16} />No reels yet</b>
              <p className="a-sub" style={{ lineHeight: 1.5 }}>A reel is a short video for your members — a tip, a class highlight, a hello from a coach. Paste a link or upload a small video
                (up to 25 MB{limit === null ? '' : `, ${limit} uploads per gym`}; links are not counted). Members see reels on Today and in More, and can give each a heart.</p>
              <button type="button" className="a-btn violet" onClick={() => openAdd()}><Plus size={14} />Add a reel</button>
            </div>
          ) : visible.length === 0 ? (
            <p className="a-sub" style={{ padding: '10px 0' }}>Nothing matches{search ? ` “${search}”` : ''} — {rows.length} reel{rows.length === 1 ? '' : 's'} in all.</p>
          ) : (
            <div className="a-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 12 }}>
              {visible.map((r) => {
                const noEmbed = r.source !== 'upload' && !reelEmbedUrl(r.url);
                return (
                  <div key={r.id} className="a-tile" style={{ opacity: r.hidden ? 0.6 : 1 }} data-reel={r.title}>
                    <Cover r={r} />
                    <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span className="a-pill v" data-reel-source>{REEL_SOURCE_WORDS[r.source]}</span>
                      {r.hidden && <span className="a-pill" data-reel-hidden>hidden</span>}
                      <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 4, alignItems: 'center', fontSize: 11, fontWeight: 600, color: r.likes ? 'var(--a-p300)' : 'var(--a-muted)' }}
                        aria-label={`${r.likes} like${r.likes === 1 ? '' : 's'}`} data-reel-likes><Heart size={12} />{r.likes}</span>
                    </div>
                    <b data-reel-title style={{ overflowWrap: 'anywhere' }}>{r.title}</b>
                    {r.caption && <small style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{r.caption}</small>}
                    <small>{r.author ? `by ${r.author} · ` : ''}{day(r.createdAt)}</small>
                    {noEmbed && <small data-reel-opens style={{ color: 'var(--a-a300)', display: 'flex', gap: 4, alignItems: 'center' }}><ExternalLink size={10} />Opens in {REEL_SOURCE_WORDS[r.source]}</small>}
                    <div style={{ display: 'flex', gap: 6, marginTop: 'auto', alignItems: 'center' }}>
                      <button type="button" className="a-btn ghost sm" onClick={() => setPreview(r)} aria-label={`Preview ${r.title}`}><Play size={13} /></button>
                      {r.canManage && <>
                        <button type="button" className="a-btn ghost sm" onClick={() => setEditing({ id: r.id, title: r.title, caption: r.caption ?? '', hidden: r.hidden })} aria-label={`Edit ${r.title}`}><Pencil size={13} /></button>
                        <button type="button" className="a-btn ghost sm" onClick={() => void toggleHidden(r)} aria-label={`${r.hidden ? 'Show' : 'Hide'} ${r.title}`}>{r.hidden ? <Eye size={13} /> : <EyeOff size={13} />}</button>
                        <button type="button" className="a-btn ghost sm" style={{ marginLeft: 'auto' }} onClick={() => setToDelete(r)} aria-label={`Remove ${r.title}`}><Trash2 size={13} /></button>
                      </>}
                    </div>
                  </div>
                );
              })}
              <button type="button" className="a-tile" style={{ borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', textAlign: 'center', minHeight: 200 }} onClick={() => openAdd()}>
                <Plus size={22} /><b>Add a reel</b><small>a link or a small video</small>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Add */}
      <Modal isOpen={!!adding} onClose={() => { if (!busy) setAdding(null); }} title="Add a reel"
        subtitle="Members see it on Today and in More." size="md"
        footer={<>
          <button type="button" className="px-4 py-2 rounded-lg text-[13px] disabled:opacity-50" style={lbl} disabled={busy} onClick={() => setAdding(null)}>Cancel</button>
          <button type="button" className="px-4 py-2 rounded-lg text-[13px] font-semibold text-white on-fill disabled:opacity-50" style={{ background: 'var(--fill-primary, var(--color-primary))' }}
            disabled={busy} onClick={() => void post()} data-post-reel>
            {busy ? (adding?.mode === 'upload' ? 'Uploading…' : 'Posting…') : 'Post the reel'}</button>
        </>}>
        {adding && (
          <div className="space-y-3">
            <div role="tablist" aria-label="Kind of reel" style={{ display: 'flex', gap: 6 }}>
              {([['link', 'Paste a link', Link2], ['upload', 'Upload a video', Upload]] as const).map(([k, words, Icon]) => {
                const chosen = adding.mode === k;
                return (
                  <button key={k} type="button" role="tab" aria-selected={chosen} disabled={busy} onClick={() => { setLinkError(false); setAdd({ mode: k }); }} data-reel-mode={k}
                    className={`px-3 py-2 rounded-lg text-[12.5px] font-semibold inline-flex items-center gap-1.5 disabled:opacity-50 ${chosen ? 'text-white on-fill' : ''}`}
                    style={chosen ? { background: 'var(--fill-primary, var(--color-primary))', border: '1px solid transparent' } : { ...lbl, background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
                    <Icon size={14} />{words}</button>
                );
              })}
            </div>

            {adding.mode === 'link' ? (
              <>
                <label className="block text-[12px]" style={lbl}>Link
                  <input className={fld} style={fldStyle} type="url" value={adding.url} placeholder="https://…" aria-label="Link" aria-invalid={linkError}
                    onChange={(e) => { setLinkError(false); setAdd({ url: e.target.value }); }} /></label>
                {linkError && <p role="alert" data-reel-link-error className="text-[12px]" style={{ color: 'var(--a-a300, var(--color-warning))' }}>That link cannot be a reel. {REEL_LINK_HINT} (it starts with https://).</p>}
                {!linkError && adding.url.trim() && reelLinkSource(adding.url) && !reelEmbedUrl(adding.url) && (
                  <p className="text-[12px] flex gap-1.5" style={muted}><Info size={13} className="flex-none mt-0.5" />This is a short share link, so it opens in {REEL_SOURCE_WORDS[reelLinkSource(adding.url)!]} instead of playing inside the app. The full link from the video's own page plays inside.</p>
                )}
              </>
            ) : (
              <div>
                <input ref={videoInput} type="file" accept={REEL_VIDEO_TYPES.join(',')} hidden aria-label="Video file" data-reel-file
                  onChange={(e) => { setAdd({ file: e.target.files?.[0] ?? null }); e.target.value = ''; }} />
                <button type="button" disabled={busy} onClick={() => videoInput.current?.click()} className="px-3 py-2 rounded-lg text-[12.5px] font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
                  style={{ ...lbl, background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}><Upload size={14} />{adding.file ? 'Choose another video' : 'Choose a video'}</button>
                {adding.file && <p className="text-[12px] mt-2" style={lbl} data-reel-file-name>{adding.file.name} · {megabytes(adding.file.size)}</p>}
                {fileProblem && <p role="alert" data-reel-file-problem className="text-[12px] mt-1" style={{ color: 'var(--a-a300, var(--color-warning))' }}>{fileProblem}</p>}
                <p className="text-[12px] mt-2 flex gap-1.5" style={muted}><Info size={13} className="flex-none mt-0.5" />MP4, MOV or WebM, up to 25 MB{limit === null ? '' : ` — ${uploads} of ${limit} uploads used`}. Its cover is taken from the start of the video.</p>
              </div>
            )}

            <label className="block text-[12px]" style={lbl}>Title <span style={muted}>· what members read</span>
              <input className={fld} style={fldStyle} value={adding.title} maxLength={80} placeholder="e.g. Three stretches before you lift" aria-label="Title" onChange={(e) => setAdd({ title: e.target.value })} /></label>
            <label className="block text-[12px]" style={lbl}>Caption <span style={muted}>· optional</span>
              <textarea className={fld} style={fldStyle} rows={2} value={adding.caption} maxLength={300} placeholder="A line or two under the title" aria-label="Caption" onChange={(e) => setAdd({ caption: e.target.value })} /></label>

            {adding.mode === 'link' && (
              <div>
                <span className="block text-[12px]" style={lbl}>Cover picture <span style={muted}>· optional</span></span>
                <input ref={coverInput} type="file" accept="image/*" hidden aria-label="Cover picture"
                  onChange={(e) => { setAdd({ cover: e.target.files?.[0] ?? null }); e.target.value = ''; }} />
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4, flexWrap: 'wrap' }}>
                  <button type="button" disabled={busy} onClick={() => coverInput.current?.click()} className="px-3 py-2 rounded-lg text-[12.5px] font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
                    style={{ ...lbl, background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}><ImagePlus size={14} />{adding.cover ? 'Choose another picture' : 'Choose a picture'}</button>
                  {adding.cover && <>
                    <span className="text-[12px]" style={lbl}>{adding.cover.name}</span>
                    <button type="button" disabled={busy} className="text-[12px] underline disabled:opacity-50" style={muted} onClick={() => setAdd({ cover: null })}>Take it off</button>
                  </>}
                </div>
                <p className="text-[12px] mt-2 flex gap-1.5" style={muted}><Info size={13} className="flex-none mt-0.5" />YouTube gives its own cover. For other sites add one, or the reel shows a plain tile.</p>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Edit */}
      <Modal isOpen={!!editing} onClose={() => { if (!busy) setEditing(null); }} title="Edit reel" subtitle="The video itself stays as posted." size="md"
        footer={<>
          <button type="button" className="px-4 py-2 rounded-lg text-[13px]" style={lbl} onClick={() => setEditing(null)}>Cancel</button>
          <button type="button" className="px-4 py-2 rounded-lg text-[13px] font-semibold text-white on-fill disabled:opacity-50" style={{ background: 'var(--fill-primary, var(--color-primary))' }}
            disabled={busy} onClick={() => void saveEdit()} data-save-reel>{busy ? 'Saving…' : 'Save'}</button>
        </>}>
        {editing && (
          <div className="space-y-3">
            <label className="block text-[12px]" style={lbl}>Title
              <input className={fld} style={fldStyle} value={editing.title} maxLength={80} aria-label="Title" onChange={(e) => setEditing({ ...editing, title: e.target.value })} /></label>
            <label className="block text-[12px]" style={lbl}>Caption <span style={muted}>· optional</span>
              <textarea className={fld} style={fldStyle} rows={3} value={editing.caption} maxLength={300} aria-label="Caption" onChange={(e) => setEditing({ ...editing, caption: e.target.value })} /></label>
            <label className="flex items-start gap-2 text-[13px]" style={lbl}>
              <input type="checkbox" checked={editing.hidden} onChange={(e) => setEditing({ ...editing, hidden: e.target.checked })} style={{ marginTop: 3 }} />
              <span>Hidden from members<br /><span className="text-[12px]" style={muted}>It stays here with its likes, and comes back when you show it again.</span></span>
            </label>
          </div>
        )}
      </Modal>

      {/* Preview */}
      <Modal isOpen={!!preview} onClose={() => setPreview(null)} title={preview?.title ?? 'Preview'} subtitle={preview ? REEL_SOURCE_WORDS[preview.source] : undefined} size="sm" hideFooter>
        {preview && (
          <div data-reel-preview style={{ display: 'grid', justifyItems: 'center', gap: 10 }}>
            {preview.source === 'upload' ? (
              <video src={preview.url} poster={preview.cover ?? undefined} controls playsInline
                style={{ width: 320, maxWidth: '100%', aspectRatio: '9 / 16', maxHeight: '62vh', borderRadius: 12, background: '#000', objectFit: 'contain' }} />
            ) : previewEmbed ? (
              <iframe src={previewEmbed} title={preview.title} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen
                style={{ width: 320, maxWidth: '100%', aspectRatio: '9 / 16', maxHeight: '62vh', border: 0, borderRadius: 12, background: '#000' }} />
            ) : (
              <>
                <div style={{ width: 240, maxWidth: '100%' }}><Cover r={preview} /></div>
                <p className="text-[12px]" style={{ ...muted, textAlign: 'center' }}>This link does not play inside the app. Members get the same button.</p>
                <a href={preview.url} target="_blank" rel="noopener noreferrer" data-reel-open
                  className="px-4 py-2 rounded-lg text-[13px] font-semibold text-white on-fill inline-flex items-center gap-1.5" style={{ background: 'var(--fill-primary, var(--color-primary))' }}>
                  <ExternalLink size={14} />Open in {REEL_SOURCE_WORDS[preview.source]}</a>
              </>
            )}
          </div>
        )}
      </Modal>

      <ConfirmDialog isOpen={!!toDelete} onClose={() => setToDelete(null)} onConfirm={() => void handleDelete()} title="Remove reel"
        message={`Remove "${toDelete?.title}"? ${toDelete?.likes ? `Its ${toDelete.likes} like${toDelete.likes === 1 ? ' goes' : 's go'} with it` : 'Any likes go with it'}${toDelete?.source === 'upload' ? ', and the video file is deleted' : ''}. If you only want it out of the member app for now, Hide keeps it — and its likes — and brings it back with one click.`}
        confirmText="Remove" type="danger" />
    </div>
  );
}
