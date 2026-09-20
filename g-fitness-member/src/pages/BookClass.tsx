import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, CalendarStar, Moon, SlidersHorizontal, Sparkle, Sun, SunHorizon, Target, User, UsersThree } from '@phosphor-icons/react';
import { SkeletonList } from '../components/ui/Skeleton';
import Modal from '../components/ui/Modal';
import Avatar from '../components/ui/Avatar';
import { useLiveData } from '../hooks/useLiveData';
import { toast } from '../components/ui/Toast';
import { errorMessage } from '../utils/errorMessage';
import {
  getCurrentMemberId,
  getExperienceLevel,
  setExperienceLevel,
  listBookableClasses,
  bookClass,
  listOpenPtSlots,
  requestPt,
  getEntitlement,
  type BookableClass,
  type BookableSlot,
  type ExperienceLevel,
  type Entitlement,
} from '../services/bookingService';
import { listPublicTrainers, trainerName, type PublicTrainer } from '../lib/api/directory';
import { listAllAvailability } from '../lib/api/trainerAvailability';
import { listEvents, eventStatus, type EventRow } from '../lib/api/events';
import { readCache, writeCache } from '../lib/pageCache';
import { joinWaitlist, leaveWaitlist } from '../lib/api/waitlist';
import { weekRangeLabel } from '../utils/dates';
import { useSetTabHeader } from '../components/layout/tabHeaderStore';
import type { ClassLevel } from '../types/db';
import { Page } from '../components/ui/page';
import { Chip, LineRow, NocButton, Panel, ProgressBar, SectionHead, TextTabs } from '../components/ui/noc';

/**
 * Everything the first paint of this screen needs, cached as one object.
 *
 * Four queries fan out on mount and all four have to land before the page is
 * worth looking at, so they are remembered together — a half-restored screen
 * showing classes but no entitlement would render the booking actions in the
 * wrong state. Only `load()` writes it.
 */
interface BookClassSnapshot {
  memberId: string | null;
  classes: BookableClass[];
  level: ExperienceLevel | null;
  trainers: PublicTrainer[];
  entitlement: Entitlement | null;
}

const CACHE_KEY = 'member:book-class';

const LEVELS: { id: ExperienceLevel; label: string; desc: string }[] = [
  { id: 'beginner', label: 'Beginner', desc: 'New to fitness, or back after a break' },
  { id: 'intermediate', label: 'Intermediate', desc: '6+ months training consistently' },
  { id: 'advanced', label: 'Advanced', desc: '2+ years of dedicated training' },
];

const LEVEL_LABEL: Record<ClassLevel, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
  all_levels: 'All levels',
};

type Filter = 'classes' | 'pt' | 'events';
type Band = 'am' | 'mid' | 'pm';

const BANDS: { id: Band; label: string }[] = [
  { id: 'am', label: 'AM' },
  { id: 'mid', label: 'Mid' },
  { id: 'pm', label: 'PM' },
];

/**
 * The matrix's three rows. Before 11:00 is a morning session, 11:00–15:59 the
 * lunch and early-afternoon block, 16:00 on the after-work block — the three
 * times a member in Mamburao actually chooses between.
 */
function bandOf(iso: string): Band {
  const h = new Date(iso).getHours();
  return h < 11 ? 'am' : h < 16 ? 'mid' : 'pm';
}

/** Local calendar day key — never toISOString(), which shifts a Manila evening into tomorrow. */
function dayKeyOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function dayTitle(d: Date): string {
  const today = new Date();
  const key = dayKeyOf(d);
  if (key === dayKeyOf(today)) return `Today, ${d.getDate()}`;
  return `${d.toLocaleDateString('en-US', { weekday: 'long' })} ${d.getDate()}`;
}

interface Cell { count: number; mine: boolean }

/**
 * Seven days from `start`, each with its three bands counted.
 *
 * Built over fixed calendar days rather than only the days with something on
 * them — the empty cells are the point: they are how a member sees Thursday is
 * free without tapping anything.
 */
