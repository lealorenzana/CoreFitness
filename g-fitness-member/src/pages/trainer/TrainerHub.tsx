import { useCallback, useEffect, useMemo, useState } from 'react';
import WhatsNew from '../../components/WhatsNew';
import TodayPanel from './hub/TodayPanel';
import YouSheet from './hub/YouSheet';
import TraineeWinCard from '../../components/trainer/TraineeWinCard';
import OfferPackageSheet from '../../components/trainer/OfferPackageSheet';
import { arrivalLeft, claimCoachOpening, coachOpening, startArrival } from '../../lib/api/coachMoments';
import { buzz, holdMoments, loadMomentPrefs, play, showMoment } from '../../lib/moments';
import { splashGone } from '../../lib/momentWatch';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Bell, ChatCircleDots, MagnifyingGlass, Plus, QrCode, Sun, X } from '@phosphor-icons/react';
import Avatar from '../../components/ui/Avatar';
import GlassSheet from '../../components/ui/GlassSheet';
import CoachCheckInSheet from '../../components/ui/CoachCheckInSheet';
import { SkeletonList } from '../../components/ui/Skeleton';
import { toast } from '../../components/ui/Toast';
import { errorMessage } from '../../utils/errorMessage';
import { supabase } from '../../lib/supabaseClient';
import { myRooms, reviewQueue, syncRooms, type ReviewItem, type Room } from '../../lib/api/rooms';
import { useLongPress } from '../../hooks/useLongPress';
import { myConversations, type Conversation } from '../../lib/api/chat';
import { getCoachingSettings, myCoachings, type Coaching, type CoachingSettings } from '../../lib/api/coaching';
import { listMyTrainerMembers, type TrainerRosterRow } from '../../lib/api/trainerRoster';
import { myPresence, setMyPresence, PRESENCE_LABEL, type Presence } from '../../lib/api/presence';
import { getUnreadCount } from '../../lib/api/notifications';
import { getCurrentTrainerId } from '../../services/trainerService';
import { coachDecides, loadTrainerRequests } from '../../services/trainerRequests';
import { getBookingModes } from '../../lib/api/bookings';
import { listTrainerClasses } from '../../lib/api/classes';
import { useGymApp } from '../../hooks/useGymApp';
import { moduleOn } from '../../lib/gymApp';
import type { ClassRow } from '../../types/db';

/**
 * The coach app, Discord style (2026-10-11; kept by the owner through the
 * simplify, 2026-10-28) — a coach's tool, not a chat app:
 *
 *   rail      Today; Personal training (everyone you coach, like Discord's
 *             DMs); then one round photo per package trainee, with an amber
 *             count of what waits for you; then + Start coaching someone
 *   panel     Today (requests, the day, Needs you), or Personal training — one
 *             row per person, "On a package" and "Single sessions"
 *   bottom    you: photo, name, status (Available/Away/On leave), your check-in
 *             QR and the bell — tap yourself for the You sheet, where Schedule,
 *             Hours, Packages, Library and Settings live
 *
 * There is no tab bar. A person opens their place (`/trainer/pt/:memberId`)
 * full screen with Back, as a Discord channel does. Classes and coaching groups
 * have no rooms since 0220.
 */
const PRESENCE_TONE: Record<Presence, string> = {
  available: 'var(--color-primary-300)', away: 'var(--color-secondary)', on_leave: 'var(--color-text-muted)',
};
const RAIL_BG = 'color-mix(in srgb, var(--color-bg) 70%, #000)';
const PANEL_SPACE = 92; // room for the floating panel at the bottom

/** One person this coach trains: their package (if any), chat and room merged. */
export interface PtPerson {
  id: string; name: string; photo: string | null;
  coaching: Coaching | null; room: Room | null; conv: Conversation | null; upcoming: number;
}

