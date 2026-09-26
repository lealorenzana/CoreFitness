import { supabase } from '../supabaseClient';
import { currentGymId } from '../gymContext';
import { assertWrote } from './mutate';

/**
 * A gym's own guide for an exercise — photo, video link, cues, steps (0121).
 *
 * **Identical in both apps** (admin and trainer write, member reads) — diff
 * before changing one.
 *
 * The standard exercises are one shared row each, read by every gym, so none of
 * this is stored on the exercise. It lives in `gym_exercise_media`, one row per
 * gym per exercise, and RLS keeps each gym to its own. `cues`/`steps` of NULL
 * mean "use the library's starter text"; an empty array means "none, on purpose".
 *
 * Photos are counted per gym against its platform plan. A photo is uploaded into
 * a slot `reserve_gym_photo()` hands out, which is where the limit is checked —
 * the storage policy refuses a content upload that has no slot, so the count
 * cannot be skipped by uploading directly.
 */

export interface ExerciseMedia {
  exerciseId: string;
  photoUrl: string | null;
  videoUrl: string | null;
  cues: string[] | null;
  steps: string[] | null;
  hidden: boolean;
  createdBy: string;
}

interface Row {
  exercise_id: string; photo_url: string | null; video_url: string | null;
  cues: string[] | null; steps: string[] | null; hidden: boolean; created_by: string;
}

const BUCKET = 'media';
const MAX_EDGE = 1280;
const MAX_BYTES = 3 * 1024 * 1024;

/** Every guide this gym has written, by exercise. Empty before 0121 is pasted. */
export async function listExerciseMedia(): Promise<Map<string, ExerciseMedia>> {
  const { data, error } = await supabase
    .from('gym_exercise_media')
    .select('exercise_id, photo_url, video_url, cues, steps, hidden, created_by');
  // Before 0121 the table does not exist. That is "no guides yet", not a failure:
  // the screens then show the library's starter text, exactly as a gym that has
  // written nothing sees after 0121.
  if (error) return new Map();
  return new Map(((data ?? []) as Row[]).map((r) => [r.exercise_id, {
    exerciseId: r.exercise_id, photoUrl: r.photo_url, videoUrl: r.video_url,
    cues: r.cues, steps: r.steps, hidden: r.hidden, createdBy: r.created_by,
  }]));
}

export type MediaPatch = Partial<Pick<ExerciseMedia, 'photoUrl' | 'videoUrl' | 'cues' | 'steps' | 'hidden'>>;

/**
 * Create or change this gym's guide for one exercise. Only the fields passed
 * are written, so hiding an exercise never clears its video.
 */
export async function saveExerciseMedia(exerciseId: string, patch: MediaPatch): Promise<void> {
  const gymId = await currentGymId();
  if (!gymId) throw new Error('Could not tell which gym this is for. Reload and try again.');
  const row: Record<string, unknown> = { gym_id: gymId, exercise_id: exerciseId };
  if ('photoUrl' in patch) row.photo_url = patch.photoUrl;
  if ('videoUrl' in patch) row.video_url = patch.videoUrl?.trim() || null;
  if ('cues' in patch) row.cues = patch.cues === null ? null : clean(patch.cues);
  if ('steps' in patch) row.steps = patch.steps === null ? null : clean(patch.steps);
  if ('hidden' in patch) row.hidden = patch.hidden;

  const { data, error } = await supabase
    .from('gym_exercise_media')
    .upsert(row, { onConflict: 'gym_id,exercise_id' })
    .select('exercise_id');
  if (error) throw new Error(friendly(error.message));
  assertWrote(data, 'That guide could not be saved. It may belong to another trainer.');
}

/** Blank lines are dropped rather than refused: an empty input box is not a cue. */
const clean = (lines: string[] | undefined) => (lines ?? []).map((l) => l.trim()).filter(Boolean);

function friendly(msg: string): string {
  if (/is_allowed_video_url|video_url/i.test(msg)) return 'That video link is not a YouTube or Vimeo link.';
  if (/guide_lines_ok|cues|steps/i.test(msg)) return 'Keep it to 6 cues and 10 steps, each on one line.';
  if (/row-level security/i.test(msg)) return 'You can only change guides you wrote.';
  return msg;
}

/** How many photos this gym has used, and its plan's limit (null = unlimited). */
export async function photoUsage(): Promise<{ used: number; cap: number | null } | null> {
  const { data, error } = await supabase.rpc('gym_photo_usage');
  if (error || !Array.isArray(data) || !data[0]) return null;
  const r = data[0] as { used: number; cap: number | null };
  return { used: r.used, cap: r.cap };
}

/** Shrink on the device: a phone photo is 3–8 MB, the bucket takes 3. */
async function shrink(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82));
    return blob ?? file;
  } catch {
    return file;
  }
}

/**
 * Reserve a slot, upload into it, return the public URL. If the upload fails
 * the slot is handed back, so a failed upload never costs the gym a photo.
 */
export async function uploadContentPhoto(file: File): Promise<string> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error('Please choose a JPEG, PNG or WebP image.');
  const body = await shrink(file);
  if (body.size > MAX_BYTES) throw new Error('That image is still too large after resizing. Please choose another.');

  const { data: path, error } = await supabase.rpc('reserve_gym_photo');
  if (error || typeof path !== 'string') {
    throw new Error(error?.message.replace(/^.*?: /, '') || 'No photo slot was available.');
  }
  const up = await supabase.storage.from(BUCKET).upload(path, body, { contentType: 'image/jpeg', upsert: false });
  if (up.error) {
    await supabase.rpc('release_gym_photo', { p_path: path });
    throw new Error('The photo could not be uploaded. Please try again.');
  }
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

/** The storage path inside one of our public URLs, or null. */
function contentPathFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const at = url.indexOf(marker);
  const path = at === -1 ? null : url.slice(at + marker.length);
  return path && /^gyms\/[^/]+\/content\//.test(path) ? path : null;
}

/**
 * Delete a content photo and give its slot back. The file goes first: a slot
 * released with its file still there would be storage nobody counts.
 */
export async function removeContentPhoto(publicUrl: string | null | undefined): Promise<void> {
  const path = contentPathFromUrl(publicUrl);
  if (!path) return;
  await supabase.storage.from(BUCKET).remove([path]);
  const { error } = await supabase.rpc('release_gym_photo', { p_path: path });
  if (error) throw new Error(error.message.replace(/^.*?: /, ''));
}
