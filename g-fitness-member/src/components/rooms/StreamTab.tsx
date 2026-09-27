import { useCallback, useEffect, useState } from 'react';
import { ChatCircle, Image as ImageIcon, Trash } from '@phosphor-icons/react';
import { NocButton, Panel } from '../ui/noc';
import { TextArea, TextInput } from '../ui/Field';
import { SkeletonList } from '../ui/Skeleton';
import { toast } from '../ui/Toast';
import { errorMessage } from '../../utils/errorMessage';
import { embedUrl, ALLOWED_VIDEO_HINT } from '../../lib/videoEmbed';
import { uploadContentPhoto } from '../../lib/api/exerciseMedia';
import {
  addComment, addPost, deleteComment, deletePost, roomStream, type Room, type RoomPost,
} from '../../lib/api/rooms';

/**
 * A room's Stream (0128): the trainer's posts, newest first, with members'
 * comments under each. Only the room's trainer writes a post; a member with
 * the plan feature comments (first name + initial is what other members see —
 * the database decides the name, not this screen). Hand-ins never appear here.
 */
export default function StreamTab({ room, canPost, canComment }: { room: Room; canPost: boolean; canComment: boolean }) {
  const [posts, setPosts] = useState<RoomPost[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [body, setBody] = useState('');
  const [video, setVideo] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try { setPosts(await roomStream(room.id)); setFailed(false); }
    catch { setFailed(true); setPosts([]); }
  }, [room.id]);
  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  const run = async (fn: () => Promise<void>, ok?: string) => {
    setBusy(true);
    try { await fn(); if (ok) toast.success(ok); await load(); }
    catch (e) { toast.error(errorMessage(e, 'That did not work')); }
    finally { setBusy(false); }
  };

  const post = () => run(async () => {
    if (video.trim() && !embedUrl(video.trim())) throw new Error(`${ALLOWED_VIDEO_HINT} only.`);
    await addPost(room.id, body, video.trim() || null, photo);
    setBody(''); setVideo(''); setPhoto(null);
  }, 'Posted to the room.');

  const pickPhoto = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try { setPhoto(await uploadContentPhoto(file)); }
    catch (e) { toast.error(errorMessage(e, 'That photo could not be added')); }
    finally { setBusy(false); }
  };

  if (posts === null) return <SkeletonList />;
  const muted = { color: 'var(--color-text-muted)' } as const;

  return (
    <div className="flex flex-col" style={{ gap: 14 }}>
      {canPost && !room.archived && (
        <Panel>
          <TextArea value={body} onChange={(e) => setBody(e.target.value.slice(0, 2000))} rows={3}
            placeholder="Announce something to your room" aria-label="New post" />
          <TextInput value={video} onChange={(e) => setVideo(e.target.value)} style={{ marginTop: 8 }}
            placeholder="YouTube or Vimeo link (optional)" aria-label="Video link" />
          {photo && <img src={photo} alt="" style={{ marginTop: 8, width: '100%', borderRadius: 12, maxHeight: 220, objectFit: 'cover' }} />}
          <div className="flex items-center justify-between" style={{ marginTop: 10, gap: 8 }}>
            <label className="flex items-center" style={{ gap: 6, fontSize: 13, color: 'var(--color-text-secondary)', cursor: 'pointer' }}>
              <ImageIcon size={18} aria-hidden /> {photo ? 'Change photo' : 'Photo'}
              <input type="file" accept="image/*" className="hidden" disabled={busy}
                onChange={(e) => void pickPhoto(e.target.files?.[0])} />
            </label>
            <NocButton variant="action" disabled={busy || !body.trim()} onClick={() => void post()}>Post</NocButton>
          </div>
        </Panel>
      )}

      {failed && <p style={{ fontSize: 13, ...muted }}>The stream could not load. Pull to refresh or try again.</p>}
      {!failed && posts.length === 0 && (
        <p style={{ fontSize: 13, ...muted }}>
          {canPost ? 'Nothing posted yet. Your first post reaches everyone in this room.' : 'Your coach has not posted here yet.'}
        </p>
      )}

      {posts.map((p) => {
        const vid = embedUrl(p.videoUrl);
        return (
          <Panel key={p.id}>
            <div className="flex items-start justify-between" style={{ gap: 8 }}>
              <div>
                <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)' }}>{p.authorName}</p>
                <p style={{ fontSize: 12, ...muted }}>{new Date(p.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</p>
              </div>
              {p.canDelete && (
                <button aria-label="Remove post" onClick={() => void run(() => deletePost(p.id), 'Post removed.')}
                  style={{ color: 'var(--color-text-muted)', padding: 4 }}><Trash size={16} /></button>
              )}
            </div>
            <p style={{ fontSize: 14, marginTop: 8, whiteSpace: 'pre-wrap', color: 'var(--color-text-primary)' }}>{p.body}</p>
            {p.photoUrl && <img src={p.photoUrl} alt="" loading="lazy" style={{ marginTop: 10, width: '100%', borderRadius: 12, maxHeight: 280, objectFit: 'cover' }} />}
            {vid && (
              <div style={{ position: 'relative', paddingTop: '56.25%', marginTop: 10, borderRadius: 12, overflow: 'hidden' }}>
                <iframe src={vid} title="Video from your coach" loading="lazy"
                  allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowFullScreen
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }} />
              </div>
            )}

            {(p.comments.length > 0 || (canComment && room.commentsOn && !room.archived)) && (
              <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--color-border)' }}>
                {p.comments.map((c) => (
                  <div key={c.id} className="flex items-start justify-between" style={{ gap: 8, padding: '4px 0' }}>
                    <p style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
                      <span style={{ fontWeight: 700, color: c.isTrainer ? 'var(--color-primary-300)' : 'var(--color-text-primary)' }}>{c.author}</span>
                      {' '}{c.body}
                    </p>
                    {c.canDelete && (
                      <button aria-label="Remove comment" onClick={() => void run(() => deleteComment(c.id))}
                        style={{ color: 'var(--color-text-muted)', padding: 2 }}><Trash size={14} /></button>
                    )}
                  </div>
                ))}
                {canComment && room.commentsOn && !room.archived && (
                  <div className="flex items-center" style={{ gap: 8, marginTop: 6 }}>
                    <ChatCircle size={16} aria-hidden style={muted} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <TextInput value={drafts[p.id] ?? ''} placeholder="Add a comment" aria-label="Add a comment"
                        onChange={(e) => setDrafts({ ...drafts, [p.id]: e.target.value.slice(0, 1000) })} />
                    </div>
                    <button type="button" className="flex-none" disabled={busy || !(drafts[p.id] ?? '').trim()}
                      style={{ fontSize: 13, fontWeight: 700, padding: '8px 4px', color: 'var(--color-secondary)',
                        opacity: busy || !(drafts[p.id] ?? '').trim() ? 0.45 : 1 }}
                      onClick={() => void run(async () => { await addComment(p.id, drafts[p.id]); setDrafts({ ...drafts, [p.id]: '' }); })}>
                      Send
                    </button>
                  </div>
                )}
              </div>
            )}
          </Panel>
        );
      })}
    </div>
  );
}
