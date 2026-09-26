/**
 * A gym's video link, turned into something that plays inside the app (0121).
 *
 * **Identical in both apps** (admin previews it, member plays it) — diff before
 * changing one. YouTube and Vimeo only: the database refuses any other host
 * (`is_allowed_video_url`), and Facebook/TikTok links often refuse to play
 * inside an Android app, which would look like our bug.
 *
 * YouTube goes to `youtube-nocookie.com`, which sets no tracking cookie until
 * the member presses play — a gym's workout video should not enrol its members
 * in ad tracking for having opened an exercise.
 *
 * Returns null for anything it does not recognise, and callers render nothing
 * then: an iframe pointed at a guess is a grey box with an error in it.
 */

export const ALLOWED_VIDEO_HINT = 'A YouTube or Vimeo link';

const YT_ID = /^[A-Za-z0-9_-]{11}$/;

export function embedUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  let u: URL;
  try { u = new URL(url.trim()); } catch { return null; }
  if (u.protocol !== 'https:') return null;
  const host = u.hostname.replace(/^(www|m)\./, '');
  const parts = u.pathname.split('/').filter(Boolean);

  if (host === 'youtu.be') {
    return YT_ID.test(parts[0] ?? '') ? `https://www.youtube-nocookie.com/embed/${parts[0]}` : null;
  }
  if (host === 'youtube.com') {
    const id = parts[0] === 'watch' ? u.searchParams.get('v')
      : ['shorts', 'embed', 'live'].includes(parts[0] ?? '') ? parts[1] : null;
    return id && YT_ID.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : null;
  }
  if (host === 'vimeo.com') {
    return /^\d+$/.test(parts[0] ?? '') ? `https://player.vimeo.com/video/${parts[0]}` : null;
  }
  if (host === 'player.vimeo.com') {
    return parts[0] === 'video' && /^\d+$/.test(parts[1] ?? '') ? `https://player.vimeo.com/video/${parts[1]}` : null;
  }
  return null;
}
