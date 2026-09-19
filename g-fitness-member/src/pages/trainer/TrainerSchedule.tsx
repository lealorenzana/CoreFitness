import { supabase } from '../../lib/supabaseClient';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClockCountdown, MapPin, PencilSimple, Plus, Users, X } from '@phosphor-icons/react';
import { SkeletonList } from '../../components/ui/Skeleton';
import DateRail, { buildRail } from '../../components/ui/DateRail';
import GlassSheet from '../../components/ui/GlassSheet';
import Modal from '../../components/ui/Modal';
import { Field, Select, TextInput } from '../../components/ui/Field';
import { addDays, dateKey, todayKey } from '../../utils/dates';
import { createClass, deleteClass, listTrainerClasses, updateClass } from '../../lib/api/classes';
import { toast } from '../../components/ui/Toast';
import { listTrainerBookings } from '../../lib/api/bookings';
import { listTrainerAvailability, type TrainerAvailabilityRow } from '../../lib/api/trainerAvailability';
import { getCurrentTrainerId } from '../../services/trainerService';
import { errorMessage } from '../../utils/errorMessage';
import { readCache, writeCache } from '../../lib/pageCache';
import type { ClassRow } from '../../types/db';
import { Page } from '../../components/ui/page';
import { Chip, Eyebrow, NocButton, Panel, ProgressBar, StatusPill, TextTabs } from '../../components/ui/noc';

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
  editable,
  onEdit,
  waiting = 0,
}: {
  cls: ClassRow;
  booked: number | null;
  /** Members on the waitlist (0096) — told automatically when a seat frees. */
  waiting?: number;
  isNext: boolean;
  last: boolean;
  /** Upcoming only — a past class is history, not something to edit. */
  editable: boolean;
  onEdit: (cls: ClassRow) => void;
}) {
  const start = new Date(cls.scheduled_at as string);
  const end = new Date(start.getTime() + cls.duration_minutes * 60_000);
  const from = timeParts(start);
  const to = timeParts(end);
  const full = booked != null && booked >= cls.capacity;
  const left = booked == null ? null : Math.max(0, cls.capacity - booked);

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
            {!cls.template_id && <span style={{ color: 'var(--color-primary-300)' }}>· Your class</span>}
          </p>

          {/* How full it is: a bar, then the count in words — "1 booked · 11
              left", the same way the member reads it. */}
          <div className="flex items-center" style={{ gap: 10, marginTop: 9 }}>
            <div className="flex-1 min-w-0">
              {booked != null
                ? <ProgressBar fraction={booked / Math.max(1, cls.capacity)} tone={full ? 'action' : 'structure'} />
                : <div style={{ height: 4, borderRadius: 2, background: 'var(--color-surface-high)' }} />}
            </div>
            <span className="flex-none inline-flex items-center" style={{
              gap: 5, fontSize: 12.5, color: full ? 'var(--color-secondary)' : 'var(--color-text-secondary)',
            }}>
              <Users size={13} />
              {booked == null ? `${cls.capacity} places` : full ? `Full · ${booked} of ${cls.capacity}` : `${booked} booked · ${left} of ${cls.capacity} left`}
              {waiting > 0 ? ` · ${waiting} waiting` : ''}
            </span>
          </div>

          {/* The class's details are the trainer's to keep right (0085). */}
          {editable && (
            <button onClick={() => onEdit(cls)} className="inline-flex items-center noc-press"
              style={{ gap: 5, marginTop: 9, fontSize: 12.5, color: 'var(--color-primary-300)' }}>
              <PencilSimple size={13} /> Edit class
            </button>
          )}
        </div>
      </div>
      {!last && <div className="hair" />}
    </div>
  );
}

const LEVEL_OPTIONS: { id: ClassRow['level']; label: string }[] = [
  { id: 'beginner', label: 'Beginner' },
  { id: 'intermediate', label: 'Intermediate' },
  { id: 'advanced', label: 'Advanced' },
  { id: 'all_levels', label: 'All levels' },
];

/** '05:00' … '22:00' in half hours — a free-text time on a phone invites '25:00'. */
const START_OPTIONS = Array.from({ length: 35 }, (_, i) => {
  const mins = 5 * 60 + i * 30;
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
});

