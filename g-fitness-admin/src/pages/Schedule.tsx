import {
  renderSchedulePng, scheduleToCsv, downloadBlob, type ScheduleSlot,
} from '../utils/exportSchedule';
import { useBranding } from '../hooks/useBranding';
import { supabase } from '../lib/supabaseClient';
import { Fragment, useMemo, useState, useEffect, useCallback } from 'react';
import Modal from '../components/ui/Modal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import Popover from '../components/ui/Popover';
import TimePicker from '../components/ui/TimePicker';
import {
  RdHeader, RdCard, StatTile, PageTabs, RdSelect, RdButton, Pill, EmptyBlock, Initials, RdField,
} from '../components/ui/rd';
import { TONE, RD_INPUT, RD_INPUT_STYLE } from '../components/ui/rdTokens';
import {
  Plus, Trash2, RefreshCw, Dumbbell, RotateCcw,
  AlertTriangle, CalendarDays, CalendarCheck, Clock, Users,
  Image as ImageIcon, FileDown,
} from 'lucide-react';
import { showToast } from '../utils/toast';
import { todayKey } from '../utils/dates';
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
 *
 * 2026-10-12: the kit's look, fitted to the screen — the board, the sessions
 * and the hours each scroll in their own box.
 */

const LEVELS: ClassLevel[] = ['all_levels', 'beginner', 'intermediate', 'advanced'];
const WEEKS_AHEAD = 4;

