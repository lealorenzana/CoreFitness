import { SkeletonList } from '../components/ui/Skeleton';
import { panelStyle } from '../components/ui/Card';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { CSSProperties } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Calendar, Clock, Users, ArrowLeft, Sparkles, Dumbbell, Lock, X, Trophy, ArrowRight,
  Activity, CalendarCheck, ClipboardList, BookOpen, Flag,
} from 'lucide-react';
import Modal from '../components/ui/Modal';
import { useLiveData } from '../hooks/useLiveData';
import DateRail, { buildRail } from '../components/ui/DateRail';
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
import { listEvents } from '../lib/api/events';
import { readCache, writeCache } from '../lib/pageCache';

import type { ClassLevel } from '../types/db';
import { Page, Bento, BentoCell, RingStat, NavTile } from '../components/ui/page';

/**
 * Everything the first paint of this screen needs, cached as one object.
 *
 * Four queries fan out on mount and all four have to land before the page is
 * worth looking at, so they are remembered together — a half-restored screen
 * showing classes but no entitlement would render the booking buttons in the
 * wrong state.
 *
 * Only `load()` writes it. `chooseLevel` deliberately does not: it changes the
 * class list in place, which leaves this snapshot one level behind until the
 * next visit's background refresh corrects it, and that is the whole contract
 * of the cache — stale for exactly one round trip, never authoritative.
 */
interface BookClassSnapshot {
  memberId: string | null;
  classes: BookableClass[];
  level: ExperienceLevel | null;
  trainers: PublicTrainer[];
  entitlement: Entitlement | null;
}

const CACHE_KEY = 'member:book-class';

/**
 * Booking, against real data.
 *
 * Both halves of the booking model live here because they are one question for
 * the member — "when am I training next" — even though they are two tables:
 * a group class has a roster and a capacity, a PT session is one member and one
 * trainer in one slot.
 *
 * Neither creates a confirmed booking. Both start pending, and the front desk
 * approves them — see the admin Bookings queue.
 */

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

/** Local calendar day key — never toISOString(), which shifts a Manila evening into tomorrow. */
function dayKeyOfDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dayKey(iso: string): string {
  return dayKeyOfDate(new Date(iso));
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  if (dayKey(iso) === dayKey(today.toISOString())) return 'Today';
  if (dayKey(iso) === dayKey(tomorrow.toISOString())) return 'Tomorrow';
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function groupByDay<T>(rows: T[], iso: (row: T) => string): [string, T[]][] {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const key = dayKey(iso(row));
    const bucket = map.get(key);
    if (bucket) bucket.push(row);
    else map.set(key, [row]);
  }
  return [...map.entries()];
}

/**
 * Two lines, then an ellipsis.
 *
 * Declared inline rather than as `line-clamp-2`: the member app is Tailwind v4
 * with no config file, and this codebase has already shipped class names that
 * emitted no CSS at all. An inline property cannot fail to exist.
 */
const CLAMP_2: CSSProperties = {
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
};

/**
 * What the Book button says, and whether it can be pressed.
 *
 * Lifted out of the row because the timetable now draws a class two ways — one
 * wide feature at the head of each day, square tiles beneath it — and the two
 * must never disagree about whether a class is bookable. One function, two
 * layouts.
 *
 * A clash is not the same refusal as "full" or "your plan does not allow it",
 * so it keeps its own label. The member can act on this one — by cancelling the
 * other thing — which is why the tile goes on to name it.
 */
function classAction(c: BookableClass, blocked: boolean) {
  const full = c.spotsLeft === 0;
  const booked = c.myStatus != null;
  const clash = !booked && c.conflict !== null;
  return {
    full,
    booked,
    clash,
    tight: !full && c.spotsLeft <= 3,
    disabled: booked || full || blocked || clash,
    label: booked
      ? (c.myStatus === 'approved' ? 'Confirmed' : 'Pending')
      : full ? 'Full'
      : blocked ? 'Locked'
      : clash ? 'Busy'
      : 'Book',
    skin: (booked
      ? { background: 'var(--color-primary-light)', color: 'var(--color-primary)' }
      : full || blocked || clash
        ? { background: 'var(--color-bg)', color: 'var(--color-text-muted)' }
        : { background: 'var(--color-secondary)', color: '#000' }) as CSSProperties,
  };
}

/**
 * Everything after the name, in one line.
 *
 * Filtered so a class with no type and no location does not render " ·  · ".
 * Always rendered clamped to two lines rather than truncated: `truncate` cut
 * this at "Beginner · Cardio · Tere Bautista · …" and silently ate the room,
 * which is the one fact a member needs before they set off to the wrong studio.
 */
function classDetail(c: BookableClass): string {
  return [LEVEL_LABEL[c.level], c.classType, c.trainerName, c.location]
    .filter(Boolean).join(' · ');
}

/** How many seats are left, and of how many. Module level so both tiles agree. */
function capacityLine(c: BookableClass, long: boolean): string {
  if (c.spotsLeft === 0) return `Full · ${c.booked}/${c.capacity}`;
  return long
    ? `${c.booked}/${c.capacity} booked · ${c.spotsLeft} left`
    : `${c.spotsLeft} of ${c.capacity} left`;
}

/**
 * "For you" and "You picked this".
 *
 * The onboarding interests step used to write to a localStorage blob nothing
 * read. The second badge is what makes answering it worth the member's time.
 *
 * Module level, not declared in a render body — a component defined during
 * render remounts its whole subtree on every pass of the page above it.
 */