function hhmmLabel(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/**
 * New class, or edit one the trainer teaches (0085).
 *
 * What the database allows is what this form offers: every detail of a class
 * the trainer created; name, level, size and room of a class from the gym's
 * weekly timetable, whose time stays the gym's. The guard trigger enforces
 * the same rules, and its sentence is shown when it refuses.
 */
function ClassEditor({
  open,
  cls,
  trainerId,
  booked,
  onClose,
  onSaved,
}: {
  open: boolean;
  /** Null for a new class. */
  cls: ClassRow | null;
  trainerId: string | null;
  booked: number;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const fromTimetable = !!cls?.template_id;
  const initialStart = cls?.scheduled_at ? new Date(cls.scheduled_at) : null;
  const [name, setName] = useState(cls?.name ?? '');
  const [level, setLevel] = useState<ClassRow['level']>(cls?.level ?? 'all_levels');
  const [capacity, setCapacity] = useState(String(cls?.capacity ?? 10));
  const [location, setLocation] = useState(cls?.location ?? '');
  const [day, setDay] = useState(initialStart ? dateKey(initialStart) : addDays(todayKey(), 1));
  const [time, setTime] = useState(initialStart
    ? `${String(initialStart.getHours()).padStart(2, '0')}:${String(initialStart.getMinutes()).padStart(2, '0')}`
    : '18:00');
  const [duration, setDuration] = useState(String(cls?.duration_minutes ?? 60));
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const size = Number(capacity);
  const sizeOk = Number.isInteger(size) && size >= Math.max(1, booked);
  const valid = name.trim().length > 0 && sizeOk && day >= todayKey();

  const save = async () => {
    if (!valid || saving || !trainerId) return;
    setSaving(true);
    try {
      const scheduledAt = new Date(`${day}T${time}:00`).toISOString();
      const details = {
        name: name.trim(),
        level,
        capacity: size,
        location: location.trim() || null,
      };
      if (cls) {
        await updateClass(cls.id, fromTimetable
          ? details
          : { ...details, scheduled_at: scheduledAt, duration_minutes: Number(duration) });
        onSaved(`${details.name} updated.`);
      } else {
        await createClass({
          ...details,
          trainer_id: trainerId,
          class_type: 'group',
          scheduled_at: scheduledAt,
          duration_minutes: Number(duration),
        });
        onSaved(`${details.name} is on the timetable. Members can book it now.`);
      }
    } catch (err) {
      // The guard's sentence is the useful one ("already booked for …").
      toast.error(errorMessage(err, 'Could not save that class'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!cls) return;
    setSaving(true);
    try {
      await deleteClass(cls.id);
      onSaved(`${cls.name} removed.`);
    } catch (err) {
      toast.error(errorMessage(err, 'Could not remove that class'));
    } finally {
      setSaving(false);
      setConfirmDelete(false);
    }
  };

  return (
    <>
      <GlassSheet
        open={open}
        onClose={onClose}
        title={cls ? 'Edit class' : 'New class'}
        subtitle={cls ? (fromTimetable ? 'From the gym’s weekly timetable' : 'A class you run') : 'You teach it; members book it'}
        footer={
          <div className="flex flex-col" style={{ gap: 8 }}>
            <NocButton variant="fill" className="w-full" onClick={save} disabled={!valid || saving}>
              {saving ? 'Saving…' : cls ? 'Save changes' : 'Add to timetable'}
            </NocButton>
            {cls && !fromTimetable && booked === 0 && (
              <NocButton variant="ghost" className="w-full" onClick={() => setConfirmDelete(true)} disabled={saving}>
                Remove class
              </NocButton>
            )}
          </div>
        }
      >
        <div className="flex flex-col" style={{ gap: 16 }}>
          <Field label="Title">
            <TextInput value={name} maxLength={60} placeholder="e.g. Beginner Kettlebells"
              onChange={(e) => setName(e.target.value)} />
          </Field>

          <Field label="Level" as="div">
            <div className="flex flex-wrap" style={{ gap: 7, marginTop: 6 }}>
              {LEVEL_OPTIONS.map((l) => (
                <Chip key={l.id} label={l.label} on={level === l.id} onClick={() => setLevel(l.id)} />
              ))}
            </div>
          </Field>

          <div className="grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
            <Field label="Places" hint={booked > 0 ? `At least ${booked} — already booked` : 'How many fit'}>
              <TextInput type="number" inputMode="numeric" min={Math.max(1, booked)} value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
                style={sizeOk ? undefined : { borderColor: 'var(--color-secondary)' }} />
            </Field>
            <Field label="Room">
              <TextInput value={location} maxLength={40} placeholder="e.g. Studio A"
                onChange={(e) => setLocation(e.target.value)} />
            </Field>
          </div>

          {fromTimetable ? (
            <p style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--color-text-muted)' }}>
              The day and time come from the gym’s weekly timetable, so the front desk changes those.
            </p>
          ) : (
            <>
              <Field label="Day">
                <TextInput type="date" value={day} min={todayKey()} onChange={(e) => setDay(e.target.value)} />
              </Field>
              <div className="grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
                <Field label="Starts">
                  <Select value={time} onChange={(e) => setTime(e.target.value)}>
                    {START_OPTIONS.map((t) => <option key={t} value={t}>{hhmmLabel(t)}</option>)}
                  </Select>
                </Field>
                <Field label="Length">
                  <Select value={duration} onChange={(e) => setDuration(e.target.value)}>
                    <option value="30">30 minutes</option>
                    <option value="45">45 minutes</option>
                    <option value="60">1 hour</option>
                    <option value="90">1 hour 30 minutes</option>
                    <option value="120">2 hours</option>
                  </Select>
                </Field>
              </div>
            </>
          )}
        </div>
      </GlassSheet>

      <Modal
        isOpen={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Remove this class"
        subtitle="Nobody is booked into it yet, so no member is affected."
        confirmLabel="Remove"
        cancelLabel="Keep"
        onConfirm={() => void remove()}
      >
        <span />
      </Modal>
    </>
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

  /** The class being edited, 'new' for a new one, null when the sheet is shut. */
  const [editing, setEditing] = useState<ClassRow | 'new' | null>(null);
  const [trainerId, setTrainerId] = useState<string | null>(null);
  /** Bumped after a save, so the effect below reads the schedule again. */
  const [reloadKey, setReloadKey] = useState(0);
  const [availability, setAvailability] = useState<TrainerAvailabilityRow[]>(cached?.availability ?? []);
  /** classId → live bookings. Null means the query failed, which is not zero. */
  const [bookedByClass, setBookedByClass] = useState<Map<string, number> | null>(cached?.bookedByClass ?? null);
  /** Waitlist sizes for this coach's classes (0096; RLS shows a coach their own). Empty before 0096. */
  /** Taken once per visit (a lazy initialiser keeps render pure); the page reloads its list on return. */
  const [now] = useState(() => Date.now());
  const [waitingByClass, setWaitingByClass] = useState<Map<string, number>>(new Map());
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
        if (!cancelled) setTrainerId(id);
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
        const { data: wl } = await supabase.from('class_waitlist').select('class_id');
        if (!cancelled) {
          const w = new Map<string, number>();
          for (const r of wl ?? []) w.set(r.class_id as string, (w.get(r.class_id as string) ?? 0) + 1);
          setWaitingByClass(w);
        }
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
  }, [reloadKey]);

  if (loading) return <SkeletonList count={4} />;

  // Grouped by CALENDAR DATE, not weekday name — four occurrences of a weekly
  // class under one "MONDAY" heading read as a duplication bug.
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

      {/* A trainer runs their own classes too (0085): title, level, places,
          room and time — the gym's weekly timetable still comes from the desk. */}
      <NocButton variant="action" className="w-full" icon={<Plus size={16} weight="bold" />}
        onClick={() => setEditing('new')}>
        New class
      </NocButton>

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
                    waiting={waitingByClass.get(cls.id) ?? 0}
                    isNext={tab === 'upcoming' && cls.id === upcoming[0]?.id}
                    last={i === items.length - 1}
                    editable={tab === 'upcoming'}
                    onEdit={setEditing}
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

      {/* Keyed on the class, so each open starts from that class's values. */}
      <ClassEditor
        key={editing === 'new' ? 'new' : editing?.id ?? 'closed'}
        open={editing !== null}
        cls={editing === 'new' ? null : editing}
        trainerId={trainerId}
        booked={editing && editing !== 'new' && bookedByClass ? bookedByClass.get(editing.id) ?? 0 : 0}
        onClose={() => setEditing(null)}
        onSaved={(message) => {
          setEditing(null);
          toast.success(message);
          setReloadKey((k) => k + 1);
        }}
      />
    </Page>
  );
}
