import { useState } from 'react';
import { ImagePlus, X } from 'lucide-react';
import Card from './ui/Card';
import Button from './ui/Button';
import { showToast } from '../utils/toast';
import { ALLOWED_VIDEO_HINT, embedUrl } from '../lib/videoEmbed';
import {
  removeContentPhoto, saveExerciseMedia, uploadContentPhoto, type ExerciseMedia,
} from '../lib/api/exerciseMedia';

const MUTED = 'var(--color-text-muted)';
const FIELD = { background: 'var(--color-surface-high)', border: '1px solid var(--color-border)' };

const lines = (s: string) => s.split('\n').map((l) => l.trim()).filter(Boolean);

/**
 * The gym's own guide for one exercise (0121): photo, video link, cues, steps.
 *
 * For a shared (library) exercise the boxes start empty with the library's
 * starter text shown beneath them. Empty means "keep using the library's", so
 * the gym never has to copy text it is happy with, and the library can improve
 * later without every gym having frozen an old copy.
 *
 * The photo uploads the moment it is picked (so the owner sees it), which uses
 * one of the gym's photo slots. Cancelling before Save hands that slot back;
 * replacing a saved photo removes the old one after the save succeeds.
 */
export default function ExerciseGuideEditor({
  exerciseId, name, libraryCues, librarySteps, media, onSaved, onClose,
}: {
  exerciseId: string;
  name: string;
  libraryCues: string[];
  librarySteps: string[];
  media: ExerciseMedia | null;
  onSaved: () => void;
  onClose: () => void;
}) {
  const [video, setVideo] = useState(media?.videoUrl ?? '');
  const [cues, setCues] = useState((media?.cues ?? []).join('\n'));
  const [steps, setSteps] = useState((media?.steps ?? []).join('\n'));
  const [photo, setPhoto] = useState<string | null>(media?.photoUrl ?? null);
  /** A photo uploaded in this sitting and not yet saved — handed back on cancel. */
  const [fresh, setFresh] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const preview = embedUrl(video);
  const badLink = video.trim() !== '' && !preview;

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const url = await uploadContentPhoto(file);
      if (fresh) await removeContentPhoto(fresh).catch(() => {});
      setFresh(url);
      setPhoto(url);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'The photo could not be added', 'error');
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (fresh) await removeContentPhoto(fresh).catch(() => {});
    onClose();
  };

  const save = async () => {
    if (badLink) { showToast(`${ALLOWED_VIDEO_HINT}, please.`, 'error'); return; }
    setBusy(true);
    try {
      await saveExerciseMedia(exerciseId, {
        videoUrl: video.trim() || null,
        // Empty box = the library's text, stored as NULL, not as "no cues".
        cues: lines(cues).length ? lines(cues) : null,
        steps: lines(steps).length ? lines(steps) : null,
        photoUrl: photo,
      });
      // The old photo goes only once the new one is saved in its place.
      const old = media?.photoUrl ?? null;
      if (old && old !== photo) await removeContentPhoto(old).catch(() => {});
      setFresh(null);
      showToast(`Guide for ${name} saved. Your members see it now.`, 'success');
      onSaved();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'The guide could not be saved', 'error');
    } finally {
      setBusy(false);
    }
  };

  const removePhoto = () => {
    if (fresh) { void removeContentPhoto(fresh).catch(() => {}); setFresh(null); }
    setPhoto(null);
  };

  return (
    <Card className="!p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-white">Your guide for {name}</h2>
          <p className="text-[10px] mt-0.5" style={{ color: MUTED }}>
            Only your members see this. Leave a box empty to keep the Core Fitness starter text.
          </p>
        </div>
        <button onClick={() => void cancel()} aria-label="Close guide" className="p-1.5 rounded-lg" style={{ color: MUTED }}>
          <X size={14} />
        </button>
      </div>

      <div className="grid gap-4 mt-4" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)' }}>
        <div className="space-y-3">
          <div>
            <span className="text-[10px] font-semibold uppercase" style={{ color: MUTED }}>Photo</span>
            {photo ? (
              <div className="relative mt-1">
                <img src={photo} alt={`${name} photo`} className="w-full rounded-lg object-cover" style={{ maxHeight: 180 }} />
                <button onClick={removePhoto} className="absolute top-1.5 right-1.5 text-[10px] px-2 py-1 rounded-md"
                  style={{ background: 'rgba(0,0,0,0.6)', color: '#fff' }}>Remove</button>
              </div>
            ) : (
              <label className="mt-1 flex flex-col items-center justify-center gap-1 rounded-lg cursor-pointer"
                style={{ ...FIELD, height: 110 }}>
                <ImagePlus size={16} style={{ color: MUTED }} />
                <span className="text-[11px] text-white">Add a photo</span>
                <span className="text-[10px]" style={{ color: MUTED }}>Uses one of your photo slots</span>
                <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" disabled={busy}
                  onChange={(e) => void pick(e.target.files?.[0])} />
              </label>
            )}
          </div>

          <label className="block">
            <span className="text-[10px] font-semibold uppercase" style={{ color: MUTED }}>Video link</span>
            <input value={video} onChange={(e) => setVideo(e.target.value)} aria-label="Video link"
              placeholder="https://youtu.be/…" className="w-full h-10 px-3 rounded-lg text-xs text-white mt-1" style={FIELD} />
            <span className="text-[10px] mt-1 block" style={{ color: badLink ? 'var(--color-secondary)' : MUTED }}>
              {badLink ? `${ALLOWED_VIDEO_HINT} — this one will not play in the app.`
                : `${ALLOWED_VIDEO_HINT}. Unlisted YouTube videos work and cost nothing.`}
            </span>
          </label>
          {preview && (
            <div className="rounded-lg overflow-hidden" style={{ aspectRatio: '16 / 9', background: '#000' }}>
              <iframe src={preview} title={`${name} video`} className="w-full h-full" loading="lazy"
                allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowFullScreen />
            </div>
          )}
        </div>

        <div className="space-y-3">
          <label className="block">
            <span className="text-[10px] font-semibold uppercase" style={{ color: MUTED }}>Cues — up to 6</span>
            <textarea value={cues} onChange={(e) => setCues(e.target.value)} aria-label="Cues, one per line"
              rows={4} placeholder={libraryCues.join('\n')}
              className="w-full px-3 py-2 rounded-lg text-xs text-white mt-1" style={FIELD} />
          </label>
          <label className="block">
            <span className="text-[10px] font-semibold uppercase" style={{ color: MUTED }}>Steps — up to 10, in order</span>
            <textarea value={steps} onChange={(e) => setSteps(e.target.value)} aria-label="Steps, one per line"
              rows={6} placeholder={librarySteps.join('\n')}
              className="w-full px-3 py-2 rounded-lg text-xs text-white mt-1" style={FIELD} />
          </label>
          {(libraryCues.length > 0 || librarySteps.length > 0) && !cues.trim() && (
            <div className="text-[10px] rounded-lg px-3 py-2" style={{ background: 'var(--color-surface-high)', color: MUTED }}>
              <p className="font-semibold text-white">Using the starter cues</p>
              <ul className="list-disc pl-4 mt-1">{libraryCues.map((c) => <li key={c}>{c}</li>)}</ul>
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-2 mt-4">
        <Button variant="secondary" onClick={() => void save()} disabled={busy}>
          {busy ? 'Working…' : 'Save guide'}
        </Button>
        <Button variant="ghost" onClick={() => void cancel()} disabled={busy}>Cancel</Button>
      </div>
    </Card>
  );
}