function ClassBadges({ c, className }: { c: BookableClass; className?: string }) {
  if (!c.recommended && !c.matchesInterest) return null;
  return (
    <div className={`flex items-center gap-1 flex-wrap ${className ?? ''}`}>
      {c.recommended && (
        <span className="px-1.5 py-0.5 rounded-full font-bold flex items-center gap-0.5"
          style={{ fontSize: 'var(--text-meta)', background: 'var(--color-primary-light)', color: 'var(--color-primary)' }}>
          <Sparkles size={9} /> For you
        </span>
      )}
      {c.matchesInterest && (
        <span className="px-1.5 py-0.5 rounded-full font-bold"
          style={{ fontSize: 'var(--text-meta)', background: 'var(--color-secondary-light)', color: 'var(--color-secondary)' }}>
          You picked this
        </span>
      )}
    </div>
  );
}

/** The Book / Full / Busy / Locked control. One button, two tile widths. */
function BookButton({
  c, action, onBook, full,
}: {
  c: BookableClass;
  action: ReturnType<typeof classAction>;
  onBook: (c: BookableClass) => void;
  /** Stretch to the cell — the square tile pins it to its own bottom edge. */
  full: boolean;
}) {
  return (
    <button
      disabled={action.disabled}
      onClick={() => onBook(c)}
      className={`h-9 rounded-full font-bold transition-all active:scale-[0.97] disabled:cursor-not-allowed whitespace-nowrap ${full ? 'w-full' : 'px-5'}`}
      style={{ fontSize: 'var(--text-meta)', ...action.skin }}
    >
      {action.label}
    </button>
  );
}

/**
 * The first class of a day, as the wide cell of the bento.
 *
 * Every day has a next thing on it, and that is a real hierarchy rather than an
 * invented one — so it gets the full width, the larger name and a rule above
 * its action row. The square tiles under it carry exactly the same facts in the
 * same order; only the room differs.
 */
function ClassFeature({
  c, blocked, onBook,
}: {
  c: BookableClass;
  blocked: boolean;
  onBook: (c: BookableClass) => void;
}) {
  const a = classAction(c, blocked);
  return (
    <BentoCell wide>
      <div className="flex items-start gap-3">
        {/* A mark for the kind of session, then the time above the name — the
            arrangement from the reference the gym chose. The time keeps its
            tabular figures: proportional digits make a column of times jitter
            left and right as you scan down it. */}
        <span className="flex-shrink-0 w-11 h-11 rounded-xl grid place-items-center"
          style={{ background: 'var(--color-primary-light)' }} aria-hidden>
          <Dumbbell size={19} style={{ color: 'var(--color-primary)' }} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="tabular-nums leading-none"
            style={{ fontSize: 'var(--text-meta)', color: 'var(--color-text-muted)' }}>
            {timeLabel(c.scheduledAt)} · {c.durationMinutes}m
          </p>
          <p className="mt-1 font-bold text-white leading-snug" style={{ fontSize: 'var(--text-title)' }}>
            {c.name}
          </p>
          <p className="mt-1" style={{ fontSize: 'var(--text-meta)', color: 'var(--color-text-muted)', ...CLAMP_2 }}>
            {classDetail(c)}
          </p>
          <ClassBadges c={c} className="mt-1.5" />
        </div>
      </div>

      <div className="flex items-center gap-3 mt-3 pt-3" style={{ borderTop: '1px solid var(--color-border)' }}>
        <div className="min-w-0 flex-1">
          {/* "18 left" alone never said *of what*, so a class of 20 and a class
              of 200 read identically. Amber only when it is nearly gone — a
              count that is always highlighted highlights nothing. */}
          <p className="font-semibold" style={{
            fontSize: 'var(--text-meta)',
            color: a.full ? 'var(--color-text-muted)'
              : a.tight ? 'var(--color-secondary)'
              : 'var(--color-text-secondary)',
          }}>
            {capacityLine(c, true)}
          </p>
          {/* Named, not "unavailable": a slot that reads as the gym's problem
              sends the member looking for another class, when what they need to
              do is cancel the thing they forgot they booked. */}
          {a.clash && (
            <p className="font-semibold mt-0.5" style={{ fontSize: 'var(--text-meta)', color: 'var(--color-secondary)' }}>
              {c.conflict}
            </p>
          )}
        </div>
        <BookButton c={c} action={a} onBook={onBook} full={false} />
      </div>
    </BentoCell>
  );
}

/**
 * Every other class of the day, as a square cell.
 *
 * The time leads because that is what a member scans a timetable for. The
 * action is pushed to the bottom with `mt-auto`, so a row of two tiles has one
 * line of buttons across it however unevenly the names wrap above them.
 */
