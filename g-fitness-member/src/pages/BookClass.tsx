import { SkeletonList } from '../components/ui/Skeleton';
import { panelStyle } from '../components/ui/Card';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import { Calendar, Clock, Users, ArrowLeft, Sparkles, Dumbbell, Lock, X, Trophy, ArrowRight } from 'lucide-react';
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
 * One class, as a row rather than a card.
 *
 * The old card stacked a title, two badges, a level line, a capacity pill,
 * three icon rows and a full-width button — around 200px, so a phone showed
 * barely two classes and the timetable could not be scanned at all. Everything
 * it said is still here; it is arranged as **time | what | act** instead of a
 * vertical list of labelled facts, which is how a timetable is actually read.
 *
 * The icons went because each one prefixed a fact that is already unambiguous:
 * nobody needs a pin to know "Studio A" is a place. Losing them buys the room
 * that makes the row fit on two lines.
 *
 * Module level, not declared in the page body — a component defined during
 * render remounts its subtree every pass and would restart each row's entry
 * animation on every keystroke elsewhere on the screen.
 */
function ClassRow({
  c, index, blocked, onBook,
}: {
  c: BookableClass;
  index: number;
  blocked: boolean;
  onBook: (c: BookableClass) => void;
}) {
  const full = c.spotsLeft === 0;
  const booked = c.myStatus != null;
  const tight = !full && c.spotsLeft <= 3;
  // A clash is not the same refusal as "full" or "your plan does not allow it",
  // so it gets its own label. The member can act on this one — by cancelling
  // the other thing — which is why it names it.
  const clash = !booked && c.conflict !== null;

  // Everything after the name, in one line. Filtered so a class with no type
  // and no location does not render " ·  · ".
  const detail = [LEVEL_LABEL[c.level], c.classType, c.trainerName, c.location]
    .filter(Boolean).join(' · ');

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.15) }}
      className="rounded-2xl p-3 flex items-stretch gap-3"
      style={panelStyle}
    >
      {/* Time is the column you scan, so it gets its own rail and the only
          tabular figures on the row — proportional digits make a list of times
          jitter left and right. */}
      <div className="flex flex-col items-center justify-center px-1 flex-shrink-0"
        style={{ minWidth: 58, borderRight: '1px solid var(--color-border)' }}>
        <span className="text-sm font-bold text-white tabular-nums leading-tight">
          {timeLabel(c.scheduledAt)}
        </span>
        <span className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
          {c.durationMinutes}m
        </span>
      </div>

      <div className="min-w-0 flex-1 flex flex-col justify-center gap-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <p className="text-sm font-bold text-white truncate">{c.name}</p>
          {c.recommended && (
            <span className="text-xs px-1.5 py-0.5 rounded-full font-bold flex items-center gap-0.5 flex-shrink-0"
              style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary)' }}>
              <Sparkles size={8} /> For you
            </span>
          )}
          {/* The onboarding interests step used to write to a localStorage blob
              nothing read. This badge is what makes answering it worth the
              member's time. */}
          {c.matchesInterest && (
            <span className="text-xs px-1.5 py-0.5 rounded-full font-bold flex-shrink-0"
              style={{ background: 'var(--color-secondary-light)', color: 'var(--color-secondary)' }}>
              You picked this
            </span>
          )}
        </div>

        {/* Wraps to two lines rather than truncating. `truncate` cut this at
            "Beginner · Cardio · Tere Bautista · …" and silently ate the room —
            which is the one fact on the row a member needs before they set off
            to the wrong studio. Clamped so a long class type still cannot push
            the row to four lines.

            Declared inline, not as `line-clamp-2`: the member app is Tailwind
            v4 with no config file, and this codebase has already shipped
            classes that emitted no CSS at all. The measurement below confirms
            the clamp is live. */}
        <p className="text-xs" style={{
          color: 'var(--color-text-muted)',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}>
          {detail}
        </p>

        {/* "18 left" alone never said *of what*, so a class of 20 and a class of
            200 read identically. The fraction stays; it just no longer needs a
            pill of its own. Amber only when it is nearly gone — a count that is
            always highlighted highlights nothing. */}
        <p className="text-xs font-semibold"
          style={{ color: full ? 'var(--color-text-muted)' : tight ? 'var(--color-secondary)' : 'var(--color-text-secondary)' }}>
          {full ? `Full · ${c.booked}/${c.capacity}` : `${c.booked}/${c.capacity} booked · ${c.spotsLeft} left`}
        </p>

        {/* Named, not "unavailable": a slot that reads as the gym's problem
            sends the member looking for another class, when what they need to
            do is cancel the thing they forgot they booked. */}
        {clash && (
          <p className="text-xs font-semibold" style={{ color: 'var(--color-secondary)' }}>
            {c.conflict}
          </p>
        )}
      </div>

      <div className="flex items-center flex-shrink-0">
        <button
          disabled={booked || full || blocked || clash}
          onClick={() => onBook(c)}
          className="px-4 h-9 rounded-full font-bold text-xs transition-all active:scale-[0.97] disabled:cursor-not-allowed whitespace-nowrap"
          style={
            booked
              ? { background: 'var(--color-primary-light)', color: 'var(--color-primary)' }
              : full || blocked || clash
                ? { background: 'var(--color-bg)', color: 'var(--color-text-muted)' }
                : { background: 'var(--color-secondary)', color: '#000' }
          }
        >
          {booked
            ? (c.myStatus === 'approved' ? 'Confirmed' : 'Pending')
            : full ? 'Full'
            : blocked ? 'Locked'
            : clash ? 'Busy'
            : 'Book'}
        </button>
      </div>
    </motion.div>
  );
}

