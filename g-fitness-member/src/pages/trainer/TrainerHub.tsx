import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import WhatsNew from '../../components/WhatsNew';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Bell, CalendarBlank, Camera, CaretRight, ChatCircleDots, MagnifyingGlass, Plus, QrCode, Tray, UsersThree, X,
} from '@phosphor-icons/react';
import Avatar from '../../components/ui/Avatar';
import GlassSheet from '../../components/ui/GlassSheet';
import CoachCheckInSheet from '../../components/ui/CoachCheckInSheet';
import { NocButton } from '../../components/ui/noc';
import { Field, TextArea, TextInput } from '../../components/ui/Field';
import { SkeletonList } from '../../components/ui/Skeleton';
import { toast } from '../../components/ui/Toast';
import { errorMessage } from '../../utils/errorMessage';
import { supabase } from '../../lib/supabaseClient';
import { createGroup, deleteRoom, myRoomPhotos, myRooms, reviewQueue, setArchived, setRoomPhoto, syncRooms, updateRoom, type ReviewItem, type Room } from '../../lib/api/rooms';
import { useLongPress } from '../../hooks/useLongPress';
import { myConversations, type Conversation } from '../../lib/api/chat';
import { uploadContentPhoto } from '../../lib/api/exerciseMedia';
import { myPresence, setMyPresence, PRESENCE_LABEL, type Presence } from '../../lib/api/presence';
import { getUnreadCount } from '../../lib/api/notifications';
import { getCurrentTrainerId, getTrainerOverview } from '../../services/trainerService';
import { listTrainerClasses } from '../../lib/api/classes';
import { useGymApp } from '../../hooks/useGymApp';
import { moduleOn } from '../../lib/gymApp';
import type { ClassRow } from '../../types/db';

/**
 * The trainer app, Discord style (2026-10-11, from the Discord mobile screens
 * the gym owner sent) — but a coach's tool, not a chat app:
 *
 *   rail      Messages on top (1-on-1 trainees, like Discord's DMs), then each
 *             class and coaching group as a round "server" with an amber count
 *             of work to review, then + for a new group
 *   Messages  search · Requests (booking requests) · Members · +; a Today strip
 *             of the classes you teach today where Discord has "active now";
 *             what waits for your comment; then one row per trainee — last
 *             message, when, unread — opening your 1-on-1 room with them
 *   a room    its name, People and picture; ROOM channels (# stream …) and,
 *             for a class, UPCOMING sessions where Discord has voice channels
 *   panel     you, bottom: photo, name, status (Available/Away/On leave) and
 *             the bell — tap yourself for your profile, where Schedule, Hours,
 *             Coaching, Library and Settings live
 *
 * There is no tab bar. Everything else opens full screen with Back, as a
 * Discord channel does. The open room is in the address (`?room=`).
 */
type Kind = Room['kind'];
const PRESENCE_TONE: Record<Presence, string> = {
  available: 'var(--color-primary-300)', away: 'var(--color-secondary)', on_leave: 'var(--color-text-muted)',
};
const RAIL_BG = 'color-mix(in srgb, var(--color-bg) 70%, #000)';
const PANEL_SPACE = 92; // room for the floating panel at the bottom

