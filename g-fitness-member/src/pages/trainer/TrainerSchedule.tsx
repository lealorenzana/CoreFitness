import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Dumbbell, Clock, ChevronRight, X, MapPin, Users } from 'lucide-react';
import { SkeletonList } from '../../components/ui/Skeleton';
import { panelStyle } from '../../components/ui/Card';
import DateRail, { buildRail } from '../../components/ui/DateRail';
import { listTrainerClasses } from '../../lib/api/classes';
import { listTrainerBookings } from '../../lib/api/bookings';
import { listTrainerAvailability, type TrainerAvailabilityRow } from '../../lib/api/trainerAvailability';
import { getCurrentTrainerId } from '../../services/trainerService';
import { errorMessage } from '../../utils/errorMessage';
import type { ClassRow } from '../../types/db';

/**
 * The trainer's real class schedule, from `classes.trainer_id`.
 *
 * This screen used to carry a row of weekday chips labelled "Available days",
 * writing the comma-joined string on `trainer_profiles.availability`. It read
 * exactly like setting your bookable days and did nothing of the sort — no slot
 * is ever generated from it, so a trainer could tick Monday and Wednesday and
 * remain unbookable. Real hours live in `trainer_availability` (0015) and are
 * now edited on their own screen; what's left here is a summary that links to
 * it and tells the truth when it's empty.
 *
 * Two views of the same rows, because they answer different questions. The
 * **week strip** answers "what does my week look like, am I free Thursday" —
 * which a flat list cannot show. The **agenda** answers "what am I teaching
 * next", which is what a trainer opens this for. A month grid would answer
 * neither well on a 375px screen: the cells come out around 45px, too small for
 * a class name, and with roughly one class a day most of the grid is empty.
 */

/** Local calendar key. Never toISOString — that shifts to UTC near midnight. */
const dayKeyOf = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

/** '10:00 PM' split, so the row can set the hour big and the meridiem small. */
function timeParts(d: Date): { clock: string; suffix: string } {
  const [clock, suffix = ''] = d
    .toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    .split(' ');
  return { clock, suffix };
}

/** 120 → '2h', 90 → '1h 30m', 45 → '45m'. "120 min" makes you do the division. */
function durationLabel(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

const LEVEL_LABEL: Record<string, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
  all_levels: 'All levels',
};

/**
 * One class in the agenda.
 *
 * The old row was a generic ListRow: the same violet dumbbell tile on every
 * line, the time buried in a subtitle beside "120 min", and a right-hand
 * "4 capacity". Three problems with that. A schedule is scanned by **time**,
 * so the time has to be the anchor, not a detail. "120 min" makes the reader
 * work out when it ends. And capacity is the wrong number — a trainer wants to
 * know how many people are actually coming, which is a count of `bookings`, not
 * a ceiling on the class.
 *
 * `booked` is null when the booking query failed. That renders the ceiling
 * alone rather than "0 of 4", which would be an invented zero standing for
 * "unknown" on the one screen a trainer plans their day from.
 */