/**
 * What the member's plan lets them do here, in one strip.
 *
 * This was two separate things stacked: an amber lock card when booking was
 * refused, and a centred grey sentence counting the weekly quota. They answer
 * the same question — *can I book, and how much is left* — so they are one
 * element that changes state, and the page has one fewer thing above the
 * timetable either way.
 *
 * Renders nothing when the plan imposes no limit worth mentioning. A strip
 * saying "you may book" on every visit is noise.
 */
function PlanStrip({
  block, entitlement, onSeePlans,
}: {
  block: string | null;
  entitlement: Entitlement | null;
  onSeePlans: () => void;
}) {
  if (block) {
    return (
      <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl p-3 flex items-start gap-2.5"
        style={{ background: 'var(--color-secondary-light)', border: '1px solid rgba(245,158,11,0.30)' }}>
        <Lock size={14} style={{ color: 'var(--color-secondary)' }} className="flex-shrink-0 mt-0.5" />
        <p className="text-xs flex-1 leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
          {block}{' '}
          <button onClick={onSeePlans} className="font-bold underline whitespace-nowrap"
            style={{ color: 'var(--color-secondary)' }}>
            See plans
          </button>
        </p>
      </motion.div>
    );
  }

  if (entitlement?.classesPerWeek == null) return null;

  const used = entitlement.classesUsedThisWeek;
  const cap = entitlement.classesPerWeek;
  return (
    <div className="flex items-center gap-2 px-1">
      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--color-border)' }}>
        <div className="h-full rounded-full"
          style={{ width: `${Math.min(100, (used / cap) * 100)}%`, background: 'var(--color-secondary)' }} />
      </div>
      <p className="text-xs whitespace-nowrap" style={{ color: 'var(--color-text-muted)' }}>
        <span className="font-bold text-white">{used}/{cap}</span> classes this week
      </p>
    </div>
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

  return (
    <div className="space-y-5 pb-4">
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

        {/* The trainers directory has no bottom-nav tab of its own — the centre
            check-in button took that slot — so this is one of its two entry
            points. See MobileMenuDock. */}
        {!selectedTrainer && (
          <button
            onClick={() => navigate('/member/trainers')}
            className="flex-shrink-0 h-9 px-3 rounded-full text-xs font-semibold flex items-center gap-1.5"
            style={{ ...panelStyle, color: 'var(--color-text-secondary)' }}>
            <Users size={14} /> Coaches
          </button>
        )}
      </motion.div>

      {/* The gym's next announcement.
          Was a full amber card with a 44px icon tile and three lines of its
          own, which made the loudest thing on a booking screen something you
          cannot book. Same facts, same tap target, one line — a nudge sized
          like a nudge. Renders nothing when there is no upcoming event, never
          a placeholder promising activity that does not exist. */}
      {!selectedTrainer && nextEvent && (
        <motion.button
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          onClick={() => navigate('/member/events')}
          className="w-full px-3 py-2.5 flex items-center gap-2 text-left rounded-xl"
          style={{ background: 'var(--color-secondary-light)' }}
        >
          <Trophy size={14} className="flex-shrink-0" style={{ color: 'var(--color-secondary)' }} />
          <span className="text-xs font-bold flex-shrink-0" style={{ color: 'var(--color-secondary)' }}>
            {new Date(nextEvent.startsAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
          <span className="text-xs font-semibold text-white truncate flex-1">{nextEvent.title}</span>
          <ArrowRight size={14} className="flex-shrink-0" style={{ color: 'var(--color-secondary)' }} />
        </motion.button>
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

      {/* Why you can't book, or how much of your allowance is left — one strip
          instead of two stacked ones. Says nothing when there is nothing to
          say. */}
      {!loading && (
        <PlanStrip
          block={activeBlock}
          entitlement={tab === 'classes' && !selectedTrainer ? entitlement : null}
          onSeePlans={() => navigate('/member/renew-membership')}
        />
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
              <div className="space-y-2">
                {LEVELS.map((l) => (
                  <button key={l.id} disabled={busy} onClick={() => chooseLevel(l.id)}
                    className="w-full rounded-xl p-3 text-left transition-all active:scale-[0.98] disabled:opacity-50"
                    style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
                    <p className="text-sm font-semibold text-white">{l.label}</p>
                    <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{l.desc}</p>
                  </button>
                ))}
              </div>
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
            classDays.map(([key, dayClasses]) => (
              <div key={key} className="space-y-2">
                {/* Sticky, so the day you are looking at stays named while you
                    scroll a fortnight of classes. `top-0` inside `<main>`,
                    which is the scroll container — the page body does not
                    scroll on this shell. */}
                <h2 className="text-xs font-bold uppercase tracking-wide sticky top-0 py-1 z-10"
                  style={{ color: 'var(--color-text-muted)', background: 'var(--color-bg)' }}>
                  {dayLabel(dayClasses[0].scheduledAt)}
                  <span className="ml-1.5 font-semibold" style={{ opacity: 0.7 }}>
                    · {dayClasses.length}
                  </span>
                </h2>
                {dayClasses.map((c, i) => (
                  <ClassRow
                    key={c.id}
                    c={c}
                    index={i}
                    blocked={classBlock !== null}
                    onBook={setConfirmClass}
                  />
                ))}
              </div>
            ))
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
          <div className="space-y-2">
            {trainers.map((t, i) => (
              <motion.button key={t.id}
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.05, 0.2) }}
                onClick={() => openTrainer(t)}
                className="w-full rounded-2xl p-4 text-left transition-all active:scale-[0.98]"
                style={panelStyle}>
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full flex items-center justify-center text-black font-bold text-sm flex-shrink-0"
                    style={{ background: 'var(--color-secondary)' }}>
                    {`${t.first_name[0] ?? ''}${t.last_name[0] ?? ''}`.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-semibold text-sm">{trainerName(t)}</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                      {t.specialization ?? 'General training'}
                    </p>
                  </div>
                </div>
              </motion.button>
            ))}
          </div>
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
            <div className="grid grid-cols-3 gap-2">
              {daySlots.map((s) => (
                /* A clashing slot is shown and disabled, never hidden. Removing
                   it would read as "this coach has no 10am", which is a
                   different and wrong statement — the coach is free, the
                   member is not. */
                <button key={s.startsAt} onClick={() => setConfirmSlot(s)}
                  disabled={ptBlock !== null || s.conflict !== null}
                  className="rounded-xl py-3 text-center transition-all active:scale-[0.96] disabled:cursor-not-allowed"
                  style={{ ...panelStyle, opacity: ptBlock !== null || s.conflict !== null ? 0.4 : 1 }}>
                  <span className="text-xs font-bold text-white block">{timeLabel(s.startsAt)}</span>
                  <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    {s.conflict !== null ? 'Busy' : `${s.durationMinutes} min`}
                  </span>
                </button>
              ))}
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
              style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}
            />
          </div>
        )}
      </Modal>
    </div>
  );
}