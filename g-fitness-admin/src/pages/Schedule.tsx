import { motion, AnimatePresence } from 'framer-motion';
import { useMemo, useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import TimePicker from '../components/ui/TimePicker';
import {
  Plus, X, Trash2, Clock, MapPin, Users, RefreshCw, Dumbbell, Ban, Edit2,
  AlertTriangle, CalendarDays, Filter,
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

  const load = useCallback(async () => {
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
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to load schedule', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Schedule</h1>
          <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
            Weekly timetable and trainer working hours
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={load} disabled={loading}>
            <RefreshCw size={14} className="mr-1.5" /> Regenerate sessions
          </Button>
          {tab === 'timetable' && (
            <Button variant="primary" onClick={openAdd}>
              <Plus size={16} className="mr-1.5" /> Add Class
            </Button>
          )}
        </div>
      </div>

      {generated !== null && generated > 0 && (
        <div className="rounded-xl p-3" style={{ background: 'var(--color-primary-light)' }}>
          <p className="text-[11px]" style={{ color: 'var(--color-primary)' }}>
            {generated} session{generated === 1 ? '' : 's'} scheduled for the next {WEEKS_AHEAD} weeks.
          </p>
        </div>
      )}

      {/* Clashes, stated plainly. Nothing stopped one trainer being booked onto
          two classes at the same hour, or two classes sharing a room — and both
          go on to generate real sessions members can book. */}
      {conflicts.length > 0 && (
        <div className="rounded-xl p-3 space-y-1"
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

      <div className="flex items-center justify-between gap-3">
        <div className="flex gap-1.5">
          {([
            ['timetable', 'Class Timetable'],
            ['sessions', 'Upcoming Sessions'],
            ['hours', 'Trainer Hours'],
          ] as const).map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)}
              className="px-3 py-1.5 rounded-full text-[11px] font-semibold transition-colors"
              style={{
                background: tab === id ? 'var(--color-primary)' : 'var(--color-surface)',
                color: tab === id ? '#fff' : 'var(--color-text-muted)',
                border: `1px solid ${tab === id ? 'var(--color-primary)' : 'var(--color-border)'}`,
              }}>
              {label}
              {id === 'sessions' && sessions.length > 0 && (
                <span className="ml-1.5 opacity-70">{sessions.length}</span>
              )}
            </button>
          ))}
        </div>

        {tab !== 'hours' && (
          <div className="flex items-center gap-1.5">
            <Filter size={12} style={{ color: 'var(--color-text-muted)' }} />
            <select value={trainerFilter} onChange={(e) => setTrainerFilter(e.target.value)}
              aria-label="Filter by trainer"
              className="rounded-full px-3 h-8 text-[11px] text-white"
              style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
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
          <div className="rounded-xl p-10 text-center" style={panel}>
            <Dumbbell size={26} className="mx-auto mb-2 opacity-40" style={{ color: 'var(--color-text-muted)' }} />
            <p className="text-sm text-white mb-1">
              {templates.length === 0 ? 'No classes on the timetable' : 'No classes for that trainer'}
            </p>
            <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
              {templates.length === 0
                ? 'Add one and the sessions members book are generated automatically.'
                : 'Clear the filter to see the whole week.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {DAY_NAMES.map((day, dow) => {
              const items = visibleTemplates.filter((t) => t.day_of_week === dow);
              if (items.length === 0) return null;
              return (
                <div key={day}>
                  <p className="text-[10px] font-bold uppercase mb-1.5" style={{ color: 'var(--color-text-muted)' }}>{day}</p>
                  <div className="grid grid-cols-2 gap-2">
                    {items.map((t) => {
                      const clashing = flagged.has(t.id);
                      return (
                      <motion.div key={t.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                        className="rounded-xl p-3 flex items-start gap-3"
                        style={{
                          ...panel,
                          opacity: t.active ? 1 : 0.55,
                          borderColor: clashing ? 'var(--color-secondary)' : 'var(--color-border)',
                        }}>
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                          style={{ background: 'var(--color-primary-light)' }}>
                          <Dumbbell size={14} style={{ color: 'var(--color-primary)' }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-xs font-semibold text-white truncate">{t.name}</p>
                            {clashing && (
                              <span title="Clashes with another class" className="flex-shrink-0">
                                <AlertTriangle size={11} style={{ color: 'var(--color-secondary)' }} />
                              </span>
                            )}
                            {!t.active && (
                              <span className="text-[8px] px-1.5 py-0.5 rounded-full flex-shrink-0"
                                style={{ background: 'var(--color-border)', color: 'var(--color-text-muted)' }}>
                                retired
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                            {trainerName(t.trainer_id)} · {t.level.replace('_', ' ')}
                          </p>
                          <p className="text-[10px] flex items-center gap-2 mt-1" style={{ color: 'var(--color-text-muted)' }}>
                            <span className="flex items-center gap-1"><Clock size={9} /> {clock(t.start_time)} · {t.duration_minutes}m</span>
                            <span className="flex items-center gap-1"><Users size={9} /> {t.capacity}</span>
                          </p>
                          {t.location && (
                            <p className="text-[10px] flex items-center gap-1 mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                              <MapPin size={9} /> {t.location}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-col gap-1.5 flex-shrink-0">
                          <button onClick={() => openEdit(t)} title="Edit class"
                            style={{ color: 'var(--color-primary)' }}>
                            <Edit2 size={13} />
                          </button>
                          <button onClick={() => setToRetire(t)} title={t.active ? 'Retire' : 'Reactivate'}
                            style={{ color: 'var(--color-text-muted)' }}>
                            <Ban size={13} />
                          </button>
                        </div>
                      </motion.div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : tab === 'sessions' ? (
        /* The plan versus what it actually produced. The page used to show only
           the recurring templates, so "is Saturday's class full?" was a question
           the front desk could not answer from here at all. */
        visibleSessions.length === 0 ? (
          <div className="rounded-xl p-10 text-center" style={panel}>
            <CalendarDays size={26} className="mx-auto mb-2 opacity-40" style={{ color: 'var(--color-text-muted)' }} />
            <p className="text-sm text-white mb-1">No sessions in the next 14 days</p>
            <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
              Add an active class to the timetable, then hit Regenerate sessions.
            </p>
          </div>
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
                <div className="grid grid-cols-2 gap-2">
                  {items.map((s) => {
                    const full = s.booked >= s.capacity;
                    const pct = s.capacity > 0 ? Math.min(100, (s.booked / s.capacity) * 100) : 0;
                    return (
                      <div key={s.id} className="rounded-xl p-3" style={panel}>
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
                      </div>
                    );
                  })}
                </div>
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
                    <button onClick={() => setToDeleteHours(a)} title="Remove these hours"
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
