import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CaretRight, Check, ClipboardText, HandWaving, MagnifyingGlass, Receipt, UserCircleMinus, X } from '@phosphor-icons/react';
import Avatar from '../../../components/ui/Avatar';
import { LineRow } from '../../../components/ui/noc';
import { toast } from '../../../components/ui/Toast';
import { useCountUp } from '../../../components/moments/momentHooks';
import { listTrainerPtSessions, type PtSessionRow } from '../../../lib/api/ptSessions';
import { listMyTrainerMembers, type TrainerRosterRow } from '../../../lib/api/trainerRoster';
import { getBookingModes, type BookingModes } from '../../../lib/api/bookings';
import { buzz, play, reducedMotion } from '../../../lib/moments';
import type { ReviewItem } from '../../../lib/api/rooms';
import type { ClassRow } from '../../../types/db';
import { useGymApp } from '../../../hooks/useGymApp';
import { moduleOn } from '../../../lib/gymApp';
import { errorMessage } from '../../../utils/errorMessage';
import { loadPackageAsks, monthsLabel, peso, type Coaching } from '../../../lib/api/coaching';
import {
  coachDecides, decideRequest, decidedText, loadTrainerRequests, waitedLabel, type TrainerRequest,
} from '../../../services/trainerRequests';

/** A trainee not seen for this many days is someone to reach out to. */
const QUIET_DAYS = 7;
/** Requests decided here; the rest wait on Schedule. */
const REQUEST_PREVIEW = 3;

const time = (iso: string) => new Date(iso).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
const when = (iso: string | null) => (iso
  ? `${new Date(iso).toLocaleDateString('en-PH', { weekday: 'short', day: 'numeric', month: 'short' })}, ${time(iso)}`
  : 'no time set');
const isToday = (iso: string) => {
  const d = new Date(iso), n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
};

interface Slot { key: string; at: string; title: string; meta: string; open: () => void; live: boolean }

/**
 * Today — the coach's control panel (wave 1 of the lively coach app, 2026-10-27;
 * mock-up docs/superpowers/specs/2026-10-27-lively-trainer-w1/mock-trainer-w1.html).
 *
 * Top to bottom: find a trainee; the day in three numbers (which count up with a
 * chime on the first open of the day, 0218); requests decided right here — ✓
 * accepts, ✕ asks once more, then declines — with the rest a tap away on
 * Schedule; then packages asked for or paid (simplify, 2026-10-28); the day as a timeline; and who needs them. Every line is read,
 * never assumed: a name comes from the coach's own roster, and a request whose
 * person the roster does not have shows what was booked, not a made-up name.
 */