export default function TrainerHub() {
  const navigate = useNavigate();
  const app = useGymApp();
  const roomsOn = moduleOn(app, 'rooms');
  const [params, setParams] = useSearchParams();
  const [rooms, setRooms] = useState<Room[] | null | undefined>(null);
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [photos, setPhotos] = useState<Map<string, string | null>>(new Map());
  const [queue, setQueue] = useState<ReviewItem[]>([]);
  const [today, setToday] = useState<ClassRow[]>([]);
  const [upcoming, setUpcoming] = useState<ClassRow[]>([]);
  const [requests, setRequests] = useState(0);
  const [bell, setBell] = useState(0);
  const [me, setMe] = useState<{ id: string; name: string; photo: string | null } | null>(null);
  const [presence, setPresence] = useState<Presence>('available');
  const [statusOpen, setStatusOpen] = useState(false);
  /** The owner turned coach check-in on (0200): the panel gets a QR button. */
  const [coachCheckin, setCoachCheckin] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [creating, setCreating] = useState(params.get('new') === '1');
  const [searching, setSearching] = useState(false);
  const [q, setQ] = useState('');
  /** A room held on the rail: its settings sheet. */
  const [held, setHeld] = useState<Room | null>(null);

  const load = useCallback(async () => {
    await syncRooms();
    const { data } = await supabase.auth.getUser();
    const uid = data.user?.id ?? null;
    const [r, c, qu, ph, prof, pres, unread] = await Promise.all([
      myRooms(), myConversations(), reviewQueue(), myRoomPhotos(),
      uid ? supabase.from('profiles').select('first_name, last_name, photo_url').eq('id', uid).maybeSingle() : Promise.resolve({ data: null }),
      uid ? myPresence(uid) : Promise.resolve('available' as Presence),
      uid ? getUnreadCount(uid).catch(() => 0) : Promise.resolve(0),
    ]);
    setRooms(r); setConvs(c ?? []); setQueue(qu); setPhotos(ph); setPresence(pres); setBell(unread);
    // Before 0200 the column does not exist: no button, never an error.
    const door = await supabase.from('gym_settings').select('coach_checkin_on').maybeSingle();
    setCoachCheckin(!door.error && !!(door.data as { coach_checkin_on?: boolean } | null)?.coach_checkin_on);
    const p = (prof as { data: { first_name: string | null; last_name: string | null; photo_url: string | null } | null }).data;
    if (uid) setMe({ id: uid, name: [p?.first_name, p?.last_name].filter(Boolean).join(' ') || 'You', photo: p?.photo_url ?? null });
    // Today and requests come from the trainer's own overview (classes, bookings).
    const tid = await getCurrentTrainerId().catch(() => null);
    if (tid) {
      const [ov, cls] = await Promise.all([getTrainerOverview(tid).catch(() => null), listTrainerClasses(tid).catch(() => [] as ClassRow[])]);
      setToday(ov?.todayClasses ?? []);
      setRequests(ov?.pendingBookings ?? 0);
      const now = Date.now();
      setUpcoming(cls.filter((x) => !!x.scheduled_at && new Date(x.scheduled_at).getTime() > now).sort((a, b) => (a.scheduled_at ?? '').localeCompare(b.scheduled_at ?? '')));
    }
  }, []);
  useEffect(() => { void (async () => { await load(); })(); }, [load]);
  // A coach who has not finished their first steps (0212) is taken there — once a session if they chose Later.
  useEffect(() => {
    let skip = false;
    try { skip = sessionStorage.getItem('cf-coach-setup-later') === '1'; } catch { /* storage blocked: ask */ }
    if (skip) return;
    void supabase.rpc('my_coach_setup').then(({ data, error }) => {
      if (!error && data && (data as { onboarded: boolean }).onboarded === false) navigate('/trainer/welcome', { replace: true });
    });
  }, [navigate]);

  const active = useMemo(() => (rooms ?? []).filter((r) => !r.archived), [rooms]);
  const servers = useMemo(() => active.filter((r) => r.kind !== 'pt'), [active]);
  const open = servers.find((r) => r.id === params.get('room')) ?? null;
  const select = (id: string | null) => setParams(id ? { room: id } : {}, { replace: true });
  const unreadDMs = convs.reduce((n, c) => n + (c.muted ? 0 : c.unread), 0);

  const changeStatus = async (p: Presence) => {
    try { await setMyPresence(p); setPresence(p); setStatusOpen(false); toast.success(`You are ${PRESENCE_LABEL[p].toLowerCase()}`); }
    catch (e) { toast.error(errorMessage(e, 'Could not change your status')); }
  };

  if (rooms === null) return <div style={{ padding: 'var(--gutter)' }}><SkeletonList /></div>;

  return (
    <div className="flex" data-trainer-hub style={{ flex: 1, minHeight: '100dvh', background: RAIL_BG }}>
      {/* What changed for coaches (0212), once. */}
      <WhatsNew app="trainer" />
      {/* ---- the rail ---- */}
      <nav aria-label="Your rooms" className="flex flex-col items-center flex-none scrollbar-hide"
        style={{ width: 68, gap: 10, padding: `12px 0 ${PANEL_SPACE}px`, overflowY: 'auto' }}>
        <RailButton label="Messages" on={!open} onClick={() => select(null)} badge={unreadDMs + queue.length} dataAttr="home">
          <span className="grid place-items-center" style={{ width: 46, height: 46, background: 'var(--color-primary)', color: '#fff', borderRadius: 'inherit' }}>
            <ChatCircleDots size={24} weight="fill" />
          </span>
        </RailButton>
        <span aria-hidden style={{ width: 28, height: 2, borderRadius: 2, background: 'var(--color-border)' }} />
        {roomsOn && (['class', 'group'] as Kind[]).map((k) => {
          const list = servers.filter((r) => r.kind === k);
          if (list.length === 0) return null;
          return (
            <div key={k} className="flex flex-col items-center" style={{ gap: 10 }} data-rail-group={k}>
              {list.map((r) => (
                <RailButton key={r.id} label={r.name} on={open?.id === r.id} onClick={() => select(r.id)} onLong={() => setHeld(r)} badge={r.toReview} room={r.id}>
                  <RoomPicture name={r.name} photo={photos.get(r.id) ?? null} />
                </RailButton>
              ))}
            </div>
          );
        })}
        {roomsOn && (
          <button type="button" onClick={() => setCreating(true)} aria-label="New group" className="grid place-items-center noc-press flex-none"
            style={{ width: 46, height: 46, borderRadius: 23, background: 'var(--color-surface)', color: 'var(--color-primary-300)' }}>
            <Plus size={20} />
          </button>
        )}
      </nav>

      {/* ---- the panel: Messages, or the open room ---- */}
      <section className="flex-1 min-w-0 flex flex-col overflow-y-auto scrollbar-hide"
        style={{ background: 'var(--color-bg)', borderTopLeftRadius: 18, padding: `14px 14px ${PANEL_SPACE}px`, borderLeft: '1px solid var(--color-separator)' }}>
        {open ? (
          <RoomPanel room={open} upcoming={upcoming.filter((c) => sameClass(c.name, open.name)).slice(0, 5)}
            onPhoto={(url) => setPhotos((m) => new Map(m).set(open.id, url))} />
        ) : (
          <>
            <div className="flex items-center justify-between" style={{ gap: 8 }}>
              <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--color-text-primary)' }}>Messages</h1>
              {roomsOn && (
                <button type="button" aria-label="New group" onClick={() => setCreating(true)} className="grid place-items-center noc-press flex-none"
                  style={{ width: 36, height: 36, borderRadius: 12, background: 'var(--color-primary)', color: '#fff' }}>
                  <Plus size={18} weight="bold" />
                </button>
              )}
            </div>
            <div className="flex items-center" style={{ gap: 8, marginTop: 10 }} data-hub-actions>
              <HeadButton label="Search" onClick={() => { setSearching((s) => !s); setQ(''); }}><MagnifyingGlass size={17} /></HeadButton>
              <HeadButton label="Requests" wide onClick={() => navigate('/trainer/bookings')} badge={requests}>
                <Tray size={17} /><span style={{ fontSize: 13, fontWeight: 600 }}>Requests{requests ? ` · ${requests}` : ''}</span>
              </HeadButton>
              <HeadButton label="Members" wide onClick={() => navigate('/trainer/members')}>
                <UsersThree size={17} /><span style={{ fontSize: 13, fontWeight: 600 }}>Members</span>
              </HeadButton>
            </div>
            {searching && (
              <div className="flex items-center" style={{ gap: 8, marginTop: 10 }}>
                <TextInput autoFocus value={q} placeholder="Find a trainee" aria-label="Find a trainee" onChange={(e) => setQ(e.target.value)} />
                <button type="button" aria-label="Close search" onClick={() => { setSearching(false); setQ(''); }} style={{ color: 'var(--color-text-muted)' }}><X size={18} /></button>
              </div>
            )}

            {/* Today, where Discord shows who is active: the classes you teach today. */}
            <div className="flex scrollbar-hide" style={{ gap: 10, marginTop: 14, overflowX: 'auto', paddingBottom: 2 }} data-today-strip>
              <button type="button" onClick={() => navigate('/trainer/today')} className="flex-none text-left noc-press"
                style={{ width: 128, padding: 12, borderRadius: 16, background: 'var(--color-surface)', border: '1px solid var(--color-separator)' }}>
                <CalendarBlank size={20} style={{ color: 'var(--color-primary-300)' }} />
                <span className="block" style={{ fontSize: 13, fontWeight: 700, marginTop: 8, color: 'var(--color-text-primary)' }}>Your day</span>
                <span className="block" style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{today.length ? `${today.length} class${today.length === 1 ? '' : 'es'} today` : 'No classes today'}</span>
              </button>
              {today.map((c) => (
                <button key={c.id} type="button" onClick={() => navigate('/trainer/schedule')} className="flex-none text-left noc-press" data-today-class
                  style={{ width: 128, padding: 12, borderRadius: 16, background: 'var(--color-surface)', border: '1px solid var(--color-separator)' }}>
                  <span className="block" style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-secondary)' }}>
                    {new Date(c.scheduled_at ?? '').toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}
                  </span>
                  <span className="block truncate" style={{ fontSize: 13, fontWeight: 700, marginTop: 6, color: 'var(--color-text-primary)' }}>{c.name}</span>
                  <span className="block" style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{c.capacity ? `${c.capacity} places` : 'Class'}</span>
                </button>
              ))}
            </div>

            {/* What waits for the coach's comment, like Discord's message requests. */}
            {queue.length > 0 && (
              <button type="button" onClick={() => navigate(`/trainer/rooms/${queue[0].roomId}/work/${queue[0].assignmentId}`)} data-review-row
                className="flex items-center text-left noc-press" style={{ gap: 10, marginTop: 14, padding: '10px 12px', borderRadius: 14, background: 'color-mix(in srgb, var(--color-secondary) 12%, transparent)' }}>
                <span className="grid place-items-center flex-none" style={{ width: 34, height: 34, borderRadius: 17, background: 'var(--color-secondary)', color: 'var(--color-bg)', fontWeight: 800, fontSize: 13 }}>{queue.length}</span>
                <span className="min-w-0 flex-1">
                  <span className="block" style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text-primary)' }}>{queue.length} turned in, waiting for your comment</span>
                  <span className="block truncate" style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{queue[0].memberName} · {queue[0].title}</span>
                </span>
                <CaretRight size={14} style={{ color: 'var(--color-text-muted)' }} />
              </button>
            )}

            <DMList convs={convs} rooms={active.filter((r) => r.kind === 'pt')} q={q} onOpenRoom={(id) => navigate(`/trainer/rooms/${id}`)}
              onOpenConv={(id) => navigate(`/trainer/messages/${id}`)} />

            {(rooms ?? []).some((r) => r.archived) && (
              <div style={{ marginTop: 18 }}>
                <p style={{ fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>Closed rooms</p>
                {(rooms ?? []).filter((r) => r.archived).map((r) => (
                  <button key={r.id} type="button" onClick={() => navigate(`/trainer/rooms/${r.id}`)} className="w-full text-left noc-press"
                    style={{ padding: '9px 4px', fontSize: 14, color: 'var(--color-text-secondary)', opacity: 0.7 }}>{r.name}</button>
                ))}
              </div>
            )}
          </>
        )}
      </section>

      {/* ---- you, floating at the bottom ---- */}
      {me && (
        <div className="fixed flex items-center" data-user-panel data-presence={presence}
          style={{ left: 8, right: 8, bottom: 'calc(env(safe-area-inset-bottom) + 8px)', gap: 10, padding: '8px 10px', borderRadius: 18, zIndex: 30,
            background: 'color-mix(in srgb, var(--color-surface) 92%, #000)', border: '1px solid var(--color-separator)', boxShadow: '0 8px 24px rgba(0,0,0,.35)' }}>
          <button type="button" onClick={() => navigate('/trainer/profile')} aria-label="Your profile" className="flex items-center min-w-0 flex-1 text-left noc-press" style={{ gap: 10 }}>
            <span className="relative flex-none">
              <Avatar name={me.name} photoUrl={me.photo} size={38} />
              <span className="absolute" style={{ right: -1, bottom: -1, width: 13, height: 13, borderRadius: 7, border: '2px solid var(--color-surface)', background: PRESENCE_TONE[presence] }} />
            </span>
            <span className="min-w-0">
              <span className="block truncate" style={{ fontSize: 14, fontWeight: 800, color: 'var(--color-text-primary)' }}>{me.name}</span>
            </span>
          </button>
          <button type="button" onClick={() => setStatusOpen(true)} data-status-button className="flex-none noc-press"
            style={{ fontSize: 12, fontWeight: 600, padding: '5px 10px', borderRadius: 12, border: '1px solid var(--color-separator)', color: PRESENCE_TONE[presence] }}>
            {PRESENCE_LABEL[presence]}
          </button>
          {coachCheckin && (
            <button type="button" onClick={() => setQrOpen(true)} aria-label="My check-in QR" data-coach-qr className="grid place-items-center flex-none noc-press"
              style={{ width: 38, height: 38, borderRadius: 12, background: 'var(--color-primary)', color: '#fff' }}>
              <QrCode size={19} weight="bold" />
            </button>
          )}
          <button type="button" onClick={() => navigate('/trainer/notifications')} aria-label="Notifications" className="relative grid place-items-center flex-none noc-press"
            style={{ width: 38, height: 38, borderRadius: 12, background: 'var(--color-bg)', color: 'var(--color-text-secondary)' }}>
            <Bell size={18} />
            {bell > 0 && <Badge n={bell} />}
          </button>
        </div>
      )}

      {me && <CoachCheckInSheet open={qrOpen} onClose={() => setQrOpen(false)} trainerId={me.id} />}

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
        </div>
      </GlassSheet>

      <RoomSettingsSheet room={held} photo={held ? photos.get(held.id) ?? null : null} onClose={() => setHeld(null)}
        onChanged={() => { setHeld(null); void load(); }} onPhoto={(id, url) => setPhotos((m) => new Map(m).set(id, url))} />

      <NewGroupSheet open={creating} onClose={() => { setCreating(false); if (params.get('new')) setParams({}, { replace: true }); }} />
    </div>
  );
}

