import { supabase } from '../supabaseClient';

/**
 * Picture attachments for events, challenges, announcements and resources
 * (migration 0065).
 *
 * Files live at `media/<kind>/<random>.jpg`. Unlike avatars, the folder is not
 * a permission boundary — an event picture belongs to the gym, not to whoever
 * uploaded it, so the storage policies key off the **role**. The folder is
 * there to keep the bucket browsable.
 *
 * The bucket caps size and mime type server-side as well, so the checks here
 * exist to produce a sentence a human can act on rather than a 400.
 */

const BUCKET = 'media';
const MAX_BYTES = 3 * 1024 * 1024; // must match the bucket's file_size_limit
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * Longest edge, in px, that an attachment is stored at.
 *
 * Wider than an avatar's 512 because these render as banners across a phone
 * screen, and a 512px-wide picture stretched to a 3x-density 400pt card is
 * visibly soft. 1280 covers that with room to spare and still lands well under
 * the size cap after JPEG.
 */
const MAX_EDGE = 1280;

export type MediaKind = 'events' | 'challenges' | 'announcements' | 'resources';

/**
 * Shrink an image before upload.
 *
 * A phone camera produces 3–8 MB files, which fail the bucket limit outright.
 * Resizing in the browser means the admin can pick a photo straight off their
 * phone and have it work, rather than being told to go and compress it.
 *
 * Unlike the avatar version this does **not** square-crop: an event banner is
 * whatever shape the poster is, and cropping a flyer to a square cuts the text
 * off it. Aspect ratio is preserved and the card decides how to fit it.
 *
 * Falls back to the original file if the browser cannot decode it — the upload
 * then either succeeds or fails on the server's own limits, which is a clearer
 * outcome than a silent no-op.
 */
async function shrink(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;

    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.85)
    );
    return blob ?? file;
  } catch {
    return file;
  }
}

/**
 * Uploads a picture and returns its public URL.
 *
 * Deliberately returns the URL rather than writing it anywhere: the caller is
 * usually a form that has not been saved yet, and uploading on save instead
 * would mean the admin cannot see what they picked until it is too late to
 * change it.
 *
 * The cost of that choice is an orphan file if the form is then cancelled. That
 * is the right trade at this size — a 300KB file nobody points at is cheaper
 * than a form that lies about what it is going to publish.
 */
export async function uploadMedia(file: File, kind: MediaKind): Promise<string> {
  if (!ALLOWED.includes(file.type)) {
    throw new Error('Please choose a JPEG, PNG or WebP image.');
  }
  if (file.size > MAX_BYTES * 8) {
    // Bail before spending time decoding something absurd.
    throw new Error('That image is far too large. Please choose a smaller one.');
  }

  const body = await shrink(file);
  if (body.size > MAX_BYTES) {
    throw new Error('That image is still too large after resizing. Please choose another.');
  }

  const path = `${kind}/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, body, { contentType: 'image/jpeg', upsert: false });
  if (error) {
    // The most likely cause by far, and the one the message should name.
    if (/row-level security|not authorized/i.test(error.message)) {
      throw new Error('You do not have permission to upload pictures. Ask an admin.');
    }
    throw error;
  }

  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

/**
 * Removes a file this app uploaded, given the public URL that was stored.
 *
 * Never throws: it is called when replacing or clearing a picture, and a row
 * that already points somewhere new must not report failure because the old
 * file could not be tidied away. Admin-only in SQL, so a staff member clearing
 * a picture simply leaves the file behind — the row is what members read.
 */
export async function removeMedia(publicUrl: string | null | undefined): Promise<void> {
  const path = mediaPathFromUrl(publicUrl);
  if (!path) return;
  await supabase.storage.from(BUCKET).remove([path]).catch(() => {});
}

/**
 * The storage path inside a public URL, or null if this is not one of ours.
 *
 * Returns null for the `/resource-previews/...` paths 0061 seeded, which are
 * files committed to each app's `public/` folder. Passing one of those to
 * `remove()` would be a no-op, but it would also mean this function was lying
 * about what it recognises.
 */
export function mediaPathFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const at = url.indexOf(marker);
  return at === -1 ? null : url.slice(at + marker.length);
}
