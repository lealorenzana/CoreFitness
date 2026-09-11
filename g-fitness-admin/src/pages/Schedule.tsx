import { motion, AnimatePresence } from 'framer-motion';
import {
  renderSchedulePng, scheduleToCsv, downloadBlob, type ScheduleSlot,
} from '../utils/exportSchedule';
import { useBranding } from '../hooks/useBranding';
import { Fragment, useMemo, useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import Button from '../components/ui/Button';
import {
  PageHeader, StatTiles, Section, EmptyState, CardGrid, TileCard, Chips,
} from '../components/ui/kit';
import Input from '../components/ui/Input';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import TimePicker from '../components/ui/TimePicker';
import {
  Plus, X, Trash2, RefreshCw, Dumbbell, RotateCcw,
  AlertTriangle, CalendarDays, Filter, Clock,
  Image as ImageIcon, FileDown,
} from 'lucide-react';
import { showToast } from '../utils/toast';
import {
  listClassTemplates, createClassTemplate, deactivateClassTemplate, updateClassTemplate,
  generateClassInstances, DAY_NAMES, type ClassTemplateRow,
} from '../lib/api/classTemplates';
import {
  listAllAvailability, addAvailability, deleteAvailability, type TrainerAvailabilityRow,
} from '../lib/api/trainerAvailability';
import { listTrainers, type TrainerWithProfile } from '../lib/api/trainers';
import { getGymSettings } from '../lib/api/settings';
import {
  findConflicts, findOutOfHours, conflictedIds, hoursOverlap, loadUpcomingSessions,
  type Conflict, type UpcomingSession,
} from '../services/scheduleService';
import type { ClassLevel } from '../types/db';

/**
 * The gym's weekly timetable, plus trainer working hours.
 *
 * Two different things used to be conflated here. `class_templates` is the
 * recurring plan ("Yoga, Tuesdays 06:00"); `classes` rows are the dated sessions
 * members actually book. This page edits the plan and materialises the sessions
 * from it — see generate_class_instances in migration 0015.
 *
 * Generation runs on load rather than on a schedule: the free tier has no cron
 * worker, and it's idempotent, so visiting the page keeps the next few weeks
 * populated without any background infrastructure.
 */

const LEVELS: ClassLevel[] = ['all_levels', 'beginner', 'intermediate', 'advanced'];
const WEEKS_AHEAD = 4;

/** Labelled form row. A bare number box tells nobody what the number means. */
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] font-semibold uppercase tracking-wide block mb-1"
        style={{ color: 'var(--color-text-muted)' }}>
        {label}
        {hint && <span className="normal-case font-normal tracking-normal opacity-70"> · {hint}</span>}
      </span>
      {children}
    </label>
  );
}

const emptyTemplate = {
  name: '', trainerId: '', level: 'all_levels' as ClassLevel, capacity: '20',
  location: '', dayOfWeek: '1', startTime: '06:00', duration: '60',
};

const emptyHours = { trainerId: '', dayOfWeek: '1', start: '09:00', end: '17:00', slot: '60' };

/** 'HH:MM:SS' → 'HH:MM'. Module scope so the handlers can use it too. */
const hhmm = (t: string) => t.slice(0, 5);

/** 'HH:MM(:SS)' → '6:00 AM'. Wall-clock; never routed through a Date. */
function clock(t: string): string {
  const [h, m] = t.split(':').map(Number);
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m ?? 0).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

type TabId = 'timetable' | 'sessions' | 'hours';