/** A class's room is named after the class; its sessions share the name. */
function sameClass(className: string, roomName: string): boolean {
  const a = className.trim().toLowerCase(), b = roomName.trim().toLowerCase();
  return a === b || b.startsWith(a) || a.startsWith(b);
}

function Badge({ n }: { n: number }) {
  return (
    <span className="absolute grid place-items-center" style={{ top: -4, right: -4, minWidth: 19, height: 19, padding: '0 5px', borderRadius: 10,
      fontSize: 11, fontWeight: 800, background: 'var(--color-secondary)', color: 'var(--color-bg)', border: '2px solid var(--color-bg)' }}>
      {n > 99 ? '99+' : n}
    </span>
  );
}

function RailButton({ label, on, onClick, onLong, badge, room, dataAttr, children }: {
  label: string; on: boolean; onClick: () => void; onLong?: () => void; badge?: number; room?: string; dataAttr?: string; children: React.ReactNode;
}) {
  // Hold a room for its settings, as in Discord (never the browser's image menu).
  const lp = useLongPress(() => onLong?.());
  return (
    <button type="button" onClick={() => { if (!lp.consumed()) onClick(); }} {...(onLong ? lp.handlers : {})}
      aria-label={label} aria-pressed={on} data-rail-room={room} data-rail-home={dataAttr === 'home' || undefined}
      className="relative flex-none noc-press select-none" style={{ width: 46, height: 46, WebkitTouchCallout: 'none' }}>
      {/* Discord's pill: a bar at the edge marks the open one. */}
      <span aria-hidden className="absolute" style={{ left: -11, top: on ? 8 : 19, width: 4, height: on ? 30 : 8, borderRadius: 4,
        background: on ? 'var(--color-text-primary)' : 'transparent', transition: 'all .15s' }} />
      <span className="block overflow-hidden" style={{ width: 46, height: 46, borderRadius: on ? 15 : 23, transition: 'border-radius .15s' }}>{children}</span>
      {badge ? <Badge n={badge} /> : null}
    </button>
  );
}

