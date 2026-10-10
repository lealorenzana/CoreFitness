import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Camera, CaretRight, House, Plus } from '@phosphor-icons/react';
import { NocButton } from '../../components/ui/noc';
import { Field, TextArea, TextInput } from '../../components/ui/Field';
import GlassSheet from '../../components/ui/GlassSheet';
import Avatar from '../../components/ui/Avatar';
import { SkeletonList } from '../../components/ui/Skeleton';
import { toast } from '../../components/ui/Toast';
import { errorMessage } from '../../utils/errorMessage';
import { supabase } from '../../lib/supabaseClient';
import {
  createGroup, myRoomPhotos, myRooms, reviewQueue, setRoomPhoto, syncRooms, type ReviewItem, type Room,
} from '../../lib/api/rooms';
import { uploadContentPhoto } from '../../lib/api/exerciseMedia';
import { myPresence, setMyPresence, PRESENCE_LABEL, type Presence } from '../../lib/api/presence';

/**
 * The trainer's Rooms, Discord style (2026-10-10, the layout picked from the
 * mockups). A rail of round pictures down the left — Home, then Classes,
 * 1-on-1 and Groups, each room's own picture (0178) with an amber count when
 * something waits — beside the open room's channels. Tapping a channel opens
 * it over the list (the room page slides in), and Back slides it away. The
 * coach's own profile sits in the corner with their status: Available, Away
 * or On leave, which members see on the coach's card.
 *
 * The open room is in the address (`?room=`), so Back from a channel returns
 * to the same room's list.
 */
type Group = { kind: Room['kind']; label: string };
const GROUPS: Group[] = [
  { kind: 'class', label: 'Classes' },
  { kind: 'pt', label: '1-on-1' },
  { kind: 'group', label: 'Groups' },
];
const PRESENCE_TONE: Record<Presence, string> = {
  available: 'var(--color-primary-300)', away: 'var(--color-secondary)', on_leave: 'var(--color-text-muted)',
};