export default function TrainerHub() {
  const navigate = useNavigate();
  const app = useGymApp();
  const classesOn = moduleOn(app, 'classes');
  const [params, setParams] = useSearchParams();
  const [rooms, setRooms] = useState<Room[] | null | undefined>(null);
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [coachings, setCoachings] = useState<Coaching[]>([]);
  const [roster, setRoster] = useState<TrainerRosterRow[]>([]);
  const [settings, setSettings] = useState<CoachingSettings | null>(null);
  const [queue, setQueue] = useState<ReviewItem[]>([]);
  const [today, setToday] = useState<ClassRow[]>([]);
  /** The coach's classes Monday to Sunday of this week, for the You sheet's Schedule tile. */
  const [classesWeek, setClassesWeek] = useState(0);
  const [requests, setRequests] = useState(0);
  const [bell, setBell] = useState(0);
  const [me, setMe] = useState<{ id: string; name: string; photo: string | null } | null>(null);
  const [presence, setPresence] = useState<Presence>('available');
  const [statusOpen, setStatusOpen] = useState(false);
  /** The owner turned coach check-in on (0200): the panel gets a QR button. */
  const [coachCheckin, setCoachCheckin] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [offering, setOffering] = useState(false);
  const [q, setQ] = useState('');
  const [trainerId, setTrainerId] = useState<string | null>(null);
  /** The user bar's You panel (redesign, 2026-10-27). */
  const [youOpen, setYouOpen] = useState(false);
  /** The first open of the day (0218): Today's three numbers count up. */
  const [arriving, setArriving] = useState(false);

  // Opening the hub (wave 1 of the lively coach app): the day's arrival first,
  // then any milestone the coach has newly reached, as a full moment — each
  // counted and marked played in SQL (0218), so it plays once per account.
  useEffect(() => {
    let alive = true;
    const timers: number[] = [];
    void (async () => {
      await loadMomentPrefs();
      const o = await coachOpening();
      // Not under the start-up splash: the arrival is for the coach to see.
      await splashGone();
      if (!alive) return;
      const fresh = claimCoachOpening();
      if (fresh && o.arrive) startArrival();
      // A hub remounted mid-arrival (the shell re-keys a screen) carries on with it.
      const left = arrivalLeft();
      if (left > 0) {
        holdMoments(true);
        setArriving(true);
        if (fresh) timers.push(window.setTimeout(() => { play('chime'); buzz(20); }, 250));
        timers.push(window.setTimeout(() => { holdMoments(false); setArriving(false); }, left));
      }
      if (fresh) o.milestones.forEach((m) => showMoment({ kind: 'coach', milestone: m }));
    })();
    return () => { alive = false; timers.forEach(clearTimeout); holdMoments(false); };
  }, []);

  const load = useCallback(async () => {
    await syncRooms();
    const { data } = await supabase.auth.getUser();
    const uid = data.user?.id ?? null;
    const [r, c, co, ro, st, qu, prof, pres, unread] = await Promise.all([
      myRooms(), myConversations(), myCoachings().catch(() => null), listMyTrainerMembers().catch(() => [] as TrainerRosterRow[]),
      getCoachingSettings().catch(() => null), reviewQueue(),
      uid ? supabase.from('profiles').select('first_name, last_name, photo_url').eq('id', uid).maybeSingle() : Promise.resolve({ data: null }),
      uid ? myPresence(uid) : Promise.resolve('available' as Presence),
      uid ? getUnreadCount(uid).catch(() => 0) : Promise.resolve(0),
    ]);
    setRooms(r); setConvs(c ?? []); setCoachings((co ?? []).filter((x) => x.iAm !== 'member')); setRoster(ro);
    setSettings(st); setQueue(qu); setPresence(pres); setBell(unread);
    // Before 0200 the column does not exist: no button, never an error.
    const door = await supabase.from('gym_settings').select('coach_checkin_on').maybeSingle();
    setCoachCheckin(!door.error && !!(door.data as { coach_checkin_on?: boolean } | null)?.coach_checkin_on);
    const p = (prof as { data: { first_name: string | null; last_name: string | null; photo_url: string | null } | null }).data;
    if (uid) setMe({ id: uid, name: [p?.first_name, p?.last_name].filter(Boolean).join(' ') || 'You', photo: p?.photo_url ?? null });
    // The requests still this coach's to decide (the same rule Today uses), and — where the gym runs classes — today's classes.
    const tid = await getCurrentTrainerId().catch(() => null);
    setTrainerId(tid);
    if (tid) {
      const [reqs, modes, cls] = await Promise.all([loadTrainerRequests(tid).catch(() => null), getBookingModes().catch(() => null),
        classesOn ? listTrainerClasses(tid).catch(() => [] as ClassRow[]) : Promise.resolve([] as ClassRow[])]);
      setToday(cls.filter((x) => !!x.scheduled_at && new Date(x.scheduled_at).toDateString() === new Date().toDateString()));
      if (reqs && modes) setRequests(reqs.filter((rq) => coachDecides(rq, modes)).length);
      // Monday 00:00 to next Monday 00:00, on the phone's own clock.
      const monday = new Date(); monday.setHours(0, 0, 0, 0); monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
      const next = new Date(monday); next.setDate(monday.getDate() + 7);
      setClassesWeek(cls.filter((x) => x.scheduled_at && new Date(x.scheduled_at) >= monday && new Date(x.scheduled_at) < next).length);
    }
  }, [classesOn]);
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

  /** Everyone this coach trains, one row each: package, chat, room and roster merged on the member. */
  const people = useMemo(() => {
    const byId = new Map<string, PtPerson>();
    const get = (id: string, name: string, photo: string | null) => {
      let x = byId.get(id);
      if (!x) { x = { id, name, photo, coaching: null, room: null, conv: null, upcoming: 0 }; byId.set(id, x); }
      if (!x.photo && photo) x.photo = photo;
      return x;
    };
    // A package: the running one wins, else the newest that had a room (its room is kept, read-only).
    const order = [...coachings].sort((a, b) => (a.status === 'active' ? -1 : 0) - (b.status === 'active' ? -1 : 0) || b.createdAt.localeCompare(a.createdAt));
    for (const c of order) {
      if (c.iAm !== 'coach' || !(c.status === 'active' || (c.status === 'ended' && c.roomId))) continue;
      const x = get(c.memberId, c.memberName, c.memberPhoto);
      if (!x.coaching) { x.coaching = c; x.room = (rooms ?? []).find((r) => r.id === c.roomId) ?? null; }
    }
    for (const c of convs) get(c.otherId, c.otherName, c.otherPhoto).conv = c;
    for (const r of roster) get(r.member_id, r.name, r.photo_url).upcoming = r.upcoming_with_me;
    return [...byId.values()];
  }, [coachings, convs, roster, rooms]);
  const unreadOf = (x: PtPerson) => (x.conv && !x.conv.muted ? x.conv.unread : 0) + (x.room?.toReview ?? 0);
  const packaged = people.filter((x) => x.coaching);
  const canOffer = !!settings?.modes.includes('coach_invites');

  // Today is the first stop; Personal training is the next button (`?view=messages` from before still opens it).
  const view: 'today' | 'pt' = params.get('view') === 'pt' || params.get('view') === 'messages' ? 'pt' : 'today';
  const showToday = () => setParams({}, { replace: true });
  const showPt = () => setParams({ view: 'pt' }, { replace: true });
  const unreadAll = people.reduce((n, x) => n + unreadOf(x), 0);

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
      <nav aria-label="Your trainees" className="flex flex-col items-center flex-none scrollbar-hide"
        style={{ width: 74, gap: 8, padding: `12px 0 ${PANEL_SPACE}px`, overflowY: 'auto' }}>
        <RailButton label="Today" on={view === 'today'} onClick={showToday} badge={requests + queue.length} dataAttr="today">
          <span className="grid place-items-center" style={{ width: 46, height: 46, borderRadius: 'inherit',
            background: view === 'today' ? 'var(--color-primary)' : 'var(--color-surface)', color: view === 'today' ? '#fff' : 'var(--color-text-secondary)' }}>
            <Sun size={23} weight={view === 'today' ? 'fill' : 'regular'} />
          </span>
        </RailButton>
        <RailButton label="Personal training" on={view === 'pt'} onClick={showPt} badge={unreadAll} dataAttr="pt">
          <span className="grid place-items-center" style={{ width: 46, height: 46, borderRadius: 'inherit',
            background: view === 'pt' ? 'var(--color-primary)' : 'var(--color-surface)', color: view === 'pt' ? '#fff' : 'var(--color-text-secondary)' }}>
            <ChatCircleDots size={24} weight={view === 'pt' ? 'fill' : 'regular'} />
          </span>
        </RailButton>
        <span aria-hidden style={{ width: 28, height: 2, borderRadius: 2, background: 'var(--color-border)' }} />
        {/* One round photo per package trainee (simplify, 2026-10-28). */}
        {packaged.map((x) => (
          <RailButton key={x.id} label={x.name.split(' ')[0]} on={false} onClick={() => navigate(`/trainer/pt/${x.id}`)} badge={unreadOf(x)} trainee={x.id}>
            <span className="block" style={{ opacity: x.coaching?.status === 'active' ? 1 : 0.55 }}>
              <Avatar name={x.name} photoUrl={x.photo} size={46} />
            </span>
          </RailButton>
        ))}
        {canOffer && (
          <RailButton label="Start coaching someone" on={false} onClick={() => setOffering(true)} dataAttr="offer">
            <span className="grid place-items-center" style={{ width: 46, height: 46, borderRadius: 'inherit', background: 'var(--color-surface)', color: 'var(--color-secondary)' }}>
              <Plus size={20} />
            </span>
          </RailButton>
        )}
      </nav>

      {/* ---- the panel: Today, or Personal training ---- */}
      <section className="flex-1 min-w-0 flex flex-col overflow-y-auto scrollbar-hide"
        style={{ background: 'var(--color-bg)', borderTopLeftRadius: 18, padding: `14px 14px ${PANEL_SPACE}px`, borderLeft: '1px solid var(--color-separator)' }}>
        {view === 'today' ? (
          <TodayPanel trainerId={trainerId} classes={today} queue={queue} onRequests={setRequests} arriving={arriving} />
        ) : (
          <>
            <div className="flex items-center justify-between" style={{ gap: 8 }}>
              <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--color-text-primary)' }}>Personal training</h1>
              {canOffer && (
                <button type="button" aria-label="Start coaching someone" onClick={() => setOffering(true)} className="grid place-items-center noc-press flex-none"
                  style={{ width: 36, height: 36, borderRadius: 12, background: 'var(--color-secondary)', color: 'var(--color-bg)' }}>
                  <Plus size={18} weight="bold" />
                </button>
              )}
            </div>
            <label className="flex items-center" style={{ gap: 10, marginTop: 10, height: 42, padding: '0 12px', borderRadius: 12,
              background: 'var(--color-surface)', border: '1px solid var(--color-hairline)' }}>
              <MagnifyingGlass size={16} aria-hidden style={{ color: 'var(--color-text-muted)', flex: 'none' }} />
              <input value={q} placeholder="Find a trainee" aria-label="Find a trainee" onChange={(e) => setQ(e.target.value)}
                className="flex-1 min-w-0 bg-transparent outline-none" style={{ fontSize: 14, color: 'var(--color-text-primary)' }} />
              {q && <button type="button" aria-label="Clear the search" onClick={() => setQ('')} style={{ color: 'var(--color-text-muted)' }}><X size={15} /></button>}
            </label>
            <PtList people={people} q={q} unreadOf={unreadOf} onOpen={(id, single) => navigate(`/trainer/pt/${id}${single ? '?tab=chat' : ''}`)} canOffer={canOffer} onOffer={() => setOffering(true)} />
          </>
        )}
      </section>

      {/* ---- you, floating at the bottom ---- */}
      {me && (
        <div className="fixed flex items-center" data-user-panel data-presence={presence}
          style={{ left: 8, right: 8, bottom: 'calc(env(safe-area-inset-bottom) + 8px)', gap: 10, padding: '8px 10px', borderRadius: 18, zIndex: 30,
            background: 'color-mix(in srgb, var(--color-surface) 92%, #000)', border: '1px solid var(--color-separator)', boxShadow: '0 8px 24px rgba(0,0,0,.35)' }}>
          <button type="button" onClick={() => setYouOpen(true)} aria-label="You — your status and screens" data-you-button className="flex items-center min-w-0 flex-1 text-left noc-press" style={{ gap: 10 }}>
            <span className="relative flex-none">
              <Avatar name={me.name} photoUrl={me.photo} size={38} />
              <span className="absolute" style={{ right: -1, bottom: -1, width: 13, height: 13, borderRadius: 7, border: '2px solid var(--color-surface)', background: PRESENCE_TONE[presence] }} />
            </span>
            <span className="min-w-0">
              <span className="block truncate" style={{ fontSize: 14, fontWeight: 800, color: 'var(--color-text-primary)' }}>{me.name}</span>
              <span className="block truncate" style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Coach{app?.gymName ? ` · ${app.shortName?.trim() || app.gymName}` : ''}</span>
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

      {/* A trainee's win, as a small card (0218). */}
      <TraineeWinCard />
      {me && <CoachCheckInSheet open={qrOpen} onClose={() => setQrOpen(false)} trainerId={me.id} />}
      {me && <YouSheet open={youOpen} onClose={() => setYouOpen(false)} me={me} presence={presence} tones={PRESENCE_TONE}
        onPresence={(p) => void changeStatus(p)} classesThisWeek={classesWeek} />}

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

      {settings && <OfferPackageSheet open={offering} onClose={() => setOffering(false)} settings={settings} onSent={() => void load()} />}
    </div>
  );
}

