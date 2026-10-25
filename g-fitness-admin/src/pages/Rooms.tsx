import { useCallback, useEffect, useMemo, useState } from 'react';
import { MessageSquare, Search, Trash2, Users, Shield, Flame, HeartHandshake, UsersRound, Check, X } from 'lucide-react';
import { Av } from './attendance/parts';
import './attendance/att.css';
import { showToast } from '../utils/toast';
import { supabase } from '../lib/supabaseClient';
import { allGymRooms, memberRoomsSummary, moderateRoomItem, roomStream, type GymRoom, type StreamPost } from '../lib/api/rooms';

const KIND: Record<GymRoom['kind'], string> = { class: 'Class', pt: '1-on-1', group: 'Coaching group' };
const ICON = { class: Flame, pt: HeartHandshake, group: UsersRound };
type Kind = 'all' | GymRoom['kind'];
const ago = (iso: string | null) => {
  if (!iso) return 'nothing posted yet';
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return d <= 0 ? 'today' : d === 1 ? 'yesterday' : new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
};
const stamp = (iso: string) => new Date(iso).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/**
 * Training → Rooms (0128/0129, redrawn 2026-10-20 to the approved mock-up):
 * the rooms on the left — by name, coach or a member in them — and the one
 * open beside them, read-only for the desk. A post or comment that does not
 * belong is removed with a reason the author is told (moderate_room_item,
 * 0207). The owner and desk never post as a coach (the database refuses it).
 * The mock-up's member "flags" do not exist yet — the list says nothing it
 * cannot count.
 */