function ClassRowCard({
  cls,
  booked,
  isNext,
}: {
  cls: ClassRow;
  booked: number | null;
  isNext: boolean;
}) {
  const start = new Date(cls.scheduled_at as string);
  const end = new Date(start.getTime() + cls.duration_minutes * 60_000);
  const from = timeParts(start);
  const to = timeParts(end);

  const full = booked != null && booked >= cls.capacity;
  const fill = booked == null ? 0 : Math.min(1, booked / Math.max(1, cls.capacity));
  const accent = isNext ? 'var(--color-secondary)' : 'var(--color-primary)';

  const meta = [durationLabel(cls.duration_minutes), LEVEL_LABEL[cls.level] ?? cls.level].filter(Boolean);

  return (
    <div
      className="flex items-stretch gap-3 p-3 overflow-hidden"
      style={{
        ...panelStyle,
        borderRadius: 'var(--radius-card)',
        // Amber spine on the very next class. Everything on this screen is
        // "coming up"; only one of them is next.
        borderLeft: `3px solid ${accent}`,
      }}
    >
      {/* Time column — the thing you scan down */}
      <div className="flex flex-col items-end justify-start w-14 flex-shrink-0 pt-0.5">
        <span className="flex items-baseline gap-0.5">
          <span className="text-sm font-bold text-white leading-none">{from.clock}</span>
          <span className="text-xs font-semibold leading-none" style={{ color: 'var(--color-text-muted)' }}>
            {from.suffix}
          </span>
        </span>
        <span className="text-xs mt-1 leading-none" style={{ color: 'var(--color-text-muted)' }}>
          {to.clock} {to.suffix}
        </span>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-bold text-white truncate">{cls.name}</p>
          {isNext && (
            <span
              className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-full flex-shrink-0"
              style={{ background: 'var(--color-secondary)', color: '#000' }}
            >
              Next
            </span>
          )}
        </div>

        <p className="text-xs mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5"
          style={{ color: 'var(--color-text-muted)' }}>
          {meta.join(' · ')}
          {cls.location && (
            <span className="inline-flex items-center gap-0.5">
              <MapPin size={10} /> {cls.location}
            </span>
          )}
        </p>

        {/* How full it is. A bar reads faster than "3/20" and still carries the
            exact numbers beside it. */}
        <div className="flex items-center gap-2 mt-2">
          <span className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--color-bg)' }}>
            <span
              className="block h-full rounded-full"
              style={{
                width: `${fill * 100}%`,
                background: full ? 'var(--color-secondary)' : 'var(--color-primary)',
              }}
            />
          </span>
          <span
            className="text-xs font-semibold flex items-center gap-1 flex-shrink-0"
            style={{ color: full ? 'var(--color-secondary)' : 'var(--color-text-secondary)' }}
          >
            <Users size={11} />
            {booked == null ? `${cls.capacity} places` : `${booked}/${cls.capacity}`}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function TrainerSchedule() {
  const navigate = useNavigate();
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [availability, setAvailability] = useState<TrainerAvailabilityRow[]>([]);
  /** classId → live bookings. Null means the query failed, which is not zero. */
  const [bookedByClass, setBookedByClass] = useState<Map<string, number> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const id = await getCurrentTrainerId();
        if (!id) throw new Error('Not signed in');
        // `null` on failure, deliberately distinct from an empty map: a class
        // with no bookings and a class whose bookings couldn't be read must not
        // render the same number.
        const [rows, hours, bookings] = await Promise.all([
          listTrainerClasses(id),
          listTrainerAvailability(id).catch(() => [] as TrainerAvailabilityRow[]),
          listTrainerBookings(id).catch(() => null),
        ]);
        if (cancelled) return;
        setClasses(rows);
        setAvailability(hours);
        if (bookings) {
          const counts = new Map<string, number>();
          for (const b of bookings) {
            // A rejected or cancelled booking is not a person turning up.
            if (b.status !== 'pending' && b.status !== 'approved') continue;
            counts.set(b.class_id, (counts.get(b.class_id) ?? 0) + 1);
          }
          setBookedByClass(counts);
        }
      } catch (err) {
        console.error('Trainer schedule load failed:', err);
        if (!cancelled) setError(errorMessage(err, 'Failed to load schedule'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <SkeletonList count={4} />;

  // Grouped by CALENDAR DATE, not weekday name.
  //
  // This screen used to bucket by weekday — every Monday session, whatever week
  // it belonged to, landed under one "MONDAY" heading, and the row showed only
  // a time. Four separate occurrences of a weekly class then rendered as four
  // identical lines, which reads as a duplication bug rather than as a
  // schedule. The date is the thing that distinguishes them, so the date is
  // what groups them.
  const now = Date.now();
  const scheduled = classes.filter((c) => c.scheduled_at);
  const upcoming = scheduled
    .filter((c) => new Date(c.scheduled_at as string).getTime() >= now)
    .sort((a, b) => (a.scheduled_at as string).localeCompare(b.scheduled_at as string));
  const past = scheduled
    .filter((c) => new Date(c.scheduled_at as string).getTime() < now)
    .sort((a, b) => (b.scheduled_at as string).localeCompare(a.scheduled_at as string));

  const all = tab === 'upcoming' ? upcoming : past;
  // The strip only makes sense forwards, so a day filter can't survive the tab.
  const visible =
    tab === 'upcoming' && selectedDay
      ? all.filter((c) => dayKeyOf(new Date(c.scheduled_at as string)) === selectedDay)
      : all;

  const dayLabel = (iso: string) => {
    const d = new Date(iso);
    const today = new Date();
    const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    if (dayKeyOf(d) === dayKeyOf(today)) return 'Today';
    if (dayKeyOf(d) === dayKeyOf(tomorrow)) return 'Tomorrow';
    return d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' });
  };

  // Preserves the sort order above — no Map, which would reorder by insertion
  // of the key rather than of the row.
  const groups: [string, ClassRow[]][] = [];
  for (const c of visible) {
    const label = dayLabel(c.scheduled_at as string);
    const last = groups[groups.length - 1];
    if (last && last[0] === label) last[1].push(c);
    else groups.push([label, [c]]);
  }

  // Classes with no date at all can't be placed on a schedule, but hiding them
  // silently would lose them — the gym needs to notice and set a time.
  const undated = classes.filter((c) => !c.scheduled_at);

  // Fourteen days from today, via the shared rail so the member's Book a
  // Session calendar and this one cannot drift apart.
  const strip = buildRail(14, dayKeyOf, (key) =>
    upcoming.filter((c) => dayKeyOf(new Date(c.scheduled_at as string)) === key).length
  );

  const slotsPerWeek = availability.reduce((sum, a) => {
    const [sh, sm] = a.start_time.split(':').map(Number);
    const [eh, em] = a.end_time.split(':').map(Number);
    return sum + Math.max(0, Math.floor((eh * 60 + em - (sh * 60 + sm)) / a.slot_minutes));
  }, 0);

  return (
    <div className="space-y-4 pb-4">
      <div>
        <h1 className="display text-xl text-white">My Schedule</h1>
        {/* "12 classes assigned to you" counted every occurrence ever, past
            included, which is not a number a trainer can act on. */}
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          {upcoming.length === 0
            ? 'Nothing scheduled ahead'
            : `${upcoming.length} ${upcoming.length === 1 ? 'class' : 'classes'} coming up`}
        </p>
      </div>

      {error && (
        <div className="rounded-xl p-3" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>
          <p className="text-xs" style={{ color: '#ef4444' }}>{error}</p>
        </div>
      )}

      {/* Bookable hours — a summary, not an editor. Amber when unset, because
          "no hours" means members literally cannot book this trainer, and that
          is worth interrupting for. */}
      <button
        onClick={() => navigate('/trainer/availability')}
        className="w-full p-4 flex items-center gap-3 text-left active:scale-[0.99] transition-transform"
        style={
          availability.length === 0
            ? {
                background: 'var(--color-secondary-light)',
                border: '1px solid rgba(245,158,11,0.30)',
                borderRadius: 'var(--radius-panel)',
              }
            : { ...panelStyle, borderRadius: 'var(--radius-panel)' }
        }
      >
        <span
          className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{
            background: availability.length === 0 ? 'var(--color-secondary)' : 'var(--color-primary-light)',
          }}
        >
          <Clock
            size={19}
            style={{ color: availability.length === 0 ? '#000' : 'var(--color-primary)' }}
          />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-semibold text-white">Bookable hours</span>
          <span className="block text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
            {availability.length === 0
              ? 'Not set — members can’t book you 1-on-1 yet'
              : `${slotsPerWeek} ${slotsPerWeek === 1 ? 'slot' : 'slots'} a week across ${
                  new Set(availability.map((a) => a.day_of_week)).size
                } ${new Set(availability.map((a) => a.day_of_week)).size === 1 ? 'day' : 'days'}`}
          </span>
        </span>
        <ChevronRight size={18} className="flex-shrink-0" style={{ color: 'var(--color-text-muted)' }} />
      </button>

      {/* Upcoming vs past. A trainer opening this wants "what am I teaching
          next", not a wall of history sorted by weekday. */}
      {classes.length > 0 && (
        <div className="grid grid-cols-2 gap-1 p-1"
          style={{ ...panelStyle, borderRadius: 'var(--radius-btn)' }} role="tablist">
          {([['upcoming', 'Upcoming', upcoming.length], ['past', 'Past', past.length]] as const).map(
            ([id, label, count]) => (
              <button key={id} onClick={() => { setTab(id); setSelectedDay(null); }} role="tab" aria-selected={tab === id}
                className="py-2 rounded-full font-semibold text-xs transition-colors"
                style={{
                  background: tab === id ? 'var(--color-primary)' : 'transparent',
                  color: tab === id ? '#fff' : 'var(--color-text-muted)',
                }}>
                {label} ({count})
              </button>
            )
          )}
        </div>
      )}

      {/* The next two weeks at a glance. Dots, not names — at this width a name
          would truncate to nothing useful, and the count is the thing you scan
          for. Tapping filters the agenda below rather than opening a day view,
          so the detail never leaves the screen you're already on. */}
      {tab === 'upcoming' && upcoming.length > 0 && (
        <DateRail days={strip} selected={selectedDay} onSelect={setSelectedDay} />
      )}

      {selectedDay && (
        <div className="flex items-center justify-between gap-3 px-1">
          <p className="text-xs font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
            {visible.length === 0
              ? 'Nothing on this day'
              : `${visible.length} ${visible.length === 1 ? 'class' : 'classes'} on this day`}
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

      {classes.length === 0 && !error ? (
        <div className="p-8 text-center" style={{ ...panelStyle, borderRadius: 'var(--radius-panel)' }}>
          <Dumbbell size={36} className="mx-auto mb-3" style={{ color: 'var(--color-border)' }} />
          <p className="text-sm font-semibold text-white">No classes assigned</p>
          {/* This used to say "Class scheduling isn't built yet". It has been
              built for some time; a stale apology reads as a broken feature. */}
          <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
            The gym schedules classes and assigns them to a trainer. Yours will appear here once
            the front desk puts you on one.
          </p>
        </div>
      ) : visible.length === 0 && !selectedDay ? (
        <div className="p-8 text-center" style={{ ...panelStyle, borderRadius: 'var(--radius-panel)' }}>
          <Dumbbell size={36} className="mx-auto mb-3" style={{ color: 'var(--color-border)' }} />
          <p className="text-sm font-semibold text-white">
            {tab === 'upcoming' ? 'Nothing coming up' : 'No past classes'}
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
            {tab === 'upcoming'
              ? 'Every class you teach has already happened. The gym schedules new ones.'
              : 'Classes move here once their time has passed.'}
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map(([label, items], gi) => (
            <motion.div key={label + gi}
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(gi * 0.04, 0.25) }}>
              {/* Day heading carries the date as well as the word. "Tomorrow"
                  alone forces the reader to work out which date that is, and
                  the bare dates below it had no anchor to count from. */}
              <div className="flex items-baseline justify-between gap-3 mb-2">
                <p className="text-xs font-bold uppercase tracking-wider"
                  style={{ color: 'var(--color-text-secondary)' }}>
                  {label}
                </p>
                <span className="flex-1 h-px" style={{ background: 'var(--color-border)' }} />
                {/* "Tomorrow" without a date makes the reader work out which
                    date that is before the plain dates below mean anything.
                    Only shown where the label isn't already the date. */}
                {(label === 'Today' || label === 'Tomorrow') && (
                  <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    {new Date(items[0].scheduled_at as string).toLocaleDateString('en-US', {
                      weekday: 'short', month: 'short', day: 'numeric',
                    })}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                {items.map((cls) => (
                  <ClassRowCard
                    key={cls.id}
                    cls={cls}
                    booked={bookedByClass ? bookedByClass.get(cls.id) ?? 0 : null}
                    isNext={tab === 'upcoming' && cls.id === upcoming[0]?.id}
                  />
                ))}
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Surfaced rather than dropped: a class with no time can never appear on
          a dated schedule, and silently hiding it means nobody fixes it. */}
      {undated.length > 0 && (
        <div className="p-4" style={{
          background: 'var(--color-secondary-light)',
          border: '1px solid rgba(245,158,11,0.30)',
          borderRadius: 'var(--radius-panel)',
        }}>
          <p className="text-xs font-semibold" style={{ color: 'var(--color-secondary)' }}>
            {undated.length} {undated.length === 1 ? 'class has' : 'classes have'} no time set
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--color-text-secondary)' }}>
            {undated.map((c) => c.name).join(', ')} — ask the front desk to schedule {undated.length === 1 ? 'it' : 'them'}.
          </p>
        </div>
      )}
    </div>
  );
}