export default function TodayPanel({ trainerId, classes, queue, onRequests, arriving }: {
  trainerId: string | null; classes: ClassRow[]; queue: ReviewItem[]; onRequests?: (n: number) => void;
  /** The first open of the day (0218, asked by the hub): the three numbers count up. */
  arriving: boolean;
}) {
  const navigate = useNavigate();
  const classesOn = moduleOn(useGymApp(), 'classes');
  const [sessions, setSessions] = useState<PtSessionRow[]>([]);
  const [roster, setRoster] = useState<TrainerRosterRow[]>([]);
  const [requests, setRequests] = useState<TrainerRequest[] | null>(null);
  const [asks, setAsks] = useState<Coaching[]>([]);
  const [modes, setModes] = useState<BookingModes>({ classMode: 'coach', ptMode: 'coach' });
  const [asking, setAsking] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [decided, setDecided] = useState<Record<string, 'approved' | 'rejected'>>({});
  const [q, setQ] = useState('');
  // Read once when the panel opens (a clock read during render is not pure).
  const [now] = useState(() => Date.now());

  const loadRequests = useCallback(async () => {
    if (!trainerId) return;
    const [r, m] = await Promise.all([loadTrainerRequests(trainerId).catch(() => null), getBookingModes().catch(() => null)]);
    if (m) setModes(m);
    if (r) setRequests(r);
  }, [trainerId]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const [s, r, a] = await Promise.all([
        trainerId ? listTrainerPtSessions(trainerId).catch(() => []) : Promise.resolve([]),
        listMyTrainerMembers().catch(() => []),
        loadPackageAsks().catch(() => [] as Coaching[]),
        loadRequests(),
      ]);
      if (alive) { setSessions(s); setRoster(r); setAsks(a); }
    })();
    return () => { alive = false; };
  }, [trainerId, loadRequests]);

  // Class requests only where the gym runs classes (0220: off unless the owner switches them on).
  const open = (requests ?? []).filter((r) => (r.kind === 'pt' || classesOn) && (coachDecides(r, modes) || decided[r.id]));
  const waiting = open.filter((r) => !decided[r.id]).length;
  useEffect(() => { if (requests) onRequests?.(waiting); }, [requests, waiting, onRequests]);

  const names = new Map(roster.map((m) => [m.member_id, m]));
  const slots: Slot[] = [
    ...(classesOn ? classes : []).filter((c) => c.scheduled_at && isToday(c.scheduled_at)).map((c) => ({
      key: `c${c.id}`, at: c.scheduled_at as string, title: c.name,
      meta: [c.location, c.capacity ? `${c.capacity} places` : null].filter(Boolean).join(' · '),
      open: () => navigate('/trainer/schedule'), live: false,
    })),
    ...sessions.filter((s) => s.status === 'approved' && isToday(s.starts_at)).map((s) => ({
      key: `p${s.id}`, at: s.starts_at, title: names.get(s.member_id) ? `1-on-1 · ${names.get(s.member_id)!.name}` : '1-on-1',
      meta: `${s.duration_minutes} min`, open: () => navigate(`/trainer/pt/${s.member_id}`), live: false,
    })),
  ].sort((a, b) => a.at.localeCompare(b.at));
  // The one happening now, or the next to come, carries the lit dot.
  const nextIdx = slots.findIndex((s) => new Date(s.at).getTime() + 60 * 60_000 > now);
  if (nextIdx >= 0) slots[nextIdx].live = true;

  const quiet = roster
    .filter((m) => !m.last_visit || (now - new Date(m.last_visit).getTime()) / 86_400_000 >= QUIET_DAYS)
    .slice(0, 3);
  const daysSince = (iso: string | null) => (iso ? Math.floor((now - new Date(iso).getTime()) / 86_400_000) : null);
  const needYou = queue.length + quiet.length;
  const today = new Date().toLocaleDateString('en-PH', { weekday: 'long', day: 'numeric', month: 'long' });
  const found = q.trim().length >= 1 ? roster.filter((m) => m.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 6) : [];

  const decide = async (req: TrainerRequest, status: 'approved' | 'rejected') => {
    if (!trainerId) return;
    setBusy(req.id);
    try {
      await decideRequest(req, status, trainerId);
      setDecided((d) => ({ ...d, [req.id]: status }));
      setAsking(null);
      if (status === 'approved') { play('pop'); buzz(15); }
      toast.success(decidedText(req, status, modes, names.get(req.memberId)?.name));
    } catch (e) {
      toast.error(errorMessage(e, 'Could not save that decision'));
      void loadRequests();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div data-today-panel>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--color-text-primary)' }}>Today</h1>
      <p style={{ fontSize: 12.5, marginTop: 2, color: 'var(--color-text-muted)' }}>{today}</p>

      {/* Find a trainee: one step to their sheet, instead of Messages → Your trainees → scroll. */}
      <label className="flex items-center" style={{ gap: 10, marginTop: 12, height: 42, padding: '0 12px', borderRadius: 12,
        background: 'var(--color-surface)', border: '1px solid var(--color-hairline)' }}>
        <MagnifyingGlass size={16} aria-hidden style={{ color: 'var(--color-text-muted)', flex: 'none' }} />
        <input value={q} placeholder="Find a trainee" aria-label="Find a trainee" onChange={(e) => setQ(e.target.value)} data-find-trainee
          className="flex-1 min-w-0 bg-transparent outline-none" style={{ fontSize: 14, color: 'var(--color-text-primary)' }} />
        {q && <button type="button" aria-label="Clear the search" onClick={() => setQ('')} style={{ color: 'var(--color-text-muted)' }}><X size={15} /></button>}
      </label>
      {q.trim() && (
        <section aria-label="Trainees found" data-found style={{ marginTop: 6 }}>
          {found.length === 0 ? (
            <p style={{ fontSize: 13, padding: '8px 2px', color: 'var(--color-text-muted)' }}>No trainee of yours by that name.</p>
          ) : found.map((m) => (
            <button key={m.member_id} type="button" onClick={() => navigate(`/trainer/pt/${m.member_id}`)}
              className="w-full flex items-center text-left noc-press" style={{ gap: 10, padding: '8px 2px' }}>
              <Avatar name={m.name} photoUrl={m.photo_url} size={34} />
              <span className="min-w-0 flex-1">
                <span className="block truncate" style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--color-text-primary)' }}>{m.name}</span>
                <span className="block" style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                  {m.last_visit ? `Last in ${daysSince(m.last_visit) === 0 ? 'today' : `${daysSince(m.last_visit)} days ago`}` : 'Not in yet'}
                </span>
              </span>
              <CaretRight size={14} style={{ color: 'var(--color-text-muted)' }} />
            </button>
          ))}
        </section>
      )}

      {/* The day in three numbers. Requests are amber: they wait on the coach. */}
      <div className={`td-strip${arriving ? ' td-arrive' : ''}`} data-day-strip>
        <DayNumber value={slots.length} label={slots.length === 1 ? 'session today' : 'sessions today'} run={arriving} />
        <DayNumber value={waiting + asks.length} label={waiting + asks.length === 1 ? 'request' : 'requests'} run={arriving} act={waiting + asks.length > 0} />
        <DayNumber value={needYou} label="need you" run={arriving} />
      </div>

      {open.length > 0 && (
        <>
          <p className="eyebrow" style={{ marginTop: 18 }}>Requests · decide here</p>
          <section aria-label="Requests" data-requests className="td-card">
            {open.slice(0, REQUEST_PREVIEW).map((r, i) => {
              const person = names.get(r.memberId);
              const done = decided[r.id];
              const waited = waitedLabel(r.requestedAt, now);
              return (
                <div key={r.id} className="flex items-center" data-request={r.id}
                  style={{ gap: 10, padding: '10px 0', borderTop: i === 0 ? 0 : '1px solid var(--color-separator)' }}>
                  {person ? <Avatar name={person.name} photoUrl={person.photo_url} size={34} /> : null}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate" style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--color-text-primary)' }}>{person?.name ?? r.title}</span>
                    <span className="block" style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                      {[r.kind === 'pt' ? '1-on-1' : r.title, when(r.startsAt), waited].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  {done ? (
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: done === 'approved' ? 'var(--color-primary-300)' : 'var(--color-text-muted)' }} data-decided={done}>
                      {done === 'approved' ? 'Accepted' : 'Declined'}
                    </span>
                  ) : asking === r.id ? (
                    <>
                      <button type="button" className="td-no noc-press" onClick={() => setAsking(null)} aria-label="Keep it">Keep</button>
                      <button type="button" className="td-ask noc-press" disabled={busy === r.id} onClick={() => void decide(r, 'rejected')}>Decline</button>
                    </>
                  ) : (
                    <>
                      <button type="button" className="td-no noc-press" disabled={busy === r.id} onClick={() => setAsking(r.id)}
                        aria-label={`Decline ${person?.name ?? r.title}`}><X size={16} /></button>
                      <button type="button" className="td-ok noc-press" disabled={busy === r.id} onClick={() => void decide(r, 'approved')}
                        aria-label={`Accept ${person?.name ?? r.title}`}><Check size={18} weight="bold" /></button>
                    </>
                  )}
                </div>
              );
            })}
            {open.length > REQUEST_PREVIEW && (
              <button type="button" onClick={() => navigate('/trainer/schedule')} data-see-all className="w-full flex items-center noc-press"
                style={{ gap: 6, padding: '10px 0 2px', borderTop: '1px solid var(--color-separator)', fontSize: 13, fontWeight: 700, color: 'var(--color-secondary)' }}>
                See all {open.length} in Schedule <CaretRight size={13} />
              </button>
            )}
          </section>
        </>
      )}

      {/* Packages asked for, or paid to this coach and to check — decided on Packages. */}
      {asks.length > 0 && (
        <>
          <p className="eyebrow" style={{ marginTop: 18 }}>Packages</p>
          <section aria-label="Package requests" data-package-asks>
            {asks.map((c, i) => (
              <LineRow key={c.id} icon={c.status === 'requested' ? HandWaving : Receipt} tone="act"
                title={c.status === 'requested' ? `${c.memberName} asks for a ${monthsLabel(c.months)} package` : `${c.memberName} paid ${c.price != null ? peso(c.price) : 'you'}`}
                meta={c.status === 'requested' ? 'Accept or decline on Packages' : 'Check it reached you, then the package starts'}
                action={<CaretRight size={14} />} actionTone="muted"
                onClick={() => navigate('/trainer/packages?tab=needs')} last={i === asks.length - 1} />
            ))}
          </section>
        </>
      )}

      <p className="eyebrow" style={{ marginTop: 18 }}>Your day</p>
      {slots.length === 0 ? (
        <p style={{ fontSize: 13, marginTop: 6, color: 'var(--color-text-muted)' }}>
          {classesOn ? 'No classes or sessions today.' : 'No sessions today.'}{' '}<button type="button" onClick={() => navigate('/trainer/schedule')} style={{ color: 'var(--color-primary-300)' }}>See your week</button>
        </p>
      ) : (
        <section aria-label="Your day" style={{ marginTop: 8 }} data-day>
          {slots.map((s, i) => (
            <div key={s.key} className="flex" style={{ gap: 12 }}>
              <span className="flex-none" style={{ width: 52, paddingTop: 2, fontSize: 12, fontWeight: s.live ? 700 : 400,
                color: s.live ? 'var(--color-primary-300)' : 'var(--color-text-muted)' }}>{time(s.at)}</span>
              <button type="button" onClick={s.open} className="relative flex-1 min-w-0 text-left" style={{
                borderLeft: '1px solid rgba(233, 233, 237, 0.12)', paddingLeft: 14, paddingBottom: i === slots.length - 1 ? 0 : 16 }}>
                <span aria-hidden className="absolute rounded-full" style={{ left: -4, top: 6, width: 7, height: 7,
                  background: s.live ? 'var(--color-primary)' : 'var(--color-surface-high)',
                  boxShadow: s.live ? '0 0 9px var(--color-primary)' : '0 0 0 1px rgba(233, 233, 237, 0.18)' }} />
                <span className="block truncate" style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--color-text-primary)' }}>{s.title}</span>
                {s.meta && <span className="block" style={{ fontSize: 12.5, marginTop: 2, color: 'var(--color-text-muted)' }}>{s.meta}</span>}
              </button>
            </div>
          ))}
        </section>
      )}

      {needYou > 0 && (
        <>
          <p className="eyebrow" style={{ marginTop: 20 }}>Needs you</p>
          <section aria-label="Needs you" data-needs-you>
            {queue.length > 0 && (
              <LineRow icon={ClipboardText} tone="act"
                title={`${queue.length} ${queue.length === 1 ? 'piece of classwork' : 'pieces of classwork'} to check`}
                meta={`${queue[0].memberName} · ${queue[0].title}`}
                action={<CaretRight size={14} />} actionTone="muted"
                onClick={() => navigate(`/trainer/rooms/${queue[0].roomId}/work/${queue[0].assignmentId}`)}
                last={quiet.length === 0} />
            )}
            {quiet.map((m, i) => {
              const d = daysSince(m.last_visit);
              return (
                <LineRow key={m.member_id} icon={UserCircleMinus} tone="info"
                  title={d == null ? `${m.name} hasn’t been in yet` : `${m.name} hasn’t been in for ${d} days`}
                  meta="Their notes, plan and progress"
                  action={<CaretRight size={14} />} actionTone="muted"
                  onClick={() => navigate(`/trainer/pt/${m.member_id}?tab=about`)}
                  last={i === quiet.length - 1} />
              );
            })}
          </section>
        </>
      )}
    </div>
  );
}

/** One of the day's three numbers; on the first open of the day it counts up. */
function DayNumber({ value, label, run, act }: { value: number; label: string; run: boolean; act?: boolean }) {
  const shown = useCountUp(value, run, !run || reducedMotion(), { ms: 700 });
  return (
    <div className={act ? 'td-n td-act' : 'td-n'}>
      <b className="tabular-nums">{run ? shown : value}</b>
      <small>{label}</small>
    </div>
  );
}