function ClassTile({
  c, blocked, wide, onBook,
}: {
  c: BookableClass;
  blocked: boolean;
  /** Set on the last tile of an odd count, so the grid never ends half empty. */
  wide: boolean;
  onBook: (c: BookableClass) => void;
}) {
  const a = classAction(c, blocked);
  return (
    <BentoCell wide={wide}>
      <div className="flex items-start justify-between gap-2">
        <span className="flex-shrink-0 w-9 h-9 rounded-xl grid place-items-center"
          style={{ background: 'var(--color-primary-light)' }} aria-hidden>
          <Dumbbell size={16} style={{ color: 'var(--color-primary)' }} />
        </span>
        <span className="text-right leading-none">
          <span className="block tabular-nums font-bold text-white" style={{ fontSize: 'var(--text-body)' }}>
            {timeLabel(c.scheduledAt)}
          </span>
          <span className="block mt-1 tabular-nums" style={{ fontSize: 'var(--text-meta)', color: 'var(--color-text-muted)' }}>
            {c.durationMinutes}m
          </span>
        </span>
      </div>

      <p className="mt-3 font-bold text-white leading-snug" style={{ fontSize: 'var(--text-body)', ...CLAMP_2 }}>
        {c.name}
      </p>
      <p className="mt-1" style={{ fontSize: 'var(--text-meta)', color: 'var(--color-text-muted)', ...CLAMP_2 }}>
        {classDetail(c)}
      </p>
      <ClassBadges c={c} className="mt-1.5" />
      <p className="mt-1.5 font-semibold" style={{
        fontSize: 'var(--text-meta)',
        color: a.full ? 'var(--color-text-muted)'
          : a.tight ? 'var(--color-secondary)'
          : 'var(--color-text-secondary)',
      }}>
        {capacityLine(c, false)}
      </p>
      {a.clash && (
        <p className="font-semibold mt-0.5" style={{ fontSize: 'var(--text-meta)', color: 'var(--color-secondary)' }}>
          {c.conflict}
        </p>
      )}

      <div className="mt-auto pt-3">
        <BookButton c={c} action={a} onBook={onBook} full />
      </div>
    </BentoCell>
  );
}

/**
 * Why the member cannot book, as the amber cell of the bento.
 *
 * Renders only when there is something to refuse. A cell saying "you may book"
 * on every visit is noise, and the timetable below already implies it.
 */
function BlockCell({ block, onSeePlans }: { block: string; onSeePlans: () => void }) {
  return (
    <BentoCell wide tone="secondary">
      <div className="flex items-start gap-2.5">
        <Lock size={14} style={{ color: 'var(--color-secondary)' }} className="flex-shrink-0 mt-0.5" />
        <p className="flex-1 leading-relaxed" style={{ fontSize: 'var(--text-meta)', color: 'var(--color-text-secondary)' }}>
          {block}{' '}
          <button onClick={onSeePlans} className="font-bold underline whitespace-nowrap"
            style={{ color: 'var(--color-secondary)' }}>
            See plans
          </button>
        </p>
      </div>
    </BentoCell>
  );
}

/**
 * The weekly allowance, as a ring rather than a progress bar.
 *
 * This was a hairline bar with a sentence beside it, sitting alone above the
 * timetable. Same two numbers — they come from `getEntitlement`, which counts
 * the same week `date_trunc('week')` counts in 0017 — in a cell that belongs to
 * a grid instead of floating between sections.
 *
 * The ring is drawn only when the plan has a ceiling. On an uncapped plan the
 * number still means something ("you have booked two classes this week") and a
 * ring drawn full would be decoration pretending to be a measurement.
 */
function WeekCell({ entitlement }: { entitlement: Entitlement }) {
  const used = entitlement.classesUsedThisWeek;
  const cap = entitlement.classesPerWeek;
  return (
    <RingStat
      icon={<CalendarCheck size={16} />}
      value={cap == null ? used : `${used}/${cap}`}
      label={cap == null ? 'classes booked this week' : 'classes this week'}
      fraction={cap == null || cap === 0 ? undefined : used / cap}
      tone="secondary"
    />
  );
}

