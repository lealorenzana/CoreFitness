/**
 * A reel's link, turned into something that plays inside the app (0245).
 *
 * **Identical in both apps** (admin previews it, the phone plays it) — diff
 * before changing one. The database decides which sites count
 * (`reel_link_source`); this decides *how* each plays:
 *
 *   - YouTube (Shorts, watch, youtu.be) → the no-cookie player, playing at once and looping.
 *   - TikTok → its video player (`/player/v1/<id>`), which fills the frame, plays
 *     at once and loops. The older `/embed/v2` card drew TikTok's whole post — and
 *     answered "429 Too Many Requests" on a computer (owner, 2026-11-12).
 *   - Instagram → the post's own `/embed` page. Instagram draws its header and its
 *     likes around the video and offers no switch for them; the screen crops the
 *     frame to the video (`INSTAGRAM_CROP`). It does not play until tapped.
 *   - Facebook → the video plugin, from a reel, watch or video link.
 *
 * Nothing here can remove what a site draws *inside* its own player (TikTok's
 * like and share counts): that page belongs to them.
 *
 * A link we cannot turn into a player returns `embed: null` — a short share
 * link (vm.tiktok.com, fb.watch, facebook.com/share/…) hides the video's id
 * behind a redirect a browser may not follow. The screen then shows the cover
 * and an "Open in <app>" button, never an iframe pointed at a guess.
 */

export type ReelSource = 'youtube' | 'tiktok' | 'facebook' | 'instagram' | 'upload';

export const REEL_SOURCE_WORDS: Record<ReelSource, string> = {
  youtube: 'YouTube', tiktok: 'TikTok', facebook: 'Facebook', instagram: 'Instagram', upload: 'Video',
};

export const REEL_LINK_HINT = 'A link from YouTube, TikTok, Facebook or Instagram';

const YT_ID = /^[A-Za-z0-9_-]{11}$/;

function parse(url: string | null | undefined): URL | null {
  if (!url) return null;
  try {
    const u = new URL(url.trim());
    return u.protocol === 'https:' ? u : null;
  } catch { return null; }
}

function youTubeId(u: URL): string | null {
  const host = u.hostname.replace(/^(www|m)\./, '');
  const parts = u.pathname.split('/').filter(Boolean);
  if (host === 'youtu.be') return YT_ID.test(parts[0] ?? '') ? parts[0] : null;
  if (host !== 'youtube.com') return null;
  const id = parts[0] === 'watch' ? u.searchParams.get('v') : parts[0] === 'shorts' ? parts[1] : null;
  return id && YT_ID.test(id) ? id : null;
}

/** Which site a pasted link is from — the same answer as SQL's `reel_link_source`. Null: not one we take. */
export function reelLinkSource(url: string | null | undefined): Exclude<ReelSource, 'upload'> | null {
  const u = parse(url);
  if (!u) return null;
  const h = u.hostname.toLowerCase();
  const p = u.pathname;
  if (/^((www|m)\.)?youtube\.com$/.test(h) && (/^\/shorts\//.test(p) || (p === '/watch' && u.search.length > 1))) return 'youtube';
  if (h === 'youtu.be') return 'youtube';
  if (/^((www|m|vm|vt)\.)?tiktok\.com$/.test(h)) return 'tiktok';
  if (/^((www|m|web)\.)?facebook\.com$/.test(h) || h === 'fb.watch') return 'facebook';
  if (/^(www\.)?instagram\.com$/.test(h) && /^\/(reel|reels|p)\//.test(p)) return 'instagram';
  return null;
}

/** The address to put in an iframe, or null when this link only opens in its own app. */
export function reelEmbedUrl(url: string | null | undefined): string | null {
  const u = parse(url);
  const source = reelLinkSource(url);
  if (!u || !source) return null;
  const parts = u.pathname.split('/').filter(Boolean);

  if (source === 'youtube') {
    const id = youTubeId(u);
    // playlist=<id> is what makes YouTube loop a single video.
    return id ? `https://www.youtube-nocookie.com/embed/${id}?playsinline=1&rel=0&autoplay=1&loop=1&playlist=${id}` : null;
  }
  if (source === 'tiktok') {
    const i = parts.indexOf('video');
    const id = i >= 0 ? parts[i + 1] : null;
    return id && /^\d{6,25}$/.test(id)
      ? `https://www.tiktok.com/player/v1/${id}?autoplay=1&loop=1&rel=0&music_info=0&description=0&native_context_menu=0&fullscreen_button=0&closed_caption=0`
      : null;
  }
  if (source === 'instagram') {
    const kind = parts[0] === 'p' ? 'p' : 'reel';
    const code = parts[1];
    return code && /^[A-Za-z0-9_-]{5,40}$/.test(code) ? `https://www.instagram.com/${kind}/${code}/embed` : null;
  }
  // Facebook: only shapes that carry the video's own id.
  if (u.hostname === 'fb.watch' || parts[0] === 'share') return null;
  const hasId = (parts[0] === 'reel' && /^\d+$/.test(parts[1] ?? ''))
    || (parts[0] === 'watch' && /^\d+$/.test(u.searchParams.get('v') ?? ''))
    || (parts.includes('videos') && /^\d+$/.test(parts[parts.indexOf('videos') + 1] ?? ''));
  if (!hasId) return null;
  const clean = `https://www.facebook.com${u.pathname}${parts[0] === 'watch' ? `?v=${u.searchParams.get('v')}` : ''}`;
  return `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(clean)}&show_text=false&autoplay=true`;
}

/**
 * How to show Instagram's embed as just its video: the frame is pushed up by the
 * header's height inside a box the shape of the video, and what Instagram draws
 * below (View more, likes, comment) falls outside the box. Measured on the live
 * embed (2026-11-12): a 54px header, then a media box 1.25× as tall as it is wide
 * (Instagram letterboxes a tall reel inside it) when the frame has room below.
 */
export const INSTAGRAM_CROP = { header: 54, ratio: 1.25, below: 360 };

/** A cover the link itself gives us: YouTube's own thumbnail. Nothing for the others — a browser cannot read theirs. */
export function reelLinkCover(url: string | null | undefined): string | null {
  const u = parse(url);
  const id = u ? youTubeId(u) : null;
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null;
}
