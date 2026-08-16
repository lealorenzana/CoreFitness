import { supabase } from '../supabaseClient';
import { updateMyProfile } from './profiles';

/**
 * Profile photo upload (migration 0021).
 *
 * Files live at `avatars/<auth.uid()>/<random>.<ext>`. The uid folder is what
 * the storage policies key off — you cannot write outside your own — and the
 * random filename means a public URL cannot be derived from a user id.
 *
 * The bucket caps size and mime type server-side too, so the checks here are
 * for a decent error message, not for safety.
 */

const BUCKET = 'avatars';
const MAX_BYTES = 2 * 1024 * 1024; // must match the bucket's file_size_limit
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];

/** Longest edge, in px, that an avatar is stored at. */
const MAX_EDGE = 512;

/**
 * Shrink an image before upload.
 *
 * A modern phone camera produces 3–8 MB files, which would fail the 2 MB bucket
 * limit outright. Resizing client-side means a member can just pick a photo
 * from their camera roll and have it work, rather than being told to go and
 * compress it themselves.
 *
 * Falls back to the original file if the browser can't decode it — the upload
 * will then either succeed or fail on the server's own limits, which is a
 * clearer outcome than a silent no-op.
 */
async function shrink(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    // Square crop from the centre: avatars render in circles, and letting a
    // portrait photo squash into one looks worse than trimming the edges.
    const edge = Math.min(bitmap.width, bitmap.height);
    const out = Math.round(edge * scale);

    const canvas = document.createElement('canvas');
    canvas.width = out;
    canvas.height = out;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;

    ctx.drawImage(
      bitmap,
      (bitmap.width - edge) / 2, (bitmap.height - edge) / 2, edge, edge,
      0, 0, out, out
    );
    bitmap.close?.();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.85)
    );
    return blob ?? file;
  } catch {
    return file;
  }
}

export interface AvatarUploadResult {
  publicUrl: string;
  path: string;
}

/**
 * Upload a new avatar for the signed-in user and point their profile at it.
 * Any previous avatar is removed afterwards so the bucket doesn't accumulate
 * every photo a member has ever chosen.
 */
export async function uploadMyAvatar(file: File): Promise<AvatarUploadResult> {
  if (!ALLOWED.includes(file.type)) {
    throw new Error('Please choose a JPEG, PNG or WebP image.');
  }
  if (file.size > MAX_BYTES * 8) {
    // Guard against something absurd before spending time decoding it.
    throw new Error('That image is too large. Please choose a smaller photo.');
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in.');

  const body = await shrink(file);
  if (body.size > MAX_BYTES) {
    throw new Error('That image is too large even after resizing. Please choose another.');
  }

  const path = `${user.id}/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, body, { contentType: 'image/jpeg', upsert: false });
  if (error) throw error;

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  const publicUrl = data.publicUrl;

  const previous = await currentAvatarPath();
  await updateMyProfile({ photo_url: publicUrl });

  // Only after the profile points at the new file — if this fails the member
  // still has a working photo, which matters more than a tidy bucket.
  if (previous) await supabase.storage.from(BUCKET).remove([previous]).catch(() => {});

  return { publicUrl, path };
}

/** Remove the signed-in user's avatar and fall back to initials. */
export async function removeMyAvatar(): Promise<void> {
  const previous = await currentAvatarPath();
  await updateMyProfile({ photo_url: null });
  if (previous) await supabase.storage.from(BUCKET).remove([previous]).catch(() => {});
}

/**
 * Admin moderation: clear someone else's photo. Requires the caller to be an
 * admin — `avatars_delete_admin` and `profiles_update_admin` both enforce it
 * server-side, so a non-admin calling this gets a 42501 rather than a no-op.
 */
export async function removeAvatarFor(userId: string): Promise<void> {
  const { data: profile } = await supabase
    .from('profiles').select('photo_url').eq('id', userId).maybeSingle();

  const { error } = await supabase
    .from('profiles').update({ photo_url: null }).eq('id', userId);
  if (error) throw error;

  const path = pathFromPublicUrl(profile?.photo_url ?? null);
  if (path) await supabase.storage.from(BUCKET).remove([path]).catch(() => {});
}

/** The storage path of the signed-in user's current avatar, if any. */
async function currentAvatarPath(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from('profiles').select('photo_url').eq('id', user.id).maybeSingle();
  return pathFromPublicUrl(data?.photo_url ?? null);
}

/**
 * Recover the storage path from a public URL.
 *
 * Returns null for anything that isn't one of our bucket URLs, so an externally
 * hosted photo set by some other means is never deleted by accident.
 */
function pathFromPublicUrl(url: string | null): string | null {
  if (!url) return null;
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const i = url.indexOf(marker);
  return i === -1 ? null : url.slice(i + marker.length);
}
