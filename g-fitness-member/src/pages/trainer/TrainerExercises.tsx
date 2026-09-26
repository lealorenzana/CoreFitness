import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Video } from '@phosphor-icons/react';
import { Page, PageTitle } from '../../components/ui/page';
import { Chip, LineRow, NocButton, SectionHead } from '../../components/ui/noc';
import { Field, Select, TextArea, TextInput } from '../../components/ui/Field';
import GlassSheet from '../../components/ui/GlassSheet';
import { SkeletonList } from '../../components/ui/Skeleton';
import { toast } from '../../components/ui/Toast';
import ExerciseGuide from '../../components/workout/ExerciseGuide';
import { errorMessage } from '../../utils/errorMessage';
import { supabase } from '../../lib/supabaseClient';
import { currentGymId } from '../../lib/gymContext';
import { ALLOWED_VIDEO_HINT, embedUrl } from '../../lib/videoEmbed';
import {
  listExerciseMedia, removeContentPhoto, saveExerciseMedia, uploadContentPhoto, type ExerciseMedia,
} from '../../lib/api/exerciseMedia';

interface Row {
  id: string; name: string; muscle_group: string; equipment: string; is_timed: boolean;
  gym_id: string | null; cues: string[]; steps: string[]; created_by: string | null;
}

const GROUPS = ['chest', 'back', 'legs', 'shoulders', 'arms', 'core', 'full_body', 'cardio'];
const EQUIPMENT = ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'other'];
const label = (s: string) => s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
const lines = (s: string) => s.split('\n').map((l) => l.trim()).filter(Boolean);

/**
 * A coach writes the gym's exercise guides from their phone (0121).
 *
 * The rule is the database's, not this screen's: a trainer writes a guide for
 * any exercise nobody has written one for yet, and edits only the guides they
 * wrote; the owner edits anything. So a guide the owner (or another coach)
 * wrote is shown **read-only** here, with who to ask — offering a Save the
 * database would refuse is the "control that does nothing" this repo keeps
 * finding. A trainer can also add an exercise the gym does not have yet; it is
 * the gym's own, never the shared library's.
 *
 * Programs are built on the admin website (spec): laying out six weeks on a
 * phone is the wrong tool.
 */