const SECOND = 'var(--color-text-secondary)';
const MUTED = 'var(--color-text-muted)';
const LINE = '1px solid rgba(255,255,255,0.06)';

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
  /** Waitlist sizes per class (0096). Empty before it is pasted, so nothing shows. */
  const [waitingByClass, setWaitingByClass] = useState<Map<string, number>>(new Map());
  useEffect(() => {
    void (async () => {
      const { data } = await supabase.from('class_waitlist').select('class_id');
      const w = new Map<string, number>();
      for (const r of data ?? []) w.set(r.class_id as string, (w.get(r.class_id as string) ?? 0) + 1);
      setWaitingByClass(w);
    })();
  }, [sessions]);
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
  const [clashAnchor, setClashAnchor] = useState<HTMLElement | null>(null);
  const [clashOpen, setClashOpen] = useState(false);
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

  useEffect(() => { void (async () => { await load(); })(); }, [load]);

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
      downloadBlob(blob, `timetable-${todayKey()}.png`);
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
    // The BOM (\ufeff) so Excel opens it as UTF-8. Without it a peso sign or an accented
    // trainer name arrives mangled, which is how most "the export is broken"
    // reports start.
    const blob = new Blob(['\ufeff' + scheduleToCsv(slots)], {
      type: 'text/csv;charset=utf-8',
    });
    downloadBlob(blob, `timetable-${todayKey()}.csv`);
    showToast('Timetable spreadsheet downloaded.', 'success');
  };

  const activeCount = templates.filter((t) => t.active).length;
  const fullSoon = sessions.filter((s) => s.capacity > 0 && s.booked >= s.capacity).length;
  const byTrainer = trainers
    .map((t) => ({ t, rows: availability.filter((a) => a.trainer_id === t.profile.id).sort((a, b) => a.day_of_week - b.day_of_week || a.start_time.localeCompare(b.start_time)) }))
    .filter((x) => x.rows.length > 0);
  const noHours = trainers.filter((t) => !availability.some((a) => a.trainer_id === t.profile.id));

  /*
    "Refresh" runs the same generate_class_instances the page load runs — the
    timetable is a weekly *pattern*, members book dated sessions made from it,
    four weeks ahead. Idempotent; it reports the outcome every time, including
    "already up to date". PNG and CSV draw from the same data as the board.
  */
  return (
    <div className="rd-fit" data-schedule>
      <RdHeader title="Schedule" subtitle="The weekly timetable members book from, and each coach's 1-on-1 hours."
        actions={<>
          <RdButton size="sm" variant="ghost" icon={ImageIcon} onClick={handleExportPng} data-tip="Download the week as an image, sized for printing">PNG</RdButton>
          <RdButton size="sm" variant="ghost" icon={FileDown} onClick={handleExportCsv} data-tip="Download the week as a spreadsheet">CSV</RdButton>
          <RdButton size="sm" icon={RefreshCw} onClick={() => load(true)} disabled={loading}>Refresh</RdButton>
          <RdButton size="sm" variant="primary" icon={Plus} onClick={openAdd}>Add class</RdButton>
        </>} />

      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        <StatTile compact icon={Dumbbell} label="Classes" value={activeCount} sub={`${templates.length - activeCount} retired`} active={tab === 'timetable'} onClick={() => setTab('timetable')} />
        <StatTile compact icon={CalendarDays} label="Sessions, next 14 days" value={sessions.length} sub={fullSoon ? `${fullSoon} already full` : 'none full yet'} active={tab === 'sessions'} onClick={() => setTab('sessions')} />
        <StatTile compact icon={Clock} label="Coach hours set" value={availability.length} sub={noHours.length ? `${noHours.length} coach${noHours.length === 1 ? ' has' : 'es have'} none` : 'every coach has hours'} tone={noHours.length ? 'amber' : 'violet'} active={tab === 'hours'} onClick={() => setTab('hours')} />
        <span ref={setClashAnchor} className="grid">
          <StatTile compact icon={AlertTriangle} label="Clashes" value={conflicts.length} tone={conflicts.length ? 'amber' : 'violet'}
            sub={conflicts.length ? 'click to see each one' : 'none — the week is clear'}
            onClick={conflicts.length ? () => setClashOpen((v) => !v) : undefined} />
        </span>
      </div>

      {/* The clashes, stated plainly, one click from the tile that counts them. */}
      <Popover anchor={clashAnchor} open={clashOpen && conflicts.length > 0} onClose={() => setClashOpen(false)} width={420}>
        <div className="p-4" data-clashes>
          <p className="text-[14px] font-semibold flex items-center gap-2" style={{ color: TONE.amber.fg }}>
            <AlertTriangle size={15} /> {conflicts.length} timetable clash{conflicts.length === 1 ? '' : 'es'}
          </p>
          {conflicts.map((c: Conflict, i) => (
            <p key={`${c.a}-${c.b}-${c.kind}-${i}`} className="text-[13px] mt-1.5" style={{ color: 'var(--color-text-primary)' }}>{c.message}</p>
          ))}
          <p className="text-[12px] mt-2.5" style={{ color: MUTED }}>Clashing classes are amber on the board — click one to change its time, coach or room.</p>
        </div>
      </Popover>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <PageTabs<TabId> label="Schedule sections" value={tab} onChange={setTab} tabs={[
          { key: 'timetable', label: 'Timetable', icon: CalendarDays },
          { key: 'sessions', label: 'Upcoming sessions', icon: Users },
          { key: 'hours', label: 'Coach hours', icon: Clock },
        ]} />
        {/* How far ahead members can book — the fact the desk is asked. */}
        {!loading && (
          <p className="flex-1 min-w-[260px] text-[13px] flex items-center gap-2" style={{ color: SECOND }} data-bookable>
            <CalendarCheck size={15} style={{ color: '#C4B5FD' }} />
            {activeCount === 0
              ? 'No active classes, so nothing to book yet.'
              : bookableThrough
                ? <span>Members can book through <b className="text-white">{bookableThrough}</b> — {WEEKS_AHEAD} weeks are made from the timetable{generated ? ` (+${generated} new)` : ''}.</span>
                : 'Add an active class and its sessions are made automatically.'}
          </p>
        )}
        {tab !== 'hours' && (
          <RdSelect label="Filter by trainer" value={trainerFilter} onChange={setTrainerFilter} className="w-[220px]">
            <option value="all">All coaches</option>
            <option value="unassigned">Unassigned</option>
            {trainers.map((t) => <option key={t.profile.id} value={t.profile.id}>{t.profile.first_name} {t.profile.last_name}</option>)}
          </RdSelect>
        )}
      </div>

      {loading ? (
        <p className="text-[14px]" style={{ color: MUTED }}>Loading…</p>
      ) : tab === 'timetable' ? (
        visibleTemplates.length === 0 ? (
          <RdCard className="rd-fit-fill">
            <EmptyBlock icon={Dumbbell}
              title={templates.length === 0 ? 'No classes on the timetable' : 'No classes for that coach'}
              body={templates.length === 0 ? 'Add one and the dated sessions members book are made from it automatically.' : 'Clear the filter to see the whole week.'}
              action={templates.length === 0 ? <RdButton variant="primary" icon={Plus} onClick={openAdd}>Add class</RdButton> : undefined} />
          </RdCard>
        ) : (
          <CalendarWeek templates={visibleTemplates} flagged={flagged} trainerName={trainerName} onEdit={openEdit} onRetire={setToRetire} />
        )
      ) : tab === 'sessions' ? (
        /* The plan versus what it actually produced: is Saturday's class full? */
        <RdCard className="flex flex-col min-h-0 overflow-hidden rd-fit-fill" data-sessions>
          <div className="rd-fit-scroll">
            {visibleSessions.length === 0 ? (
              <EmptyBlock compact icon={CalendarDays} title="No sessions in the next 14 days"
                body="Add an active class to the timetable; its dated sessions are made automatically." />
            ) : Object.entries(
              visibleSessions.reduce<Record<string, UpcomingSession[]>>((acc, s) => {
                const label = new Date(s.startsAt).toLocaleDateString('en-PH', { weekday: 'long', day: 'numeric', month: 'long' });
                (acc[label] ||= []).push(s);
                return acc;
              }, {}),
            ).map(([label, items]) => (
              <div key={label}>
                <p className="px-4 py-2 text-[13px] font-semibold sticky top-0 z-[1]" style={{ color: SECOND, background: 'var(--color-surface)', borderBottom: LINE }}>
                  {label} <span className="font-normal" style={{ color: MUTED }}>— {items.length} session{items.length === 1 ? '' : 's'}</span>
                </p>
                {items.map((s) => {
                  const full = s.capacity > 0 && s.booked >= s.capacity;
                  const waiting = waitingByClass.get(s.id) ?? 0;
                  return (
                    <div key={s.id} className="flex items-center gap-4 px-4 py-2.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }} data-session-row>
                      <span className="w-[86px] text-[14px] font-semibold tabular-nums" style={{ color: '#C4B5FD' }}>
                        {new Date(s.startsAt).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-[14.5px] font-semibold text-white truncate">{s.name}</span>
                        <span className="block text-[12.5px] truncate" style={{ color: MUTED }}>
                          {trainerName(s.trainerId)} — {s.durationMinutes} min{s.location ? ` — ${s.location}` : ''}
                        </span>
                      </span>
                      <span className="w-[180px] hidden md:block">
                        <span className="block h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
                          <span className="block h-full rounded-full" style={{ width: `${s.capacity > 0 ? Math.min(100, (s.booked / s.capacity) * 100) : 0}%`,
                            background: full ? 'linear-gradient(90deg,#F59E0B,#FBBF24)' : 'linear-gradient(90deg,#6D28D9,#8B5CF6)' }} />
                        </span>
                      </span>
                      <span className="w-[70px] text-right text-[14px] font-bold tabular-nums" style={{ color: full ? TONE.amber.fg : 'var(--color-text-primary)' }}>{s.booked}/{s.capacity}</span>
                      <span className="w-[110px] flex justify-end">
                        {waiting > 0 ? <Pill tone="amber">+{waiting} waiting</Pill> : full ? <Pill tone="amber">Full</Pill> : null}
                      </span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </RdCard>
      ) : (
        <div className="rd-fit-two" data-hours>
          {/* Add hours */}
          <RdCard className="flex flex-col min-h-0 overflow-hidden">
            <div className="px-5 py-4" style={{ borderBottom: LINE }}>
              <h2 className="text-[16px] font-semibold text-white">Add working hours</h2>
              <p className="text-[13px] mt-0.5" style={{ color: SECOND }}>1-on-1 slots members can book are made from these.</p>
            </div>
            <div className="rd-fit-scroll p-5 space-y-3.5">
              <RdSelect label="Coach" value={hoursForm.trainerId} onChange={(v) => setHoursForm({ ...hoursForm, trainerId: v })} className="w-full">
                <option value="">Select a coach…</option>
                {trainers.map((t) => <option key={t.profile.id} value={t.profile.id}>{t.profile.first_name} {t.profile.last_name}</option>)}
              </RdSelect>
              <div className="flex gap-1.5 flex-wrap" role="group" aria-label="Day of week">
                {DAY_NAMES.map((d, i) => (
                  <button key={d} type="button" onClick={() => setHoursForm({ ...hoursForm, dayOfWeek: String(i) })} aria-pressed={hoursForm.dayOfWeek === String(i)}
                    className="h-10 px-3.5 rounded-xl text-[13.5px] font-semibold"
                    style={hoursForm.dayOfWeek === String(i) ? { background: 'rgba(124,58,237,0.22)', color: '#EDE9FE', border: '1px solid rgba(139,92,246,0.7)' }
                      : { color: SECOND, border: '1px solid rgba(255,255,255,0.1)' }}>{d.slice(0, 3)}</button>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-3">
                <RdField label="From"><TimePicker value={hoursForm.start} onChange={(v) => setHoursForm({ ...hoursForm, start: v })} /></RdField>
                <RdField label="Until"><TimePicker value={hoursForm.end} onChange={(v) => setHoursForm({ ...hoursForm, end: v })} /></RdField>
                <RdField label="Slot (minutes)">
                  <input type="number" min="15" step="15" value={hoursForm.slot} onChange={(e) => setHoursForm({ ...hoursForm, slot: e.target.value })} className={RD_INPUT} style={RD_INPUT_STYLE} />
                </RdField>
              </div>
              <p className="text-[12.5px]" style={{ color: MUTED }}>This window is cut into slots of that length, and members book one slot at a time.</p>
              <RdButton variant="primary" icon={Plus} onClick={handleAddHours} disabled={saving}>{saving ? 'Adding…' : 'Add hours'}</RdButton>
              {noHours.length > 0 && (
                <p className="text-[12.5px] rounded-xl px-3 py-2.5" style={{ color: TONE.amber.fg, background: TONE.amber.bg, border: `1px solid ${TONE.amber.line}` }}>
                  No hours yet, so no 1-on-1 can be booked with: {noHours.map((t) => `${t.profile.first_name} ${t.profile.last_name}`).join(', ')}.
                </p>
              )}
            </div>
          </RdCard>

          {/* Existing hours, grouped by coach: one glance answers "when is Rae free?" */}
          <RdCard className="flex flex-col min-h-0 overflow-hidden">
            <div className="px-5 py-4" style={{ borderBottom: LINE }}>
              <h2 className="text-[16px] font-semibold text-white">Current hours</h2>
              <p className="text-[13px] mt-0.5" style={{ color: SECOND }}>{availability.length} window{availability.length === 1 ? '' : 's'} across {byTrainer.length} coach{byTrainer.length === 1 ? '' : 'es'}</p>
            </div>
            <div className="rd-fit-scroll p-4 space-y-3">
              {byTrainer.length === 0 ? (
                <EmptyBlock compact icon={Clock} title="No working hours set" body="No 1-on-1 slots can be offered yet." />
              ) : byTrainer.map(({ t, rows }) => (
                <div key={t.profile.id} className="rounded-xl p-3" style={{ border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.015)' }}>
                  <div className="flex items-center gap-2.5 mb-2">
                    <Initials name={`${t.profile.first_name} ${t.profile.last_name}`} photo={t.profile.photo_url} size={30} />
                    <p className="text-[14.5px] font-semibold text-white flex-1 truncate">{t.profile.first_name} {t.profile.last_name}</p>
                    <span className="text-[12px]" style={{ color: MUTED }}>{rows.length} window{rows.length === 1 ? '' : 's'}</span>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {rows.map((a) => (
                      <div key={a.id} className="flex items-center gap-3 px-2.5 py-1.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.025)' }}>
                        <span className="w-12 text-[13px] font-semibold" style={{ color: '#C4B5FD' }}>{DAY_NAMES[a.day_of_week].slice(0, 3)}</span>
                        <span className="flex-1 text-[13.5px] text-white tabular-nums">{clock(a.start_time)} – {clock(a.end_time)}</span>
                        <span className="text-[12px]" style={{ color: MUTED }}>{a.slot_minutes}-min slots</span>
                        <button type="button" onClick={() => setToDeleteHours(a)} data-tip="Remove these hours" aria-label={`Remove ${DAY_NAMES[a.day_of_week]} ${clock(a.start_time)} hours`}
                          className="w-8 h-8 rounded-lg grid place-items-center hover:bg-white/[0.06]" style={{ color: TONE.amber.fg }}><Trash2 size={14} /></button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </RdCard>
        </div>
      )}

      <ConfirmDialog
        isOpen={!!toRetire}
        onClose={() => setToRetire(null)}
        onConfirm={handleRetire}
        title={toRetire?.active ? 'Retire class' : 'Reactivate class'}
        message={
          toRetire?.active
            ? `Retire "${toRetire?.name}"? It stops making new sessions, but every session already scheduled from it stays exactly as it is — including anyone who has booked. Reversible at any time.`
            : `Put "${toRetire?.name}" back on the timetable? It starts making sessions again from the next refresh.`
        }
        confirmText={toRetire?.active ? 'Retire' : 'Reactivate'}
        type={toRetire?.active ? 'warning' : 'info'}
      />

      <ConfirmDialog
        isOpen={!!toDeleteHours}
        onClose={() => setToDeleteHours(null)}
        onConfirm={handleDeleteHours}
        title="Remove working hours"
        message={
          toDeleteHours
            ? `Remove ${trainerName(toDeleteHours.trainer_id)}'s ${DAY_NAMES[toDeleteHours.day_of_week]} ${clock(toDeleteHours.start_time)}–${clock(toDeleteHours.end_time)}? No new 1-on-1 slots will be offered in that window. Sessions already booked in it are not cancelled — handle those at the desk.`
            : ''
        }
        confirmText="Remove"
        type="danger"
      />

      {/* Add / edit a class. Every field carries a visible label: each numeric field ships
          with a default, and a placeholder only shows while the box is empty. */}
      <Modal isOpen={showTemplateModal} onClose={() => setShowTemplateModal(false)} size="md"
        title={editingTemplate ? 'Edit class' : 'Add class'}
        subtitle={editingTemplate ? 'Changes apply to sessions made from now on.' : 'Repeats weekly. Sessions are made automatically.'}
        footer={<>
          <RdButton variant="ghost" onClick={() => setShowTemplateModal(false)}>Cancel</RdButton>
          <RdButton variant="primary" onClick={handleSaveTemplate} disabled={saving}>{saving ? 'Saving…' : editingTemplate ? 'Save changes' : 'Add class'}</RdButton>
        </>}>
        <div className="space-y-3.5">
          <RdField label="Class name">
            <input type="text" value={templateForm.name} placeholder="e.g. Morning HIIT" onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })} className={RD_INPUT} style={RD_INPUT_STYLE} />
          </RdField>
          <RdField label="Coach">
            <RdSelect label="Coach" value={templateForm.trainerId} onChange={(v) => setTemplateForm({ ...templateForm, trainerId: v })} className="w-full">
              <option value="">Unassigned</option>
              {trainers.map((t) => <option key={t.profile.id} value={t.profile.id}>{t.profile.first_name} {t.profile.last_name}</option>)}
            </RdSelect>
          </RdField>
          <div>
            <span className="block text-[13px] font-medium mb-1.5" style={{ color: SECOND }}>Repeats every</span>
            <div className="flex gap-1.5 flex-wrap" role="group" aria-label="Repeats every">
              {DAY_NAMES.map((d, i) => (
                <button key={d} type="button" onClick={() => setTemplateForm({ ...templateForm, dayOfWeek: String(i) })} aria-pressed={templateForm.dayOfWeek === String(i)}
                  className="h-10 px-3 rounded-xl text-[13.5px] font-semibold"
                  style={templateForm.dayOfWeek === String(i) ? { background: 'rgba(124,58,237,0.22)', color: '#EDE9FE', border: '1px solid rgba(139,92,246,0.7)' }
                    : { color: SECOND, border: '1px solid rgba(255,255,255,0.1)' }}>{d.slice(0, 3)}</button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <RdField label="Start time"><TimePicker value={templateForm.startTime} onChange={(v) => setTemplateForm({ ...templateForm, startTime: v })} /></RdField>
            <RdField label="Minutes">
              <input type="number" min="15" step="15" value={templateForm.duration} onChange={(e) => setTemplateForm({ ...templateForm, duration: e.target.value })} className={RD_INPUT} style={RD_INPUT_STYLE} />
            </RdField>
            <RdField label="Capacity">
              <input type="number" min="1" value={templateForm.capacity} onChange={(e) => setTemplateForm({ ...templateForm, capacity: e.target.value })} className={RD_INPUT} style={RD_INPUT_STYLE} />
            </RdField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <RdField label="Level" hint="Members see a “For you” badge on a match">
              <RdSelect label="Level" value={templateForm.level} onChange={(v) => setTemplateForm({ ...templateForm, level: v as ClassLevel })} className="w-full">
                {LEVELS.map((l) => <option key={l} value={l}>{l === 'all_levels' ? 'All levels' : l[0].toUpperCase() + l.slice(1)}</option>)}
              </RdSelect>
            </RdField>
            <RdField label="Room">
              <input type="text" value={templateForm.location} placeholder="e.g. Studio A" onChange={(e) => setTemplateForm({ ...templateForm, location: e.target.value })} className={RD_INPUT} style={RD_INPUT_STYLE} />
            </RdField>
          </div>
        </div>
      </Modal>
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
 * were free. The hour grid that replaced it drew a one-hour class as a 30px
 * sliver. So the week is split into three bands everyone already thinks in —
 * morning, afternoon, evening — and every class is a card big enough to read at
 * a glance. "Is Wednesday evening free?" is one cell, and it says **Free**.
 * Bands get room in proportion to how busy they are. Clashes stay loud: an amber
 * card with a "Clash" chip. Retired classes stay visible, dimmed.
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
  const tone = !t.active ? TONE.gray : clashing ? TONE.amber : TONE.violet;
  const meta = [
    t.level !== 'all_levels' ? t.level[0].toUpperCase() + t.level.slice(1) : null,
    `${t.duration_minutes} min`,
    `${t.capacity} spots`,
    t.location,
  ].filter(Boolean).join(' — ');
  return (
    // A div, not a <button>: a button centres its content, and this card is
    // left-aligned text with a button of its own inside it.
    <div role="button" tabIndex={0} onClick={onEdit}
      onKeyDown={(e) => { if (e.key === 'Enter') onEdit(); }}
      data-tip={`Edit ${t.name} — ${trainer} — ${meta}`}
      className="rounded-xl px-2.5 py-2 cursor-pointer transition-all hover:brightness-125"
      style={{ background: tone.bg, borderLeft: `3px solid ${tone.dot}`, opacity: t.active ? 1 : 0.6 }}>
      <div className="flex items-start justify-between gap-1">
        {/* The flags ride on the time line, which never truncates. */}
        <p className="text-[12px] font-bold tabular-nums leading-tight flex items-center gap-1.5 flex-wrap" style={{ color: tone.fg }}>
          {timeRange(t.start_time, t.duration_minutes)}
          {clashing && <span className="text-[10.5px] font-semibold px-1.5 rounded leading-4" style={{ background: '#F59E0B', color: '#1A1205' }}>Clash</span>}
          {!t.active && <span className="text-[10.5px] font-semibold px-1.5 rounded leading-4" style={{ background: 'rgba(255,255,255,0.12)', color: SECOND }}>Retired</span>}
        </p>
        <button type="button" onClick={(e) => { e.stopPropagation(); onRetire(); }}
          data-tip={t.active ? 'Retire this class' : 'Put this class back on the timetable'}
          aria-label={t.active ? `Retire ${t.name}` : `Restore ${t.name}`}
          className="w-6 h-6 -mt-0.5 -mr-0.5 rounded-md grid place-items-center flex-shrink-0 hover:bg-white/10" style={{ color: MUTED }}>
          {t.active ? <Trash2 size={12} /> : <RotateCcw size={12} />}
        </button>
      </div>
      <p className="text-[13.5px] font-semibold text-white leading-snug truncate mt-0.5">{t.name}</p>
      <p className="text-[12px] truncate leading-snug" style={{ color: SECOND }}>
        {trainer}<span style={{ color: MUTED }}> — {t.capacity} spots</span>
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
  // Read once, in an initialiser: a clock read during render is impure.
  const [today] = useState(() => new Date().getDay());

  const cell = (dow: number, band: (typeof BANDS)[number]) => templates
    .filter((t) => {
      const m = minutesOfDay(t.start_time);
      return t.day_of_week === dow && m >= band.from && m < band.to;
    })
    .sort((a, b) => a.start_time.localeCompare(b.start_time));

  // Each band's share of the height follows its busiest day; never below 0.6.
  const weights = BANDS.map((b) => Math.max(0.6, ...DAY_NAMES.map((_, dow) => cell(dow, b).length)));

  return (
    <RdCard className="flex flex-col min-h-0 overflow-hidden rd-fit-fill p-3" data-board>
      <div className="flex-1 min-h-0 overflow-auto" style={{ scrollbarWidth: 'thin' }}>
        <div className="grid gap-1.5 min-w-[1000px] min-h-full"
          style={{
            gridTemplateColumns: '96px repeat(7, minmax(0, 1fr))',
            gridTemplateRows: `auto ${weights.map((w) => `minmax(max-content, ${w}fr)`).join(' ')}`,
          }}>
          <div />
          {DAY_NAMES.map((day, dow) => {
            const n = templates.filter((t) => t.day_of_week === dow).length;
            const isToday = dow === today;
            return (
              <div key={day} className="text-center rounded-xl py-2"
                style={{ background: isToday ? TONE.violet.bg : 'transparent', border: `1px solid ${isToday ? TONE.violet.line : 'transparent'}` }}>
                <p className="text-[13px] font-semibold" style={{ color: isToday ? '#EDE9FE' : n > 0 ? 'var(--color-text-primary)' : MUTED }}>
                  {day.slice(0, 3)}{isToday && ' · today'}
                </p>
                <p className="text-[11.5px]" style={{ color: MUTED }}>{n === 0 ? 'no classes' : `${n} class${n === 1 ? '' : 'es'}`}</p>
              </div>
            );
          })}

          {BANDS.map((band) => (
            <Fragment key={band.id}>
              <div className="rounded-xl px-2.5 py-2 flex flex-col justify-center" style={{ background: 'rgba(255,255,255,0.03)' }}>
                <p className="text-[13px] font-semibold text-white">{band.label}</p>
                <p className="text-[11.5px]" style={{ color: MUTED }}>{band.range}</p>
              </div>
              {DAY_NAMES.map((day, dow) => {
                const items = cell(dow, band);
                return (
                  <div key={`${band.id}-${day}`} className="rounded-xl p-1.5 space-y-1.5"
                    style={{ background: dow === today ? 'rgba(124,58,237,0.06)' : 'rgba(255,255,255,0.012)', border: '1px solid rgba(255,255,255,0.05)' }}>
                    {items.length === 0 ? (
                      <div className="h-full min-h-[40px] flex items-center justify-center text-[12px]" style={{ color: MUTED, opacity: 0.6 }}>Free</div>
                    ) : items.map((t) => (
                      <ClassCard key={t.id} t={t} clashing={flagged.has(t.id)} trainer={trainerName(t.trainer_id)}
                        onEdit={() => onEdit(t)} onRetire={() => onRetire(t)} />
                    ))}
                  </div>
                );
              })}
            </Fragment>
          ))}
        </div>
      </div>
    </RdCard>
  );
}
