import { supabase } from '../supabaseClient';
import { currentGymId } from '../gymContext';
import { reelEmbedUrl, reelLinkCover, reelLinkSource, type ReelSource } from '../reelEmbed';

/**
 * Reels (0245): short videos the gym puts up for its members.
 *
 * **Identical in both apps** — diff before changing one. Every write is an RPC;
 * the tables have no write policy. Files live in the public `reels` bucket at
 * `gyms/<gym>/reels/<random>.<ext>`; only the gym's owner, desk and coaches
 * write there. What a gym may keep is its Core Fitness plan's storage (0247,
 * `gymStorage`), not a count of videos; links use none.
 *
 * A link's cover is fetched from the link's own page by the `reel-preview`
 * function (a browser cannot read another site) and copied into the bucket —
 * best effort: a site that will not answer leaves the plain tile.
 */

const BUCKET = 'reels';
/** Must match the bucket's file_size_limit (15 MB since 0248; 25 MB before). */
export const REEL_MAX_BYTES = 15 * 1024 * 1024;
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

/** What the gym has uploaded against what its plan allows (0247). `limitBytes` null = no limit. */
export interface GymStorage { planName: string | null; limitBytes: number | null; usedBytes: number }

/** Null for someone who does not upload (a member), or before 0247. */
export async function gymStorage(): Promise<GymStorage | null> {
  const { data, error } = await supabase.rpc('my_gym_storage');
  if (error) return null;
  const row = (Array.isArray(data) ? data[0] : data) as { plan_name: string | null; limit_bytes: number | string | null; used_bytes: number | string } | undefined;
  if (!row) return null;
  return { planName: row.plan_name, limitBytes: row.limit_bytes === null ? null : Number(row.limit_bytes), usedBytes: Number(row.used_bytes) };
}

/** 1536 MB → "1.5 GB"; 120 MB → "120 MB". */
export function bytesWords(n: number): string {
  const mb = n / 1048576;
  if (mb >= 1024) { const gb = mb / 1024; return `${gb >= 10 || Number.isInteger(gb) ? Math.round(gb) : gb.toFixed(1)} GB`; }
  return `${mb >= 10 ? Math.round(mb) : Math.max(0, Math.round(mb * 10) / 10)} MB`;
}

/** "120 MB of 2 GB", or "120 MB" on a plan with no limit. */
export function storageWords(s: GymStorage): string {
  return s.limitBytes === null ? bytesWords(s.usedBytes) : `${bytesWords(s.usedBytes)} of ${bytesWords(s.limitBytes)}`;
}

/** What a link shows when shared: its picture (already copied into the bucket) and its full address. Never throws. */
async function linkPreview(url: string): Promise<{ coverPath: string | null; url: string | null }> {
  try {
    const { data, error } = await supabase.functions.invoke('reel-preview', { body: { url } });
    if (error || !data) return { coverPath: null, url: null };
    const d = data as { coverPath?: unknown; url?: unknown };
    return { coverPath: typeof d.coverPath === 'string' ? d.coverPath : null, url: typeof d.url === 'string' ? d.url : null };
  } catch { return { coverPath: null, url: null }; }
}

/**
 * The full address a share link led to, kept only when it is better: it plays here
 * and the typed link did not. A site's sign-in wall is never better (2026-11-12: a
 * Facebook share link was traded for facebook.com/login — the reel went dead).
 */
function betterUrl(typed: string, found: string | null): string | null {
  if (!found || /\/(login|checkpoint)(\/|\?|$)/i.test(found)) return null;
  if (reelLinkSource(found) !== reelLinkSource(typed)) return null;
  return reelEmbedUrl(found) && !reelEmbedUrl(typed) ? found : null;
}

/** A new cover picture for a reel the caller may change (the old one is deleted). */
export async function changeReelCover(reelId: string, image: Blob): Promise<void> {
  const path = await uploadReelCover(image);
  const { data, error } = await supabase.rpc('set_reel_cover', { p_reel: reelId, p_cover_path: path, p_url: null });
  if (error) {
    void supabase.storage.from(BUCKET).remove([path]);
    throw new Error(error.message);
  }
  if (typeof data === 'string' && data) void supabase.storage.from(BUCKET).remove([data]);
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
  if (file.size > REEL_MAX_BYTES) return `That video is ${(file.size / 1048576).toFixed(0)} MB. The limit is 15 MB — trim it, or export it at 720p.`;
  return null;
}

export interface NewReel { title: string; caption: string; }

/** Post a pasted link. `cover` is an optional picture for sites that give us none. */
export async function postLinkReel(r: NewReel & { url: string; cover?: Blob | null }): Promise<string> {
  const typed = r.url.trim();
  const source = reelLinkSource(typed);
  // YouTube gives its own thumbnail and needs no lookup; the others are asked for their share picture
  // and for the full address a short share link leads to (so it can play inside the app).
  const found = source && source !== 'youtube' ? await linkPreview(typed) : { coverPath: null, url: null };
  let coverPath = found.coverPath;
  if (r.cover) {
    const own = await uploadReelCover(r.cover);
    if (coverPath) void supabase.storage.from(BUCKET).remove([coverPath]);
    coverPath = own;
  }
  const url = betterUrl(typed, found.url) ?? typed;
  const { data, error } = await supabase.rpc('post_reel', {
    p_title: r.title, p_caption: r.caption, p_url: url, p_video_path: null, p_cover_path: coverPath,
  });
  if (error) {
    if (coverPath) void supabase.storage.from(BUCKET).remove([coverPath]);
    throw new Error(error.message);
  }
  return data as string;
}

/**
 * For a link reel posted without a picture: fetch the link's own and attach it.
 * True when the reel now has a cover. Only for someone who may change the reel.
 */
export async function fetchReelCover(reel: Pick<Reel, 'id' | 'url' | 'source' | 'cover' | 'canManage'>): Promise<boolean> {
  if (!reel.canManage || reel.cover || reel.source === 'upload' || reel.source === 'youtube') return false;
  const found = await linkPreview(reel.url);
  if (!found.coverPath && !found.url) return false;
  const url = betterUrl(reel.url, found.url);
  if (!found.coverPath && !url) return false;
  const { data, error } = await supabase.rpc('set_reel_cover', { p_reel: reel.id, p_cover_path: found.coverPath, p_url: url });
  if (error) {
    if (found.coverPath) void supabase.storage.from(BUCKET).remove([found.coverPath]);
    return false;
  }
  if (typeof data === 'string' && data) void supabase.storage.from(BUCKET).remove([data]);
  return !!found.coverPath;
}

/** Upload a video and post it. The file is removed again if the database refuses the reel. */
export async function postUploadedReel(r: NewReel & { file: File; cover?: Blob | null }): Promise<string> {
  const problem = reelFileProblem(r.file);
  if (problem) throw new Error(problem);
  // Said in words before the upload starts, instead of a refusal after a minute of uploading.
  const store = await gymStorage();
  if (store && store.limitBytes !== null && store.usedBytes + r.file.size > store.limitBytes) {
    throw new Error(`Your gym has used ${storageWords(store)} of storage${store.planName ? ` on ${store.planName}` : ''}, and this video is ${bytesWords(r.file.size)}. Remove a video you no longer need, or move to a plan with more storage — links use none.`);
  }
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