export default function Schedule() {
  const [tab, setTab] = useState<TabId>('timetable');
  const branding = useBranding();
  const [templates, setTemplates] = useState<ClassTemplateRow[]>([]);
  const [availability, setAvailability] = useState<TrainerAvailabilityRow[]>([]);
  const [trainers, setTrainers] = useState<TrainerWithProfile[]>([]);
  const [sessions, setSessions] = useState<UpcomingSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generated, setGenerated] = useState<number | null>(null);

  const [showTemplateModal, setShowTemplateModal] = useState(false);
  /** Set when the modal is editing rather than creating. */
  const [editingTemplate, setEditingTemplate] = useState<ClassTemplateRow | null>(null);
  const [templateForm, setTemplateForm] = useState(emptyTemplate);
  const [hoursForm, setHoursForm] = useState(emptyHours);
  const [toRetire, setToRetire] = useState<ClassTemplateRow | null>(null);
  const [toDeleteHours, setToDeleteHours] = useState<TrainerAvailabilityRow | null>(null);
  const [trainerFilter, setTrainerFilter] = useState('all');
  /** The gym's own hours (0013) — what makes an out-of-hours class detectable. */
  const [hours, setHours] = useState<{ open: string | null; close: string | null }>({ open: null, close: null });

  // Clashes are derived, never stored — a stored flag goes stale the moment
  // someone edits a start time.
  const conflicts = useMemo(
    () => [...findConflicts(templates), ...findOutOfHours(templates, hours.open, hours.close)],
    [templates, hours]
  );
  const flagged = useMemo(() => conflictedIds(conflicts), [conflicts]);

  const trainerName = useCallback(
    (id: string | null) => {
      if (!id) return 'Unassigned';
      const t = trainers.find((x) => x.profile.id === id);
      return t ? `${t.profile.first_name} ${t.profile.last_name}` : 'Unknown trainer';
    },
    [trainers]
  );

  const load = useCallback(async (announce = false) => {
    setLoading(true);
    try {
      const [tpl, avail, trainerRows, gym] = await Promise.all([
        listClassTemplates(),
        listAllAvailability().catch(() => []),
        listTrainers().catch(() => []),
        getGymSettings().catch(() => null),
      ]);
      setTemplates(tpl);
      setAvailability(avail);
      setTrainers(trainerRows);
      setHours({ open: gym?.opening_time ?? null, close: gym?.closing_time ?? null });

      // Keep the next few weeks of sessions materialised. Idempotent.
      const created = await generateClassInstances(WEEKS_AHEAD).catch(() => 0);
      setGenerated(created);

      // Read the dated sessions *after* generating, so a first visit doesn't
      // show an empty list that fills in only on the next refresh.
      setSessions(await loadUpcomingSessions(14).catch(() => []));

      // Only on an explicit refresh. Announcing this on every mount would toast
      // the front desk every time they open the screen.
      if (announce) {
        showToast(
          created > 0
            ? `${created} new session${created === 1 ? '' : 's'} generated`
            : 'Sessions are already up to date',
          'success'
        );
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to load schedule', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  /**
   * The last local date a generated session exists for.
   *
   * Derived from the templates rather than the session list: the list is capped
   * at 14 days for display, and the generator runs four weeks out, so counting
   * the list would understate the horizon by a fortnight.
   */
  const bookableThrough = useMemo(() => {
    if (templates.filter((t) => t.active).length === 0) return null;
    const d = new Date();
    d.setDate(d.getDate() + WEEKS_AHEAD * 7);
    return d.toLocaleDateString('en-PH', { day: 'numeric', month: 'long' });
  }, [templates]);

  const openAdd = () => {
    setEditingTemplate(null);
    setTemplateForm(emptyTemplate);
    setShowTemplateModal(true);
  };

  /**
   * Editing was impossible: the page could add and retire, so fixing a typo in a
   * class name meant retiring it and building a replacement — which orphans the
   * sessions already generated from the original.
   */
  const openEdit = (t: ClassTemplateRow) => {
    setEditingTemplate(t);
    setTemplateForm({
      name: t.name,
      trainerId: t.trainer_id ?? '',
      level: t.level,
      capacity: String(t.capacity),
      location: t.location ?? '',
      dayOfWeek: String(t.day_of_week),
      startTime: t.start_time.slice(0, 5),
      duration: String(t.duration_minutes),
    });
    setShowTemplateModal(true);
  };

  const handleSaveTemplate = async () => {
    if (!templateForm.name.trim()) return showToast('Class name is required', 'error');
    setSaving(true);
    try {
      const payload = {
        name: templateForm.name.trim(),
        trainer_id: templateForm.trainerId || null,
        level: templateForm.level,
        capacity: Number(templateForm.capacity) || 20,
        location: templateForm.location.trim() || null,
        day_of_week: Number(templateForm.dayOfWeek),
        start_time: `${templateForm.startTime}:00`,
        duration_minutes: Number(templateForm.duration) || 60,
      };
      if (editingTemplate) {
        await updateClassTemplate(editingTemplate.id, payload);
        // Sessions already generated keep their old details — the template is
        // the plan for *future* generation, not a live link to dated rows.
        showToast('Class updated. Sessions already scheduled keep their old time.', 'success');
      } else {
        await createClassTemplate(payload);
        showToast('Class added to the timetable', 'success');
      }
      setShowTemplateModal(false);
      setEditingTemplate(null);
      setTemplateForm(emptyTemplate);
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to save class', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleRetire = async () => {
    const t = toRetire;
    if (!t) return;
    try {
      if (t.active) await deactivateClassTemplate(t.id);
      else await updateClassTemplate(t.id, { active: true });
      showToast(`${t.name} ${t.active ? 'retired' : 'reactivated'}`, 'success');
      setToRetire(null);
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to update class', 'error');
    }
  };

  const handleAddHours = async () => {
    if (!hoursForm.trainerId) return showToast('Pick a trainer', 'error');
    if (hoursForm.end <= hoursForm.start) return showToast('End time must be after start time', 'error');

    // Two overlapping windows on the same day would offer the same PT slot
    // twice. The database has no constraint for it, so it has to be caught here.
    const clash = hoursOverlap(
      availability, hoursForm.trainerId, Number(hoursForm.dayOfWeek), hoursForm.start, hoursForm.end
    );
    if (clash) {
      return showToast(
        `That overlaps hours already set for ${DAY_NAMES[clash.day_of_week]} ${hhmm(clash.start_time)}–${hhmm(clash.end_time)}`,
        'error'
      );
    }

    setSaving(true);
    try {
      await addAvailability({
        trainer_id: hoursForm.trainerId,
        day_of_week: Number(hoursForm.dayOfWeek),
        start_time: `${hoursForm.start}:00`,
        end_time: `${hoursForm.end}:00`,
        slot_minutes: Number(hoursForm.slot) || 60,
      });
      showToast('Working hours added', 'success');
      setHoursForm({ ...emptyHours, trainerId: hoursForm.trainerId });
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to add hours', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteHours = async () => {
    if (!toDeleteHours) return;
    try {
      await deleteAvailability(toDeleteHours.id);
      showToast('Hours removed', 'success');
      setToDeleteHours(null);
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to remove hours', 'error');
    }
  };

  const panel = { background: 'var(--color-surface)', border: '1px solid var(--color-border)' };

  const visibleTemplates = trainerFilter === 'all'
    ? templates
    : templates.filter((t) => (trainerFilter === 'unassigned' ? t.trainer_id == null : t.trainer_id === trainerFilter));

  const visibleSessions = trainerFilter === 'all'
    ? sessions
    : sessions.filter((s) => (trainerFilter === 'unassigned' ? s.trainerId == null : s.trainerId === trainerFilter));

  /**
   * The timetable as a file.
   *
   * Exports the **active** templates only. An inactive template is a class the
   * gym has stopped running; printing it would send members to an empty studio.
   * The trainer filter is deliberately NOT applied — a wall timetable filtered
   * to one coach without saying so is worse than no timetable, and the filter
   * is a browsing aid rather than a statement about the week.
   */
  const exportable = (): ScheduleSlot[] =>
    templates
      .filter((t) => t.active)
      .map((t) => ({
        id: t.id,
        name: t.name,
        dayOfWeek: t.day_of_week,
        startTime: t.start_time,
        durationMinutes: t.duration_minutes,
        trainerName: t.trainer_id ? trainerName(t.trainer_id) : null,
        location: t.location,
        capacity: t.capacity,
      }));

  const handleExportPng = async () => {
    const slots = exportable();
    if (slots.length === 0) {
      showToast('There are no active classes to export.', 'error');
      return;
    }
    try {
      const blob = await renderSchedulePng(slots, { gymName: branding.name });
      // renderSchedulePng returns null when the canvas is unavailable, which is
      // a failure and must not pass silently as a download that never arrives.
      if (!blob) {
        showToast('Could not draw the timetable image.', 'error');
        return;
      }
      downloadBlob(blob, `timetable-${new Date().toISOString().slice(0, 10)}.png`);
      showToast('Timetable image downloaded.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Export failed', 'error');
    }
  };

  const handleExportCsv = () => {
    const slots = exportable();
    if (slots.length === 0) {
      showToast('There are no active classes to export.', 'error');
      return;
    }
    // \ufeff so Excel opens it as UTF-8. Without it a peso sign or an accented
    // trainer name arrives mangled, which is how most "the export is broken"
    // reports start.
    const blob = new Blob(['\ufeff' + scheduleToCsv(slots)], {
      type: 'text/csv;charset=utf-8',
    });
    downloadBlob(blob, `timetable-${new Date().toISOString().slice(0, 10)}.csv`);
    showToast('Timetable spreadsheet downloaded.', 'success');
  };

  // The timetable tab is exactly the window's height (header 4rem + <main>'s
  // padding 3rem) so the board fills it; the two list tabs scroll as before.
  return (
    <div className={tab === 'timetable' ? 'h-[calc(100vh-7rem)] flex flex-col gap-4' : 'space-y-4'}>
      <PageHeader
        title="Schedule"
        subtitle="Weekly timetable and trainer working hours"
        actions={
          <>
          {/*
            What this button is for, and why it says "Refresh" now.

            The Class Timetable is a weekly *pattern* — "Yoga, Mondays, 6am".
            Members cannot book a pattern; they book a dated session. Opening
            this page calls `generate_class_instances`, which walks four weeks
            forward and creates the dated sessions each active template is
            missing. It is idempotent, so it creates only what is absent.

            The button ran that same page load. Labelled "Regenerate sessions"
            it promised a manual action for something that had already happened
            the moment the screen opened — and because the confirmation banner
            only appeared when the count was above zero, the ordinary case
            (nothing to create) looked like a button that did nothing at all.

            It is a refresh, it says so, and it now reports the outcome every
            time — including "already up to date".
          */}
          {/* Two formats, two real uses: a sheet to pin up, and rows to open
              in Excel. Both draw from the same data as the calendar rather than
              screenshotting it — see utils/exportSchedule.ts for why. */}
          <Button variant="ghost" size="sm" onClick={handleExportPng}
            data-tip="Download the week as an image, sized for printing">
              <ImageIcon size={14} className="mr-1.5" /> PNG
          </Button>
          <Button variant="ghost" size="sm" onClick={handleExportCsv}
            data-tip="Download the week as a spreadsheet">
              <FileDown size={14} className="mr-1.5" /> CSV
          </Button>
          <Button variant="secondary" size="sm" onClick={() => load(true)} disabled={loading}>
              <RefreshCw size={14} className="mr-1.5" /> Refresh
            </Button>
            {tab === 'timetable' && (
              <Button variant="primary" size="sm" onClick={openAdd}>
                <Plus size={15} className="mr-1" /> Add class
              </Button>
            )}
          </>
        }
      />

      {/* The numbers and the two notices share one row. Stacked, they took
          about 200px above the timetable — enough to push the evening band
          off the bottom of the board, and the stat tiles only need 600px of
          the width anyway. */}
      {!loading && (
      <div className="flex items-start gap-3 flex-wrap">
      {/* The four numbers the desk is asked for, sized to the numbers. */}
        <StatTiles items={[
          { label: 'Classes', value: templates.filter((t) => t.active).length, icon: Dumbbell },
          { label: 'Sessions ahead', value: sessions.length, icon: CalendarDays },
          { label: 'Trainer hours set', value: availability.length, icon: Clock },
          {
            label: 'Clashes',
            value: conflicts.length,
            icon: AlertTriangle,
            tone: conflicts.length > 0 ? 'secondary' : 'primary',
          },
        ]} />

      <div className="flex-1 min-w-[320px] space-y-2">
      {/* Says how far ahead members can book, which is the fact the front desk
          is actually asked. The old banner only appeared when new sessions had
          just been created, so on a normal visit this said nothing. */}
        <div className="rounded-xl px-3 py-2 flex items-center justify-between gap-3"
          style={{ background: 'var(--color-primary-light)' }}>
          <p className="text-[11px]" style={{ color: 'var(--color-primary)' }}>
            {templates.filter((t) => t.active).length === 0
              ? 'No active classes on the timetable, so there is nothing to schedule yet.'
              : bookableThrough
                ? <>Members can book through <b>{bookableThrough}</b> — {WEEKS_AHEAD} weeks of sessions are generated from the timetable below.</>
                : 'Add an active class to the timetable and its sessions are generated automatically.'}
          </p>
          {generated !== null && (
            <span className="text-[10px] font-semibold whitespace-nowrap px-2 py-1 rounded-full"
              style={{ background: 'var(--color-surface)', color: 'var(--color-primary)' }}>
              {generated > 0 ? `+${generated} new` : 'Up to date'}
            </span>
          )}
        </div>

      {/* Clashes, stated plainly. Nothing stopped one trainer being booked onto
          two classes at the same hour, or two classes sharing a room — and both
          go on to generate real sessions members can book. */}
      {conflicts.length > 0 && (
        <div className="rounded-xl px-3 py-2 space-y-0.5"
          style={{ background: 'var(--color-secondary-light)', border: '1px solid rgba(245,158,11,0.30)' }}>
          <p className="text-[11px] font-bold flex items-center gap-1.5" style={{ color: 'var(--color-secondary)' }}>
            <AlertTriangle size={12} />
            {conflicts.length} timetable clash{conflicts.length === 1 ? '' : 'es'}
          </p>
          {conflicts.map((c: Conflict, i) => (
            <p key={`${c.a}-${c.b}-${c.kind}-${i}`} className="text-[10px]" style={{ color: 'var(--color-secondary)' }}>
              · {c.message}
            </p>
          ))}
        </div>
      )}
      </div>
      </div>
      )}

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Chips
          value={tab}
          onChange={(v) => setTab(v as typeof tab)}
          options={[
            { value: 'timetable', label: 'Timetable', count: templates.filter((t) => t.active).length },
            { value: 'sessions', label: 'Upcoming sessions', count: sessions.length },
            { value: 'hours', label: 'Trainer hours', count: availability.length },
          ]}
        />

        {tab !== 'hours' && (
          <div className="flex items-center gap-1.5">
            <Filter size={12} style={{ color: 'var(--color-text-muted)' }} />
            <select value={trainerFilter} onChange={(e) => setTrainerFilter(e.target.value)}
              aria-label="Filter by trainer"
              className="rounded-lg px-3 h-9 text-[11px] text-white"
              style={{ background: 'var(--color-surface-high)', border: '1px solid var(--color-border)' }}>
              <option value="all">All trainers</option>
              <option value="unassigned">Unassigned</option>
              {trainers.map((t) => (
                <option key={t.profile.id} value={t.profile.id}>
                  {t.profile.first_name} {t.profile.last_name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {loading ? (
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Loading…</p>
      ) : tab === 'timetable' ? (
        visibleTemplates.length === 0 ? (
          <Section title="Class timetable" icon={Dumbbell}>
            <EmptyState
              icon={Dumbbell}
              title={templates.length === 0 ? 'No classes on the timetable' : 'No classes for that trainer'}
              hint={templates.length === 0
                ? 'Add one and the dated sessions members book are generated from it automatically.'
                : 'Clear the filter to see the whole week.'}
              action={templates.length === 0
                ? <Button variant="primary" size="sm" onClick={openAdd}><Plus size={14} /> Add class</Button>
                : undefined}
            />
          </Section>
        ) : (
          /*
            A week, laid out like a calendar.

            Two shapes have been wrong here. First, one column per day stacked
            vertically with each day's classes in a `grid-cols-2` — a single
            class meant a half-width card and an empty half. Then seven columns
            of stacked cards, which fixed the emptiness but still answered the
            wrong question: a list per day tells you *what* is on, and a
            timetable is asked *when*. "Is 6pm free on Wednesday?" needed
            counting down a column and reading times one by one.

            Then an hour grid, which answered "when" but drew a one-hour class
            as a 30px sliver in a 5am-11pm grid of empty lines — unreadable
            without hovering. Now: days across, morning / afternoon / evening
            down, every class a card you can read, and a free cell says Free.
            See CalendarWeek.
          */
          <CalendarWeek
            templates={visibleTemplates}
            flagged={flagged}
            trainerName={trainerName}
            onEdit={openEdit}
            onRetire={setToRetire}
          />
        )
      ) : tab === 'sessions' ? (
        /* The plan versus what it actually produced. The page used to show only
           the recurring templates, so "is Saturday's class full?" was a question
           the front desk could not answer from here at all. */
        visibleSessions.length === 0 ? (
          <Section title="Upcoming sessions" icon={CalendarDays}>
            <EmptyState
              icon={CalendarDays}
              title="No sessions in the next 14 days"
              /* "hit Regenerate sessions" named a button that no longer exists —
                 it is Refresh now, and it runs on page load anyway. */
              hint="Add an active class to the timetable; its dated sessions are generated automatically."
            />
          </Section>
        ) : (
          <div className="space-y-3">
            {Object.entries(
              visibleSessions.reduce<Record<string, UpcomingSession[]>>((acc, s) => {
                const d = new Date(s.startsAt);
                const label = d.toLocaleDateString('en-PH', { weekday: 'long', day: 'numeric', month: 'long' });
                (acc[label] ||= []).push(s);
                return acc;
              }, {})
            ).map(([label, items]) => (
              <div key={label}>
                <p className="text-[10px] font-bold uppercase mb-1.5" style={{ color: 'var(--color-text-muted)' }}>{label}</p>
                {/* Was `grid-cols-2`: a day with one session drew an 800px card
                    and left 800px blank beside it. */}
                <CardGrid min={270}>
                  {items.map((s) => {
                    const full = s.booked >= s.capacity;
                    const pct = s.capacity > 0 ? Math.min(100, (s.booked / s.capacity) * 100) : 0;
                    return (
                      <TileCard key={s.id} accent={full}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-white truncate">{s.name}</p>
                            <p className="text-[10px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                              {new Date(s.startsAt).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}
                              {' · '}{s.durationMinutes}m · {trainerName(s.trainerId)}
                              {s.location ? ` · ${s.location}` : ''}
                            </p>
                          </div>
                          <span className="text-[11px] font-bold flex-shrink-0"
                            style={{ color: full ? 'var(--color-secondary)' : 'var(--color-primary)' }}>
                            {s.booked}/{s.capacity}
                          </span>
                        </div>
                        <div className="h-1 rounded-full mt-2 overflow-hidden" style={{ background: 'var(--color-border)' }}>
                          <div className="h-full rounded-full"
                            style={{ width: `${pct}%`, background: full ? 'var(--color-secondary)' : 'var(--color-primary)' }} />
                        </div>
                      </TileCard>
                    );
                  })}
                </CardGrid>
              </div>
            ))}
          </div>
        )
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {/* Add hours */}
          <div className="rounded-xl p-4 space-y-3" style={panel}>
            <div>
              <h2 className="text-sm font-bold text-white">Add Working Hours</h2>
              <p className="text-[10px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                Personal-training slots are generated from these.
              </p>
            </div>
            <select value={hoursForm.trainerId} onChange={(e) => setHoursForm({ ...hoursForm, trainerId: e.target.value })}
              className="w-full rounded-xl px-3 py-2.5 text-white text-xs"
              style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
              <option value="">Select trainer…</option>
              {trainers.map((t) => (
                <option key={t.profile.id} value={t.profile.id}>
                  {t.profile.first_name} {t.profile.last_name}
                </option>
              ))}
            </select>
            <select value={hoursForm.dayOfWeek} onChange={(e) => setHoursForm({ ...hoursForm, dayOfWeek: e.target.value })}
              aria-label="Day of week"
              className="w-full rounded-xl px-3 py-2.5 text-white text-xs"
              style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
              {DAY_NAMES.map((d, i) => <option key={d} value={i}>{d}</option>)}
            </select>
            <div className="grid grid-cols-3 gap-2">
              <Field label="From">
                <TimePicker value={hoursForm.start} onChange={(v) => setHoursForm({ ...hoursForm, start: v })} />
              </Field>
              <Field label="Until">
                <TimePicker value={hoursForm.end} onChange={(v) => setHoursForm({ ...hoursForm, end: v })} />
              </Field>
              <Field label="Slot (min)">
                <Input type="number" min="15" step="15" value={hoursForm.slot}
                  style={{ background: 'var(--color-bg)' }}
                  onChange={(e) => setHoursForm({ ...hoursForm, slot: e.target.value })} />
              </Field>
            </div>
            <p className="text-[9px]" style={{ color: 'var(--color-text-muted)' }}>
              This window is chopped into slots of that length, and members book one slot at a time.
            </p>
            <Button variant="primary" onClick={handleAddHours} disabled={saving}>
              {saving ? 'Adding…' : 'Add Hours'}
            </Button>
          </div>

          {/* Existing hours */}
          <div className="rounded-xl p-4 space-y-2" style={panel}>
            <h2 className="text-sm font-bold text-white">Current Hours</h2>
            {availability.length === 0 ? (
              <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                No working hours set — no PT slots can be offered yet.
              </p>
            ) : (
              <div className="space-y-1.5 max-h-[420px] overflow-y-auto">
                {availability.map((a) => (
                  <div key={a.id} className="flex items-center gap-2 p-2.5 rounded-lg"
                    style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-semibold text-white truncate">{trainerName(a.trainer_id)}</p>
                      <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                        {DAY_NAMES[a.day_of_week]} · {clock(a.start_time)}–{clock(a.end_time)} · {a.slot_minutes}m slots
                      </p>
                    </div>
                    <button onClick={() => setToDeleteHours(a)} data-tip="Remove these hours"
                      style={{ color: 'var(--color-secondary)' }}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={!!toRetire}
        onClose={() => setToRetire(null)}
        onConfirm={handleRetire}
        title={toRetire?.active ? 'Retire Class' : 'Reactivate Class'}
        message={
          toRetire?.active
            ? `Retire "${toRetire?.name}"? It stops generating new sessions, but every session already scheduled from it stays exactly as it is — including anyone who has booked. Reversible at any time.`
            : `Put "${toRetire?.name}" back on the timetable? It starts generating sessions again from the next regeneration.`
        }
        confirmText={toRetire?.active ? 'Retire' : 'Reactivate'}
        type={toRetire?.active ? 'warning' : 'info'}
      />

      <ConfirmDialog
        isOpen={!!toDeleteHours}
        onClose={() => setToDeleteHours(null)}
        onConfirm={handleDeleteHours}
        title="Remove Working Hours"
        message={
          toDeleteHours
            ? `Remove ${trainerName(toDeleteHours.trainer_id)}'s ${DAY_NAMES[toDeleteHours.day_of_week]} ${clock(toDeleteHours.start_time)}–${clock(toDeleteHours.end_time)}? No new 1-on-1 slots will be offered in that window. Sessions already booked in it are not cancelled — handle those at the desk.`
            : ''
        }
        confirmText="Remove"
        type="danger"
      />

      {/* Add / edit class template modal */}
      {createPortal(
        <AnimatePresence>
          {showTemplateModal && (
            <>
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={() => setShowTemplateModal(false)}
                className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[200]" />
              <div className="fixed inset-0 flex items-center justify-center z-[200] p-4">
                <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="w-full max-w-md rounded-2xl overflow-hidden"
                  style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
                  onClick={(e) => e.stopPropagation()}>
                  <div className="p-5 flex items-center justify-between" style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <div>
                      <h2 className="text-base font-bold text-white">{editingTemplate ? 'Edit Class' : 'Add Class'}</h2>
                      <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                        {editingTemplate
                          ? 'Changes apply to sessions generated from now on.'
                          : 'Repeats weekly. Sessions are generated automatically.'}
                      </p>
                    </div>
                    <button onClick={() => setShowTemplateModal(false)} className="text-gray-400 hover:text-white">
                      <X size={20} />
                    </button>
                  </div>
                  {/* Every field carries a visible label. Placeholders alone don't
                      work here: each numeric field ships with a sensible default,
                      and a placeholder only renders while the input is empty — so
                      "Capacity" and "Minutes" were never once shown to anyone. */}
                  <div className="p-5 space-y-3 max-h-[65vh] overflow-y-auto">
                    <Field label="Class name">
                      <Input type="text" value={templateForm.name} placeholder="e.g. Morning HIIT"
                        onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })} />
                    </Field>
                    <Field label="Trainer">
                      <select value={templateForm.trainerId}
                        onChange={(e) => setTemplateForm({ ...templateForm, trainerId: e.target.value })}
                        className="w-full rounded-xl px-3 py-2.5 text-white text-sm"
                        style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
                        <option value="">Unassigned</option>
                        {trainers.map((t) => (
                          <option key={t.profile.id} value={t.profile.id}>
                            {t.profile.first_name} {t.profile.last_name}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Repeats every">
                        <select value={templateForm.dayOfWeek}
                          onChange={(e) => setTemplateForm({ ...templateForm, dayOfWeek: e.target.value })}
                          className="w-full rounded-xl px-3 py-2.5 text-white text-sm"
                          style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
                          {DAY_NAMES.map((d, i) => <option key={d} value={i}>{d}</option>)}
                        </select>
                      </Field>
                      <Field label="Start time">
                        <TimePicker value={templateForm.startTime}
                          onChange={(v) => setTemplateForm({ ...templateForm, startTime: v })} />
                      </Field>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Capacity" hint="Max members per session">
                        <Input type="number" min="1" value={templateForm.capacity}
                          onChange={(e) => setTemplateForm({ ...templateForm, capacity: e.target.value })} />
                      </Field>
                      <Field label="Duration" hint="Minutes">
                        <Input type="number" min="15" step="15" value={templateForm.duration}
                          onChange={(e) => setTemplateForm({ ...templateForm, duration: e.target.value })} />
                      </Field>
                    </div>
                    <Field label="Level" hint="Members see a “For you” badge on a match">
                      <select value={templateForm.level}
                        onChange={(e) => setTemplateForm({ ...templateForm, level: e.target.value as ClassLevel })}
                        className="w-full rounded-xl px-3 py-2.5 text-white text-sm capitalize"
                        style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
                        {LEVELS.map((l) => <option key={l} value={l}>{l.replace('_', ' ')}</option>)}
                      </select>
                    </Field>
                    <Field label="Location">
                      <Input type="text" value={templateForm.location} placeholder="e.g. Studio A"
                        onChange={(e) => setTemplateForm({ ...templateForm, location: e.target.value })} />
                    </Field>
                  </div>
                  <div className="p-5 flex gap-3" style={{ borderTop: '1px solid var(--color-border)' }}>
                    <Button variant="ghost" className="flex-1" onClick={() => setShowTemplateModal(false)}>Cancel</Button>
                    <Button variant="primary" className="flex-1" onClick={handleSaveTemplate} disabled={saving}>
                      {saving ? 'Saving…' : editingTemplate ? 'Save Changes' : 'Add Class'}
                    </Button>
                  </div>
                </motion.div>
              </div>
            </>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
}

/** Minutes since midnight, from 'HH:MM' or 'HH:MM:SS'. */
function minutesOfDay(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/**
 * The weekly timetable as a board: days across, parts of the day down.
 *
 * Third shape, and the reasons the first two failed are why this one looks the
 * way it does. A plain list per day said *what* was on but not *when* things
 * were free. The hour grid that replaced it answered "when" — and drew a 5am to
 * 11pm grid in which a one-hour class was a 30px sliver holding 10px text, most
 * of the screen empty lines, and nothing readable without hovering.
 *
 * So the week is split into three bands everyone already thinks in — morning,
 * afternoon, evening — and every class is a card big enough to read at a
 * glance: its time range, name, coach, level, room and size. "Is Wednesday
 * evening free?" is one cell, and it says **Free** when it is. Bands get room
 * in proportion to how busy they are, so a quiet afternoon does not take the
 * same height as a packed evening, and the board fills the panel it is given.
 *
 * Clashes stay loud: an amber card with a "Clash" chip, the same classes the
 * banner above lists. Retired classes stay visible, dimmed, so restoring one is
 * a click here rather than a hunt.
 */
const BANDS = [
  { id: 'morning',   label: 'Morning',   range: 'before 12 PM', from: 0,       to: 12 * 60 },
  { id: 'afternoon', label: 'Afternoon', range: '12 – 5 PM',    from: 12 * 60, to: 17 * 60 },
  { id: 'evening',   label: 'Evening',   range: 'from 5 PM',    from: 17 * 60, to: 24 * 60 + 1 },
] as const;

/** Minutes since midnight → 'HH:MM', wrapping past midnight. */
function fromMinutes(total: number): string {
  const m = ((total % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** '6:00 – 7:00 AM', or '11:30 AM – 12:30 PM' when the half of the day changes. */
function timeRange(start: string, minutes: number): string {
  const a = clock(start);
  const b = clock(fromMinutes(minutesOfDay(start) + minutes));
  return a.slice(-2) === b.slice(-2) ? `${a.slice(0, -3)} – ${b}` : `${a} – ${b}`;
}

function ClassCard({ t, clashing, trainer, onEdit, onRetire }: {
  t: ClassTemplateRow;
  clashing: boolean;
  trainer: string;
  onEdit: () => void;
  onRetire: () => void;
}) {
  const accent = !t.active ? 'var(--color-border)' : clashing ? 'var(--color-secondary)' : 'var(--color-primary)';
  const chip = 'text-[9px] font-semibold px-1.5 rounded leading-4';
  // One muted line rather than a row of chips: chips wrapped to two rows on a
  // 200px column and made every card twice the height it needed to be, so the
  // evening band fell off the bottom of the board.
  const meta = [
    t.level !== 'all_levels' ? t.level[0].toUpperCase() + t.level.slice(1) : null,
    `${t.duration_minutes} min`,
    `${t.capacity} spots`,
    t.location,
  ].filter(Boolean).join(' · ');
  return (
    // A div, not a <button>: a button centres its content, and this card is
    // left-aligned text with a button of its own inside it.
    <div role="button" tabIndex={0} onClick={onEdit}
      onKeyDown={(e) => { if (e.key === 'Enter') onEdit(); }}
      data-tip={`Edit ${t.name} — ${trainer} · ${meta}`}
      className="rounded-lg px-2 py-1.5 cursor-pointer transition-colors"
      style={{
        background: !t.active ? 'var(--color-surface-high)'
          : clashing ? 'var(--color-secondary-light)' : 'var(--color-primary-light)',
        borderLeft: `3px solid ${accent}`,
        opacity: t.active ? 1 : 0.6,
      }}>
      <div className="flex items-start justify-between gap-1">
        {/* The flags ride on the time line, which never truncates — on the
            name line a long class name would push them out of sight. */}
        <p className="text-[11px] font-bold tabular-nums leading-tight flex items-center gap-1.5 flex-wrap"
          style={{ color: clashing ? 'var(--color-secondary)' : 'var(--color-primary)' }}>
          {timeRange(t.start_time, t.duration_minutes)}
          {clashing && (
            <span className={chip} style={{ background: 'var(--color-secondary)', color: '#000' }}>Clash</span>
          )}
          {!t.active && (
            <span className={chip} style={{ background: 'var(--color-border)', color: 'var(--color-text-secondary)' }}>Retired</span>
          )}
        </p>
        {/* Always visible: hover-only actions have to be discovered first. */}
        <button onClick={(e) => { e.stopPropagation(); onRetire(); }}
          data-tip={t.active ? 'Retire this class' : 'Put this class back on the timetable'}
          aria-label={t.active ? `Retire ${t.name}` : `Restore ${t.name}`}
          className="w-5 h-5 -mt-0.5 -mr-0.5 rounded flex items-center justify-center flex-shrink-0"
          style={{ color: 'var(--color-text-muted)' }}>
          {t.active ? <Trash2 size={11} /> : <RotateCcw size={11} />}
        </button>
      </div>
      <p className="text-[12px] font-semibold text-white leading-snug truncate">{t.name}</p>
      {/* Coach and length only; level, size and room are in the hover tip and
          one click away in the editor. Three lines keep a busy band's cards
          short enough for all three bands to fit on a laptop screen. */}
      <p className="text-[10px] truncate leading-snug" style={{ color: 'var(--color-text-secondary)' }}>
        {trainer}<span style={{ color: 'var(--color-text-muted)' }}> · {t.duration_minutes} min</span>
      </p>
    </div>
  );
}

function CalendarWeek({ templates, flagged, trainerName, onEdit, onRetire }: {
  templates: ClassTemplateRow[];
  flagged: Set<string>;
  trainerName: (id: string | null) => string;
  onEdit: (t: ClassTemplateRow) => void;
  onRetire: (t: ClassTemplateRow) => void;
}) {
  // Read once, in an initialiser: a clock read during render is impure, and a
  // tab left open past midnight is fixed by the next visit, not by a timer.
  const [today] = useState(() => new Date().getDay());

  const cell = (dow: number, band: (typeof BANDS)[number]) => templates
    .filter((t) => {
      const m = minutesOfDay(t.start_time);
      return t.day_of_week === dow && m >= band.from && m < band.to;
    })
    .sort((a, b) => a.start_time.localeCompare(b.start_time));

  // Each band's share of the height follows its busiest day, so a band with
  // four classes stacked on a Monday gets the room they need. Never below 0.6,
  // so a free band still reads as a row and not a crease.
  const weights = BANDS.map((b) => Math.max(0.6, ...DAY_NAMES.map((_, dow) => cell(dow, b).length)));

  return (
    <Section title="Class timetable" icon={CalendarDays}
      hint="click a class to edit it · empty cells are free time"
      className="flex-1 min-h-0 flex flex-col">
      <div className="flex-1 min-h-0 overflow-auto scrollbar-thin scrollbar-thumb-dark-border">
        <div className="grid gap-1.5 min-w-[1000px] min-h-full"
          style={{
            gridTemplateColumns: '92px repeat(7, minmax(0, 1fr))',
            gridTemplateRows: `auto ${weights.map((w) => `minmax(max-content, ${w}fr)`).join(' ')}`,
          }}>
          {/* Day headings share the grid's own columns, so they cannot drift
              out of line with the cells below when a scrollbar appears. */}
          <div />
          {DAY_NAMES.map((day, dow) => {
            const n = templates.filter((t) => t.day_of_week === dow).length;
            const isToday = dow === today;
            return (
              <div key={day} className="text-center rounded-lg py-1.5"
                style={{
                  background: isToday ? 'var(--color-primary-light)' : 'transparent',
                  border: `1px solid ${isToday ? 'var(--color-primary)' : 'transparent'}`,
                }}>
                <p className="text-[11px] font-bold uppercase tracking-wide"
                  style={{ color: isToday ? 'var(--color-primary)' : n > 0 ? 'var(--color-text-secondary)' : 'var(--color-text-muted)' }}>
                  {day.slice(0, 3)}{isToday && ' · today'}
                </p>
                <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                  {n === 0 ? 'no classes' : `${n} class${n === 1 ? '' : 'es'}`}
                </p>
              </div>
            );
          })}

          {BANDS.map((band) => (
            <Fragment key={band.id}>
              <div className="rounded-lg px-2 py-2 flex flex-col justify-center"
                style={{ background: 'var(--color-surface-high)' }}>
                <p className="text-[11px] font-bold text-white">{band.label}</p>
                <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>{band.range}</p>
              </div>
              {DAY_NAMES.map((day, dow) => {
                const items = cell(dow, band);
                return (
                  <div key={`${band.id}-${day}`} className="rounded-lg p-1.5 space-y-1.5"
                    style={{
                      background: dow === today ? 'rgba(124,58,237,0.06)' : 'var(--color-surface)',
                      border: '1px solid var(--color-border)',
                    }}>
                    {items.length === 0 ? (
                      <div className="h-full min-h-[40px] flex items-center justify-center text-[10px]"
                        style={{ color: 'var(--color-text-muted)', opacity: 0.6 }}>
                        Free
                      </div>
                    ) : items.map((t) => (
                      <ClassCard key={t.id} t={t} clashing={flagged.has(t.id)}
                        trainer={trainerName(t.trainer_id)}
                        onEdit={() => onEdit(t)} onRetire={() => onRetire(t)} />
                    ))}
                  </div>
                );
              })}
            </Fragment>
          ))}
        </div>
      </div>
    </Section>
  );
}