export default function TrainerExercises() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [media, setMedia] = useState<Map<string, ExerciseMedia>>(new Map());
  const [me, setMe] = useState<string | null>(null);
  const [group, setGroup] = useState('all');
  const [open, setOpen] = useState<Row | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    const [{ data: { session } }, res, m] = await Promise.all([
      supabase.auth.getSession(),
      supabase.from('exercises')
        .select('id, name, muscle_group, equipment, is_timed, gym_id, cues, steps, created_by')
        .eq('is_active', true).order('muscle_group').order('sort_order'),
      listExerciseMedia(),
    ]);
    setMe(session?.user.id ?? null);
    if (res.error) { setFailed(true); return; }
    setRows(((res.data ?? []) as Row[]).filter((r) => !m.get(r.id)?.hidden));
    setMedia(m);
  }, []);

  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  const groups = useMemo(() => [...new Set((rows ?? []).map((r) => r.muscle_group))], [rows]);
  const visible = (rows ?? []).filter((r) => group === 'all' || r.muscle_group === group);

  if (failed) {
    return (
      <Page>
        <PageTitle back fallback="/trainer/profile" title="Exercises" />
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
          The exercise guides need the gym to update (migration 0121), or the list could not load just now.
        </p>
      </Page>
    );
  }

  return (
    <Page>
      <PageTitle back fallback="/trainer/profile" title="Exercises"
        subtitle="Photos, videos and cues your members see" />

      <NocButton variant="structure" className="w-full" icon={<Plus size={15} weight="bold" />}
        onClick={() => setAdding(true)}>
        New exercise
      </NocButton>

      {!rows ? <SkeletonList /> : (
        <>
          <div className="flex overflow-x-auto scrollbar-hide" style={{ gap: 8, margin: '0 calc(var(--gutter) * -1)', padding: '0 var(--gutter)' }}>
            <Chip label="All" on={group === 'all'} onClick={() => setGroup('all')} />
            {groups.map((g) => <Chip key={g} label={label(g)} on={group === g} onClick={() => setGroup(g)} />)}
          </div>
          <section>
            <SectionHead title={`${visible.length} exercises`} />
            {visible.map((r, i) => {
              const m = media.get(r.id);
              const meta = [
                r.gym_id === null ? 'Library' : r.created_by === me ? 'Yours' : "Gym's own",
                label(r.equipment),
                m ? (m.createdBy === me ? 'guide by you' : 'guide by the gym') : null,
              ].filter(Boolean).join(' · ');
              return (
                <LineRow key={r.id} title={r.name} meta={meta} onClick={() => setOpen(r)} last={i === visible.length - 1}
                  action={m?.videoUrl ? <Video size={16} aria-label="Has a video" style={{ color: 'var(--color-primary-300)' }} /> : undefined} />
              );
            })}
          </section>
        </>
      )}

      <GlassSheet open={open != null} onClose={() => setOpen(null)} title={open?.name ?? ''}
        subtitle={open ? `${label(open.muscle_group)} · ${label(open.equipment)}` : undefined}>
        {open && (
          <GuideSheet key={open.id} row={open} media={media.get(open.id) ?? null} me={me}
            onSaved={async () => { setOpen(null); await load(); }} />
        )}
      </GlassSheet>

      <GlassSheet open={adding} onClose={() => setAdding(false)} title="New exercise"
        subtitle="Added to your gym only">
        {adding && <NewExercise onDone={async () => { setAdding(false); await load(); }} />}
      </GlassSheet>
    </Page>
  );
}

/** Edit when the guide is the trainer's to edit; otherwise show it and say whose it is. */
function GuideSheet({ row, media, me, onSaved }: {
  row: Row; media: ExerciseMedia | null; me: string | null; onSaved: () => Promise<void>;
}) {
  const canEdit = me != null && (media ? media.createdBy === me : true);
  const [video, setVideo] = useState(media?.videoUrl ?? '');
  const [cues, setCues] = useState((media?.cues ?? []).join('\n'));
  const [steps, setSteps] = useState((media?.steps ?? []).join('\n'));
  const [photo, setPhoto] = useState<string | null>(media?.photoUrl ?? null);
  const [fresh, setFresh] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!canEdit) {
    return (
      <div className="flex flex-col" style={{ gap: 14 }}>
        <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>
          The gym wrote this guide, so only the owner can change it. Ask them if something is wrong.
        </p>
        <ExerciseGuide name={row.name} libraryCues={row.cues} librarySteps={row.steps} media={media} />
      </div>
    );
  }

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
      toast.error(errorMessage(e, 'The photo could not be added'));
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (badLink) { toast.error(`${ALLOWED_VIDEO_HINT}, please.`); return; }
    setBusy(true);
    try {
      await saveExerciseMedia(row.id, {
        videoUrl: video.trim() || null,
        cues: lines(cues).length ? lines(cues) : null,
        steps: lines(steps).length ? lines(steps) : null,
        photoUrl: photo,
      });
      const old = media?.photoUrl ?? null;
      if (old && old !== photo) await removeContentPhoto(old).catch(() => {});
      toast.success('Saved. Your members see it now.');
      await onSaved();
    } catch (e) {
      toast.error(errorMessage(e, 'The guide could not be saved'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col" style={{ gap: 12 }}>
      <Field label="Video link" hint={badLink ? `${ALLOWED_VIDEO_HINT} — this one will not play.` : `${ALLOWED_VIDEO_HINT}. Unlisted YouTube works.`}>
        <TextInput value={video} onChange={(e) => setVideo(e.target.value)} placeholder="https://youtu.be/…" aria-label="Video link" />
      </Field>
      {preview && (
        <div style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', borderRadius: 14, overflow: 'hidden', background: '#000' }}>
          <iframe src={preview} title={`${row.name} video`} loading="lazy" allowFullScreen
            allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }} />
        </div>
      )}
      <Field label="Cues, one per line" hint={row.cues.length ? 'Empty keeps the starter cues.' : 'Up to 6.'}>
        <TextArea value={cues} onChange={(e) => setCues(e.target.value)} rows={3}
          placeholder={row.cues.join('\n')} aria-label="Cues, one per line" />
      </Field>
      <Field label="Steps, one per line" hint="Up to 10, in order.">
        <TextArea value={steps} onChange={(e) => setSteps(e.target.value)} rows={4}
          placeholder={row.steps.join('\n')} aria-label="Steps, one per line" />
      </Field>
      <Field label="Photo" hint="Uses one of the gym's photo slots.">
        {photo ? (
          <div className="flex items-center" style={{ gap: 12 }}>
            <img src={photo} alt="" style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 12 }} />
            <NocButton variant="ghost" onClick={() => { if (fresh) { void removeContentPhoto(fresh).catch(() => {}); setFresh(null); } setPhoto(null); }}>
              Remove
            </NocButton>
          </div>
        ) : (
          <input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} aria-label="Add a photo"
            onChange={(e) => void pick(e.target.files?.[0])} style={{ fontSize: 13, color: 'var(--color-text-secondary)' }} />
        )}
      </Field>
      <NocButton variant="action" className="w-full" disabled={busy} onClick={() => void save()}>
        {busy ? 'Saving…' : 'Save guide'}
      </NocButton>
    </div>
  );
}