export default function Rooms() {
  const [rooms, setRooms] = useState<GymRoom[] | null | undefined>(null);
  const [open, setOpen] = useState<GymRoom | null>(null);
  const [posts, setPosts] = useState<StreamPost[] | null>(null);
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<Kind>('all');
  const [coach, setCoach] = useState('all');
  const [showClosed, setShowClosed] = useState(false);
  const [memberHit, setMemberHit] = useState<{ name: string; ids: Set<string> } | null>(null);
  const [removing, setRemoving] = useState<{ kind: 'post' | 'comment'; id: string; reason: string } | null>(null);
  const [busy, setBusy] = useState(false);

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
  const pick = (r: GymRoom) => { setOpen(r); setRemoving(null); void loadStream(r); };

  const remove = async () => {
    if (!removing || !open) return;
    setBusy(true);
    try {
      await moderateRoomItem(removing.kind, removing.id, removing.reason);
      showToast(`${removing.kind === 'post' ? 'Post' : 'Comment'} removed — they have been told why`, 'success');
      setRemoving(null);
      await loadStream(open);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'That could not be removed', 'error');
    } finally {
      setBusy(false);
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

  if (rooms === null) return <div className="att"><p className="a-sub">Loading rooms…</p></div>;
  if (rooms === undefined) return <div className="att"><div className="a-card"><p className="a-sub">Rooms are not switched on yet — migration 0128 is not live on this database.</p></div></div>;
  const count = (k: Kind) => rooms.filter((r) => (showClosed || !r.archived) && (k === 'all' || r.kind === k)).length;

  const reasonRow = (k: 'post' | 'comment', itemId: string) => removing?.id === itemId ? (
    <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
      <input className="a-in" style={{ padding: '6px 9px', fontSize: 12 }} autoFocus maxLength={200} value={removing.reason} aria-label="Why it is removed"
        onChange={(e) => setRemoving({ kind: k, id: itemId, reason: e.target.value })} placeholder="Why — the person is told" />
      <button type="button" className="a-btn violet sm" disabled={busy || !removing.reason.trim()} onClick={() => void remove()} data-confirm-remove><Check size={13} />Remove</button>
      <button type="button" className="a-btn ghost sm" aria-label="Cancel" onClick={() => setRemoving(null)}><X size={13} /></button>
    </div>
  ) : null;

  return (
    <div className="att" data-rooms>
      <div className="a-head">
        <div className="min-w-0"><h1>Rooms</h1><p>Where coaches talk to their classes and groups — you can read every room and remove what does not belong</p></div>
      </div>
      <div className="a-grid" style={{ gridTemplateColumns: '360px minmax(0, 1fr)', flex: 1 }}>
        <div className="a-card" data-room-list>
          <label className="a-input" style={{ padding: '7px 11px', fontSize: 12, marginBottom: 8 }}><Search size={14} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a room, coach or member…" aria-label="Find a room, coach or member" /></label>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
            {(['all', 'class', 'pt', 'group'] as Kind[]).map((k) => (
              <button key={k} type="button" className={`a-chip ${kind === k ? 'v' : ''}`} aria-pressed={kind === k} onClick={() => setKind(k)}>{k === 'all' ? 'All' : KIND[k]} <em>{count(k)}</em></button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8, alignItems: 'center' }}>
            <select className="a-chip" value={coach} onChange={(e) => setCoach(e.target.value)} aria-label="Coach"><option value="all">Every coach</option>{coaches.map((c) => <option key={c} value={c}>{c}</option>)}</select>
            <button type="button" className={`a-chip ${showClosed ? 'v' : ''}`} aria-pressed={showClosed} onClick={() => setShowClosed(!showClosed)}>Closed rooms</button>
          </div>
          {memberHit && q.trim() && <div className="a-sub" style={{ marginBottom: 6 }}>Including the {memberHit.ids.size} room{memberHit.ids.size === 1 ? '' : 's'} {memberHit.name} is in.</div>}
          <div className="a-scroll grow">
            {rooms.length === 0 ? <p className="a-sub">No rooms yet. A room appears for each recurring class that has a coach, and for each 1-on-1 trainee.</p>
              : shown.length === 0 ? <p className="a-sub">No room matches.</p> : shown.map((r) => {
              const Icon = ICON[r.kind];
              return (
                <button key={r.id} type="button" className="a-row w-full text-left" onClick={() => pick(r)} data-room={r.name}
                  style={{ padding: 9, borderRadius: 12, borderTop: 0, background: open?.id === r.id ? '#7c3aed14' : undefined, opacity: r.archived ? 0.55 : 1 }}>
                  <div className={`a-ic ${r.kind === 'pt' ? 'a' : ''}`} style={r.kind === 'group' ? { background: '#14323a', color: '#7ee7d4' } : undefined}><Icon size={15} /></div>
                  <div className="t"><b>{r.name}{r.archived ? ' · closed' : ''}</b><small>{r.trainerName} · {r.memberCount} member{r.memberCount === 1 ? '' : 's'} · {ago(r.lastPostAt)}</small></div>
                  <span className="a-sub" style={{ display: 'flex', alignItems: 'center', gap: 4 }}><MessageSquare size={12} />{r.postCount + r.commentCount}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="a-card glow" data-room-stream>
          {!open ? (
            <div style={{ margin: 'auto', textAlign: 'center' }}><Shield size={28} style={{ color: 'var(--a-p300)', margin: '0 auto 8px' }} />
              <b>Open a room to read it</b><div className="a-sub" style={{ marginTop: 4 }}>The stream, newest first. You can remove a post or comment; you cannot post as the coach.</div></div>
          ) : (<>
            <div className="a-ct"><div className="min-w-0"><h3 className="truncate">{open.name}</h3>
              <div className="a-sub">{KIND[open.kind]} room · {open.trainerName} · {open.memberCount} member{open.memberCount === 1 ? '' : 's'} · read-only for you</div></div>
              <span className="a-pill"><Users size={12} />{open.memberCount}</span></div>
            <div className="a-scroll grow" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {posts === null ? <p className="a-sub">Loading…</p> : posts.length === 0 ? <p className="a-sub">Nothing posted in this room yet.</p> : posts.map((p) => (
                <div key={p.id} className="a-post" data-post>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <Av name={p.authorName} small /><b>{p.authorName}</b><span className="a-sub">{stamp(p.createdAt)}</span>
                    <button type="button" className="a-btn ghost sm" style={{ marginLeft: 'auto' }} onClick={() => setRemoving({ kind: 'post', id: p.id, reason: '' })} aria-label="Remove post"><Trash2 size={13} />Remove</button>
                  </div>
                  <div style={{ marginTop: 6, whiteSpace: 'pre-wrap' }}>{p.body}</div>
                  {p.photoUrl && <img src={p.photoUrl} alt="" style={{ marginTop: 8, borderRadius: 10, width: '100%', maxHeight: 220, objectFit: 'cover' }} />}
                  {p.videoUrl && <div className="a-sub" style={{ marginTop: 4, color: 'var(--a-p300)' }}>{p.videoUrl}</div>}
                  {reasonRow('post', p.id)}
                  {p.comments.map((c) => (
                    <div key={c.id}>
                      <div className="a-rep" style={{ marginTop: 8, padding: '8px 10px', borderRadius: 10, background: '#0f0f19', fontSize: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
                        <Av name={c.author} small /><div style={{ flex: 1, minWidth: 0 }}><b>{c.author}</b>{c.isTrainer ? <span className="a-pill v" style={{ marginLeft: 6 }}>coach</span> : null} {c.body}</div>
                        <button type="button" className="a-btn ghost sm" onClick={() => setRemoving({ kind: 'comment', id: c.id, reason: '' })} aria-label={`Remove comment by ${c.author}`}><Trash2 size={12} /></button>
                      </div>
                      {reasonRow('comment', c.id)}
                    </div>
                  ))}
                </div>
              ))}
            </div>
            <div className="a-hint" style={{ marginTop: 10 }}><Shield size={14} /><span>You can remove a post or comment, and the person is told why. You cannot post as the coach.</span></div>
          </>)}
        </div>
      </div>
    </div>
  );
}