export default function TrainerRooms() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [rooms, setRooms] = useState<Room[] | null | undefined>(null);
  const [photos, setPhotos] = useState<Map<string, string | null>>(new Map());
  const [queue, setQueue] = useState<ReviewItem[]>([]);
  const [me, setMe] = useState<{ id: string; name: string; photo: string | null } | null>(null);
  const [presence, setPresence] = useState<Presence>('available');
  const [statusOpen, setStatusOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [about, setAbout] = useState('');
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    await syncRooms();
    const { data } = await supabase.auth.getUser();
    const uid = data.user?.id ?? null;
    const [r, q, ph, prof, pres] = await Promise.all([
      myRooms(), reviewQueue(), myRoomPhotos(),
      uid ? supabase.from('profiles').select('first_name, last_name, photo_url').eq('id', uid).maybeSingle() : Promise.resolve({ data: null }),
      uid ? myPresence(uid) : Promise.resolve('available' as Presence),
    ]);
    setRooms(r); setQueue(q); setPhotos(ph); setPresence(pres);
    const p = (prof as { data: { first_name: string | null; last_name: string | null; photo_url: string | null } | null }).data;
    if (uid) setMe({ id: uid, name: [p?.first_name, p?.last_name].filter(Boolean).join(' ') || 'You', photo: p?.photo_url ?? null });
  }, []);
  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  const open = rooms?.find((r) => r.id === params.get('room')) ?? null;
  const select = (id: string | null) => setParams(id ? { room: id } : {}, { replace: true });
  const active = useMemo(() => (rooms ?? []).filter((r) => !r.archived), [rooms]);

  const create = async () => {
    setBusy(true);
    try {
      const id = await createGroup(name, about);
      toast.success('Group started. Share its code from People.');
      setCreating(false); setName(''); setAbout('');
      navigate(`/trainer/rooms/${id}?tab=people`);
    } catch (e) {
      toast.error(errorMessage(e, 'The group could not be started'));
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = async (p: Presence) => {
    try { await setMyPresence(p); setPresence(p); setStatusOpen(false); toast.success(`You are ${PRESENCE_LABEL[p].toLowerCase()}`); }
    catch (e) { toast.error(errorMessage(e, 'Could not change your status')); }
  };

  const pickPhoto = async (file: File | undefined) => {
    if (!file || !open) return;
    try {
      const url = await uploadContentPhoto(file);
      await setRoomPhoto(open.id, url);
      setPhotos((m) => new Map(m).set(open.id, url));
      toast.success('Room picture set.');
    } catch (e) { toast.error(errorMessage(e, 'Could not set the picture')); }
  };

  if (rooms === null) return <SkeletonList />;
  if (rooms === undefined) {
    return (
      <div style={{ padding: 'var(--gutter)' }}>
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Rooms are not switched on at your gym yet.</p>
        <NocButton variant="ghost" onClick={() => navigate('/trainer/members')}>All my members</NocButton>
      </div>
    );
  }

  const bubble = (r: Room) => {
    const on = open?.id === r.id;
    const pic = photos.get(r.id) ?? null;
    return (
      <button key={r.id} type="button" onClick={() => select(r.id)} aria-label={r.name} aria-pressed={on} data-rail-room={r.id}
        className="relative flex-none noc-press" style={{ width: 46, height: 46 }}>
        {pic
          ? <img src={pic} alt="" style={{ width: 46, height: 46, objectFit: 'cover', borderRadius: on ? 15 : 23, transition: 'border-radius .15s',
              outline: on ? '2px solid var(--color-primary-300)' : 'none', outlineOffset: 2 }} />
          : <span className="grid place-items-center" style={{ width: 46, height: 46, borderRadius: on ? 15 : 23, transition: 'border-radius .15s',
              fontSize: 13, fontWeight: 800, color: '#fff', background: r.kind === 'pt' ? 'var(--color-primary)' : 'color-mix(in srgb, var(--color-primary) 55%, #1a1726)',
              outline: on ? '2px solid var(--color-primary-300)' : 'none', outlineOffset: 2 }}>
              {initials(r.name)}
            </span>}
        {r.toReview > 0 && (
          <span className="absolute grid place-items-center" style={{ top: -3, right: -3, minWidth: 18, height: 18, padding: '0 4px', borderRadius: 9,
            fontSize: 11, fontWeight: 800, background: 'var(--color-secondary)', color: 'var(--color-bg)' }}>{r.toReview}</span>
        )}
      </button>
    );
  };

  const channels = open
    ? (open.kind === 'pt'
      ? [['together', 'Together'], ['classwork', 'Classwork'], ['progress', 'Progress']]
      : [['stream', 'Stream'], ['classwork', 'Classwork'], ['people', `People · ${open.memberCount}`], ['progress', 'Progress']])
    : [];

  return (
    <div className="flex" data-discord-rooms style={{ flex: 1, minHeight: 'calc(100dvh - 300px)', margin: '0 calc(var(--gutter) * -1)' }}>
      {/* ---- the rail ---- */}
      <nav aria-label="Your rooms" className="flex flex-col items-center"
        style={{ width: 68, flex: 'none', gap: 10, padding: '12px 0 80px', background: 'color-mix(in srgb, var(--color-bg) 70%, #000)', overflowY: 'auto' }}>
        <button type="button" onClick={() => select(null)} aria-label="Home" aria-pressed={!open} data-rail-home
          className="relative grid place-items-center noc-press"
          style={{ width: 46, height: 46, borderRadius: open ? 23 : 15, background: 'var(--color-primary)', color: '#fff', transition: 'border-radius .15s' }}>
          <House size={22} weight="fill" />
          {queue.length > 0 && (
            <span className="absolute grid place-items-center" style={{ top: -3, right: -3, minWidth: 18, height: 18, padding: '0 4px', borderRadius: 9,
              fontSize: 11, fontWeight: 800, background: 'var(--color-secondary)', color: 'var(--color-bg)' }}>{queue.length}</span>
          )}
        </button>
        <span aria-hidden style={{ width: 28, height: 2, borderRadius: 2, background: 'var(--color-border)' }} />
        {GROUPS.map((g) => {
          const list = active.filter((r) => r.kind === g.kind);
          if (list.length === 0) return null;
          return (
            <div key={g.kind} className="flex flex-col items-center" style={{ gap: 10 }} data-rail-group={g.kind}>
              <span style={{ fontSize: 10, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>{g.label}</span>
              {list.map(bubble)}
            </div>
          );
        })}
        <button type="button" onClick={() => setCreating(true)} aria-label="New group" className="grid place-items-center noc-press"
          style={{ width: 46, height: 46, borderRadius: 23, border: '1px dashed var(--color-border)', color: 'var(--color-primary-300)' }}>
          <Plus size={20} />
        </button>
      </nav>

      {/* ---- the channel column ---- */}
      <section className="flex-1 min-w-0 flex flex-col" style={{ padding: '12px 14px 80px', background: 'var(--color-surface)' }}>
        {!open ? (
          <>
            <p style={{ fontSize: 17, fontWeight: 800, color: 'var(--color-text-primary)' }}>Home</p>
            <p style={{ fontSize: 12.5, marginTop: 2, color: 'var(--color-text-muted)' }}>Pick a room on the left, or start here.</p>
            <div className="flex flex-col" style={{ marginTop: 14, gap: 4 }}>
              {queue.length > 0 && <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-secondary)', marginTop: 4 }}>{queue.length} to review</p>}
              {queue.slice(0, 6).map((q) => (
                <Channel key={q.submissionId} label={`${q.memberName} · ${q.title}`} meta={`${q.roomName}${q.late ? ' · late' : ''}`}
                  onClick={() => navigate(`/trainer/rooms/${q.roomId}/work/${q.assignmentId}`)} />
              ))}
              {queue.length === 0 && <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 4 }}>Nothing waiting for your comment.</p>}
              {rooms.some((r) => r.archived) && (
                <>
                  <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-muted)', marginTop: 10 }}>Closed</p>
                  {rooms.filter((r) => r.archived).map((r) => <Channel key={r.id} label={r.name} dim onClick={() => navigate(`/trainer/rooms/${r.id}`)} />)}
                </>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center" style={{ gap: 10 }}>
              <div className="min-w-0 flex-1">
                <p className="truncate" style={{ fontSize: 17, fontWeight: 800, color: 'var(--color-text-primary)' }}>{open.name}</p>
                <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                  {open.kind === 'pt' ? '1-on-1' : open.kind === 'class' ? 'Class' : 'Coaching group'}{open.dueSoon ? ` · ${open.dueSoon} due this week` : ''}
                </p>
              </div>
              {open.kind !== 'pt' && open.isMine && (
                <button type="button" aria-label="Set the room picture" onClick={() => fileInput.current?.click()}
                  className="grid place-items-center noc-press" style={{ width: 36, height: 36, borderRadius: 18, border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
                  <Camera size={17} />
                </button>
              )}
              <input ref={fileInput} type="file" accept="image/*" hidden onChange={(e) => void pickPhoto(e.target.files?.[0])} />
            </div>
            <p style={{ fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginTop: 16 }}>Room</p>
            <div className="flex flex-col" style={{ gap: 2, marginTop: 4 }} data-channels>
              {channels.map(([tab, label]) => (
                <Channel key={tab} label={`# ${label}`} badge={tab === 'classwork' && open.toReview ? open.toReview : undefined}
                  onClick={() => navigate(`/trainer/rooms/${open.id}${tab === (open.kind === 'pt' ? 'together' : 'stream') ? '' : `?tab=${tab}`}`)} />
              ))}
            </div>
          </>
        )}
      </section>

      {/* ---- the coach, bottom-left: who they are and whether they are around ---- */}
      {me && (
        <button type="button" onClick={() => setStatusOpen(true)} data-presence={presence}
          className="fixed flex items-center noc-press"
          style={{ left: 8, bottom: 'calc(var(--bar-height, 64px) + 8px)', gap: 8, padding: '6px 10px 6px 6px', borderRadius: 24,
            background: 'color-mix(in srgb, var(--color-bg) 85%, #000)', border: '1px solid var(--color-border)', zIndex: 20 }}>
          <span className="relative">
            <Avatar name={me.name} photoUrl={me.photo} size={30} />
            <span className="absolute" style={{ right: -1, bottom: -1, width: 11, height: 11, borderRadius: 6, border: '2px solid var(--color-bg)', background: PRESENCE_TONE[presence] }} />
          </span>
          <span className="text-left">
            <span className="block" style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--color-text-primary)' }}>{me.name.split(' ')[0]}</span>
            <span className="block" style={{ fontSize: 11, color: PRESENCE_TONE[presence] }}>{PRESENCE_LABEL[presence]}</span>
          </span>
        </button>
      )}

      <GlassSheet open={statusOpen} onClose={() => setStatusOpen(false)} title="Your status" subtitle="Members see it on your card">
        <div className="flex flex-col" style={{ gap: 8, padding: '0 var(--gutter) 16px' }}>
          {(['available', 'away', 'on_leave'] as Presence[]).map((p) => (
            <button key={p} type="button" onClick={() => void changeStatus(p)} aria-pressed={presence === p}
              className="flex items-center noc-press" style={{ gap: 10, padding: 12, borderRadius: 12,
                border: `1px solid ${presence === p ? 'var(--color-primary)' : 'var(--color-border)'}` }}>
              <span style={{ width: 12, height: 12, borderRadius: 6, background: PRESENCE_TONE[p] }} />
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}>{PRESENCE_LABEL[p]}</span>
              <span style={{ fontSize: 12, marginLeft: 'auto', color: 'var(--color-text-muted)' }}>
                {p === 'on_leave' ? 'Your members pick a stand-in for now' : p === 'away' ? 'Back soon' : 'Taking members and messages'}
              </span>
            </button>
          ))}
          <NocButton variant="ghost" onClick={() => navigate('/trainer/profile')}>Your profile</NocButton>
          <NocButton variant="ghost" onClick={() => navigate('/trainer/settings')}>Settings</NocButton>
        </div>
      </GlassSheet>

      <GlassSheet open={creating} onClose={() => setCreating(false)} title="New coaching group"
        subtitle="Members join with a 6-letter code"
        footer={<NocButton variant="action" className="w-full" disabled={busy || name.trim().length < 2} onClick={() => void create()}>Start the group</NocButton>}>
        <div className="flex flex-col" style={{ gap: 14 }}>
          <Field label="Name">
            <TextInput value={name} maxLength={80} placeholder="e.g. 8-week fat loss" aria-label="Group name" onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="What it is for (optional)">
            <TextArea value={about} rows={3} aria-label="Group description" onChange={(e) => setAbout(e.target.value.slice(0, 500))}
              placeholder="Two check-ins a week, one workout, weigh-in on Mondays." />
          </Field>
        </div>
      </GlassSheet>
    </div>
  );
}

function initials(name: string): string {
  const parts = name.replace(/[·|]/g, ' ').split(/\s+/).filter(Boolean);
  return (parts.slice(0, 2).map((p) => p[0]).join('') || '?').toUpperCase();
}

function Channel({ label, meta, badge, dim, onClick }: { label: string; meta?: string; badge?: number; dim?: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="w-full flex items-center text-left noc-press"
      style={{ gap: 8, padding: '9px 8px', borderRadius: 8, opacity: dim ? 0.6 : 1 }}>
      <span className="min-w-0 flex-1">
        <span className="block truncate" style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}>{label}</span>
        {meta && <span className="block truncate" style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{meta}</span>}
      </span>
      {badge ? <span style={{ minWidth: 18, padding: '0 5px', borderRadius: 9, fontSize: 11, fontWeight: 800, background: 'var(--color-secondary)', color: 'var(--color-bg)' }}>{badge}</span> : null}
      <CaretRight size={14} style={{ color: 'var(--color-text-muted)' }} />
    </button>
  );
}
