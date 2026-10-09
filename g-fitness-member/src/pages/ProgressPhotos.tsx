import { useCallback, useEffect, useState } from 'react';
import { Camera, Lock, Trash } from '@phosphor-icons/react';
import { Page, PageTitle } from '../components/ui/page';
import { Chip, NocButton, Panel, SectionHead } from '../components/ui/noc';
import { Field, Select, TextInput } from '../components/ui/Field';
import DateField from '../components/ui/DateField';
import { SkeletonList } from '../components/ui/Skeleton';
import { toast } from '../components/ui/Toast';
import { errorMessage } from '../utils/errorMessage';
import { todayKey } from '../utils/dates';
import {
  addPhoto, deletePhoto, getSharePhotos, myPhotos, setSharePhotos, type Pose, type ProgressPhoto,
} from '../lib/api/photos';

const POSES: { id: Pose; label: string }[] = [
  { id: 'front', label: 'Front' }, { id: 'side', label: 'Side' }, { id: 'back', label: 'Back' }, { id: 'other', label: 'Other' },
];
const dateLabel = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

/**
 * Progress photos (0132): the member's own album. Private — only they see it,
 * unless they share it with the coaches they train with (the switch at the
 * top). The gym's owner and desk never see these. Compare puts two side by side.
 */
export default function ProgressPhotos() {
  const [photos, setPhotos] = useState<ProgressPhoto[] | null | undefined>(null);
  const [shared, setShared] = useState(false);
  const [pose, setPose] = useState<Pose>('front');
  const [taken, setTaken] = useState(todayKey());
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [compare, setCompare] = useState<string[]>([]);
  const [filter, setFilter] = useState<Pose | 'all'>('all');

  const load = useCallback(async () => {
    const [p, s] = await Promise.all([myPhotos(), getSharePhotos()]);
    setPhotos(p); setShared(s);
  }, []);
  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  const add = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try { await addPhoto(file, pose, taken, note.trim()); setNote(''); toast.success('Added to your album.'); await load(); }
    catch (e) { toast.error(errorMessage(e, 'That photo could not be added')); }
    finally { setBusy(false); }
  };

  const remove = async (p: ProgressPhoto) => {
    if (!window.confirm('Delete this photo for good?')) return;
    setBusy(true);
    try { await deletePhoto(p); setCompare((c) => c.filter((x) => x !== p.id)); toast.success('Deleted.'); await load(); }
    catch (e) { toast.error(errorMessage(e, 'That photo could not be deleted')); }
    finally { setBusy(false); }
  };

  const share = async () => {
    try { await setSharePhotos(!shared); setShared(!shared); toast.success(!shared ? 'Your coaches can now see your album.' : 'Your album is private again.'); }
    catch (e) { toast.error(errorMessage(e, 'That did not work')); }
  };

  if (photos === null) return <Page><PageTitle back title="Progress photos" /><SkeletonList /></Page>;
  if (photos === undefined) {
    return <Page><PageTitle back title="Progress photos" /><p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Progress photos are not switched on at your gym yet.</p></Page>;
  }

  const shown = photos.filter((p) => filter === 'all' || p.pose === filter);
  const pair = compare.map((id) => photos.find((p) => p.id === id)).filter(Boolean) as ProgressPhoto[];
  const pick = (id: string) => setCompare((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c.slice(-1), id]));
  const byDate = [...new Set(shown.map((p) => p.takenOn))];

  return (
    <Page>
      <PageTitle back fallback="/member/progress" title="Progress photos" subtitle="Private — only you, unless you share with your coach" />

      <Panel onClick={() => void share()} ariaLabel={shared ? 'Stop sharing photos with my coach' : 'Share photos with my coach'}>
        <div className="flex items-center justify-between" style={{ gap: 12 }}>
          <div>
            <p className="flex items-center" style={{ gap: 6, fontSize: 14, fontWeight: 700, color: 'var(--color-text-primary)' }}>
              {!shared && <Lock size={16} aria-hidden />} {shared ? 'Shared with your coaches' : 'Only you can see these'}
            </p>
            <p style={{ fontSize: 12.5, marginTop: 2, color: 'var(--color-text-secondary)' }}>
              {shared ? 'Coaches you train with can see this album. The front desk never can.'
                : 'Tap to share this album with the coaches you train with. The front desk never sees it.'}
            </p>
          </div>
          <span aria-hidden style={{ width: 44, height: 26, borderRadius: 13, flex: 'none', position: 'relative',
            background: shared ? 'var(--color-primary)' : 'var(--color-surface-high)', border: '1px solid var(--color-border)' }}>
            <span style={{ position: 'absolute', top: 2, left: shared ? 20 : 2, width: 20, height: 20, borderRadius: 10, background: '#fff' }} />
          </span>
        </div>
      </Panel>

      <section>
        <SectionHead title="Add a photo" />
        <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 10 }}>
          <Field label="Pose">
            <Select value={pose} aria-label="Pose" onChange={(e) => setPose(e.target.value as Pose)}>
              {POSES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </Select>
          </Field>
          <Field label="Taken on">
            <DateField mode="record" bounds={{ backDays: 365 }} value={taken} label="Taken on" onChange={(v) => setTaken(v || todayKey())} />
          </Field>
        </div>
        <Field label="Note (optional)">
          <TextInput value={note} maxLength={200} aria-label="Note" placeholder="e.g. 68 kg, week 4" onChange={(e) => setNote(e.target.value)} />
        </Field>
        <label className="flex items-center justify-center noc-press" style={{ gap: 8, height: 44, borderRadius: 12, cursor: 'pointer',
          border: '1px solid var(--color-secondary)', color: 'var(--color-secondary)', fontWeight: 600, fontSize: 14, opacity: busy ? 0.5 : 1 }}>
          <Camera size={18} aria-hidden /> {busy ? 'Adding…' : 'Take or choose a photo'}
          <input type="file" accept="image/*" capture="environment" className="hidden" disabled={busy} aria-label="Add a progress photo"
            onChange={(e) => { void add(e.target.files?.[0]); e.target.value = ''; }} />
        </label>
      </section>

      {pair.length === 2 && (
        <section>
          <SectionHead title="Compare" meta={`${dateLabel(pair[0].takenOn)} → ${dateLabel(pair[1].takenOn)}`} />
          <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 8 }}>
            {[...pair].sort((a, b) => a.takenOn.localeCompare(b.takenOn)).map((p) => (
              <figure key={p.id}>
                {p.url && <img src={p.url} alt={`${p.pose} photo from ${dateLabel(p.takenOn)}`} style={{ width: '100%', aspectRatio: '3 / 4', objectFit: 'cover', borderRadius: 12 }} />}
                <figcaption style={{ fontSize: 12, marginTop: 4, color: 'var(--color-text-muted)' }}>{dateLabel(p.takenOn)}{p.note ? ` · ${p.note}` : ''}</figcaption>
              </figure>
            ))}
          </div>
          <NocButton variant="ghost" className="w-full" style={{ marginTop: 8 }} onClick={() => setCompare([])}>Clear compare</NocButton>
        </section>
      )}

      <section>
        <SectionHead title="Your album" meta={`${photos.length}`} />
        <div className="flex flex-wrap" style={{ gap: 8, marginBottom: 10 }}>
          <Chip label="All" on={filter === 'all'} onClick={() => setFilter('all')} />
          {POSES.map((p) => <Chip key={p.id} label={p.label} on={filter === p.id} onClick={() => setFilter(p.id)} />)}
        </div>
        {photos.length === 0 && <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>No photos yet. Take one every few weeks, same pose and light, to see the change.</p>}
        {photos.length > 0 && <p style={{ fontSize: 12, marginBottom: 8, color: 'var(--color-text-muted)' }}>Tap two photos to compare them side by side.</p>}
        {byDate.map((d) => (
          <div key={d} style={{ marginBottom: 12 }}>
            <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, color: 'var(--color-text-secondary)' }}>{dateLabel(d)}</p>
            <div className="grid" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6 }}>
              {shown.filter((p) => p.takenOn === d).map((p) => (
                <div key={p.id} style={{ position: 'relative' }}>
                  <button type="button" onClick={() => pick(p.id)} aria-label={`${compare.includes(p.id) ? 'Unpick' : 'Pick'} ${p.pose} photo from ${dateLabel(p.takenOn)}`}
                    style={{ display: 'block', width: '100%', padding: 0, borderRadius: 10, overflow: 'hidden',
                      outline: compare.includes(p.id) ? '3px solid var(--color-primary)' : 'none' }}>
                    {p.url
                      ? <img src={p.url} alt="" loading="lazy" style={{ width: '100%', aspectRatio: '3 / 4', objectFit: 'cover', display: 'block' }} />
                      : <span style={{ display: 'block', aspectRatio: '3 / 4', background: 'var(--color-surface-high)' }} />}
                  </button>
                  <span style={{ position: 'absolute', left: 6, bottom: 6, fontSize: 12, padding: '1px 6px', borderRadius: 6, background: 'rgba(0,0,0,0.6)', color: '#fff' }}>
                    {POSES.find((x) => x.id === p.pose)?.label}
                  </span>
                  <button type="button" onClick={() => void remove(p)} aria-label="Delete photo" disabled={busy}
                    style={{ position: 'absolute', right: 4, top: 4, padding: 4, borderRadius: 8, background: 'rgba(0,0,0,0.6)', color: '#fff' }}>
                    <Trash size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>
    </Page>
  );
}