function buildWeek<T>(start: Date, rows: T[], iso: (r: T) => string, mine: (r: T) => boolean) {
  const days = Array.from({ length: 7 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  const keys = days.map(dayKeyOf);
  const grid: Record<Band, Cell[]> = {
    am: days.map(() => ({ count: 0, mine: false })),
    mid: days.map(() => ({ count: 0, mine: false })),
    pm: days.map(() => ({ count: 0, mine: false })),
  };
  for (const r of rows) {
    const idx = keys.indexOf(dayKeyOf(new Date(iso(r))));
    if (idx < 0) continue;
    const cell = grid[bandOf(iso(r))][idx];
    cell.count += 1;
    if (mine(r)) cell.mine = true;
  }
  return { days, keys, grid };
}

/**
 * The week matrix: weekday initials over AM / Mid / PM, a count per cell.
 *
 * Replaces the day rail and the bento timetable. The bento existed to stop a
 * day of classes reading as a spreadsheet; the matrix does that better by
 * showing the *shape* of the week before any single class. Selection is
 * structure, so the selected day is violet; a cell holding the member's own
 * booking carries a violet dot.
 */
function WeekMatrix({
  week,
  selected,
  onSelect,
}: {
  week: ReturnType<typeof buildWeek>;
  selected: number;
  onSelect: (i: number) => void;
}) {
  const initials = week.days.map((d) => d.toLocaleDateString('en-US', { weekday: 'narrow' }));
  return (
    <div role="grid" aria-label="Sessions this week"
      className="grid items-center" style={{ gridTemplateColumns: '38px repeat(7, minmax(0, 1fr))', gap: 5 }}>
      <span />
      {week.days.map((d, i) => (
        <button key={week.keys[i]} onClick={() => onSelect(i)}
          aria-label={d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
          aria-pressed={i === selected}
          className="text-center" style={{ fontSize: 12, height: 20, fontWeight: i === selected ? 700 : 400,
            color: i === selected ? 'var(--color-primary-300)' : 'var(--color-text-muted)' }}>
          {initials[i]}
        </button>
      ))}
      {BANDS.map((b) => (
        <FragmentRow key={b.id} label={b.label} cells={week.grid[b.id]} selected={selected} onSelect={onSelect} />
      ))}
    </div>
  );
}

function FragmentRow({
  label, cells, selected, onSelect,
}: {
  label: string;
  cells: Cell[];
  selected: number;
  onSelect: (i: number) => void;
}) {
  return (
    <>
      {/* Morning, midday, evening at a glance — the band's icon above its name. */}
      <span className="flex flex-col items-center" style={{ gap: 2, fontSize: 12, color: 'var(--color-text-muted)' }}>
        <span aria-hidden className="inline-flex" style={{ color: 'var(--color-primary-300)' }}>
          {label === 'AM' ? <SunHorizon size={15} weight="duotone" /> : label === 'Mid' ? <Sun size={15} weight="duotone" /> : <Moon size={14} weight="duotone" />}
        </span>
        {label}
      </span>
      {cells.map((c, i) => {
        const on = i === selected;
        return (
          <button
            key={i}
            onClick={() => onSelect(i)}
            aria-label={`${label}: ${c.count} ${c.count === 1 ? 'session' : 'sessions'}${c.mine ? ', one is yours' : ''}`}
            // The AI bubble's orb language. "Something on" must still read at a
            // glance against "nothing on" — that contrast IS the matrix — so
            // sessions are lavender glass and empty slots faint glass; the
            // chosen day is the orb (core + ring) where it has sessions and the
            // ring alone where it has none.
            className={`relative grid place-items-center orb-cell ${
              on ? (c.count ? 'orb-cell--on' : 'orb-cell--ring') : c.count ? 'orb-cell--busy' : ''}`}
            style={{
              height: 40, fontSize: 13, fontWeight: 600,
              color: on && c.count ? '#fff' : c.count ? 'var(--color-primary-300)' : 'var(--color-text-muted)',
            }}
          >
            {c.count || ''}
            {c.mine && (
              <span aria-hidden className="absolute orb-dot" style={{ top: 5, right: 5, width: 6, height: 6 }} />
            )}
          </button>
        );
      })}
    </>
  );
}

function Legend() {
  // Swatches are the same orb surfaces the matrix draws, so the key cannot drift.
  const swatch = (cls: string) => (
    <span aria-hidden className={`orb-cell ${cls}`} style={{ width: 14, height: 14, borderRadius: 4 }} />
  );
  return (
    <div className="flex items-center flex-wrap" style={{ gap: 14, fontSize: 12, color: 'var(--color-text-secondary)' }}>
      <span className="flex items-center" style={{ gap: 6 }}>{swatch('orb-cell--busy')}Sessions on</span>
      <span className="flex items-center" style={{ gap: 6 }}>{swatch('')}Nothing on</span>
      <span className="flex items-center" style={{ gap: 6 }}>
        <span aria-hidden className="orb-dot" style={{ width: 6, height: 6 }} />
        Yours
      </span>
    </div>
  );
}

/**
 * What a class row's trailing word says, and whether tapping the row books it.
 *
 * A clash is not the same refusal as "full" or "your plan does not allow it",
 * so it keeps its own word — the member can act on this one, by cancelling the
 * other thing, which is why the row goes on to name it.
 *
 * A full class offers the waitlist (0096) — "Waitlist", or your place in
 * line once you are on it. Before 0096 is pasted it says "Full", because a word
 * that implies a waitlist that does not exist is a control that does nothing.
 */
function classAction(c: BookableClass, blocked: boolean) {
  if (c.myStatus != null) {
    return { word: c.myStatus === 'approved' ? 'Confirmed' : 'Pending', tone: 'structure' as const, bookable: false, mine: true };
  }
  if (c.spotsLeft === 0) {
    if (c.waitlistOpen && c.myWaitPosition != null) {
      return { word: `#${c.myWaitPosition} in line`, tone: 'structure' as const, bookable: false, mine: false };
    }
    if (c.waitlistOpen) return { word: 'Waitlist', tone: 'action' as const, bookable: false, mine: false };
    return { word: 'Full', tone: 'muted' as const, bookable: false, mine: false };
  }
  if (blocked) return { word: 'Locked', tone: 'muted' as const, bookable: false, mine: false };
  if (c.conflict !== null) return { word: 'Busy', tone: 'muted' as const, bookable: false, mine: false };
  return { word: 'Book', tone: 'action' as const, bookable: true, mine: false };
}

function classMeta(c: BookableClass) {
  const seats = c.spotsLeft === 0
    ? `Full · ${c.booked}/${c.capacity}${c.waiting > 0 ? ` · ${c.waiting} waiting` : ''}`
    : `${c.spotsLeft} of ${c.capacity} left`;
  const facts = [LEVEL_LABEL[c.level], c.trainerName, c.location, seats].filter(Boolean).join(' · ');
  return (
    <>
      {(c.recommended || c.matchesInterest) && (
        <span style={{ color: 'var(--color-primary-300)' }}>
          {c.recommended ? 'For your level' : 'You picked this'}{' · '}
        </span>
      )}
      {c.conflict !== null && c.myStatus == null ? `Clashes with ${c.conflict}` : facts}
    </>
  );
}

/**
 * Train — the week at a glance, then the chosen day (Nocturne redesign).
 *
 * Both halves of booking live here because they are one question for the
 * member — "when am I training next" — even though they are two tables: a group
 * class has a roster and a capacity, a PT session is one member and one coach in
 * one slot. Neither creates a confirmed booking; both start pending, and the
 * coach decides (0071).
 *
 * **Kept from the old screen, though the prototype drops them:** matching to
 * the member's experience level and the "For my level" filter; the weekly class
 * allowance and the plain-words reason a plan refuses a booking; clash
 * detection naming the other commitment; the coach → slot flow for 1-on-1 (the
 * prototype books PT in one tap, which is not how PT works here); a trainer
 * profile deep-linking straight into that coach's hours; and the second week,
 * which the old fourteen-day rail covered and a seven-column matrix alone
 * would have silently dropped.
 */
const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "Strength · Mon, Tue, Thu", or says plainly that the coach has no hours yet. */
function coachMeta(t: PublicTrainer, workDays: Map<string, number[]> | null): string {
  const spec = t.specialization ?? 'General training';
  if (!workDays) return spec;
  const days = workDays.get(t.id);
  if (!days || days.length === 0) return `${spec} · no bookable hours yet`;
  // Monday first — a working week does not start on Sunday.
  const order = [1, 2, 3, 4, 5, 6, 0];
  return `${spec} · ${order.filter((d) => days.includes(d)).map((d) => WEEKDAY_SHORT[d]).join(', ')}`;
}

export default function BookClass() {
  const navigate = useNavigate();
  const deepLinkTrainerId = (useLocation().state as { trainerId?: string } | null)?.trainerId ?? null;
  const [filter, setFilter] = useState<Filter>(deepLinkTrainerId ? 'pt' : 'classes');
  const [weekOffset, setWeekOffset] = useState<0 | 7>(0);
  const [selected, setSelected] = useState<number | null>(null);

  const cached = readCache<BookClassSnapshot>(CACHE_KEY);
  const [memberId, setMemberId] = useState<string | null>(cached?.memberId ?? null);
  const [loading, setLoading] = useState(cached === undefined);
  const [busy, setBusy] = useState(false);
  const [entitlement, setEntitlement] = useState<Entitlement | null>(cached?.entitlement ?? null);

  const [classes, setClasses] = useState<BookableClass[]>(cached?.classes ?? []);
  const [level, setLevel] = useState<ExperienceLevel | null>(cached?.level ?? null);
  const [recommendedOnly, setRecommendedOnly] = useState(false);
  const [confirmClass, setConfirmClass] = useState<BookableClass | null>(null);
  /** A full class whose waitlist sheet is open (0096). */
  const [waitClass, setWaitClass] = useState<BookableClass | null>(null);

  /** trainerId → the weekdays they keep bookable hours, for the coach list. Null until read. */
  const [workDays, setWorkDays] = useState<Map<string, number[]> | null>(null);
  const [trainers, setTrainers] = useState<PublicTrainer[]>(cached?.trainers ?? []);
  const [selectedTrainer, setSelectedTrainer] = useState<PublicTrainer | null>(null);
  const [slots, setSlots] = useState<BookableSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [confirmSlot, setConfirmSlot] = useState<BookableSlot | null>(null);
  const [notes, setNotes] = useState('');

  const [events, setEvents] = useState<EventRow[] | null>(null);

  /** `quiet` = a background refresh: no skeleton flash, no toast on a blip. */
  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const id = await getCurrentMemberId();
      setMemberId(id);
      if (!id) {
        if (!quiet) toast.error('Your session could not be verified. Please sign in again.');
        return;
      }
      const [bookable, lvl, coaches, ent, evs] = await Promise.all([
        listBookableClasses(id),
        getExperienceLevel(id),
        listPublicTrainers().catch(() => [] as PublicTrainer[]),
        getEntitlement(id),
        listEvents().catch(() => null),
      ]);
      // Which days each coach works, so the list says it before a tap — a coach
      // with no hours used to look identical to one with a full week.
      void listAllAvailability().then((rows) => {
        const m = new Map<string, number[]>();
        for (const r of rows) {
          const days = m.get(r.trainer_id) ?? [];
          if (!days.includes(r.day_of_week)) days.push(r.day_of_week);
          m.set(r.trainer_id, days);
        }
        setWorkDays(m);
      }).catch(() => { /* the list still works without the days */ });
      setClasses(bookable);
      setLevel(lvl);
      setTrainers(coaches);
      setEntitlement(ent);
      setEvents(evs);
      writeCache<BookClassSnapshot>(CACHE_KEY, {
        memberId: id, classes: bookable, level: lvl, trainers: coaches, entitlement: ent,
      });
    } catch (err) {
      if (!quiet) toast.error(errorMessage(err, 'Could not load the schedule'));
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  const revisit = useRef(cached !== undefined);
  useEffect(() => { void load(revisit.current); }, [load]);

  // Approval happens on the coach's screen, not this one — without a refresh
  // the member would sit looking at a stale "Pending".
  useLiveData(() => load(true), { enabled: !confirmClass && !confirmSlot });

  const chooseLevel = async (chosen: ExperienceLevel) => {
    if (!memberId) return;
    setBusy(true);
    try {
      await setExperienceLevel(memberId, chosen);
      setLevel(chosen);
      setClasses(await listBookableClasses(memberId));
      toast.success(`Matched to ${chosen} classes`);
    } catch (err) {
      toast.error(errorMessage(err, 'Could not save your level'));
    } finally {
      setBusy(false);
    }
  };

  const openTrainer = useCallback(async (trainer: PublicTrainer) => {
    setSelectedTrainer(trainer);
    // Each coach has their own hours, so a day picked against the last one
    // would filter this one's list against a day they may not even work.
    setSelected(null);
    setSlots([]);
    setSlotsLoading(true);
    try {
      setSlots(await listOpenPtSlots(trainer.id, 14, memberId ?? undefined));
    } catch (err) {
      toast.error(errorMessage(err, 'Could not load open times'));
    } finally {
      setSlotsLoading(false);
    }
  }, [memberId]);

  // Deep link from a trainer profile: open their hours as soon as the roster
  // arrives — once. The ref, not `selectedTrainer`, is the guard: guarding on
  // the selection re-opened the coach the moment the member backed out of them.
  // The IIFE is what the set-state-in-effect rule needs: it follows a directly
  // called function into its setState, and this one is asynchronous work.
  const deepLinkDone = useRef(false);
  useEffect(() => {
    if (deepLinkDone.current || !deepLinkTrainerId || trainers.length === 0) return;
    const match = trainers.find((t) => t.id === deepLinkTrainerId);
    if (!match) return;
    deepLinkDone.current = true;
    void (async () => { await openTrainer(match); })();
  }, [deepLinkTrainerId, trainers, openTrainer]);

  const submitClassBooking = async () => {
    if (!memberId || !confirmClass) return;
    setBusy(true);
    try {
      await bookClass(memberId, confirmClass.id);
      setConfirmClass(null);
      toast.success('Requested — you will be told when it is confirmed');
      // Refresh the allowance alongside the list — "0 of 1 booked" still
      // showing after booking is worse than showing no allowance.
      const [refreshed, ent] = await Promise.all([listBookableClasses(memberId), getEntitlement(memberId)]);
      setClasses(refreshed);
      setEntitlement(ent);
    } catch (err) {
      toast.error(errorMessage(err, 'Could not book that class'));
    } finally {
      setBusy(false);
    }
  };

  /** Join or leave a full class's waitlist, then reload the list so the row says where you stand. */
  const toggleWaitlist = async () => {
    if (!memberId || !waitClass) return;
    setBusy(true);
    try {
      if (waitClass.myWaitPosition != null) {
        await leaveWaitlist(waitClass.id);
        toast.success('You left the waitlist');
      } else {
        const pos = await joinWaitlist(waitClass.id);
        toast.success(`You are #${pos} in line — we will tell you the moment a spot opens`);
      }
      setWaitClass(null);
      setClasses(await listBookableClasses(memberId));
    } catch (err) {
      toast.error(errorMessage(err, 'Could not update the waitlist'));
    } finally {
      setBusy(false);
    }
  };

  const submitPtRequest = async () => {
    if (!memberId || !confirmSlot || !selectedTrainer) return;
    setBusy(true);
    try {
      await requestPt({
        memberId,
        trainerId: selectedTrainer.id,
        startsAt: confirmSlot.startsAt,
        durationMinutes: confirmSlot.durationMinutes,
        notes: notes.trim() || undefined,
      });
      setConfirmSlot(null);
      setNotes('');
      toast.success('Requested — you will be told when it is confirmed');
      // The slot just taken must disappear for everyone, including us.
      setSlots(await listOpenPtSlots(selectedTrainer.id, 14, memberId ?? undefined));
    } catch (err) {
      toast.error(errorMessage(err, 'Could not request that session'));
    } finally {
      setBusy(false);
    }
  };

  // ── The week on screen ──
  const start = useMemo(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate() + weekOffset);
  }, [weekOffset]);

  const visibleClasses = useMemo(
    () => (recommendedOnly ? classes.filter((c) => c.recommended) : classes),
    [classes, recommendedOnly],
  );

  const week = useMemo(
    () => (filter === 'pt'
      ? buildWeek(start, slots, (s) => s.startsAt, () => false)
      : buildWeek(start, visibleClasses, (c) => c.scheduledAt, (c) => c.myStatus != null)),
    [filter, start, slots, visibleClasses],
  );

  // Default to the first day that has something, so the list under the matrix
  // is never an empty "Nothing on today" when Friday is full.
  const firstBusy = (['am', 'mid', 'pm'] as Band[])
    .map((b) => week.grid[b].findIndex((c) => c.count > 0))
    .filter((i) => i >= 0)
    .sort((a, b) => a - b)[0] ?? 0;
  const day = selected ?? firstBusy;
  const dayKey = week.keys[day];

  const dayClasses = visibleClasses
    .filter((c) => dayKeyOf(new Date(c.scheduledAt)) === dayKey)
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  const daySlots = slots
    .filter((s) => dayKeyOf(new Date(s.startsAt)) === dayKey)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  // What next week holds, so the member knows it is worth looking.
  const nextWeekCount = useMemo(() => {
    const n = new Date();
    const from = new Date(n.getFullYear(), n.getMonth(), n.getDate() + 7).getTime();
    const to = from + 7 * 86_400_000;
    const src = filter === 'pt' ? slots.map((s) => s.startsAt) : visibleClasses.map((c) => c.scheduledAt);
    return src.filter((iso) => { const t = new Date(iso).getTime(); return t >= from && t < to; }).length;
  }, [filter, slots, visibleClasses]);

  useSetTabHeader('train',
    weekOffset === 7 ? 'Next week' : undefined,
    weekOffset === 7 ? weekRangeLabel(start) : undefined);

  // ── Why the member can't book, in the order they'd hit it (0017) ──
  const quotaReached =
    entitlement?.classesPerWeek != null && entitlement.classesUsedThisWeek >= entitlement.classesPerWeek;
  const classBlock: string | null =
    entitlement == null ? null
      : entitlement.blockedReason ? entitlement.blockedReason
      : !entitlement.canBookClasses
        ? `${entitlement.planName ?? 'Your plan'} doesn't include group classes. Ask the front desk about upgrading.`
      : quotaReached
        ? `${entitlement.planName} includes ${entitlement.classesPerWeek} class${entitlement.classesPerWeek === 1 ? '' : 'es'} a week, and you've booked this week's. You can book next week.`
        : null;
  const ptBlock: string | null =
    entitlement == null ? null
      : entitlement.blockedReason ? entitlement.blockedReason
      : !entitlement.canBookPt
        ? `${entitlement.planName ?? 'Your plan'} doesn't include personal training. Ask the front desk about upgrading.`
        : null;
  const activeBlock = filter === 'pt' ? ptBlock : filter === 'classes' ? classBlock : null;

  const upcomingEvents = (events ?? [])
    .filter((e) => eventStatus(e) === 'Upcoming')
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));

  const changeFilter = (f: Filter) => {
    setFilter(f);
    setSelected(null);
    setWeekOffset(0);
  };

  const showMatrix = filter === 'classes' || (filter === 'pt' && selectedTrainer !== null && !slotsLoading);

  return (
    <Page>
      <TextTabs<Filter>
        label="What to book"
        tabs={[
          { id: 'classes', label: 'Group classes', icon: <UsersThree size={15} weight="bold" /> },
          { id: 'pt', label: '1-on-1', icon: <User size={15} weight="bold" /> },
          { id: 'events', label: 'Events', icon: <CalendarStar size={15} weight="bold" /> },
        ]}
        active={filter}
        onChange={changeFilter}
      />

      {loading ? <SkeletonList /> : (
        <>
          {/* The allowance, when the plan has one. A bar only with a ceiling —
              on an uncapped plan the count still means something, a full bar
              would not. */}
          {filter === 'classes' && entitlement && !classBlock && (
            <div>
              <div className="flex justify-between" style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                <span>
                  {entitlement.classesPerWeek == null
                    ? `${entitlement.classesUsedThisWeek} ${entitlement.classesUsedThisWeek === 1 ? 'class' : 'classes'} booked this week`
                    : `${entitlement.classesUsedThisWeek} of ${entitlement.classesPerWeek} classes this week`}
                </span>
                {entitlement.planName && <span style={{ color: 'var(--color-text-muted)' }}>{entitlement.planName}</span>}
              </div>
              {entitlement.classesPerWeek != null && entitlement.classesPerWeek > 0 && (
                <ProgressBar tone="action" style={{ marginTop: 8 }}
                  fraction={entitlement.classesUsedThisWeek / entitlement.classesPerWeek} />
              )}
            </div>
          )}

          {activeBlock && (
            <Panel glow="action">
              <p style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--color-text-secondary)' }}>{activeBlock}</p>
              <button onClick={() => navigate('/member/renew-membership')}
                style={{ marginTop: 10, fontSize: 13, color: 'var(--color-secondary)' }}>
                See plans
              </button>
            </Panel>
          )}

          {/* ── Experience level: asked, never guessed ── */}
          {filter === 'classes' && level === null && (
            <Panel glow="structure">
              <p className="flex items-center" style={{ gap: 8, fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)' }}>
                <Sparkle size={16} style={{ color: 'var(--color-primary-400)' }} /> What is your experience level?
              </p>
              <p style={{ fontSize: 12.5, marginTop: 4, lineHeight: 1.5, color: 'var(--color-text-muted)' }}>
                Classes pitched at your level are marked. You can still book any class you like.
              </p>
              <div className="flex flex-col" style={{ gap: 8, marginTop: 14 }}>
                {LEVELS.map((l) => (
                  <button key={l.id} disabled={busy} onClick={() => chooseLevel(l.id)}
                    className="text-left disabled:opacity-50"
                    style={{ minHeight: 52, padding: '9px 14px', borderRadius: 8, border: '1px solid var(--color-hairline)' }}>
                    <span className="block" style={{ fontSize: 15, color: 'var(--color-text-primary)' }}>{l.label}</span>
                    <span className="block" style={{ fontSize: 12, marginTop: 1, color: 'var(--color-text-muted)' }}>{l.desc}</span>
                  </button>
                ))}
              </div>
            </Panel>
          )}

          {/* ── 1-on-1, step one: pick a coach ── */}
          {filter === 'pt' && !selectedTrainer && (
            <section>
              <SectionHead title="Pick a coach" meta={`${trainers.length} at the gym`} />
              {trainers.length === 0 ? (
                <p style={{ marginTop: 12, fontSize: 13, color: 'var(--color-text-muted)' }}>
                  Personal training opens once the gym adds its coaching team.
                </p>
              ) : (
                <div className="noc-rows" style={{ marginTop: 4 }}>
                  {trainers.map((t, i) => (
                    <LineRow
                      key={t.id}
                      gutterWidth={46}
                      // The coach's photo when they have one — this was initials only.
                      gutter={<Avatar name={trainerName(t)} photoUrl={t.photo_url} size={36} />}
                      title={trainerName(t)}
                      meta={coachMeta(t, workDays)}
                      action="Open times"
                      onClick={() => openTrainer(t)}
                      last={i === trainers.length - 1}
                    />
                  ))}
                </div>
              )}
            </section>
          )}

          {/* ── 1-on-1, step two: the chosen coach ── */}
          {filter === 'pt' && selectedTrainer && (
            <div>
              <button onClick={() => { setSelectedTrainer(null); setSelected(null); setWeekOffset(0); }}
                className="flex items-center" style={{ gap: 7, fontSize: 13, color: 'var(--color-primary-300)' }}>
                <ArrowLeft size={15} /> All coaches
              </button>
              <p style={{ marginTop: 10, fontSize: 17, fontWeight: 600, color: 'var(--color-text-primary)' }}>
                {trainerName(selectedTrainer)}
              </p>
              <p style={{ fontSize: 12.5, marginTop: 2, color: 'var(--color-text-muted)' }}>
                {selectedTrainer.specialization ?? 'General training'} · pick an open time
              </p>
            </div>
          )}
          {filter === 'pt' && selectedTrainer && slotsLoading && <SkeletonList count={2} />}

          {/* ── The matrix ── */}
          {showMatrix && (
            <div className="flex flex-col" style={{ gap: 12 }}>
              <WeekMatrix week={week} selected={day} onSelect={setSelected} />
              <div className="flex items-center justify-between flex-wrap" style={{ gap: 10 }}>
                <Legend />
                {weekOffset === 0 && nextWeekCount > 0 && (
                  <button onClick={() => { setWeekOffset(7); setSelected(null); }}
                    style={{ fontSize: 12.5, color: 'var(--color-primary-300)' }}>
                    Next week · {nextWeekCount}
                  </button>
                )}
                {weekOffset === 7 && (
                  <button onClick={() => { setWeekOffset(0); setSelected(null); }}
                    style={{ fontSize: 12.5, color: 'var(--color-primary-300)' }}>
                    Back to this week
                  </button>
                )}
              </div>

              {filter === 'classes' && level !== null && (
                <div className="flex flex-wrap" style={{ gap: 8 }}>
                  <Chip label="For my level" icon={<Target size={14} weight="bold" />} on={recommendedOnly} onClick={() => { setRecommendedOnly((v) => !v); setSelected(null); }} />
                  {/* "You chose", not "your level": Achievements shows a
                      different, *earned* level, and naming both "level" made
                      the two screens look like they disagreed. */}
                  <Chip label={`You chose ${LEVEL_LABEL[level]} · change`} icon={<SlidersHorizontal size={14} weight="bold" />} onClick={() => setLevel(null)} />
                </div>
              )}
            </div>
          )}

          {/* ── The chosen day ── */}
          {showMatrix && (
            <section className="flex flex-col" style={{ gap: 4 }}>
              <div className="rule" style={{ marginBottom: 12 }} />
              <SectionHead
                title={dayTitle(week.days[day])}
                meta={filter === 'pt'
                  ? `${daySlots.length} open ${daySlots.length === 1 ? 'time' : 'times'}`
                  : `${dayClasses.length} ${dayClasses.length === 1 ? 'class' : 'classes'}`}
              />

              {filter === 'classes' && (
                dayClasses.length === 0 ? (
                  <p style={{ padding: '14px 0', fontSize: 13, color: 'var(--color-text-muted)' }}>
                    {classes.length === 0
                      ? 'No classes on the timetable yet — the gym publishes it weekly.'
                      : recommendedOnly
                        ? 'Nothing at your level on this day. Turn off "For my level" to see every class.'
                        : 'Nothing on this day. Pick another in the week above.'}
                  </p>
                ) : (
                  <div className="noc-rows">
                    {dayClasses.map((c, i) => {
                      const a = classAction(c, classBlock !== null);
                      return (
                        <LineRow
                          key={c.id}
                          gutter={timeLabel(c.scheduledAt)}
                          title={c.name}
                          dim={c.spotsLeft === 0 && !a.mine}
                          meta={classMeta(c)}
                          action={a.word}
                          actionTone={a.tone}
                          onClick={a.mine
                            ? () => navigate('/member/booking-history')
                            : a.bookable ? () => setConfirmClass(c)
                              : c.spotsLeft === 0 && c.waitlistOpen ? () => setWaitClass(c) : undefined}
                          last={i === dayClasses.length - 1}
                        />
                      );
                    })}
                  </div>
                )
              )}

              {filter === 'pt' && selectedTrainer && (
                daySlots.length === 0 ? (
                  <p style={{ padding: '14px 0', fontSize: 13, color: 'var(--color-text-muted)' }}>
                    {slots.length === 0
                      ? `${trainerName(selectedTrainer)} has no bookable hours in the next two weeks. Try another coach.`
                      : 'No open times on this day. Pick another in the week above.'}
                  </p>
                ) : (
                  <div className="noc-rows">
                    {daySlots.map((s, i) => {
                      // A clashing slot is shown and refused, never hidden —
                      // hiding it would say "this coach has no 10am", which is a
                      // different and wrong statement.
                      const off = ptBlock !== null || s.conflict !== null;
                      return (
                        <LineRow
                          key={s.startsAt}
                          gutter={timeLabel(s.startsAt)}
                          title={`${s.durationMinutes} min with ${selectedTrainer.first_name}`}
                          dim={off}
                          meta={s.conflict !== null ? `Clashes with ${s.conflict}` : undefined}
                          action={s.conflict !== null ? 'Busy' : ptBlock ? 'Locked' : 'Request'}
                          actionTone={off ? 'muted' : 'action'}
                          onClick={off ? undefined : () => setConfirmSlot(s)}
                          last={i === daySlots.length - 1}
                        />
                      );
                    })}
                  </div>
                )
              )}
            </section>
          )}

          {/* ── Events ── */}
          {filter === 'events' && (
            <section>
              <SectionHead title="Coming up" meta={events == null ? undefined : `${upcomingEvents.length} ${upcomingEvents.length === 1 ? 'event' : 'events'}`} />
              {events == null ? (
                <p style={{ padding: '14px 0', fontSize: 13, color: 'var(--color-text-muted)' }}>
                  Events could not be loaded. They are on the Events screen too.
                </p>
              ) : upcomingEvents.length === 0 ? (
                <p style={{ padding: '14px 0', fontSize: 13, color: 'var(--color-text-muted)' }}>
                  Nothing announced yet.
                </p>
              ) : (
                <div style={{ marginTop: 4 }}>
                  {upcomingEvents.map((e, i) => (
                    <LineRow
                      key={e.id}
                      gutter={new Date(e.starts_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      title={e.title}
                      meta={[timeLabel(e.starts_at), e.location, e.who_is_it_for].filter(Boolean).join(' · ')}
                      action="Open"
                      onClick={() => navigate('/member/events')}
                      last={i === upcomingEvents.length - 1}
                    />
                  ))}
                </div>
              )}
              <NocButton variant="ghost" className="w-full" style={{ marginTop: 16 }} onClick={() => navigate('/member/events')}>
                Events and announcements
              </NocButton>
            </section>
          )}
        </>
      )}

      {/* Confirm — group class */}
      <Modal
        isOpen={confirmClass !== null}
        onClose={() => !busy && setConfirmClass(null)}
        title="Confirm your booking"
        subtitle="Requested now, confirmed before your seat is held"
        confirmLabel={busy ? 'Sending…' : 'Request booking'}
        cancelLabel="Cancel"
        confirmDisabled={busy}
        onConfirm={submitClassBooking}>
        {confirmClass && (
          <div>
            {[
              { label: 'Class', value: confirmClass.name },
              { label: 'When', value: `${dayTitle(new Date(confirmClass.scheduledAt))}, ${timeLabel(confirmClass.scheduledAt)}` },
              { label: 'Coach', value: confirmClass.trainerName },
              { label: 'Location', value: confirmClass.location ?? 'At the gym' },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between"
                style={{ padding: '10px 0', borderBottom: '1px solid var(--color-separator)', fontSize: 14 }}>
                <span style={{ color: 'var(--color-text-muted)' }}>{row.label}</span>
                <span className="text-right" style={{ color: 'var(--color-text-primary)' }}>{row.value}</span>
              </div>
            ))}
            <p className="text-center" style={{ fontSize: 12.5, marginTop: 12, color: 'var(--color-text-muted)' }}>
              Your seat is held once the booking is confirmed.
            </p>
          </div>
        )}
      </Modal>

      {/* Confirm — personal training */}
      <Modal
        isOpen={waitClass !== null}
        onClose={() => !busy && setWaitClass(null)}
        title={waitClass?.myWaitPosition != null ? 'You are on the waitlist' : 'This class is full'}
        subtitle={waitClass
          ? `${waitClass.name} · ${waitClass.waiting} ${waitClass.waiting === 1 ? 'person' : 'people'} waiting`
          : undefined}
        confirmLabel={busy ? 'Saving…' : waitClass?.myWaitPosition != null ? 'Leave the waitlist' : 'Join the waitlist'}
        cancelLabel="Close"
        confirmDisabled={busy}
        onConfirm={toggleWaitlist}>
        {waitClass && (
          <p style={{ fontSize: 13.5, lineHeight: 1.55, color: 'var(--color-text-secondary)' }}>
            {waitClass.myWaitPosition != null
              ? `You are #${waitClass.myWaitPosition} in line. When someone cancels, everyone waiting gets a notification, and the first to book takes the spot.`
              : 'Join and you get a notification the moment someone cancels. Everyone waiting is told at the same time, and the first to book takes the spot — so book quickly when it comes.'}
          </p>
        )}
      </Modal>

      <Modal
        isOpen={confirmSlot !== null}
        onClose={() => !busy && setConfirmSlot(null)}
        title="Request this session"
        subtitle="Requested now, confirmed before it is booked"
        confirmLabel={busy ? 'Sending…' : 'Request session'}
        cancelLabel="Cancel"
        confirmDisabled={busy}
        onConfirm={submitPtRequest}>
        {confirmSlot && selectedTrainer && (
          <div>
            {[
              { label: 'Coach', value: trainerName(selectedTrainer) },
              { label: 'When', value: `${dayTitle(new Date(confirmSlot.startsAt))}, ${timeLabel(confirmSlot.startsAt)}` },
              { label: 'Length', value: `${confirmSlot.durationMinutes} min` },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between"
                style={{ padding: '10px 0', borderBottom: '1px solid var(--color-separator)', fontSize: 14 }}>
                <span style={{ color: 'var(--color-text-muted)' }}>{row.label}</span>
                <span className="text-right" style={{ color: 'var(--color-text-primary)' }}>{row.value}</span>
              </div>
            ))}
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Anything your coach should know? (optional)"
              className="field-input w-full resize-none"
              style={{ marginTop: 12 }}
            />
          </div>
        )}
      </Modal>
    </Page>
  );
}
