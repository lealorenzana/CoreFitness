import { supabase } from '../supabaseClient';
import { currentGymId } from '../gymContext';
import { reelLinkCover, type ReelSource } from '../reelEmbed';

/**
 * Reels (0245): short videos the gym puts up for its members.
 *
 * **Identical in both apps** — diff before changing one. Every write is an RPC;
 * the tables have no write policy. Files live in the public `reels` bucket at
 * `gyms/<gym>/reels/<random>.<ext>`; only the gym's owner, desk and coaches
 * write there, and the database refuses an 11th uploaded video.
 */

const BUCKET = 'reels';
/** Must match the bucket's file_size_limit (25 MB). */
export const REEL_MAX_BYTES = 25 * 1024 * 1024;
export const REEL_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];

export interface Reel {
  id: string; title: string; caption: string | null; source: ReelSource; url: string;
  /** A picture to show before it plays: the uploaded cover, else YouTube's thumbnail, else null. */
  cover: string | null;
  hidden: boolean; createdAt: string; author: string;
  likes: number; liked: boolean; mine: boolean; canManage: boolean;
}

interface FeedRow {
  id: string; title: string; caption: string | null; source: ReelSource; url: string;
  video_path: string | null; cover_path: string | null; hidden: boolean; created_at: string;
  author: string | null; likes: number; liked: boolean; mine: boolean; can_manage: boolean;
}

const publicUrl = (path: string) => supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

/** The gym's reels, newest first — what the caller may see. Empty while the gym has reels switched off. */
export async function listReels(): Promise<Reel[]> {
  const { data, error } = await supabase.rpc('gym_reels_feed');
  if (error) throw new Error(error.message);
  return ((data ?? []) as FeedRow[]).map((r) => ({
    id: r.id, title: r.title, caption: r.caption, source: r.source, url: r.url,
    cover: r.cover_path ? publicUrl(r.cover_path) : reelLinkCover(r.url),
    hidden: r.hidden, createdAt: r.created_at, author: (r.author ?? '').trim(),
    likes: r.likes, liked: r.liked, mine: r.mine, canManage: r.can_manage,
  }));
}

/** How many uploaded videos the gym may keep (links are not counted). */
export async function reelUploadLimit(): Promise<number> {
  const { data, error } = await supabase.rpc('reel_upload_limit');
  if (error) throw new Error(error.message);
  return Number(data ?? 10);
}

const randomName = () => (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);

async function folder(): Promise<string> {
  const gym = await currentGymId();
  if (!gym) throw new Error('You are not in a gym.');
  return `gyms/${gym}/reels`;
}

/** A cover picture, shrunk to a phone-sized JPEG and put in the bucket. Returns its path. */
export async function uploadReelCover(image: Blob): Promise<string> {
  const small = await shrinkCover(image);
  const path = `${await folder()}/${randomName()}.jpg`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, small, { contentType: 'image/jpeg', cacheControl: '31536000' });
  if (error) throw new Error(error.message);
  return path;
}

async function shrinkCover(image: Blob): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(image);
    const scale = Math.min(1, 720 / Math.max(bitmap.width, bitmap.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bitmap.width * scale); c.height = Math.round(bitmap.height * scale);
    c.getContext('2d')?.drawImage(bitmap, 0, 0, c.width, c.height);
    const out = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/jpeg', 0.82));
    return out ?? image;
  } catch { return image; }
}

/**
 * A frame from the start of a video, as a JPEG — the cover of an uploaded reel.
 * Null when the browser cannot decode the file (some .mov files): the reel then
 * simply has no cover, which is honest.
 */