function Badge({ n }: { n: number }) {
  return (
    <span className="absolute grid place-items-center" style={{ top: -4, right: -4, minWidth: 19, height: 19, padding: '0 5px', borderRadius: 10,
      fontSize: 11, fontWeight: 800, background: 'var(--color-secondary)', color: 'var(--color-bg)', border: '2px solid var(--color-bg)' }}>
      {n > 99 ? '99+' : n}
    </span>
  );
}

function RailButton({ label, on, onClick, onLong, badge, trainee, dataAttr, children }: {
  label: string; on: boolean; onClick: () => void; onLong?: () => void; badge?: number; trainee?: string; dataAttr?: string; children: React.ReactNode;
}) {
  // A held picture never opens the browser's image menu.
  const lp = useLongPress(() => onLong?.());
  // Every rail button says what it is underneath (wave 1, 2026-10-27): "MH" alone told a new coach nothing.
  return (
    <button type="button" onClick={() => { if (!lp.consumed()) onClick(); }} {...(onLong ? lp.handlers : {})}
      aria-label={label} aria-pressed={on} data-rail-trainee={trainee} data-rail-pt={dataAttr === 'pt' || undefined}
      data-rail-home={dataAttr === 'pt' || undefined} data-rail-today={dataAttr === 'today' || undefined} data-rail-offer={dataAttr === 'offer' || undefined}
      className="flex flex-col items-center flex-none noc-press select-none" style={{ width: 70, gap: 4, WebkitTouchCallout: 'none' }}>
      <span className="relative block" style={{ width: 46, height: 46 }}>
        {/* Discord's pill: a bar at the edge marks the open one. */}
        <span aria-hidden className="absolute" style={{ left: -12, top: on ? 8 : 19, width: 4, height: on ? 30 : 8, borderRadius: 4,
          background: on ? 'var(--color-text-primary)' : 'transparent', transition: 'all .15s' }} />
        <span className="block overflow-hidden" style={{ width: 46, height: 46, borderRadius: on ? 15 : 23, transition: 'border-radius .15s' }}>{children}</span>
        {badge ? <Badge n={badge} /> : null}
      </span>
      <span aria-hidden data-rail-label className="block" style={{ maxWidth: 68, fontSize: 12, lineHeight: 1.15, textAlign: 'center',
        overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
        fontWeight: on ? 700 : 500, color: on ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>{label}</span>
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

/** Personal training: one row per person — on a package first, then single sessions. */
function PtList({ people, q, unreadOf, onOpen, canOffer, onOffer }: {
  people: PtPerson[]; q: string; unreadOf: (x: PtPerson) => number; onOpen: (id: string, single: boolean) => void; canOffer: boolean; onOffer: () => void;
}) {
  const shown = people.filter((x) => x.name.toLowerCase().includes(q.trim().toLowerCase()));
  const at = (x: PtPerson) => x.conv?.lastMessageAt ?? x.room?.lastPostAt ?? null;
  const sorted = (list: PtPerson[]) => [...list].sort((a, b) => unreadOf(b) - unreadOf(a) || (at(b) ?? '').localeCompare(at(a) ?? '') || a.name.localeCompare(b.name));
  const pkg = sorted(shown.filter((x) => x.coaching)), single = sorted(shown.filter((x) => !x.coaching));
  if (people.length === 0) {
    return (
      <div style={{ marginTop: 18 }} data-pt-empty>
        <p style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--color-text-muted)' }}>
          Nobody yet. People appear here when they book a session with you or start a package.
        </p>
        {canOffer && <button type="button" onClick={onOffer} style={{ marginTop: 8, fontSize: 13.5, fontWeight: 600, color: 'var(--color-secondary)' }}>+ Start coaching someone</button>}
      </div>
    );
  }
  if (shown.length === 0) return <p style={{ fontSize: 13, marginTop: 18, color: 'var(--color-text-muted)' }} data-dm-empty>No trainee by that name.</p>;
  const row = (x: PtPerson) => {
    const u = unreadOf(x);
    const line = x.conv?.lastMessage ? `${x.conv.lastFromMe ? 'You: ' : ''}${x.conv.lastMessage}`
      : x.room?.toReview ? `${x.room.toReview} to review`
      : x.upcoming ? `${x.upcoming} session${x.upcoming === 1 ? '' : 's'} ahead` : 'No messages yet';
    const pill = x.coaching ? (x.coaching.status === 'active' ? `${x.coaching.months} mo` : 'Ended') : null;
    return (
      <button key={x.id} type="button" onClick={() => onOpen(x.id, !x.coaching)} className="flex items-center text-left noc-press" data-dm-row data-pt-row={x.coaching ? 'package' : 'single'}
        style={{ gap: 12, padding: '9px 4px', borderRadius: 12 }}>
        <Avatar name={x.name} photoUrl={x.photo} size={44} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center" style={{ gap: 8 }}>
            <span className="truncate" style={{ fontSize: 15, fontWeight: u ? 800 : 600, color: 'var(--color-text-primary)' }}>{x.name}</span>
            {pill && <span data-pt-tag style={{ fontSize: 12, padding: '1px 7px', borderRadius: 999, flex: 'none',
              border: `1px solid ${x.coaching?.status === 'active' ? 'var(--color-primary-300)' : 'var(--color-hairline)'}`,
              color: x.coaching?.status === 'active' ? 'var(--color-primary-300)' : 'var(--color-text-muted)' }}>{pill}</span>}
            <span className="flex-1" />
            <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{ago(at(x))}</span>
          </span>
          <span className="flex items-center" style={{ gap: 8 }}>
            <span className="truncate flex-1" style={{ fontSize: 13, color: u ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>{line}</span>
            {u > 0 && <span style={{ minWidth: 19, height: 19, padding: '0 5px', borderRadius: 10, fontSize: 11, fontWeight: 800, lineHeight: '19px', textAlign: 'center', background: 'var(--color-secondary)', color: 'var(--color-bg)' }}>{u}</span>}
          </span>
        </span>
      </button>
    );
  };
  return (
    <div className="flex flex-col" style={{ marginTop: 14 }} data-dm-list>
      {pkg.length > 0 && <p className="eyebrow" data-pt-section="package">On a package · {pkg.length}</p>}
      {pkg.map(row)}
      {single.length > 0 && <p className="eyebrow" style={{ marginTop: pkg.length ? 16 : 0 }} data-pt-section="single">Single sessions · {single.length}</p>}
      {single.map(row)}
    </div>
  );
}
