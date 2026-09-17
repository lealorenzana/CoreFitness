import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClockCountdown, MapPin, PencilSimple, Users, X } from '@phosphor-icons/react';
import { SkeletonList } from '../../components/ui/Skeleton';
import DateRail, { buildRail } from '../../components/ui/DateRail';
import { listTrainerClasses, setClassCapacity } from '../../lib/api/classes';
import { toast } from '../../components/ui/Toast';
import { listTrainerBookings } from '../../lib/api/bookings';
import { listTrainerAvailability, type TrainerAvailabilityRow } from '../../lib/api/trainerAvailability';
import { getCurrentTrainerId } from '../../services/trainerService';
import { errorMessage } from '../../utils/errorMessage';
import { readCache, writeCache } from '../../lib/pageCache';
import type { ClassRow } from '../../types/db';
import { Page } from '../../components/ui/page';
import { Eyebrow, Panel, ProgressBar, StatusPill, TextTabs } from '../../components/ui/noc';

/**
 * The trainer's real class schedule, from `classes.trainer_id`.
 *
 * This screen used to carry a row of weekday chips labelled "Available days",
 * writing a string nothing read. Real hours live in `trainer_availability`
 * (0015) and are edited on their own screen; what's left here is a summary that
 * links to it and tells the truth when it's empty.
 *
 * Two views of the same rows, because they answer different questions. The
 * **date strip** answers "what does my fortnight look like, am I free Thursday";
 * the **agenda** answers "what am I teaching next". A month grid would answer
 * neither well on a 375px screen.
 *
 * Drawn in the member app's Nocturne style (2026-09-18): text tabs, the orb
 * date strip, and classes as rows on the page rather than a card each.
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
 * A schedule is scanned by **time**, so the time is the anchor in the gutter;
 * the end time is shown so nobody works out "120 min"; and the number is how
 * many are *coming* — a count of `bookings` — not only the ceiling.
 *
 * `booked` is null when the booking query failed. That renders the ceiling
 * alone rather than "0 of 4", which would be an invented zero standing for
 * "unknown" on the one screen a trainer plans their day from.
 */