export function videoCoverFrame(file: File): Promise<Blob | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement('video');
    let done = false;
    const finish = (b: Blob | null) => { if (done) return; done = true; URL.revokeObjectURL(url); resolve(b); };
    const timer = setTimeout(() => finish(null), 8000);
    v.muted = true; v.playsInline = true; v.preload = 'auto';
    v.onloadeddata = () => { v.currentTime = Math.min(0.5, (v.duration || 1) / 2); };
    v.onseeked = () => {
      try {
        const c = document.createElement('canvas');
        c.width = v.videoWidth; c.height = v.videoHeight;
        if (!c.width || !c.height) { clearTimeout(timer); finish(null); return; }
        c.getContext('2d')?.drawImage(v, 0, 0);
        c.toBlob((b) => { clearTimeout(timer); finish(b); }, 'image/jpeg', 0.85);
      } catch { clearTimeout(timer); finish(null); }
    };
    v.onerror = () => { clearTimeout(timer); finish(null); };
    v.src = url;
  });
}

/** Why this file cannot be a reel, in words — or null when it can. */
export function reelFileProblem(file: File): string | null {
  if (!REEL_VIDEO_TYPES.includes(file.type)) return 'Choose an MP4, MOV or WebM video.';
  if (file.size > REEL_MAX_BYTES) return `That video is ${(file.size / 1048576).toFixed(0)} MB. The limit is 25 MB — trim it or export it smaller.`;
  return null;
}

export interface NewReel { title: string; caption: string; }

/** Post a pasted link. `cover` is an optional picture for sites that give us none. */
export async function postLinkReel(r: NewReel & { url: string; cover?: Blob | null }): Promise<string> {
  const coverPath = r.cover ? await uploadReelCover(r.cover) : null;
  const { data, error } = await supabase.rpc('post_reel', {
    p_title: r.title, p_caption: r.caption, p_url: r.url.trim(), p_video_path: null, p_cover_path: coverPath,
  });
  if (error) {
    if (coverPath) void supabase.storage.from(BUCKET).remove([coverPath]);
    throw new Error(error.message);
  }
  return data as string;
}

/** Upload a video and post it. The file is removed again if the database refuses the reel. */
export async function postUploadedReel(r: NewReel & { file: File; cover?: Blob | null }): Promise<string> {
  const problem = reelFileProblem(r.file);
  if (problem) throw new Error(problem);
  const ext = r.file.type === 'video/webm' ? 'webm' : r.file.type === 'video/quicktime' ? 'mov' : 'mp4';
  const path = `${await folder()}/${randomName()}.${ext}`;
  const up = await supabase.storage.from(BUCKET).upload(path, r.file, { contentType: r.file.type, cacheControl: '31536000' });
  if (up.error) throw new Error(up.error.message);
  let coverPath: string | null;
  try {
    const frame = r.cover ?? (await videoCoverFrame(r.file));
    coverPath = frame ? await uploadReelCover(frame) : null;
  } catch { coverPath = null; } // a reel without a cover still plays
  const { data, error } = await supabase.rpc('post_reel', {
    p_title: r.title, p_caption: r.caption, p_url: publicUrl(path), p_video_path: path, p_cover_path: coverPath,
  });
  if (error) {
    void supabase.storage.from(BUCKET).remove([path, ...(coverPath ? [coverPath] : [])]);
    throw new Error(error.message);
  }
  return data as string;
}

export async function editReel(id: string, p: { title: string; caption: string; hidden: boolean }): Promise<void> {
  const { error } = await supabase.rpc('edit_reel', { p_reel: id, p_title: p.title, p_caption: p.caption, p_hidden: p.hidden });
  if (error) throw new Error(error.message);
}

/** Remove a reel, its likes and its files. */
export async function removeReel(id: string): Promise<void> {
  const { data, error } = await supabase.rpc('remove_reel', { p_reel: id });
  if (error) throw new Error(error.message);
  const files = (data ?? []) as string[];
  if (files.length) void supabase.storage.from(BUCKET).remove(files);
}

/** A heart on or off; returns whether it is now on. */
export async function toggleReelLike(id: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('toggle_reel_like', { p_reel: id });
  if (error) throw new Error(error.message);
  return data === true;
}
