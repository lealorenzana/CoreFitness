import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, MessageSquare, Trash2, X } from 'lucide-react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import { showToast } from '../utils/toast';
import { allGymRooms, removeComment, removePost, roomStream, type GymRoom, type StreamPost } from '../lib/api/rooms';

const MUTED = 'var(--color-text-muted)';
const KIND: Record<GymRoom['kind'], string> = { class: 'Class', pt: '1-on-1', group: 'Coaching group' };

/**
 * Training → Rooms (0128/0129): the trainers' Google Classroom, seen from the
 * desk. Every room in the gym, by trainer, with how active it is; open one to
 * read its stream and remove a post or comment that should not be there.
 *
 * The owner and desk moderate; they never post as a trainer (the database
 * refuses it). Classwork and hand-ins stay between each member and their coach
 * — this page shows the conversation, not anyone's answers.
 */
export default function Rooms() {
  const [rooms, setRooms] = useState<GymRoom[] | null | undefined>(null);
  const [open, setOpen] = useState<GymRoom | null>(null);
  const [posts, setPosts] = useState<StreamPost[] | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => { const r = await allGymRooms(); if (alive) setRooms(r); })();
    return () => { alive = false; };
  }, []);

  const loadStream = useCallback(async (room: GymRoom) => {
    setPosts(null);
    try { setPosts(await roomStream(room.id)); } catch { setPosts([]); }
  }, []);

  const remove = async (fn: () => Promise<void>, what: string) => {
    try {
      await fn();
      showToast(`${what} removed`, 'success');
      if (open) await loadStream(open);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'That could not be removed', 'error');
    }
  };

  if (rooms === null) return <div className="text-sm" style={{ color: MUTED }}>Loading rooms…</div>;
  if (rooms === undefined) {
    return (
      <Card className="!p-4">
        <div className="flex items-start gap-2">
          <AlertTriangle size={14} className="mt-0.5" style={{ color: 'var(--color-secondary)' }} />
          <p className="text-xs text-white">Rooms are not switched on yet — paste migration 0128 (System shows what is missing).</p>
        </div>
      </Card>
    );
  }

  const byTrainer = [...new Set(rooms.map((r) => r.trainerName))].map((t) => ({ trainer: t, rooms: rooms.filter((r) => r.trainerName === t) }));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white">Rooms</h1>
        <p className="text-xs mt-1" style={{ color: MUTED }}>
          Your trainers' rooms — one per recurring class, per 1-on-1 trainee, and each coaching group · {rooms.length} rooms
        </p>
      </div>

      {rooms.length === 0 && (
        <Card className="!p-6 text-center">
          <p className="text-xs" style={{ color: MUTED }}>
            No rooms yet. A room appears for each recurring class that has a trainer, and for each 1-on-1 trainee.
          </p>
        </Card>
      )}

      {byTrainer.map(({ trainer, rooms: list }) => (
        <Card key={trainer} className="!p-4">
          <p className="text-[10px] font-semibold uppercase mb-2" style={{ color: 'var(--color-primary)' }}>{trainer}</p>
          <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
            {list.map((r) => (
              <button key={r.id} type="button" onClick={() => { setOpen(r); void loadStream(r); }}
                className="text-left px-3 py-2.5 rounded-lg"
                style={{ background: 'var(--color-surface-high)', border: '1px solid var(--color-border)', opacity: r.archived ? 0.5 : 1 }}>
                <p className="text-xs font-semibold text-white truncate">{r.name}</p>
                <p className="text-[10px] mt-0.5" style={{ color: MUTED }}>
                  {KIND[r.kind]} · {r.memberCount} member{r.memberCount === 1 ? '' : 's'} · {r.postCount} post{r.postCount === 1 ? '' : 's'}
                  {r.commentCount ? ` · ${r.commentCount} comments` : ''}{r.archived ? ' · closed' : ''}
                </p>
              </button>
            ))}
          </div>
        </Card>
      ))}

      {open && (
        <Card className="!p-4">
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className="text-sm font-bold text-white">{open.name}</p>
              <p className="text-[10px]" style={{ color: MUTED }}>{KIND[open.kind]} · {open.trainerName} · the stream, newest first</p>
            </div>
            <button aria-label="Close the stream" onClick={() => setOpen(null)} style={{ color: MUTED }}><X size={16} /></button>
          </div>
          {posts === null ? (
            <p className="text-xs" style={{ color: MUTED }}>Loading…</p>
          ) : posts.length === 0 ? (
            <p className="text-xs" style={{ color: MUTED }}>Nothing posted in this room yet.</p>
          ) : (
            <div className="space-y-3">
              {posts.map((p) => (
                <div key={p.id} className="rounded-lg p-3" style={{ background: 'var(--color-surface-high)', border: '1px solid var(--color-border)' }}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[10px]" style={{ color: MUTED }}>
                      {p.authorName} · {new Date(p.createdAt).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    </p>
                    <Button size="sm" variant="ghost" aria-label="Remove post" onClick={() => void remove(() => removePost(p.id), 'Post')}>
                      <Trash2 size={12} /> Remove
                    </Button>
                  </div>
                  <p className="text-xs text-white mt-1 whitespace-pre-wrap">{p.body}</p>
                  {p.videoUrl && <p className="text-[10px] mt-1" style={{ color: 'var(--color-primary)' }}>{p.videoUrl}</p>}
                  {p.comments.map((c) => (
                    <div key={c.id} className="flex items-start justify-between gap-2 mt-2 pl-3" style={{ borderLeft: '2px solid var(--color-border)' }}>
                      <p className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
                        <MessageSquare size={10} className="inline mr-1" />
                        <span className="font-semibold text-white">{c.author}</span> {c.body}
                      </p>
                      <button aria-label={`Remove comment by ${c.author}`} onClick={() => void remove(() => removeComment(c.id), 'Comment')}
                        style={{ color: MUTED }}><Trash2 size={12} /></button>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
