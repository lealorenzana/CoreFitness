import { supabase } from '../supabaseClient';
import { shrink } from './exerciseMedia';

/**
 * Progress photos (0132). Private by default: only the member sees them, unless
 * they share their album with the coaches they train with. The owner and desk
 * never see them. A photo check-in in Rooms shows that one photo to that room's
 * coach. Files are in a PRIVATE bucket, opened with short-lived signed links —
 * a copied link stops working within the hour.
 *
 * An upload needs a slot from reserve_progress_photo(), where the per-member
 * limit (200) is checked; a failed upload gives the slot back.
 */

export type Pose = 'front' | 'side' | 'back' | 'other';
export interface ProgressPhoto { id: string; path: string; url: string | null; pose: Pose; takenOn: string; note: string | null }

const BUCKET = 'progress';
const LINK_SECONDS = 3600;
const MAX_BYTES = 3 * 1024 * 1024;
const clean = (m: string) => m.replace(/^.*?: /, '');

async function signed(paths: string[]): Promise<Map<string, string>> {
  if (paths.length === 0) return new Map();
  const { data } = await supabase.storage.from(BUCKET).createSignedUrls(paths, LINK_SECONDS);
  const out = new Map<string, string>();
  for (const d of data ?? []) if (d.signedUrl && d.path) out.set(d.path, d.signedUrl);
  return out;
}

const toPhotos = async (rows: { id: string; path: string; pose: Pose; taken_on: string; note: string | null }[]) => {
  const urls = await signed(rows.map((r) => r.path));
  return rows.map((r) => ({ id: r.id, path: r.path, url: urls.get(r.path) ?? null, pose: r.pose, takenOn: r.taken_on, note: r.note }));
};

/** undefined = 0132 not live yet. */
export async function myPhotos(): Promise<ProgressPhoto[] | undefined> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase.from('progress_photos').select('id, path, pose, taken_on, note')
    .eq('member_id', user.id).order('taken_on', { ascending: false }).order('created_at', { ascending: false });
  if (error) return undefined;
  return toPhotos((data ?? []) as { id: string; path: string; pose: Pose; taken_on: string; note: string | null }[]);
}

/** Reserve a slot, upload into it; returns the new photo's id. */
export async function addPhoto(file: File, pose: Pose, takenOn: string | null, note: string): Promise<string> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error('Please choose a JPEG, PNG or WebP image.');
  const body = await shrink(file);
  if (body.size > MAX_BYTES) throw new Error('That image is still too large after resizing. Please choose another.');
  const { data, error } = await supabase.rpc('reserve_progress_photo', { p_pose: pose, p_taken_on: takenOn, p_note: note || null });
  const slot = Array.isArray(data) ? (data[0] as { photo_id: string; path: string } | undefined) : undefined;
  if (error || !slot) throw new Error(clean(error?.message ?? 'No photo slot was available.'));
  const up = await supabase.storage.from(BUCKET).upload(slot.path, body, { contentType: 'image/jpeg', upsert: false });
  if (up.error) {
    await supabase.rpc('delete_progress_photo', { p_photo: slot.photo_id });
    throw new Error('The photo could not be uploaded. Please try again.');
  }
  return slot.photo_id;
}

/** The file first, then the row: a row without its file is a broken tile, the reverse is storage nobody sees. */
export async function deletePhoto(photo: ProgressPhoto): Promise<void> {
  await supabase.storage.from(BUCKET).remove([photo.path]);
  const { error } = await supabase.rpc('delete_progress_photo', { p_photo: photo.id });
  if (error) throw new Error(clean(error.message));
}

export async function getSharePhotos(): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase.from('member_share_prefs').select('share_photos').eq('member_id', user.id).maybeSingle();
  return !!(data as { share_photos?: boolean } | null)?.share_photos;
}

export async function setSharePhotos(share: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_share_photos', { p_share: share });
  if (error) throw new Error(clean(error.message));
}

/** A trainee's album, for their coach — empty unless the trainee shares it. */
export async function traineePhotos(memberId: string): Promise<ProgressPhoto[]> {
  const { data, error } = await supabase.rpc('trainee_progress_photos', { p_member: memberId });
  if (error) return [];
  return toPhotos((data ?? []) as { id: string; path: string; pose: Pose; taken_on: string; note: string | null }[]);
}

/** Photo check-ins (0132): the member hands in one of their photos. */
export async function submitPhotoCheckin(assignmentId: string, photoId: string): Promise<void> {
  const { error } = await supabase.rpc('submit_checkin_photo', { p_assignment: assignmentId, p_photo: photoId });
  if (error) throw new Error(clean(error.message));
}

/** For the coach reviewing hand-ins: each submission's photo, as a signed link. */
export async function submissionPhotos(submissionIds: string[]): Promise<Map<string, string>> {
  if (submissionIds.length === 0) return new Map();
  const { data } = await supabase.from('room_submissions').select('id, photo_id').in('id', submissionIds).not('photo_id', 'is', null);
  const rows = (data ?? []) as { id: string; photo_id: string }[];
  if (rows.length === 0) return new Map();
  const { data: ph } = await supabase.from('progress_photos').select('id, path').in('id', rows.map((r) => r.photo_id));
  const pathOf = new Map(((ph ?? []) as { id: string; path: string }[]).map((p) => [p.id, p.path]));
  const urls = await signed([...pathOf.values()]);
  return new Map(rows.map((r) => [r.id, urls.get(pathOf.get(r.photo_id) ?? '') ?? '']).filter(([, u]) => u) as [string, string][]);
}
