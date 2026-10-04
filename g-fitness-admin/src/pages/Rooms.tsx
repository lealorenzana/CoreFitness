import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, MessageSquare, Search, Trash2, Users } from 'lucide-react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import DetailSheet from '../components/ui/DetailSheet';
import { PageHeader } from '../components/ui/kit';
import { showToast } from '../utils/toast';
import { supabase } from '../lib/supabaseClient';
import { allGymRooms, memberRoomsSummary, removeComment, removePost, roomStream, type GymRoom, type StreamPost } from '../lib/api/rooms';

const MUTED = 'var(--color-text-muted)';
const FIELD = { background: 'var(--color-surface-high)', border: '1px solid var(--color-border)' };
const KIND: Record<GymRoom['kind'], string> = { class: 'Class', pt: '1-on-1', group: 'Coaching group' };
type Kind = 'all' | GymRoom['kind'];

const ago = (iso: string | null) => {
  if (!iso) return 'nothing posted yet';
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return d <= 0 ? 'active today' : d === 1 ? 'active yesterday' : `last post ${d} days ago`;
};

/**
 * Training → Rooms (0128/0129): the trainers' Google Classroom, seen from the
 * desk. Find a room by its name, its coach or one of its members; filter by
 * kind and coach; open one beside the list to read its stream and remove a post
 * or comment that should not be there.
 *
 * The owner and desk moderate; they never post as a trainer (the database
 * refuses it). Classwork and hand-ins stay between each member and their coach.
 */