function NewExercise({ onDone }: { onDone: () => Promise<void> }) {
  const [name, setName] = useState('');
  const [group, setGroup] = useState('full_body');
  const [equipment, setEquipment] = useState('other');
  const [timed, setTimed] = useState(false);
  const [busy, setBusy] = useState(false);

  const add = async () => {
    setBusy(true);
    try {
      const gymId = await currentGymId();
      if (!gymId) throw new Error('Could not tell which gym this is for. Reload and try again.');
      const { error } = await supabase.from('exercises').insert({
        name: name.trim(), muscle_group: group, equipment, is_timed: timed, gym_id: gymId, sort_order: 900,
      });
      if (error) {
        throw new Error(/unique|duplicate/i.test(error.message)
          ? 'Your gym already has an exercise with that name.' : error.message);
      }
      toast.success(`${name.trim()} added. Tap it to write its guide.`);
      await onDone();
    } catch (e) {
      toast.error(errorMessage(e, 'The exercise could not be added'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col" style={{ gap: 12 }}>
      <Field label="Name">
        <TextInput value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="e.g. Sled Push" aria-label="Exercise name" />
      </Field>
      <Field label="Muscle group">
        <Select value={group} onChange={(e) => setGroup(e.target.value)} aria-label="Muscle group">
          {GROUPS.map((g) => <option key={g} value={g}>{label(g)}</option>)}
        </Select>
      </Field>
      <Field label="Equipment">
        <Select value={equipment} onChange={(e) => setEquipment(e.target.value)} aria-label="Equipment">
          {EQUIPMENT.map((g) => <option key={g} value={g}>{label(g)}</option>)}
        </Select>
      </Field>
      <label className="flex items-center" style={{ gap: 10, fontSize: 13.5, color: 'var(--color-text-secondary)' }}>
        <input type="checkbox" checked={timed} onChange={(e) => setTimed(e.target.checked)} />
        Measured in time, not reps (a plank, a run)
      </label>
      <NocButton variant="action" className="w-full" disabled={busy || !name.trim()} onClick={() => void add()}>
        {busy ? 'Adding…' : 'Add to my gym'}
      </NocButton>
    </div>
  );
}
