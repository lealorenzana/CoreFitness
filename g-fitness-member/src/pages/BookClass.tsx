import { SkeletonList } from '../components/ui/Skeleton';
import { panelStyle } from '../components/ui/Card';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import { Calendar, Clock, MapPin, Users, ArrowLeft, Sparkles, User, Dumbbell, Lock, X } from 'lucide-react';
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
  type ExperienceLevel,
  type Entitlement,
} from '../services/bookingService';
import { listPublicTrainers, trainerName, type PublicTrainer } from '../lib/api/directory';
import { readCache, writeCache } from '../lib/pageCache';
import type { OpenSlot } from '../lib/api/trainerAvailability';
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
  const [slots, setSlots] = useState<OpenSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [confirmSlot, setConfirmSlot] = useState<OpenSlot | null>(null);
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
      setSlots(await listOpenPtSlots(trainer.id));
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
      setSlots(await listOpenPtSlots(selectedTrainer.id));
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

      {/* Say why up front, rather than letting them pick a class and then fail.
          The wording names the plan and the way out — a dead button with no
          explanation reads as a broken app. */}
      {!loading && activeBlock && (
        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl p-4 flex items-start gap-3"
          style={{ background: 'var(--color-secondary-light)', border: '1px solid rgba(245,158,11,0.30)' }}>
          <Lock size={16} style={{ color: 'var(--color-secondary)' }} className="flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>{activeBlock}</p>
            <button onClick={() => navigate('/member/renew-membership')}
              className="mt-2 px-3 py-1.5 rounded-full text-xs font-bold text-black"
              style={{ background: 'var(--color-secondary)' }}>
              See plans
            </button>
          </div>
        </motion.div>
      )}

      {/* A quota that's partly used is worth showing before it runs out. */}
      {!loading && !activeBlock && tab === 'classes' && !selectedTrainer && entitlement?.classesPerWeek != null && (
        <p className="text-xs text-center" style={{ color: 'var(--color-text-muted)' }}>
          {entitlement.classesUsedThisWeek} of {entitlement.classesPerWeek} weekly class
          {entitlement.classesPerWeek === 1 ? '' : 'es'} booked on {entitlement.planName}
        </p>
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
          ) : (
            <div className="flex items-center justify-between gap-2">
              {/* "You chose", not "your level". Progress shows a *different*
                  level — the one earned from check-ins here — and labelling
                  both the same made the two screens look like they disagreed.
                  Tapping puts the picker back so the choice is changeable. */}
              <button
                onClick={() => setLevel(null)}
                className="text-xs text-left min-w-0"
                style={{ color: 'var(--color-text-muted)' }}
              >
                You chose <span className="font-semibold text-white capitalize">{level}</span>
                <span className="underline ml-1" style={{ color: 'var(--color-secondary)' }}>change</span>
              </button>
              <button onClick={() => setRecommendedOnly((v) => !v)}
                className="px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1"
                style={{
                  background: recommendedOnly ? 'var(--color-primary)' : 'var(--color-surface-raised)',
                  color: recommendedOnly ? '#fff' : 'var(--color-text-muted)',
                  border: `1px solid ${recommendedOnly ? 'var(--color-primary)' : 'var(--color-border)'}`,
                }}>
                <Sparkles size={11} /> For my level
              </button>
            </div>
          )}

          {allClassDays.length > 0 && (
            <>
              <DateRail days={rail} selected={selectedDay} onSelect={setSelectedDay} />
              {selectedDay && (
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
                    {classDays[0]?.[1].length
                      ? `${classDays[0][1].length} class${classDays[0][1].length === 1 ? '' : 'es'} this day`
                      : 'No classes this day'}
                  </p>
                  <button
                    onClick={() => setSelectedDay(null)}
                    className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full"
                    style={{ background: 'var(--color-surface-high)', color: 'var(--color-text-secondary)' }}
                  >
                    <X size={11} /> Show all
                  </button>
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
                <h2 className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>
                  {dayLabel(dayClasses[0].scheduledAt)}
                </h2>
                {dayClasses.map((c, i) => {
                  const full = c.spotsLeft === 0;
                  const booked = c.myStatus != null;
                  return (
                    <motion.div key={c.id}
                      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(i * 0.04, 0.2) }}
                      className="rounded-2xl p-4" style={panelStyle}>
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-white font-bold text-sm">{c.name}</p>
                            {c.recommended && (
                              <span className="text-xs px-2 py-0.5 rounded-full font-bold flex items-center gap-1"
                                style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary)' }}>
                                <Sparkles size={8} /> For you
                              </span>
                            )}
                            {/* The onboarding interests step used to write to a
                                localStorage blob nothing read. This badge is
                                what makes answering it worth the member's time. */}
                            {c.matchesInterest && (
                              <span className="text-xs px-2 py-0.5 rounded-full font-bold"
                                style={{ background: 'var(--color-secondary-light)', color: 'var(--color-secondary)' }}>
                                You picked this
                              </span>
                            )}
                          </div>
                          <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                            {LEVEL_LABEL[c.level]}{c.classType ? ` · ${c.classType}` : ''}
                          </p>
                        </div>
                        <span className="text-xs px-2 py-1 rounded-full font-bold flex-shrink-0"
                          style={{
                            background: full ? 'rgba(148,163,184,0.15)' : 'var(--color-secondary-light)',
                            color: full ? 'var(--color-text-muted)' : 'var(--color-secondary)',
                          }}>
                          <Users size={9} className="inline mr-0.5" style={{ verticalAlign: 'middle' }} />
                          {full ? 'Full' : `${c.spotsLeft} left`}
                        </span>
                      </div>

                      <div className="space-y-1 text-xs mb-3" style={{ color: 'var(--color-text-secondary)' }}>
                        <p className="flex items-center gap-1.5">
                          <Clock size={12} style={{ color: 'var(--color-secondary)' }} />
                          {timeLabel(c.scheduledAt)} · {c.durationMinutes} min
                        </p>
                        <p className="flex items-center gap-1.5">
                          <User size={12} style={{ color: 'var(--color-secondary)' }} /> {c.trainerName}
                        </p>
                        {c.location && (
                          <p className="flex items-center gap-1.5">
                            <MapPin size={12} style={{ color: 'var(--color-secondary)' }} /> {c.location}
                          </p>
                        )}
                      </div>

                      <button
                        disabled={booked || full || classBlock !== null}
                        onClick={() => setConfirmClass(c)}
                        className="w-full h-10 rounded-full font-semibold text-xs transition-all active:scale-[0.97] disabled:cursor-not-allowed"
                        style={
                          booked
                            ? { background: 'var(--color-primary-light)', color: 'var(--color-primary)' }
                            : full || classBlock
                              ? { background: 'var(--color-bg)', color: 'var(--color-text-muted)' }
                              : { background: 'var(--color-secondary)', color: '#000' }
                        }>
                        {booked
                          ? (c.myStatus === 'approved' ? 'Confirmed' : 'Awaiting approval')
                          : full ? 'Class full'
                          : classBlock ? 'Not on your plan'
                          : 'Book'}
                      </button>
                    </motion.div>
                  );
                })}
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
          {allSlotDays.length > 0 && (
            <>
              <DateRail days={rail} selected={selectedDay} onSelect={setSelectedDay} />
              {selectedDay && (
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
                    {slotDays[0]?.[1].length
                      ? `${slotDays[0][1].length} open time${slotDays[0][1].length === 1 ? '' : 's'} this day`
                      : 'No open times this day'}
                  </p>
                  <button
                    onClick={() => setSelectedDay(null)}
                    className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full"
                    style={{ background: 'var(--color-surface-high)', color: 'var(--color-text-secondary)' }}
                  >
                    <X size={11} /> Show all
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
            <h2 className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>
              {dayLabel(daySlots[0].startsAt)}
            </h2>
            <div className="grid grid-cols-3 gap-2">
              {daySlots.map((s) => (
                <button key={s.startsAt} onClick={() => setConfirmSlot(s)}
                  disabled={ptBlock !== null}
                  className="rounded-xl py-3 text-center transition-all active:scale-[0.96] disabled:opacity-40 disabled:cursor-not-allowed"
                  style={panelStyle}>
                  <span className="text-xs font-bold text-white block">{timeLabel(s.startsAt)}</span>
                  <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{s.durationMinutes} min</span>
                </button>
              ))}
            </div>
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