function ClassLine({
  cls,
  booked,
  isNext,
  last,
  onCapacityChanged,
}: {
  cls: ClassRow;
  booked: number | null;
  isNext: boolean;
  last: boolean;
  onCapacityChanged: (id: string, capacity: number) => void;
}) {
  /**
   * Editing the class size, which migration 0071 made a trainer's own decision.
   * Only this one number is editable, and the database enforces that rather
   * than trusting this screen.
   */
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(cls.capacity));
  const [saving, setSaving] = useState(false);
  const start = new Date(cls.scheduled_at as string);
  const end = new Date(start.getTime() + cls.duration_minutes * 60_000);
  const from = timeParts(start);
  const to = timeParts(end);

  const full = booked != null && booked >= cls.capacity;
  // Never below the people already booked in. The trigger refuses it too — this
  // just means the trainer finds out while typing rather than after saving.
  const floor = booked ?? 1;
  const parsed = Number(draft);
  const valid = Number.isInteger(parsed) && parsed >= Math.max(1, floor);

  const save = async () => {
    if (!valid || saving) return;
    setSaving(true);
    try {
      await setClassCapacity(cls.id, parsed);
      onCapacityChanged(cls.id, parsed);
      toast.success(`${cls.name} now takes ${parsed}.`);
      setEditing(false);
    } catch (err) {
      // The database's sentence is the useful one here.
      toast.error(errorMessage(err, 'Could not change the class size'));
    } finally {
      setSaving(false);
    }
  };

  const meta = [durationLabel(cls.duration_minutes), LEVEL_LABEL[cls.level] ?? cls.level].filter(Boolean);

  return (
    <div>
      <div className="flex items-start" style={{ gap: 12, padding: '13px 0' }}>
        {/* Time gutter — the thing you scan down */}
        <div className="flex-none whitespace-nowrap" style={{ width: 62 }}>
          <span className="flex items-baseline" style={{ gap: 2 }}>
            <span style={{ fontSize: 15, fontWeight: 700, lineHeight: 1, color: isNext ? 'var(--color-secondary)' : 'var(--color-text-primary)' }}>
              {from.clock}
            </span>
            <span style={{ fontSize: 12, lineHeight: 1, color: 'var(--color-text-muted)' }}>{from.suffix}</span>
          </span>
          <span className="block" style={{ fontSize: 12, marginTop: 5, lineHeight: 1, color: 'var(--color-text-muted)' }}>
            {to.clock} {to.suffix}
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between" style={{ gap: 8 }}>
            <p className="truncate" style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--color-text-primary)' }}>{cls.name}</p>
            {/* Amber on the very next class. Everything here is "coming up";
                only one of them is next. */}
            {isNext && <StatusPill label="Next" tone="action" />}
          </div>

          <p className="flex flex-wrap items-center" style={{ fontSize: 12, marginTop: 3, columnGap: 6, color: 'var(--color-text-secondary)' }}>
            {meta.join(' · ')}
            {cls.location && (
              <span className="inline-flex items-center" style={{ gap: 3 }}>
                <MapPin size={12} /> {cls.location}
              </span>
            )}
          </p>

          {/* How full it is: a bar, with the exact numbers beside it. */}
          <div className="flex items-center" style={{ gap: 10, marginTop: 9 }}>
            <div className="flex-1 min-w-0">
              {booked != null
                ? <ProgressBar fraction={booked / Math.max(1, cls.capacity)} tone={full ? 'action' : 'structure'} />
                : <div style={{ height: 4, borderRadius: 2, background: 'var(--color-surface-high)' }} />}
            </div>
            {editing ? (
              <span className="flex items-center flex-none" style={{ gap: 6 }}>
                <input
                  type="number"
                  inputMode="numeric"
                  value={draft}
                  min={Math.max(1, floor)}
                  autoFocus
                  aria-label="Class size"
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void save();
                    if (e.key === 'Escape') { setDraft(String(cls.capacity)); setEditing(false); }
                  }}
                  className="text-center"
                  style={{
                    width: 56, height: 32, borderRadius: 8, fontSize: 13, fontWeight: 600,
                    color: 'var(--color-text-primary)', background: 'var(--color-surface)',
                    border: `1px solid ${valid ? 'var(--color-hairline)' : 'var(--color-secondary)'}`,
                  }}
                />
                <button onClick={() => void save()} disabled={!valid || saving}
                  className="noc-press disabled:opacity-40"
                  style={{
                    height: 32, padding: '0 11px', borderRadius: 8, fontSize: 12.5, fontWeight: 600,
                    color: 'var(--color-secondary)', border: '1px solid var(--color-secondary)',
                    background: 'color-mix(in srgb, var(--color-secondary) 8%, transparent)',
                  }}>
                  {saving ? '…' : 'Save'}
                </button>
              </span>
            ) : (
              /* Tappable, and it says so by looking like a control rather than a
                 label. Trainers were shown this number for a year and could not
                 change it. */
              <button
                onClick={() => { setDraft(String(cls.capacity)); setEditing(true); }}
                className="flex-none inline-flex items-center noc-press"
                aria-label={`Change class size, now ${cls.capacity}`}
                style={{
                  gap: 5, padding: '5px 9px', borderRadius: 'var(--radius-pill)', fontSize: 12.5,
                  color: full ? 'var(--color-secondary)' : 'var(--color-text-secondary)',
                  border: '1px solid var(--color-hairline)',
                }}
              >
                <Users size={13} />
                {booked == null ? `${cls.capacity} places` : `${booked}/${cls.capacity}`}
                <PencilSimple size={11} style={{ color: 'var(--color-text-muted)' }} />
              </button>
            )}
          </div>
          {editing && (
            <p className="text-right" style={{ fontSize: 12, marginTop: 5, color: 'var(--color-text-muted)' }}>
              {booked != null && booked > 0
                ? `At least ${booked} — that many are already booked in.`
                : 'How many people fit in the room.'}
            </p>
          )}
        </div>
      </div>
      {!last && <div className="hair" />}
    </div>
  );
}

/**
 * The schedule's three queries, cached as one.
 *
 * `bookedByClass` keeps its null-vs-empty distinction through the cache: a
 * restored screen must not turn "couldn't read the bookings" into "nobody is
 * booked", which is the entire reason that field is nullable.
 */