function RoomPicture({ name, photo, size = 46 }: { name: string; photo: string | null; size?: number }) {
  if (photo) return <img src={photo} alt="" draggable={false} style={{ width: size, height: size, objectFit: 'cover', pointerEvents: 'none' }} />;
  const parts = name.replace(/[·|]/g, ' ').split(/\s+/).filter(Boolean);
  return (
    <span className="grid place-items-center" style={{ width: size, height: size, fontSize: size > 50 ? 16 : 13, fontWeight: 800, color: '#fff',
      background: 'color-mix(in srgb, var(--color-primary) 55%, #18181e)' }}>
      {(parts.slice(0, 2).map((p) => p[0]).join('') || '?').toUpperCase()}
    </span>
  );
}

function HeadButton({ label, onClick, badge, wide, children }: { label: string; onClick: () => void; badge?: number; wide?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} onClick={onClick} className="relative inline-flex items-center justify-center noc-press flex-none"
      style={{ height: 38, minWidth: 38, gap: 6, padding: wide ? '0 12px' : '0 10px', borderRadius: 12, background: 'var(--color-surface)', color: 'var(--color-text-primary)' }}>
      {children}
      {badge ? <span aria-hidden className="absolute" style={{ top: 6, right: 6, width: 8, height: 8, borderRadius: 4, background: 'var(--color-secondary)' }} /> : null}
    </button>
  );
}