export default function BookClass() {
  const navigate = useNavigate();
  // A trainer profile can deep-link straight into that coach's open slots.
  const deepLinkTrainerId = (useLocation().state as { trainerId?: string } | null)?.trainerId ?? null;
  const [tab, setTab] = useState<'classes' | 'pt'>(deepLinkTrainerId ? 'pt' : 'classes');
  /** Calendar filter. Null = the whole fortnight. */
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const cached = readCache<BookClassSnapshot>(CACHE_KEY);
  const [memberId, setMemberId] = useState<string | null>(cached?.memberId ?? null);
  const [loading, setLoading] = useState(cached === undefined);
  const [busy, setBusy] = useState(false);
  const [entitlement, setEntitlement] = useState<Entitlement | null>(cached?.entitlement ?? null);

  // Group classes
  const [classes, setClasses] = useState<BookableClass[]>(cached?.classes ?? []);
  const [level, setLevel] = useState<ExperienceLevel | null>(cached?.level ?? null);
  const [recommendedOnly, setRecommendedOnly] = useState(false);
  const [confirmClass, setConfirmClass] = useState<BookableClass | null>(null);

  // Personal training
  const [trainers, setTrainers] = useState<PublicTrainer[]>(cached?.trainers ?? []);
  const [selectedTrainer, setSelectedTrainer] = useState<PublicTrainer | null>(null);
  const [slots, setSlots] = useState<BookableSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [confirmSlot, setConfirmSlot] = useState<BookableSlot | null>(null);
  const [notes, setNotes] = useState('');

  /**
   * `quiet` is what makes the background refresh usable.
   *
   * A silent re-poll must not flip the screen back to skeletons, and must not
   * raise a toast if the phone happened to be on a dead spot of wifi — the
   * member did not ask for this fetch, so it has no business interrupting them.
   * Only the first load, and an explicit action, are allowed to do either.
   */
  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const id = await getCurrentMemberId();
      setMemberId(id);
      if (!id) {
        if (!quiet) toast.error('Your session could not be verified. Please sign in again.');
        return;
      }
      const [bookable, lvl, coaches, ent] = await Promise.all([
        listBookableClasses(id),
        getExperienceLevel(id),
        listPublicTrainers().catch(() => [] as PublicTrainer[]),
        getEntitlement(id),
      ]);
      setClasses(bookable);
      setLevel(lvl);
      setTrainers(coaches);
      setEntitlement(ent);
      writeCache<BookClassSnapshot>(CACHE_KEY, {
        memberId: id, classes: bookable, level: lvl, trainers: coaches, entitlement: ent,
      });
    } catch (err) {
      if (!quiet) toast.error(errorMessage(err, 'Could not load the schedule'));
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  // Quiet when the cache already put a schedule on screen — see Home.tsx.
  const revisit = useRef(cached !== undefined);
  useEffect(() => { load(revisit.current); }, [load]);

  // Approval happens on the front desk's screen, not this one, so the member
  // would otherwise sit looking at a stale "Pending" until they navigated away
  // and back. Pull-to-refresh used to be the workaround; it reloaded the entire
  // app and is now disabled.
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

  const openTrainer = async (trainer: PublicTrainer) => {
    setSelectedTrainer(trainer);
    // Each coach has their own hours, so a date picked against the last one
    // would filter this one's list against a day they may not even work.
    setSelectedDay(null);
    setSlots([]);
    setSlotsLoading(true);
    try {
      setSlots(await listOpenPtSlots(trainer.id, 14, memberId ?? undefined));
    } catch (err) {
      toast.error(errorMessage(err, 'Could not load open times'));
    } finally {
      setSlotsLoading(false);
    }
  };

  // Deep link from a trainer profile: open their slots as soon as the roster
  // arrives. Guarded on `selectedTrainer` so backing out doesn't re-open it.
  useEffect(() => {
    if (!deepLinkTrainerId || selectedTrainer || trainers.length === 0) return;
    const match = trainers.find((t) => t.id === deepLinkTrainerId);
    if (match) openTrainer(match);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkTrainerId, trainers, selectedTrainer]);

  const submitClassBooking = async () => {
    if (!memberId || !confirmClass) return;
    setBusy(true);
    try {
      await bookClass(memberId, confirmClass.id);
      setConfirmClass(null);
      toast.success('Requested — the front desk will confirm it');
      // Refresh the quota alongside the list — a weekly allowance that still
      // reads "0 of 1 booked" after booking is worse than showing no quota.
      const [refreshed, ent] = await Promise.all([
        listBookableClasses(memberId),
        getEntitlement(memberId),
      ]);
      setClasses(refreshed);
      setEntitlement(ent);
    } catch (err) {
      toast.error(errorMessage(err, 'Could not book that class'));
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
      toast.success('Requested — the front desk will confirm it');
      // Re-derive: the slot just taken must disappear for everyone, including us.
      setSlots(await listOpenPtSlots(selectedTrainer.id, 14, memberId ?? undefined));
    } catch (err) {
      toast.error(errorMessage(err, 'Could not request that session'));
    } finally {
      setBusy(false);
    }
  };

  const visibleClasses = useMemo(
    () => (recommendedOnly ? classes.filter((c) => c.recommended) : classes),
    [classes, recommendedOnly]
  );
  const allClassDays = useMemo(() => groupByDay(visibleClasses, (c) => c.scheduledAt), [visibleClasses]);
  const allSlotDays = useMemo(() => groupByDay(slots, (s) => s.startsAt), [slots]);

  // The calendar rail. Built over a fixed fortnight rather than only the days
  // that happen to have something on them — the empty days are the point: they
  // are how a member sees that Thursday is free without tapping anything.
  const rail = useMemo(() => {
    const source = tab === 'pt' ? allSlotDays : allClassDays;
    const counts = new Map(source.map(([key, rows]) => [key, rows.length]));
    return buildRail(14, dayKeyOfDate, (key) => counts.get(key) ?? 0);
  }, [tab, allClassDays, allSlotDays]);

  const classDays = selectedDay ? allClassDays.filter(([key]) => key === selectedDay) : allClassDays;
  const slotDays = selectedDay ? allSlotDays.filter(([key]) => key === selectedDay) : allSlotDays;

  // Why the member can't book, in the order they'd hit it. Mirrors the trigger
  // in 0017 — that is what actually enforces this; these are the words for it.
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

  const activeBlock = tab === 'pt' || selectedTrainer ? ptBlock : classBlock;

  // The gym's next announcement. This used to sit on Home, which had grown to
  // ten stacked sections; it belongs on the screen where members plan what they
  // are going to do. Renders nothing when there is no upcoming event - never a
  // placeholder card promising activity that does not exist.
  const [nextEvent, setNextEvent] = useState<{ title: string; startsAt: string; location: string | null } | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await listEvents();
        const now = Date.now();
        const soonest = rows
          .filter((e) => e.starts_at && new Date(e.starts_at).getTime() > now)
          .sort((a, b) => new Date(a.starts_at!).getTime() - new Date(b.starts_at!).getTime())[0];
        if (!cancelled && soonest) {
          setNextEvent({ title: soonest.title, startsAt: soonest.starts_at!, location: soonest.location ?? null });
        }
      } catch {
        // A banner is a nudge, not a section. If it cannot load, the Events
        // page is still one tap away from Profile - no error is warranted.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  /**
   * What the bento above the timetable has to show.
   *
   * Gated per cell rather than as a block: the weekly allowance needs an
   * entitlement that may still be in flight, the coaches cell does not, and a
   * failed entitlement read should not take the roster down with it. The grid
   * itself renders only if at least one cell will — an empty grid is still a
   * `--stack` of dead space between the tabs and the first class.
   */
  const showWeek = !loading && !selectedTrainer && tab === 'classes' && entitlement !== null;
  // Classes tab only. On Personal training the roster is the screen — a cell
  // above it counting the same coaches is the sort of duplication this app has
  // already had to take back out once.
  const showCoaches = !loading && !selectedTrainer && tab === 'classes' && trainers.length > 0;
  const showEvent = !loading && !selectedTrainer && nextEvent !== null;
  const showBento = showWeek || showCoaches || showEvent || (!loading && activeBlock !== null);

  return (
    <Page>
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3">
        <button
          onClick={() => (selectedTrainer ? setSelectedTrainer(null) : navigate('/member/home'))}
          className="w-10 h-10 rounded-full flex items-center justify-center"
          style={{ ...panelStyle, color: 'var(--color-text-secondary)' }}>
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          {/* A coach's name stays in the body face — `.display` is condensed
              uppercase and mangles a person's name. */}
          <h1 className={selectedTrainer ? 'text-lg font-bold text-white truncate' : 'display text-xl text-white'}>
            {selectedTrainer ? trainerName(selectedTrainer) : 'Book a Session'}
          </h1>
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            {selectedTrainer ? 'Pick an open time' : 'Group classes and 1-on-1 training'}
          </p>
        </div>

      </motion.div>

      {/* The rest of Training, one tap away.

          This screen IS the Training tab — the tab opens the thing a member
          came to do rather than a grid in front of it. These are the six other
          training destinations.

          They were a scrolling rail of chips, and a rail was the wrong shape
          for a fixed set of six: two of them sat off the right edge with the
          second one sliced down the middle, which reads as a screen that has
          not finished loading rather than as something you can swipe. Six is a
          number you can just show. Three across, two rows, nothing hidden and
          nothing cut.

          Violet, not amber: these are structure. Amber on this screen belongs
          to Book, and six amber tiles above it would outshout the one control
          that actually does something.

          Hidden while a coach is selected — that view is a single task, and a
          shortcut out of it mid-booking is an invitation to lose your place. */}
      {!selectedTrainer && (
        <Bento cols={3}>
          {([
            ['Progress', <Activity size={18} />, '/member/progress'],
            ['My bookings', <CalendarCheck size={18} />, '/member/booking-history'],
            ['Training plan', <ClipboardList size={18} />, '/member/plan'],
            ['Free workouts', <BookOpen size={18} />, '/member/workouts'],
            ['Challenges', <Flag size={18} />, '/member/challenges'],
            ['Events', <Trophy size={18} />, '/member/events'],
          ] as const).map(([label, icon, to]) => (
            <NavTile key={label} label={label} icon={icon} onClick={() => navigate(to)} />
          ))}
        </Bento>
      )}

      {/* Tabs — hidden while picking a slot, that flow has its own back button.
          Switching clears the date filter: the rail's counts are per tab, so
          Thursday having a class says nothing about Thursday having a free PT
          slot. */}
      {!selectedTrainer && (
        <div className="grid grid-cols-2 gap-1 p-1"
          style={{ ...panelStyle, borderRadius: 'var(--radius-btn)' }} role="tablist">
          {([['classes', 'Group classes'], ['pt', 'Personal training']] as const).map(([id, label]) => (
            <button key={id} onClick={() => { setTab(id); setSelectedDay(null); }} role="tab" aria-selected={tab === id}
              className="py-2 rounded-full font-semibold text-xs transition-colors"
              style={{
                background: tab === id ? 'var(--color-primary)' : 'transparent',
                color: tab === id ? '#fff' : 'var(--color-text-muted)',
              }}>
              {label}
            </button>
          ))}
        </div>
      )}

      {/* The state of play, as a bento: what your plan allows, who is coaching,
          and what the gym has coming. Three things that used to be a hairline
          progress bar, a pill in the header and a full-width amber banner —
          each floating on its own between sections, none of them related to
          each other on screen even though they answer the same question:
          *what can I book right now.* */}
      {showBento && (
        <Bento>
          {showWeek && entitlement && <WeekCell entitlement={entitlement} />}

          {/* The trainers directory has no bottom-nav tab of its own — the
              centre check-in button took that slot — so this is one of its two
              entry points. It was a 9px pill in the header; here it says how
              many coaches there are, which is the fact that decides whether
              tapping it is worth it. Takes the full width when the allowance
              cell is not there to sit beside. */}
          {showCoaches && (
            /* Same gauge frame as the allowance beside it, with the ring left
               as a bare track: a roster has no ceiling to be a fraction of, and
               a ring drawn full here would be decoration pretending to be a
               measurement. That is RingStat's existing contract — omit
               `fraction` and the ring stops claiming anything. */
            <RingStat
              wide={!showWeek}
              icon={<Users size={16} />}
              value={trainers.length}
              label={trainers.length === 1 ? 'coach · see profiles' : 'coaches · see profiles'}
              onClick={() => navigate('/member/trainers')}
            />
          )}

          {!loading && activeBlock && (
            <BlockCell block={activeBlock} onSeePlans={() => navigate('/member/renew-membership')} />
          )}

          {/* The gym's next announcement. Renders nothing when there is no
              upcoming event, never a placeholder promising activity that does
              not exist. */}
          {showEvent && nextEvent && (
            <BentoCell wide tone="flat" onClick={() => navigate('/member/events')}>
              <div className="flex items-center gap-2">
                <Trophy size={14} className="flex-shrink-0" style={{ color: 'var(--color-secondary)' }} />
                <span className="font-bold flex-shrink-0" style={{ fontSize: 'var(--text-meta)', color: 'var(--color-secondary)' }}>
                  {new Date(nextEvent.startsAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
                <span className="font-semibold text-white truncate flex-1" style={{ fontSize: 'var(--text-meta)' }}>
                  {nextEvent.title}
                </span>
                <ArrowRight size={14} className="flex-shrink-0" style={{ color: 'var(--color-secondary)' }} />
              </div>
            </BentoCell>
          )}
        </Bento>
      )}

      {loading ? (
        <SkeletonList />
      ) : tab === 'classes' && !selectedTrainer ? (
        <>
          {/* Experience level — asked here rather than guessed, because nothing
              can be recommended without it. */}
          {level === null ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-2xl p-4 space-y-3" style={panelStyle}>
              <div className="flex items-center gap-2">
                <Sparkles size={16} style={{ color: 'var(--color-secondary)' }} />
                <p className="text-sm font-bold text-white">What's your experience level?</p>
              </div>
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                We'll flag the classes pitched at your level. You can still book any class you like.
              </p>
              {/* Three choices, so the last one takes the width the other two
                  share. A list of three full-width rows made the middle option
                  look like the recommended one purely by being in the middle. */}
              <Bento>
                {LEVELS.map((l, i) => (
                  <BentoCell key={l.id} tone="flat" disabled={busy} wide={i === LEVELS.length - 1}
                    onClick={() => chooseLevel(l.id)} className="disabled:opacity-50">
                    <p className="font-semibold text-white" style={{ fontSize: 'var(--text-body)' }}>{l.label}</p>
                    <p className="mt-1 leading-snug" style={{ fontSize: 'var(--text-meta)', color: 'var(--color-text-muted)' }}>
                      {l.desc}
                    </p>
                  </BentoCell>
                ))}
              </Bento>
            </motion.div>
          ) : null}

          {allClassDays.length > 0 && (
            <>
              <DateRail days={rail} selected={selectedDay} onSelect={setSelectedDay} />

              {/* One row for both filters, directly under the calendar they
                  narrow. The level used to be a sentence with an underlined
                  "change" inside it — a text link the size of two words, on a
                  phone, as the only way to correct a choice that reshapes the
                  whole list. Both are chips now, both the same size, and both
                  say what they currently are rather than what they would do. */}
              {level !== null && (
                <div className="flex items-center gap-2">
                  <button onClick={() => setRecommendedOnly((v) => !v)}
                    className="px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1 flex-shrink-0"
                    style={{
                      background: recommendedOnly ? 'var(--color-primary)' : 'var(--color-surface-raised)',
                      color: recommendedOnly ? '#fff' : 'var(--color-text-muted)',
                      border: `1px solid ${recommendedOnly ? 'var(--color-primary)' : 'var(--color-border)'}`,
                    }}>
                    <Sparkles size={11} /> For my level
                  </button>

                  {/* "You chose", not "your level". Progress shows a *different*
                      level — the one earned from check-ins here — and labelling
                      both the same made the two screens look like they
                      disagreed. */}
                  {/* `capitalize` sits on the level alone. On the whole button
                      it title-cased the sentence into "You Chose Beginner". */}
                  <button onClick={() => setLevel(null)}
                    className="px-3 py-1.5 rounded-full text-xs font-semibold flex-shrink-0 flex items-center gap-1"
                    style={{
                      background: 'var(--color-surface-raised)',
                      border: '1px solid var(--color-border)',
                      color: 'var(--color-text-muted)',
                    }}>
                    You chose <span className="capitalize text-white">{level}</span>
                    <X size={11} />
                  </button>

                  {selectedDay && (
                    <button
                      onClick={() => setSelectedDay(null)}
                      className="ml-auto flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-full flex-shrink-0"
                      style={{ background: 'var(--color-surface-high)', color: 'var(--color-text-secondary)' }}
                    >
                      <X size={11} /> All days
                    </button>
                  )}
                </div>
              )}
            </>
          )}

          {classDays.length === 0 ? (
            <div className="rounded-2xl p-8 text-center" style={panelStyle}>
              <Calendar size={40} className="mx-auto mb-3" style={{ color: 'var(--color-border)' }} />
              <p className="font-medium text-white text-sm">
                {selectedDay
                  ? 'Nothing on this day'
                  : classes.length === 0
                    ? 'No classes scheduled yet'
                    : 'Nothing at your level right now'}
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                {classes.length === 0
                  ? 'The gym publishes the weekly timetable — check back soon.'
                  : 'Turn off the filter to see every class on the timetable.'}
              </p>
            </div>
          ) : (
            classDays.map(([key, dayClasses]) => {
              /* The day's first class leads the bento at full width; the rest
                 are squares under it. That hierarchy is real rather than
                 decorative — the next thing happening is the thing a member
                 opening this screen is most likely to be looking for — which is
                 why it is not the *recommended* class that gets the width. A
                 filter can empty "recommended"; a day always has a first. */
              const [first, ...rest] = dayClasses;
              return (
                <div key={key} className="flex flex-col" style={{ gap: 'var(--stack-tight)' }}>
                  {/* Sticky, so the day you are looking at stays named while you
                      scroll a fortnight of classes. `top-0` inside `<main>`,
                      which is the scroll container — the page body does not
                      scroll on this shell. */}
                  <h2 className="text-xs font-bold uppercase tracking-wide sticky top-0 py-1 z-10"
                    style={{ color: 'var(--color-text-muted)', background: 'var(--color-bg)' }}>
                    {dayLabel(first.scheduledAt)}
                    <span className="ml-1.5 font-semibold" style={{ opacity: 0.7 }}>
                      · {dayClasses.length}
                    </span>
                  </h2>
                  <Bento>
                    <ClassFeature c={first} blocked={classBlock !== null} onBook={setConfirmClass} />
                    {rest.map((c, i) => (
                      <ClassTile
                        key={c.id}
                        c={c}
                        blocked={classBlock !== null}
                        /* An odd tail would leave a half-width hole at the
                           bottom of the day, which reads as a missing class
                           rather than as a layout. */
                        wide={rest.length % 2 === 1 && i === rest.length - 1}
                        onBook={setConfirmClass}
                      />
                    ))}
                  </Bento>
                </div>
              );
            })
          )}
        </>
      ) : !selectedTrainer ? (
        /* ─── Personal Training: pick a coach ─── */
        trainers.length === 0 ? (
          <div className="rounded-2xl p-8 text-center" style={panelStyle}>
            <Dumbbell size={40} className="mx-auto mb-3" style={{ color: 'var(--color-border)' }} />
            <p className="font-medium text-white text-sm">No trainers available yet</p>
            <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
              Personal training opens once the gym adds its coaching team.
            </p>
          </div>
        ) : (
          /* Two to a row rather than a stack of full-width rows. A coach is
             picked by looking at the set of them — the old list showed three on
             a phone and made choosing a scroll — and the odd one out takes the
             width so the grid never ends ragged. */
          <Bento>
            {trainers.map((t, i) => (
              <BentoCell
                key={t.id}
                onClick={() => openTrainer(t)}
                wide={trainers.length % 2 === 1 && i === trainers.length - 1}
              >
                <span className="w-11 h-11 rounded-full flex items-center justify-center text-black font-bold flex-shrink-0"
                  style={{ background: 'var(--color-secondary)', fontSize: 'var(--text-body)' }}>
                  {`${t.first_name[0] ?? ''}${t.last_name[0] ?? ''}`.toUpperCase()}
                </span>
                <p className="mt-3 text-white font-semibold leading-snug" style={{ fontSize: 'var(--text-body)', ...CLAMP_2 }}>
                  {trainerName(t)}
                </p>
                <p className="mt-1 leading-snug"
                  style={{ fontSize: 'var(--text-meta)', color: 'var(--color-text-muted)', ...CLAMP_2 }}>
                  {t.specialization ?? 'General training'}
                </p>
                <p className="mt-auto pt-3 flex items-center gap-1 font-semibold"
                  style={{ fontSize: 'var(--text-meta)', color: 'var(--color-secondary)' }}>
                  See open times <ArrowRight size={11} className="flex-shrink-0" />
                </p>
              </BentoCell>
            ))}
          </Bento>
        )
      ) : slotsLoading ? (
        <p className="text-sm text-center py-10" style={{ color: 'var(--color-text-muted)' }}>Finding open times…</p>
      ) : (
        <>
          {/* Who you are booking, kept on screen. The coach's name is in the
              page header too, but that scrolls away and the grid of bare times
              below gives no clue whose hours they are. */}
          <div className="flex items-center gap-3 rounded-2xl p-3" style={panelStyle}>
            <div className="w-9 h-9 rounded-full flex items-center justify-center text-black font-bold text-xs flex-shrink-0"
              style={{ background: 'var(--color-secondary)' }}>
              {`${selectedTrainer.first_name[0] ?? ''}${selectedTrainer.last_name[0] ?? ''}`.toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-white truncate">{trainerName(selectedTrainer)}</p>
              <p className="text-xs truncate" style={{ color: 'var(--color-text-muted)' }}>
                {selectedTrainer.specialization ?? 'General training'}
              </p>
            </div>
            <button onClick={() => setSelectedTrainer(null)}
              className="px-3 py-1.5 rounded-full text-xs font-semibold flex-shrink-0"
              style={{ background: 'var(--color-surface-high)', color: 'var(--color-text-secondary)' }}>
              Change
            </button>
          </div>

          {allSlotDays.length > 0 && (
            <>
              <DateRail days={rail} selected={selectedDay} onSelect={setSelectedDay} />
              {selectedDay && (
                <div className="flex justify-end">
                  <button
                    onClick={() => setSelectedDay(null)}
                    className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-full"
                    style={{ background: 'var(--color-surface-high)', color: 'var(--color-text-secondary)' }}
                  >
                    <X size={11} /> All days
                  </button>
                </div>
              )}
            </>
          )}

          {slotDays.length === 0 ? (
            <div className="rounded-2xl p-8 text-center" style={panelStyle}>
              <Clock size={40} className="mx-auto mb-3" style={{ color: 'var(--color-border)' }} />
              <p className="font-medium text-white text-sm">
                {selectedDay ? 'Nothing on this day' : 'No open times'}
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                {selectedDay
                  ? 'Pick another date, or show all.'
                  : `${trainerName(selectedTrainer)} has no bookable hours in the next two weeks. Try another coach.`}
              </p>
            </div>
          ) : (
            slotDays.map(([key, daySlots]) => (
          <div key={key} className="space-y-2">
            <h2 className="text-xs font-bold uppercase tracking-wide sticky top-0 py-1 z-10"
              style={{ color: 'var(--color-text-muted)', background: 'var(--color-bg)' }}>
              {dayLabel(daySlots[0].startsAt)}
              <span className="ml-1.5 font-semibold" style={{ opacity: 0.7 }}>· {daySlots.length}</span>
            </h2>
            {/* Three columns here, not the bento's two: a slot carries a time
                and a length and nothing else, so it needs a third of the width
                rather than half, and a fortnight of a coach's hours is a lot of
                tiles to scroll. Same radius and padding as the bento cells
                above so the two grids read as one family. */}
            <div className="grid grid-cols-3" style={{ gap: 'var(--stack-tight)' }}>
              {daySlots.map((s) => {
                /* A clashing slot is shown and disabled, never hidden. Removing
                   it would read as "this coach has no 10am", which is a
                   different and wrong statement — the coach is free, the
                   member is not. */
                const off = ptBlock !== null || s.conflict !== null;
                return (
                  <button key={s.startsAt} onClick={() => setConfirmSlot(s)} disabled={off}
                    className="rounded-2xl py-3.5 text-center transition-all active:scale-[0.96] disabled:cursor-not-allowed"
                    style={{
                      background: off ? 'var(--color-surface)' : 'var(--color-surface-raised)',
                      border: `1px solid ${off ? 'var(--color-border)' : 'rgba(245,158,11,0.30)'}`,
                      opacity: off ? 0.45 : 1,
                    }}>
                    <span className="block tabular-nums font-bold text-white leading-none"
                      style={{ fontSize: 'var(--text-body)' }}>
                      {timeLabel(s.startsAt)}
                    </span>
                    <span className="block mt-1.5 leading-none"
                      style={{ fontSize: 'var(--text-meta)', color: s.conflict !== null ? 'var(--color-secondary)' : 'var(--color-text-muted)' }}>
                      {s.conflict !== null ? 'Busy' : `${s.durationMinutes} min`}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* The detail lives here rather than on each tile. A three-column
                grid has no room for a sentence, and this app has no hover — a
                `data-tip` or a `title=` would be a flag nothing reads on a
                phone. One line per day, listing only the times that clash, is
                the version a member can actually act on. */}
            {daySlots.some((s) => s.conflict !== null) && (
              <p className="text-xs" style={{ color: 'var(--color-secondary)' }}>
                {daySlots.filter((s) => s.conflict !== null)
                  .map((s) => `${timeLabel(s.startsAt)} — ${s.conflict}`)
                  .join(' · ')}
              </p>
            )}
          </div>
            ))
          )}
        </>
      )}

      {/* Confirm — group class */}
      <Modal
        isOpen={confirmClass !== null}
        onClose={() => !busy && setConfirmClass(null)}
        title="Confirm your booking"
        subtitle="The front desk approves bookings"
        confirmLabel={busy ? 'Sending…' : 'Request booking'}
        cancelLabel="Cancel"
        confirmDisabled={busy}
        onConfirm={submitClassBooking}>
        {confirmClass && (
          <div className="space-y-2 text-sm">
            {[
              { label: 'Class', value: confirmClass.name },
              { label: 'When', value: `${dayLabel(confirmClass.scheduledAt)}, ${timeLabel(confirmClass.scheduledAt)}` },
              { label: 'Trainer', value: confirmClass.trainerName },
              { label: 'Location', value: confirmClass.location ?? 'Core Fitness' },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between py-2"
                style={{ borderBottom: '1px solid var(--color-border)' }}>
                <span style={{ color: 'var(--color-text-muted)' }}>{row.label}</span>
                <span className="font-semibold text-white text-right">{row.value}</span>
              </div>
            ))}
            <p className="text-xs mt-3 text-center" style={{ color: 'var(--color-text-muted)' }}>
              Your seat is held once the front desk confirms it.
            </p>
          </div>
        )}
      </Modal>

      {/* Confirm — personal training */}
      <Modal
        isOpen={confirmSlot !== null}
        onClose={() => !busy && setConfirmSlot(null)}
        title="Request this session"
        subtitle="The front desk approves personal training"
        confirmLabel={busy ? 'Sending…' : 'Request session'}
        cancelLabel="Cancel"
        confirmDisabled={busy}
        onConfirm={submitPtRequest}>
        {confirmSlot && selectedTrainer && (
          <div className="space-y-2 text-sm">
            {[
              { label: 'Trainer', value: trainerName(selectedTrainer) },
              { label: 'When', value: `${dayLabel(confirmSlot.startsAt)}, ${timeLabel(confirmSlot.startsAt)}` },
              { label: 'Length', value: `${confirmSlot.durationMinutes} min` },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between py-2"
                style={{ borderBottom: '1px solid var(--color-border)' }}>
                <span style={{ color: 'var(--color-text-muted)' }}>{row.label}</span>
                <span className="font-semibold text-white text-right">{row.value}</span>
              </div>
            ))}
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Anything your trainer should know? (optional)"
              className="w-full mt-2 rounded-xl p-3 text-xs text-white resize-none"
              style={{ background: 'var(--color-surface-high)' }}
            />
          </div>
        )}
      </Modal>
    </Page>
  );
}