export default function Rooms() {
  const [rooms, setRooms] = useState<GymRoom[] | null | undefined>(null);
  const [open, setOpen] = useState<GymRoom | null>(null);
  const [posts, setPosts] = useState<StreamPost[] | null>(null);
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<Kind>('all');
  const [coach, setCoach] = useState('all');
  const [showClosed, setShowClosed] = useState(false);
  /** Rooms a member searched for is in (member_rooms), keyed by their name. */
  const [memberHit, setMemberHit] = useState<{ name: string; ids: Set<string> } | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => { const r = await allGymRooms(); if (alive) setRooms(r); })();
    return () => { alive = false; };
  }, []);

  // A search that is a member's name finds the rooms they are in.
  useEffect(() => {
    let alive = true;
    const term = q.trim();
    const t = window.setTimeout(() => {
      void (async () => {
        if (term.length < 3) { if (alive) setMemberHit(null); return; }
        const safe = term.replace(/[,()%]/g, ' ');
        const { data } = await supabase.from('gym_people').select('id, first_name, last_name').eq('role', 'member')
          .or(`first_name.ilike.%${safe}%,last_name.ilike.%${safe}%`).limit(1);
        const m = (data ?? [])[0] as { id: string; first_name: string; last_name: string } | undefined;
        if (!m) { if (alive) setMemberHit(null); return; }
        const sum = await memberRoomsSummary(m.id);
        if (alive) setMemberHit(sum ? { name: `${m.first_name} ${m.last_name}`, ids: new Set(sum.rooms.map((r) => r.id)) } : null);
      })();
    }, 300);
    return () => { alive = false; window.clearTimeout(t); };
  }, [q]);

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

  const coaches = useMemo(() => [...new Set((rooms ?? []).map((r) => r.trainerName))].sort(), [rooms]);
  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (rooms ?? [])
      .filter((r) => (showClosed || !r.archived) && (kind === 'all' || r.kind === kind) && (coach === 'all' || r.trainerName === coach))
      .filter((r) => !term || r.name.toLowerCase().includes(term) || r.trainerName.toLowerCase().includes(term) || memberHit?.ids.has(r.id))
      .sort((a, b) => (b.lastPostAt ?? '').localeCompare(a.lastPostAt ?? '') || a.name.localeCompare(b.name));
  }, [rooms, q, kind, coach, showClosed, memberHit]);

  if (rooms === null) return <div className="text-sm" style={{ color: MUTED }}>Loading rooms…</div>;
  if (rooms === undefined) {
    return (
      <Card className="!p-4">
        <div className="flex items-start gap-2">
          <AlertTriangle size={14} className="mt-0.5" style={{ color: 'var(--color-secondary)' }} />
          <p className="text-xs text-white">Rooms are not switched on yet — migration 0128 is not live on this database.</p>
        </div>
      </Card>
    );
  }

  const count = (k: Kind) => rooms.filter((r) => (showClosed || !r.archived) && (k === 'all' || r.kind === k)).length;

  return (
    <div className="space-y-4">
      <PageHeader title="Rooms"
        subtitle={`Your coaches' rooms — one per recurring class, per 1-on-1 trainee, and each coaching group · ${rooms.filter((r) => !r.archived).length} open`} />

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1" style={{ minWidth: 220 }}>
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: MUTED }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a room, coach or member" aria-label="Find a room, coach or member"
            className="w-full h-9 pl-9 pr-3 rounded-lg text-xs text-white" style={FIELD} />
        </div>
        {(['all', 'class', 'pt', 'group'] as Kind[]).map((k) => (
          <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)} className="h-9 px-3 rounded-lg text-xs font-semibold"
            style={{ background: kind === k ? 'var(--color-primary-light)' : 'var(--color-surface-high)', color: kind === k ? 'var(--color-primary)' : 'var(--color-text-secondary)',
              border: `1px solid ${kind === k ? 'var(--color-primary)' : 'var(--color-border)'}` }}>
            {k === 'all' ? 'All' : KIND[k]} <span style={{ opacity: 0.7 }}>{count(k)}</span>
          </button>
        ))}
        <select value={coach} onChange={(e) => setCoach(e.target.value)} aria-label="Coach" className="h-9 px-2 rounded-lg text-xs text-white" style={FIELD}>
          <option value="all">Every coach</option>
          {coaches.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
          <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} /> Closed rooms
        </label>
      </div>
      {memberHit && q.trim() && (
        <p className="text-[11px]" style={{ color: MUTED }}>Including the {memberHit.ids.size} room{memberHit.ids.size === 1 ? '' : 's'} {memberHit.name} is in.</p>
      )}

      {rooms.length === 0 ? (
        <Card className="!p-6 text-center">
          <p className="text-xs" style={{ color: MUTED }}>No rooms yet. A room appears for each recurring class that has a coach, and for each 1-on-1 trainee.</p>
        </Card>
      ) : shown.length === 0 ? (
        <p className="text-xs py-6 text-center" style={{ color: MUTED }}>No room matches.</p>
      ) : (
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--color-border)' }}>
          {shown.map((r, i) => (
            <button key={r.id} type="button" onClick={() => { setOpen(r); void loadStream(r); }}
              className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-white/5"
              style={{ background: open?.id === r.id ? 'var(--color-primary-light)' : 'var(--color-surface)', borderTop: i ? '1px solid var(--color-border)' : undefined, opacity: r.archived ? 0.55 : 1 }}>
              <span className="text-[10px] font-bold uppercase w-20 flex-shrink-0" style={{ color: 'var(--color-primary)' }}>{KIND[r.kind]}</span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-semibold text-white truncate">{r.name}{r.archived ? ' · closed' : ''}</span>
                <span className="block text-[11px] truncate" style={{ color: MUTED }}>{r.trainerName} · {ago(r.lastPostAt)}</span>
              </span>
              <span className="text-[11px] flex items-center gap-3 flex-shrink-0" style={{ color: 'var(--color-text-secondary)' }}>
                <span className="flex items-center gap-1"><Users size={12} /> {r.memberCount}</span>
                <span className="flex items-center gap-1"><MessageSquare size={12} /> {r.postCount + r.commentCount}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      <DetailSheet open={!!open} onClose={() => setOpen(null)} width={520}
        title={open?.name ?? ''} subtitle={open ? `${KIND[open.kind]} · ${open.trainerName} · ${open.memberCount} member${open.memberCount === 1 ? '' : 's'}` : undefined}>
        {posts === null ? (
          <p className="text-xs" style={{ color: MUTED }}>Loading…</p>
        ) : posts.length === 0 ? (
          <p className="text-xs" style={{ color: MUTED }}>Nothing posted in this room yet.</p>
        ) : (
          <div className="space-y-3">
            <p className="text-[11px]" style={{ color: MUTED }}>The stream, newest first. You can remove a post or comment; you cannot post as the coach.</p>
            {posts.map((p) => (
              <div key={p.id} className="rounded-lg p-3" style={FIELD}>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[11px]" style={{ color: MUTED }}>
                    {p.authorName} · {new Date(p.createdAt).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  </p>
                  <Button size="sm" variant="ghost" aria-label="Remove post" onClick={() => void remove(() => removePost(p.id), 'Post')}>
                    <Trash2 size={12} /> Remove
                  </Button>
                </div>
                <p className="text-xs text-white mt-1 whitespace-pre-wrap">{p.body}</p>
                {p.photoUrl && <img src={p.photoUrl} alt="" className="mt-2 rounded-lg w-full object-cover" style={{ maxHeight: 220 }} />}
                {p.videoUrl && <p className="text-[11px] mt-1" style={{ color: 'var(--color-primary)' }}>{p.videoUrl}</p>}
                {p.comments.map((c) => (
                  <div key={c.id} className="flex items-start justify-between gap-2 mt-2 pl-3" style={{ borderLeft: '2px solid var(--color-border)' }}>
                    <p className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
                      <MessageSquare size={10} className="inline mr-1" />
                      <span className="font-semibold text-white">{c.author}</span> {c.body}
                    </p>
                    <button aria-label={`Remove comment by ${c.author}`} onClick={() => void remove(() => removeComment(c.id), 'Comment')} style={{ color: MUTED }}><Trash2 size={12} /></button>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </DetailSheet>
    </div>
  );
}