const ago = (iso: string | null) => {
  if (!iso) return '';
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 60) return `${Math.max(1, m)}m`;
  if (m < 1440) return `${Math.round(m / 60)}h`;
  if (m < 43200) return `${Math.round(m / 1440)}d`;
  return `${Math.round(m / 43200)}mo`;
};

/** One row per trainee: a conversation when there is one, else their 1-on-1 room. */
function DMList({ convs, rooms, q, onOpenRoom, onOpenConv }: {
  convs: Conversation[]; rooms: Room[]; q: string; onOpenRoom: (id: string) => void; onOpenConv: (id: string) => void;
}) {
  const named = (s: string) => s.toLowerCase().includes(q.trim().toLowerCase());
  const talked = new Set(convs.map((c) => c.otherName.trim().toLowerCase()));
  const rows = [
    ...convs.filter((c) => named(c.otherName)).map((c) => ({ key: c.id, name: c.otherName, photo: c.otherPhoto, line: c.lastMessage ? `${c.lastFromMe ? 'You: ' : ''}${c.lastMessage}` : 'No messages yet', at: c.lastMessageAt, unread: c.muted ? 0 : c.unread, open: () => onOpenConv(c.id) })),
    ...rooms.filter((r) => !talked.has(r.name.trim().toLowerCase()) && named(r.name)).map((r) => ({ key: r.id, name: r.name, photo: null as string | null, line: r.toReview ? `${r.toReview} to review` : '1-on-1 room', at: r.lastPostAt, unread: r.toReview, open: () => onOpenRoom(r.id) })),
  ];
  if (rows.length === 0) {
    return <p style={{ fontSize: 13, marginTop: 18, color: 'var(--color-text-muted)' }} data-dm-empty>{q ? 'No trainee by that name.' : 'Your 1-on-1 trainees appear here once they book you or start a coaching term.'}</p>;
  }
  return (
    <div className="flex flex-col" style={{ marginTop: 14 }} data-dm-list>
      {rows.map((r) => (
        <button key={r.key} type="button" onClick={r.open} className="flex items-center text-left noc-press" data-dm-row style={{ gap: 12, padding: '9px 4px', borderRadius: 12 }}>
          <Avatar name={r.name} photoUrl={r.photo} size={44} />
          <span className="min-w-0 flex-1">
            <span className="flex items-center" style={{ gap: 8 }}>
              <span className="truncate flex-1" style={{ fontSize: 15, fontWeight: r.unread ? 800 : 600, color: 'var(--color-text-primary)' }}>{r.name}</span>
              <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{ago(r.at)}</span>
            </span>
            <span className="flex items-center" style={{ gap: 8 }}>
              <span className="truncate flex-1" style={{ fontSize: 13, color: r.unread ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>{r.line}</span>
              {r.unread > 0 && <span style={{ minWidth: 19, height: 19, padding: '0 5px', borderRadius: 10, fontSize: 11, fontWeight: 800, lineHeight: '19px', textAlign: 'center', background: 'var(--color-secondary)', color: 'var(--color-bg)' }}>{r.unread}</span>}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}

/** A class or group, opened: its channels, and a class's next sessions. */
function RoomPanel({ room, upcoming, onPhoto }: { room: Room; upcoming: ClassRow[]; onPhoto: (url: string) => void }) {
  const navigate = useNavigate();
  const file = useRef<HTMLInputElement>(null);
  const channels: [string, string, number?][] = [['stream', 'stream'], ['classwork', 'classwork', room.toReview], ['progress', 'progress']];
  const pick = async (f: File | undefined) => {
    if (!f) return;
    try { const url = await uploadContentPhoto(f); await setRoomPhoto(room.id, url); onPhoto(url); toast.success('Room picture set.'); }
    catch (e) { toast.error(errorMessage(e, 'Could not set the picture')); }
  };
  const go = (tab: string) => navigate(`/trainer/rooms/${room.id}${tab === 'stream' ? '' : `?tab=${tab}`}`);
  return (
    <div data-room-panel>
      <div className="flex items-center" style={{ gap: 8 }}>
        <div className="min-w-0 flex-1">
          <h1 className="truncate" style={{ fontSize: 20, fontWeight: 800, color: 'var(--color-text-primary)' }}>{room.name}</h1>
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
            {room.kind === 'class' ? 'Class' : 'Coaching group'} · {room.memberCount} member{room.memberCount === 1 ? '' : 's'}{room.dueSoon ? ` · ${room.dueSoon} due this week` : ''}
          </p>
        </div>
        <HeadButton label="People" onClick={() => go('people')}><UsersThree size={17} /></HeadButton>
        {room.isMine && (
          <HeadButton label="Set the room picture" onClick={() => file.current?.click()}><Camera size={17} /></HeadButton>
        )}
        <input ref={file} type="file" accept="image/*" hidden onChange={(e) => void pick(e.target.files?.[0])} />
      </div>
      {room.description && <p style={{ fontSize: 13, marginTop: 8, color: 'var(--color-text-secondary)' }}>{room.description}</p>}

      <p style={{ fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginTop: 18 }}>Room</p>
      <div className="flex flex-col" style={{ gap: 2, marginTop: 4 }} data-channels>
        {channels.map(([tab, label, badge]) => (
          <button key={tab} type="button" onClick={() => go(tab)} className="w-full flex items-center text-left noc-press" style={{ gap: 10, padding: '10px 8px', borderRadius: 10 }}>
            <span style={{ fontSize: 18, color: 'var(--color-text-muted)' }}>#</span>
            <span className="flex-1" style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)' }}>{label}</span>
            {badge ? <span style={{ minWidth: 19, height: 19, padding: '0 5px', borderRadius: 10, fontSize: 11, fontWeight: 800, lineHeight: '19px', textAlign: 'center', background: 'var(--color-secondary)', color: 'var(--color-bg)' }}>{badge}</span> : null}
          </button>
        ))}
        <button type="button" onClick={() => go('people')} className="w-full flex items-center text-left noc-press" style={{ gap: 10, padding: '10px 8px', borderRadius: 10 }}>
          <span style={{ fontSize: 18, color: 'var(--color-text-muted)' }}>#</span>
          <span className="flex-1" style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)' }}>people · {room.memberCount}</span>
        </button>
      </div>

      {room.kind === 'class' && (
        <>
          <p style={{ fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginTop: 18 }}>Upcoming sessions</p>
          {upcoming.length === 0 ? (
            <p style={{ fontSize: 13, marginTop: 6, color: 'var(--color-text-muted)' }}>None on your schedule yet.</p>
          ) : (
            <div className="flex flex-col" style={{ gap: 2, marginTop: 4 }} data-sessions>
              {upcoming.map((c) => (
                <button key={c.id} type="button" onClick={() => navigate('/trainer/schedule')} className="w-full flex items-center text-left noc-press" style={{ gap: 10, padding: '10px 8px', borderRadius: 10 }}>
                  <CalendarBlank size={17} style={{ color: 'var(--color-text-muted)' }} />
                  <span className="flex-1" style={{ fontSize: 15, color: 'var(--color-text-primary)' }}>
                    {new Date(c.scheduled_at ?? '').toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' })} · {new Date(c.scheduled_at ?? '').toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}
                  </span>
                  <CaretRight size={14} style={{ color: 'var(--color-text-muted)' }} />
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function NewGroupSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [about, setAbout] = useState('');
  const [busy, setBusy] = useState(false);
  const create = async () => {
    setBusy(true);
    try {
      const id = await createGroup(name, about);
      toast.success('Group started. Share its code from People.');
      setName(''); setAbout(''); onClose();
      navigate(`/trainer/rooms/${id}?tab=people`);
    } catch (e) { toast.error(errorMessage(e, 'The group could not be started')); }
    finally { setBusy(false); }
  };
  return (
    <GlassSheet open={open} onClose={onClose} title="New coaching group" subtitle="Members join with a 6-letter code"
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
  );
}

/** Held on the rail: the room's own settings (2026-10-11), like a Discord server's. */
function RoomSettingsSheet({ room, photo, onClose, onChanged, onPhoto }: {
  room: Room | null; photo: string | null; onClose: () => void; onChanged: () => void; onPhoto: (id: string, url: string) => void;
}) {
  const navigate = useNavigate();
  const file = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState<string | null>(null);
  if (room && shown !== room.id) { setShown(room.id); setName(room.name); }
  const mine = !!room?.isMine;
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try { await fn(); toast.success(ok); onChanged(); }
    catch (e) { toast.error(errorMessage(e, 'That did not work')); }
    finally { setBusy(false); }
  };
  const pick = async (f: File | undefined) => {
    if (!f || !room) return;
    try { const url = await uploadContentPhoto(f); await setRoomPhoto(room.id, url); onPhoto(room.id, url); toast.success('Room picture set.'); }
    catch (e) { toast.error(errorMessage(e, 'Could not set the picture')); }
  };
  const row = (label: string, onClick: () => void, tone?: 'action') => (
    <button type="button" disabled={busy} onClick={onClick} className="w-full text-left noc-press disabled:opacity-50"
      style={{ padding: '13px 14px', borderRadius: 12, fontSize: 15, fontWeight: 600, background: 'var(--color-surface)',
        color: tone === 'action' ? 'var(--color-secondary)' : 'var(--color-text-primary)' }}>{label}</button>
  );
  return (
    <GlassSheet open={room !== null} onClose={onClose} title={room?.name ?? ''}
      subtitle={room ? `${room.kind === 'class' ? 'Class room' : 'Coaching group'} · ${room.memberCount} member${room.memberCount === 1 ? '' : 's'}` : undefined}>
      {room && (
        <div className="flex flex-col" style={{ gap: 8, padding: '0 var(--gutter) 16px' }} data-room-settings>
          <div className="flex items-center" style={{ gap: 12, marginBottom: 6 }}>
            <span className="overflow-hidden flex-none" style={{ width: 56, height: 56, borderRadius: 18 }}><RoomPicture name={room.name} photo={photo} size={56} /></span>
            {mine && <NocButton variant="ghost" onClick={() => file.current?.click()}>Change picture</NocButton>}
            <input ref={file} type="file" accept="image/*" hidden onChange={(e) => void pick(e.target.files?.[0])} />
          </div>
          {mine && room.kind === 'group' && (
            <div className="flex items-end" style={{ gap: 8 }}>
              <Field label="Name"><TextInput value={name} maxLength={80} aria-label="Room name" onChange={(e) => setName(e.target.value)} /></Field>
              <NocButton variant="action" disabled={busy || name.trim().length < 2 || name.trim() === room.name}
                onClick={() => void run(() => updateRoom(room.id, { name: name.trim() }), 'Renamed.')}>Save</NocButton>
            </div>
          )}
          {row(room.kind === 'group' ? 'People and join code' : 'People', () => { onClose(); navigate(`/trainer/rooms/${room.id}?tab=people`); })}
          {row('Classwork', () => { onClose(); navigate(`/trainer/rooms/${room.id}?tab=classwork`); })}
          {mine && row(room.commentsOn ? 'Turn comments off' : 'Turn comments on',
            () => void run(() => updateRoom(room.id, { commentsOn: !room.commentsOn }), room.commentsOn ? 'Comments are off.' : 'Comments are on.'))}
          {mine && row('Close this room', () => {
            if (!window.confirm(`Close "${room.name}"? It stays readable, and nothing new can be posted.`)) return;
            void run(() => setArchived(room.id, true), 'The room is closed.');
          })}
          {mine && room.kind === 'group' && row('Delete this group', () => {
            if (!window.confirm(`Delete "${room.name}"? Its posts, comments and classwork are deleted for everyone. This cannot be undone.`)) return;
            void run(() => deleteRoom(room.id), 'The group was deleted.');
          }, 'action')}
        </div>
      )}
    </GlassSheet>
  );
}