interface ScheduleSnapshot {
  classes: ClassRow[];
  availability: TrainerAvailabilityRow[];
  bookedByClass: Map<string, number> | null;
}

const CACHE_KEY = 'trainer:schedule';

export default function TrainerSchedule() {
  const navigate = useNavigate();
  const cached = readCache<ScheduleSnapshot>(CACHE_KEY);
  const [classes, setClasses] = useState<ClassRow[]>(cached?.classes ?? []);

  /**
   * Reflects a saved class size without refetching the whole screen — the write
   * already succeeded, and re-reading three tables would flash the agenda.
   */
  const applyCapacity = (id: string, capacity: number) =>
    setClasses((prev) => prev.map((c) => (c.id === id ? { ...c, capacity } : c)));
  const [availability, setAvailability] = useState<TrainerAvailabilityRow[]>(cached?.availability ?? []);
  /** classId → live bookings. Null means the query failed, which is not zero. */
  const [bookedByClass, setBookedByClass] = useState<Map<string, number> | null>(cached?.bookedByClass ?? null);
  const [loading, setLoading] = useState(cached === undefined);
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
        let counts: Map<string, number> | null = null;
        if (bookings) {
          counts = new Map<string, number>();
          for (const b of bookings) {
            // A rejected or cancelled booking is not a person turning up.
            if (b.status !== 'pending' && b.status !== 'approved') continue;
            counts.set(b.class_id, (counts.get(b.class_id) ?? 0) + 1);
          }
          setBookedByClass(counts);
        }
        writeCache<ScheduleSnapshot>(CACHE_KEY, {
          classes: rows, availability: hours, bookedByClass: counts,
        });
      } catch (err) {
        console.error('Trainer schedule load failed:', err);
        // Quiet when a schedule is already on screen — see TrainerHome.
        if (!cancelled && !cached) setError(errorMessage(err, 'Failed to load schedule'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // `cached` is the mount-time snapshot; re-running on it would refetch on
    // every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <SkeletonList count={4} />;

  // Grouped by CALENDAR DATE, not weekday name — four occurrences of a weekly
  // class under one "MONDAY" heading read as a duplication bug.
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

  // Fourteen days from today.
  const strip = buildRail(14, dayKeyOf, (key) =>
    upcoming.filter((c) => dayKeyOf(new Date(c.scheduled_at as string)) === key).length
  );

  const slotsPerWeek = availability.reduce((sum, a) => {
    const [sh, sm] = a.start_time.split(':').map(Number);
    const [eh, em] = a.end_time.split(':').map(Number);
    return sum + Math.max(0, Math.floor((eh * 60 + em - (sh * 60 + sm)) / a.slot_minutes));
  }, 0);
  const hourDays = new Set(availability.map((a) => a.day_of_week)).size;
  const noHours = availability.length === 0;

  return (
    <Page>
      {/* "12 classes assigned to you" counted every occurrence ever, past
          included, which is not a number a trainer can act on. */}
      <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>
        {upcoming.length === 0
          ? 'Nothing scheduled ahead'
          : `${upcoming.length} ${upcoming.length === 1 ? 'class' : 'classes'} coming up`}
      </p>

      {error && <p style={{ fontSize: 12.5, color: 'var(--color-secondary)' }}>{error}</p>}

      {/* Bookable hours — a summary, not an editor. Amber when unset, because
          "no hours" means members literally cannot book this trainer. */}
      <Panel glow={noHours ? 'action' : 'structure'} onClick={() => navigate('/trainer/availability')}>
        <div className="flex items-center" style={{ gap: 12 }}>
          <ClockCountdown size={22} weight="duotone" className="flex-none"
            style={{ color: noHours ? 'var(--color-secondary)' : 'var(--color-primary-300)' }} />
          <div className="flex-1 min-w-0">
            <Eyebrow tone={noHours ? 'action' : undefined}>Bookable hours</Eyebrow>
            <p style={{ fontSize: 14, marginTop: 4, color: 'var(--color-text-primary)' }}>
              {noHours
                ? 'Not set — members can’t book you 1-on-1 yet'
                : `${slotsPerWeek} ${slotsPerWeek === 1 ? 'slot' : 'slots'} a week across ${hourDays} ${hourDays === 1 ? 'day' : 'days'}`}
            </p>
          </div>
          <span className="flex-none" style={{ fontSize: 13, color: 'var(--color-secondary)' }}>
            {noHours ? 'Set' : 'Edit'}
          </span>
        </div>
      </Panel>

      {/* Upcoming vs past. A trainer opening this wants "what am I teaching
          next", not a wall of history. */}
      {classes.length > 0 && (
        <TextTabs
          label="Classes"
          tabs={[
            { id: 'upcoming', label: `Upcoming (${upcoming.length})` },
            { id: 'past', label: `Past (${past.length})` },
          ]}
          active={tab}
          onChange={(id) => { setTab(id); setSelectedDay(null); }}
        />
      )}

      {/* The next two weeks at a glance. Tapping filters the agenda below. */}
      {tab === 'upcoming' && upcoming.length > 0 && (
        <DateRail days={strip} selected={selectedDay} onSelect={setSelectedDay} />
      )}

      {selectedDay && (
        <div className="flex items-center justify-between" style={{ gap: 12 }}>
          <p style={{ fontSize: 12.5, color: 'var(--color-text-secondary)' }}>
            {visible.length === 0
              ? 'Nothing on this day'
              : `${visible.length} ${visible.length === 1 ? 'class' : 'classes'} on this day`}
          </p>
          <button
            onClick={() => setSelectedDay(null)}
            className="inline-flex items-center noc-press"
            style={{ gap: 5, fontSize: 12.5, color: 'var(--color-primary-300)' }}
          >
            <X size={12} /> Show all
          </button>
        </div>
      )}

      {classes.length === 0 && !error ? (
        <div className="text-center" style={{ padding: '32px 12px' }}>
          <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)' }}>No classes assigned</p>
          <p style={{ fontSize: 12.5, marginTop: 4, lineHeight: 1.5, color: 'var(--color-text-muted)' }}>
            The gym schedules classes and assigns them to a trainer. Yours will appear here once
            the front desk puts you on one.
          </p>
        </div>
      ) : visible.length === 0 && !selectedDay ? (
        <div className="text-center" style={{ padding: '32px 12px' }}>
          <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)' }}>
            {tab === 'upcoming' ? 'Nothing coming up' : 'No past classes'}
          </p>
          <p style={{ fontSize: 12.5, marginTop: 4, color: 'var(--color-text-muted)' }}>
            {tab === 'upcoming'
              ? 'Every class you teach has already happened. The gym schedules new ones.'
              : 'Classes move here once their time has passed.'}
          </p>
        </div>
      ) : (
        <div className="flex flex-col noc-rows" style={{ gap: 18 }}>
          {groups.map(([label, items], gi) => (
            <section key={label + gi}>
              {/* The day heading carries the date as well as the word where the
                  word is not already the date. */}
              <div className="flex items-baseline justify-between" style={{ gap: 12 }}>
                <h2 style={{ fontSize: 'var(--text-title)', fontWeight: 700, color: 'var(--color-text-primary)' }}>{label}</h2>
                {(label === 'Today' || label === 'Tomorrow') && (
                  <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                    {new Date(items[0].scheduled_at as string).toLocaleDateString('en-US', {
                      weekday: 'short', month: 'short', day: 'numeric',
                    })}
                  </span>
                )}
              </div>
              <div style={{ marginTop: 2 }}>
                {items.map((cls, i) => (
                  <ClassLine
                    key={cls.id}
                    cls={cls}
                    booked={bookedByClass ? bookedByClass.get(cls.id) ?? 0 : null}
                    isNext={tab === 'upcoming' && cls.id === upcoming[0]?.id}
                    last={i === items.length - 1}
                    onCapacityChanged={applyCapacity}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Surfaced rather than dropped: a class with no time can never appear on
          a dated schedule, and silently hiding it means nobody fixes it. */}
      {undated.length > 0 && (
        <Panel glow="action">
          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-secondary)' }}>
            {undated.length} {undated.length === 1 ? 'class has' : 'classes have'} no time set
          </p>
          <p style={{ fontSize: 12.5, marginTop: 4, color: 'var(--color-text-secondary)' }}>
            {undated.map((c) => c.name).join(', ')} — ask the front desk to schedule {undated.length === 1 ? 'it' : 'them'}.
          </p>
        </Panel>
      )}
    </Page>
  );
}
