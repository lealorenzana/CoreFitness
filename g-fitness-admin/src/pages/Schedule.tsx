import {
  renderSchedulePng, scheduleToCsv, downloadBlob, type ScheduleSlot,
} from '../utils/exportSchedule';
import { useBranding } from '../hooks/useBranding';
import { supabase } from '../lib/supabaseClient';
import { useMemo, useState, useEffect, useCallback } from 'react';
import Modal from '../components/ui/Modal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import Popover from '../components/ui/Popover';
import TimePicker from '../components/ui/TimePicker';
import DatePicker from '../components/ui/DatePicker';
import { RdSelect, RdButton, RdField } from '../components/ui/rd';
import { RD_INPUT, RD_INPUT_STYLE } from '../components/ui/rdTokens';
import {
  Plus, Trash2, RefreshCw, RotateCcw, AlertTriangle, CalendarDays, Clock, Users, Search, ChevronLeft, ChevronRight,
  Download, Image as ImageIcon, FileDown, Pencil, UserPlus, MessageSquare, Repeat, CalendarRange, X, Info, ClockAlert,
} from 'lucide-react';
import { showToast } from '../utils/toast';
import { todayKey, addDays, localDateKey } from '../utils/dates';
import {
  listClassTemplates, createClassTemplate, deactivateClassTemplate, updateClassTemplate,
  generateClassInstances, DAY_NAMES, type ClassTemplateRow,
} from '../lib/api/classTemplates';
import {
  listAllAvailability, addAvailability, deleteAvailability, type TrainerAvailabilityRow,
} from '../lib/api/trainerAvailability';
import { listTrainers, type TrainerWithProfile } from '../lib/api/trainers';
import { listMembers } from '../lib/api/members';
import { listPtSessions, type PtSessionRow } from '../lib/api/ptSessions';
import { deskBookClass, listClassRoster } from '../lib/api/bookings';
import { notifyUser } from '../lib/api/notify';
import { getGymSettings } from '../lib/api/settings';
import {
  findConflicts, findOutOfHours, conflictedIds, hoursOverlap, loadSessionsBetween,
  type Conflict, type CalendarSession,
} from '../services/scheduleService';
import type { ClassLevel } from '../types/db';
import { Av } from './attendance/parts';
import './attendance/att.css';

/**
 * Schedule — rebuilt to the owner's approved mock-up (2026-10-20,
 * outputs/dashboard-mockups/schedule-v1.html), in the attendance stylesheet.
 *
 * Two things live here, and they stay apart: `class_templates` is the weekly
 * plan ("Yoga, Tuesdays 06:00"), and `classes` rows are the dated sessions
 * members book, made from the plan by generate_class_instances (0015) on load —
 * idempotent, so visiting keeps four weeks populated without a cron.
 *
 * Calendar: a real week by the clock, any week past or future, with a search,
 * a coach and a room filter; click a class for who booked it, to book a member
 * in (0204, desk_book_class) or message them; click an empty hour to add a
 * class there. Day: one day's classes and 1-on-1s with a month to pick from.
 * Weekly timetable: the plan itself, to edit or retire. Coach hours: each
 * coach's bookable 1-on-1 windows. Clashes are derived, never stored.
 */

const LEVELS: ClassLevel[] = ['all_levels', 'beginner', 'intermediate', 'advanced'];
const WEEKS_AHEAD = 4;
const HOUR_PX = 44;

const emptyTemplate = {
  name: '', trainerId: '', level: 'all_levels' as ClassLevel, capacity: '20',
  location: '', dayOfWeek: '1', startTime: '06:00', duration: '60',
};
const emptyHours = { trainerId: '', dayOfWeek: '1', start: '09:00', end: '17:00', slot: '60' };

const hhmm = (t: string) => t.slice(0, 5);
/** 'HH:MM(:SS)' → '6:00 AM'. Wall-clock; never routed through a Date. */
function clock(t: string): string {
  const [h, m] = t.split(':').map(Number);
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m ?? 0).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}
const shortClock = (t: string) => clock(t).replace(':00 ', ' ').replace(' AM', 'a').replace(' PM', 'p');
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
const minutesOf = (iso: string) => { const d = new Date(iso); return d.getHours() * 60 + d.getMinutes(); };
/** The Sunday a local date's week starts on. */
const weekStartOf = (key: string) => { const [y, m, d] = key.split('-').map(Number); return addDays(key, -new Date(y, m - 1, d).getDay()); };
const dowOf = (key: string) => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d).getDay(); };
const fmtDay = (key: string, opts: Intl.DateTimeFormatOptions) => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('en-PH', opts); };

type View = 'week' | 'day' | 'plan' | 'hours';

/** Side-by-side lanes for classes that overlap on one day. */
function lanes(items: CalendarSession[]): Map<string, { lane: number; of: number }> {
  const out = new Map<string, { lane: number; of: number }>();
  const sorted = [...items].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  let group: CalendarSession[] = []; let groupEnd = -1;
  const flush = () => {
    const ends: number[] = [];
    const assigned = group.map((s) => {
      const st = minutesOf(s.startsAt);
      let lane = ends.findIndex((e) => e <= st);
      if (lane === -1) { lane = ends.length; ends.push(0); }
      ends[lane] = st + s.durationMinutes;
      return { s, lane };
    });
    for (const a of assigned) out.set(a.s.id, { lane: a.lane, of: ends.length });
    group = []; groupEnd = -1;
  };
  for (const s of sorted) {
    const st = minutesOf(s.startsAt);
    if (group.length && st >= groupEnd) flush();
    group.push(s); groupEnd = Math.max(groupEnd, st + s.durationMinutes);
  }
  if (group.length) flush();
  return out;
}

export default function Schedule() {
  const branding = useBranding();
  const [view, setView] = useState<View>('week');
  const [templates, setTemplates] = useState<ClassTemplateRow[]>([]);
  const [availability, setAvailability] = useState<TrainerAvailabilityRow[]>([]);
  const [trainers, setTrainers] = useState<TrainerWithProfile[]>([]);
  const [members, setMembers] = useState<{ id: string; name: string; photo: string | null }[]>([]);
  const [hours, setHours] = useState<{ open: string | null; close: string | null }>({ open: null, close: null });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [today] = useState(() => todayKey());
  const [nowMin] = useState(() => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); });
  const [weekStart, setWeekStart] = useState(() => weekStartOf(todayKey()));
  const [day, setDay] = useState(() => todayKey());
  const [sessions, setSessions] = useState<CalendarSession[]>([]);
  const [daySessions, setDaySessions] = useState<CalendarSession[]>([]);
  const [pts, setPts] = useState<PtSessionRow[]>([]);
  const [monthHas, setMonthHas] = useState<Set<string>>(new Set());
  const [waiting, setWaiting] = useState<Map<string, number>>(new Map());
  const [q, setQ] = useState('');
  const [coach, setCoach] = useState('all');
  const [room, setRoom] = useState('all');
  const [selId, setSelId] = useState<string | null>(null);
  const [roster, setRoster] = useState<{ id: string; member_id: string; status: string }[] | null>(null);
  const [bookQ, setBookQ] = useState('');
  const [booking, setBooking] = useState(false);
  const [msgOpen, setMsgOpen] = useState(false);
  const [msg, setMsg] = useState('');
  const [exportAnchor, setExportAnchor] = useState<HTMLElement | null>(null);
  const [pickAnchor, setPickAnchor] = useState<HTMLElement | null>(null);
  const [pickDate, setPickDate] = useState('');

  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ClassTemplateRow | null>(null);
  const [templateForm, setTemplateForm] = useState(emptyTemplate);
  const [hoursForm, setHoursForm] = useState(emptyHours);
  const [toRetire, setToRetire] = useState<ClassTemplateRow | null>(null);
  const [toDeleteHours, setToDeleteHours] = useState<TrainerAvailabilityRow | null>(null);

  const conflicts = useMemo(() => [...findConflicts(templates), ...findOutOfHours(templates, hours.open, hours.close)], [templates, hours]);
  const flagged = useMemo(() => conflictedIds(conflicts), [conflicts]);
  const trainerName = useCallback((id: string | null) => {
    if (!id) return 'No coach';
    const t = trainers.find((x) => x.profile.id === id);
    return t ? `${t.profile.first_name} ${t.profile.last_name}` : 'A coach';
  }, [trainers]);
  const colourOf = useCallback((id: string | null) => {
    const i = trainers.findIndex((t) => t.profile.id === id);
    return i < 0 ? 0 : i % 6;
  }, [trainers]);
  const memberName = useCallback((id: string) => members.find((m) => m.id === id)?.name ?? 'A member', [members]);

  const load = useCallback(async (announce = false) => {
    setLoading(true);
    try {
      const [tpl, avail, trainerRows, gym, ms] = await Promise.all([
        listClassTemplates(), listAllAvailability().catch(() => []), listTrainers().catch(() => []),
        getGymSettings().catch(() => null), listMembers().catch(() => []),
      ]);
      setTemplates(tpl);
      setAvailability(avail);
      setTrainers(trainerRows);
      setMembers(ms.filter((m) => m.profile.status === 'active').map((m) => ({ id: m.profile.id, name: `${m.profile.first_name} ${m.profile.last_name}`, photo: m.profile.photo_url ?? null })));
      setHours({ open: gym?.opening_time ?? null, close: gym?.closing_time ?? null });
      const created = await generateClassInstances(WEEKS_AHEAD).catch(() => 0);
      if (announce) showToast(created > 0 ? `${created} new session${created === 1 ? '' : 's'} made from the timetable` : 'Sessions are already up to date', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to load schedule', 'error');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  // The week on screen, the day, and that day's month — read when they change.
  const [tick, setTick] = useState(0);
  const reloadDated = () => setTick((t) => t + 1);
  useEffect(() => {
    if (loading) return;
    void (async () => {
      const monthFirst = `${day.slice(0, 7)}-01`;
      const [wk, dy, pt, wl, mo] = await Promise.all([
        loadSessionsBetween(weekStart, addDays(weekStart, 6)).catch(() => []),
        loadSessionsBetween(day, day).catch(() => []),
        listPtSessions().catch(() => []),
        supabase.from('class_waitlist').select('class_id'),
        loadSessionsBetween(monthFirst, addDays(monthFirst, 41)).catch(() => []),
      ]);
      setSessions(wk);
      setDaySessions(dy);
      setPts(pt.filter((p) => localDateKey(p.starts_at) === day && p.status !== 'cancelled'));
      const w = new Map<string, number>();
      for (const r of (wl.data ?? []) as { class_id: string }[]) w.set(r.class_id, (w.get(r.class_id) ?? 0) + 1);
      setWaiting(w);
      setMonthHas(new Set(mo.map((s) => localDateKey(s.startsAt))));
    })();
  }, [loading, weekStart, day, tick]);

  const selected = sessions.find((s) => s.id === selId) ?? daySessions.find((s) => s.id === selId) ?? null;
  useEffect(() => {
    if (!selId) return;
    void (async () => { setRoster(await listClassRoster(selId).catch(() => null)); })();
  }, [selId, tick]);

  const rooms = useMemo(() => [...new Set([...templates.map((t) => t.location), ...sessions.map((s) => s.location)].filter(Boolean) as string[])].sort(), [templates, sessions]);
  const term = q.trim().toLowerCase();
  const passes = (s: CalendarSession) => (coach === 'all' || (coach === 'none' ? !s.trainerId : s.trainerId === coach))
    && (room === 'all' || s.location === room)
    && (!term || `${s.name} ${trainerName(s.trainerId)} ${s.location ?? ''}`.toLowerCase().includes(term));
  const shownWeek = sessions.filter(passes);
  const isClash = (s: CalendarSession) => !!s.templateId && flagged.has(s.templateId);

  // The hours the week shows: the gym's day, widened to fit any class outside it.
  const [fromH, toH] = useMemo(() => {
    let a = hours.open ? Number(hours.open.slice(0, 2)) : 6;
    let b = hours.close ? Math.ceil(Number(hours.close.slice(0, 2)) + Number(hours.close.slice(3, 5)) / 60) : 21;
    for (const s of sessions) { const st = minutesOf(s.startsAt); a = Math.min(a, Math.floor(st / 60)); b = Math.max(b, Math.ceil((st + s.durationMinutes) / 60)); }
    return [Math.max(0, Math.min(a, 23)), Math.min(24, Math.max(b, a + 1))];
  }, [hours, sessions]);

  const openAdd = (dow?: number, start?: string) => {
    setEditingTemplate(null);
    setTemplateForm({ ...emptyTemplate, ...(dow != null ? { dayOfWeek: String(dow) } : {}), ...(start ? { startTime: start } : {}) });
    setShowTemplateModal(true);
  };
  const openEdit = (t: ClassTemplateRow) => {
    setEditingTemplate(t);
    setTemplateForm({
      name: t.name, trainerId: t.trainer_id ?? '', level: t.level, capacity: String(t.capacity), location: t.location ?? '',
      dayOfWeek: String(t.day_of_week), startTime: t.start_time.slice(0, 5), duration: String(t.duration_minutes),
    });
    setShowTemplateModal(true);
  };
  const handleSaveTemplate = async () => {
    if (!templateForm.name.trim()) return showToast('Class name is required', 'error');
    setSaving(true);
    try {
      const payload = {
        name: templateForm.name.trim(), trainer_id: templateForm.trainerId || null, level: templateForm.level,
        capacity: Number(templateForm.capacity) || 20, location: templateForm.location.trim() || null,
        day_of_week: Number(templateForm.dayOfWeek), start_time: `${templateForm.startTime}:00`, duration_minutes: Number(templateForm.duration) || 60,
      };
      if (editingTemplate) {
        await updateClassTemplate(editingTemplate.id, payload);
        showToast('Class updated. Sessions already scheduled keep their old time.', 'success');
      } else {
        await createClassTemplate(payload);
        showToast('Class added — its sessions are made for the next four weeks', 'success');
      }
      setShowTemplateModal(false);
      setEditingTemplate(null);
      await load();
      reloadDated();
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
      if (t.active) await deactivateClassTemplate(t.id); else await updateClassTemplate(t.id, { active: true });
      showToast(`${t.name} ${t.active ? 'retired' : 'back on the timetable'}`, 'success');
      setToRetire(null);
      await load();
      reloadDated();
    } catch (err) { showToast(err instanceof Error ? err.message : 'Failed to update class', 'error'); }
  };
  const handleAddHours = async () => {
    if (!hoursForm.trainerId) return showToast('Pick a coach', 'error');
    if (hoursForm.end <= hoursForm.start) return showToast('End time must be after start time', 'error');
    const clash = hoursOverlap(availability, hoursForm.trainerId, Number(hoursForm.dayOfWeek), hoursForm.start, hoursForm.end);
    if (clash) return showToast(`That overlaps hours already set for ${DAY_NAMES[clash.day_of_week]} ${hhmm(clash.start_time)}–${hhmm(clash.end_time)}`, 'error');
    setSaving(true);
    try {
      await addAvailability({ trainer_id: hoursForm.trainerId, day_of_week: Number(hoursForm.dayOfWeek), start_time: `${hoursForm.start}:00`, end_time: `${hoursForm.end}:00`, slot_minutes: Number(hoursForm.slot) || 60 });
      showToast('Hours added', 'success');
      setHoursForm({ ...emptyHours, trainerId: hoursForm.trainerId });
      await load();
    } catch (err) { showToast(err instanceof Error ? err.message : 'Failed to add hours', 'error'); }
    finally { setSaving(false); }
  };
  const handleDeleteHours = async () => {
    if (!toDeleteHours) return;
    try { await deleteAvailability(toDeleteHours.id); showToast('Hours removed', 'success'); setToDeleteHours(null); await load(); }
    catch (err) { showToast(err instanceof Error ? err.message : 'Failed to remove hours', 'error'); }
  };

  const exportable = (): ScheduleSlot[] => templates.filter((t) => t.active).map((t) => ({
    id: t.id, name: t.name, dayOfWeek: t.day_of_week, startTime: t.start_time, durationMinutes: t.duration_minutes,
    trainerName: t.trainer_id ? trainerName(t.trainer_id) : null, location: t.location, capacity: t.capacity,
  }));
  const handleExportPng = async () => {
    setExportAnchor(null);
    const slots = exportable();
    if (slots.length === 0) return showToast('There are no active classes to export.', 'error');
    try {
      const blob = await renderSchedulePng(slots, { gymName: branding.name });
      if (!blob) return showToast('Could not draw the timetable image.', 'error');
      downloadBlob(blob, `timetable-${todayKey()}.png`);
      showToast('Timetable image downloaded.', 'success');
    } catch (err) { showToast(err instanceof Error ? err.message : 'Export failed', 'error'); }
  };
  const handleExportCsv = () => {
    setExportAnchor(null);
    const slots = exportable();
    if (slots.length === 0) return showToast('There are no active classes to export.', 'error');
    downloadBlob(new Blob(['﻿' + scheduleToCsv(slots)], { type: 'text/csv;charset=utf-8' }), `timetable-${todayKey()}.csv`);
    showToast('Timetable spreadsheet downloaded.', 'success');
  };

  const bookMember = async (memberId: string) => {
    if (!selected) return;
    setBooking(true);
    try {
      await deskBookClass(memberId, selected.id);
      showToast(`${memberName(memberId)} is booked into ${selected.name} — they have been told`, 'success');
      setBookQ('');
      reloadDated();
    } catch (err) { showToast(err instanceof Error ? err.message : 'Could not book them', 'error'); }
    finally { setBooking(false); }
  };
  const sendMessage = async () => {
    if (!selected || !roster || !msg.trim()) return;
    const to = roster.filter((r) => r.status === 'approved');
    let sent = 0;
    for (const r of to) {
      try {
        await notifyUser({ userId: r.member_id, type: 'booking', title: `${selected.name} · ${fmtDay(localDateKey(selected.startsAt), { weekday: 'short', month: 'short', day: 'numeric' })}`, message: msg.trim(), actionUrl: '/member/bookings' });
        sent += 1;
      } catch { /* counted below */ }
    }
    showToast(`Sent to ${sent} of ${to.length} booked`, sent === to.length ? 'success' : 'error');
    setMsgOpen(false); setMsg('');
  };

  const activeCount = templates.filter((t) => t.active).length;
  const noHours = trainers.filter((t) => t.profile.status === 'active' && !availability.some((a) => a.trainer_id === t.profile.id));
  const weekSeats = shownWeek.reduce((a, s) => a + s.booked, 0);
  const fullWeek = sessions.filter((s) => s.capacity > 0 && s.booked >= s.capacity && (waiting.get(s.id) ?? 0) > 0);
  const tpl = selected?.templateId ? templates.find((t) => t.id === selected.templateId) ?? null : null;
  const bookHits = bookQ.trim().length >= 1 ? members.filter((m) => m.name.toLowerCase().includes(bookQ.trim().toLowerCase()) && !roster?.some((r) => r.member_id === m.id)).slice(0, 5) : [];
  const weekEnd = addDays(weekStart, 6);
  const weekLabel = weekStart.slice(5, 7) === weekEnd.slice(5, 7)
    ? `${fmtDay(weekStart, { month: 'short', day: 'numeric' })} – ${Number(weekEnd.slice(8))}, ${weekEnd.slice(0, 4)}`
    : `${fmtDay(weekStart, { month: 'short', day: 'numeric' })} – ${fmtDay(weekEnd, { month: 'short', day: 'numeric' })}, ${weekEnd.slice(0, 4)}`;
  const step = (dir: number) => { if (view === 'day') setDay(addDays(day, dir)); else setWeekStart(addDays(weekStart, dir * 7)); setSelId(null); };

  return (
    <div className="att" data-schedule>
      <div className="a-head">
        <div className="min-w-0">
          <h1>Schedule</h1>
          <p>Classes members book · 1-on-1 hours{activeCount ? <> · bookable through <b className="text-white">{fmtDay(addDays(today, WEEKS_AHEAD * 7), { month: 'short', day: 'numeric' })}</b></> : ' · no classes on the timetable yet'}</p>
        </div>
        <nav className="a-tabs" aria-label="Schedule views" data-rd-tabs>
          <button type="button" className={view === 'week' || view === 'day' ? 'on' : ''} onClick={() => setView('week')}><CalendarDays size={14} />Calendar</button>
          <button type="button" className={view === 'plan' ? 'on' : ''} onClick={() => setView('plan')} data-view="plan"><Repeat size={14} />Weekly timetable <em>{activeCount}</em></button>
          <button type="button" className={view === 'hours' ? 'on' : ''} onClick={() => setView('hours')} data-view="hours"><Clock size={14} />Coach hours</button>
        </nav>
        <button type="button" className="a-btn" onClick={(e) => setExportAnchor(e.currentTarget)}><Download size={15} />Export</button>
        <button type="button" className="a-btn ghost" onClick={() => void load(true)} disabled={loading} data-tip="Make any missing sessions from the timetable" aria-label="Refresh"><RefreshCw size={15} /></button>
        <button type="button" className="a-btn violet" onClick={() => openAdd()}><Plus size={15} />Add class</button>
      </div>
      <Popover anchor={exportAnchor} open={!!exportAnchor} onClose={() => setExportAnchor(null)} width={240}>
        <div className="p-2 flex flex-col gap-1">
          <RdButton variant="ghost" icon={ImageIcon} onClick={() => void handleExportPng()}>Timetable as a picture</RdButton>
          <RdButton variant="ghost" icon={FileDown} onClick={handleExportCsv}>Timetable as a spreadsheet</RdButton>
        </div>
      </Popover>

      {(view === 'week' || view === 'day') && (
        <div className="flex items-center gap-2 flex-none flex-wrap">
          <div className="a-datenav">
            <button type="button" className="a-btn" style={{ padding: '7px 9px' }} onClick={() => step(-1)} aria-label={view === 'day' ? 'Previous day' : 'Previous week'}><ChevronLeft size={15} /></button>
            <b data-date-label>{view === 'day' ? fmtDay(day, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : weekLabel}</b>
            <button type="button" className="a-btn" style={{ padding: '7px 9px' }} onClick={() => step(1)} aria-label={view === 'day' ? 'Next day' : 'Next week'}><ChevronRight size={15} /></button>
          </div>
          <button type="button" className="a-btn sm" style={{ padding: '7px 11px' }} onClick={() => { setDay(today); setWeekStart(weekStartOf(today)); }}>Today</button>
          <button type="button" className="a-btn" style={{ padding: '7px 11px' }} onClick={(e) => { setPickDate(view === 'day' ? day : weekStart); setPickAnchor(e.currentTarget); }}><CalendarRange size={15} />Pick a date</button>
          <label className="a-input sm" style={{ width: 230, marginLeft: 6 }}><Search size={14} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Class, coach or room…" aria-label="Search the schedule" /></label>
          <select className={`a-chip ${coach !== 'all' ? 'on' : ''}`} value={coach} onChange={(e) => setCoach(e.target.value)} aria-label="Filter by coach" style={{ maxWidth: 170 }}>
            <option value="all">All coaches</option><option value="none">No coach</option>
            {trainers.map((t) => <option key={t.profile.id} value={t.profile.id}>{t.profile.first_name} {t.profile.last_name}</option>)}
          </select>
          {rooms.length > 0 && (
            <select className={`a-chip ${room !== 'all' ? 'on' : ''}`} value={room} onChange={(e) => setRoom(e.target.value)} aria-label="Filter by room" style={{ maxWidth: 150 }}>
              <option value="all">All rooms</option>{rooms.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          )}
          <div className="a-seg" style={{ marginLeft: 'auto' }} role="tablist">
            <button type="button" className={view === 'week' ? 'on' : ''} onClick={() => setView('week')}>Week</button>
            <button type="button" className={view === 'day' ? 'on' : ''} onClick={() => setView('day')} data-view="day">Day</button>
          </div>
        </div>
      )}
      <Popover anchor={pickAnchor} open={!!pickAnchor} onClose={() => setPickAnchor(null)} width={300}>
        <div className="p-3" data-pick-date>
          <DatePicker value={pickDate} mode="future" bounds={{ today: addDays(today, -365), aheadDays: 365 + 90 }}
            onChange={(v) => { if (!v) return; setDay(v); setWeekStart(weekStartOf(v)); setPickAnchor(null); setSelId(null); }} />
        </div>
      </Popover>

      {loading ? <p className="a-sub" style={{ padding: 20 }}>Loading the schedule…</p> : view === 'week' ? (
        <div className="a-grid" style={{ gridTemplateColumns: 'minmax(0,1fr) 320px', flex: 1 }}>
          <div className="a-card" style={{ padding: 12 }}>
            <div className="a-ct" style={{ marginBottom: 8 }}>
              <div className="a-legendc">
                {trainers.filter((t) => sessions.some((s) => s.trainerId === t.profile.id)).map((t) => (
                  <span key={t.profile.id}><i style={{ background: ['#a78bfa', '#5eead4', '#fbbf24', '#f0abfc', '#93c5fd', '#bef264'][colourOf(t.profile.id)] }} />{t.profile.first_name} {t.profile.last_name}</span>
                ))}
                {conflicts.length > 0 && <span><i style={{ boxShadow: 'inset 0 0 0 1.5px #f59e0b' }} />Clash</span>}
              </div>
              <small>{shownWeek.length} class{shownWeek.length === 1 ? '' : 'es'} · {weekSeats} seats booked{conflicts.length ? <> · <span style={{ color: 'var(--a-a300)' }}>{conflicts.length} clash{conflicts.length === 1 ? '' : 'es'}</span></> : ''}</small>
            </div>
            <div className="a-wk" data-week>
              <div className="dh" style={{ borderLeft: 0 }} />
              {Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)).map((k) => (
                <div key={k} className={`dh ${k === today ? 'today' : ''}`}>{fmtDay(k, { weekday: 'short' })}{k === today ? ' · today' : ''}<b>{Number(k.slice(8))}</b></div>
              ))}
              <div className="hrs" style={{ height: (toH - fromH) * HOUR_PX }}>
                {Array.from({ length: toH - fromH }, (_, i) => fromH + i).filter((h) => h > fromH && h % 2 === 0).map((h) => (
                  <span key={h} style={{ top: (h - fromH) * HOUR_PX }}>{h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`}</span>
                ))}
              </div>
              {Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)).map((k) => {
                const items = shownWeek.filter((s) => localDateKey(s.startsAt) === k);
                const lay = lanes(items);
                return (
                  <div key={k} className={`col ${k === today ? 'today' : ''}`} style={{ height: (toH - fromH) * HOUR_PX, cursor: 'copy' }}
                    onClick={(e) => {
                      const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
                      const h = Math.min(23, fromH + Math.floor(y / HOUR_PX));
                      openAdd(dowOf(k), `${String(h).padStart(2, '0')}:00`);
                    }} data-tip="Click an empty hour to add a class there">
                    {items.map((s) => {
                      const top = ((minutesOf(s.startsAt) - fromH * 60) / 60) * HOUR_PX;
                      const height = Math.max(24, (s.durationMinutes / 60) * HOUR_PX - 2);
                      const l = lay.get(s.id) ?? { lane: 0, of: 1 };
                      const full = s.capacity > 0 && s.booked >= s.capacity;
                      return (
                        <button key={s.id} type="button" data-event={s.id}
                          className={`a-ev c${colourOf(s.trainerId)} ${isClash(s) ? 'clash' : ''} ${selId === s.id ? 'sel' : ''}`}
                          style={{ top, height, left: `calc(${(l.lane / l.of) * 100}% + 3px)`, width: `calc(${100 / l.of}% - 6px)`, right: 'auto' }}
                          onClick={(e) => { e.stopPropagation(); setSelId(s.id); }}>
                          <b>{s.name}</b>
                          <small>{timeOf(s.startsAt)}{s.location ? ` · ${s.location}` : ''} · {full ? 'full' : `${s.booked}/${s.capacity}`}</small>
                          {height > 40 && s.capacity > 0 && <div className="fill"><i style={{ width: `${Math.min(100, (s.booked / s.capacity) * 100)}%` }} /></div>}
                        </button>
                      );
                    })}
                    {k === today && nowMin >= fromH * 60 && nowMin <= toH * 60 && <div className="a-now" style={{ top: ((nowMin - fromH * 60) / 60) * HOUR_PX }} />}
                  </div>
                );
              })}
            </div>
            <div className="a-sub" style={{ paddingTop: 8 }}>
              {shownWeek.length === 0 ? (sessions.length ? 'Nothing matches the search or filters this week.' : 'No classes this week — click an hour to add one, or set up the weekly timetable.') : 'Click a class to see who booked · click an empty hour to add a class there'}
            </div>
          </div>

          <div className="a-scroll" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {selected ? (
              <div className="a-card glow" data-class-panel style={{ flexShrink: 0 }}>
                <div className="a-ct"><h3 className="truncate"><CalendarDays size={16} />{selected.name}</h3>
                  <button type="button" className="a-link" onClick={() => setSelId(null)} aria-label="Close"><X size={15} /></button></div>
                <span className="a-pill v" style={{ alignSelf: 'flex-start', marginBottom: 6 }}>{fmtDay(localDateKey(selected.startsAt), { weekday: 'short', month: 'short', day: 'numeric' })} · {timeOf(selected.startsAt)}</span>
                <div className="a-kv"><span>Coach</span><b>{trainerName(selected.trainerId)}</b></div>
                <div className="a-kv"><span>Room</span><b>{selected.location ?? '—'}</b></div>
                <div className="a-kv"><span>Seats</span><b>{selected.booked} of {selected.capacity}{waiting.get(selected.id) ? ` · ${waiting.get(selected.id)} waiting` : ''}</b></div>
                <div className="a-kv"><span>Repeats</span><b>{tpl ? `Every ${DAY_NAMES[tpl.day_of_week]}` : 'One-off'}</b></div>
                <div className="a-lbl" style={{ margin: '10px 0 6px' }}>Booked {roster ? `· ${roster.length}` : ''}</div>
                {roster === null ? <p className="a-sub">Could not read who booked.</p> : roster.length === 0 ? <p className="a-sub">Nobody yet.</p> : (
                  <div className="flex flex-col" style={{ maxHeight: 132, overflowY: 'auto' }} data-roster>
                    {roster.map((r) => (
                      <div key={r.id} className="a-row" style={{ padding: '5px 0' }}><Av name={memberName(r.member_id)} small />
                        <div className="t"><b style={{ fontSize: 12.5 }}>{memberName(r.member_id)}</b></div>
                        {r.status === 'pending' && <span className="a-pill a">waiting</span>}</div>
                    ))}
                  </div>
                )}
                {new Date(selected.startsAt).getTime() > Date.parse(`${today}T00:00:00`) && (
                  <div className="relative" style={{ marginTop: 10 }}>
                    <label className="a-input sm" style={{ fontSize: 12.5 }}><UserPlus size={14} />
                      <input value={bookQ} onChange={(e) => setBookQ(e.target.value)} placeholder="Book a member — type a name…" aria-label="Book a member" disabled={booking} /></label>
                    {bookHits.length > 0 && (
                      <div className="a-card" style={{ position: 'absolute', zIndex: 5, left: 0, right: 0, top: 40, padding: '4px 10px' }}>
                        {bookHits.map((m) => (
                          <button key={m.id} type="button" className="a-row w-full text-left" onClick={() => void bookMember(m.id)} data-book-hit>
                            <Av name={m.name} photo={m.photo} small /><div className="t"><b>{m.name}</b></div><span className="a-pill v">Book</span></button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                <div className="flex gap-1.5 flex-wrap" style={{ marginTop: 10 }}>
                  {tpl && <button type="button" className="a-btn sm" onClick={() => openEdit(tpl)}><Pencil size={12} />Edit class</button>}
                  {roster && roster.some((r) => r.status === 'approved') && <button type="button" className="a-btn sm" onClick={() => setMsgOpen(true)} data-message-booked><MessageSquare size={12} />Message booked</button>}
                </div>
              </div>
            ) : (
              <div className="a-card" style={{ flexShrink: 0 }}>
                <div className="a-ct"><h3><Info size={16} />This week</h3></div>
                <div className="a-kv"><span>Classes</span><b>{sessions.length}</b></div>
                <div className="a-kv"><span>Seats booked</span><b>{sessions.reduce((a, s) => a + s.booked, 0)} of {sessions.reduce((a, s) => a + s.capacity, 0)}</b></div>
                <div className="a-kv"><span>Busiest</span><b className="truncate">{[...sessions].sort((a, b) => b.booked / Math.max(1, b.capacity) - a.booked / Math.max(1, a.capacity))[0]?.name ?? '—'}</b></div>
                <p className="a-sub" style={{ marginTop: 8 }}>Click a class on the calendar to see who booked, book someone in, or message them.</p>
              </div>
            )}
            <div className="a-card" style={{ flexShrink: 0 }} data-needs-look>
              <div className="a-ct"><h3><AlertTriangle size={16} style={{ color: 'var(--a-a300)' }} />Needs a look</h3></div>
              {conflicts.length === 0 && fullWeek.length === 0 && noHours.length === 0 && <p className="a-sub">Nothing — the week is clear.</p>}
              {conflicts.slice(0, 3).map((c: Conflict, i) => (
                <div key={`${c.a}-${c.b}-${i}`} className="a-row"><div className="a-ic a" style={{ width: 30, height: 30 }}><AlertTriangle size={14} /></div>
                  <div className="t"><b>{c.kind === 'hours' ? 'Outside opening hours' : 'Clash'}</b><small style={{ whiteSpace: 'normal' }}>{c.message}</small></div>
                  <button type="button" className="a-btn sm" onClick={() => { const t = templates.find((x) => x.id === c.a); if (t) openEdit(t); }}>Fix</button></div>
              ))}
              {fullWeek.slice(0, 2).map((s) => (
                <div key={s.id} className="a-row"><div className="a-ic" style={{ width: 30, height: 30 }}><Users size={14} /></div>
                  <div className="t"><b>{s.name} is full</b><small>{fmtDay(localDateKey(s.startsAt), { weekday: 'short' })} · {waiting.get(s.id)} on the waitlist</small></div>
                  <button type="button" className="a-btn sm" onClick={() => setSelId(s.id)}>Open</button></div>
              ))}
              {noHours.slice(0, 2).map((t) => (
                <div key={t.profile.id} className="a-row"><div className="a-ic" style={{ width: 30, height: 30 }}><ClockAlert size={14} /></div>
                  <div className="t"><b>{t.profile.first_name} has no 1-on-1 hours</b><small>members cannot book them</small></div>
                  <button type="button" className="a-btn sm" onClick={() => { setHoursForm({ ...emptyHours, trainerId: t.profile.id }); setView('hours'); }}>Set</button></div>
              ))}
            </div>
          </div>
        </div>
      ) : view === 'day' ? (
        <div className="a-grid" style={{ gridTemplateColumns: 'minmax(0,1fr) 320px', flex: 1 }}>
          <div className="a-card">
            <div className="a-ct"><h3><CalendarDays size={16} />{fmtDay(day, { weekday: 'long', month: 'long', day: 'numeric' })}</h3>
              <small>{daySessions.filter(passes).length} class{daySessions.filter(passes).length === 1 ? '' : 'es'} · {pts.length} coach session{pts.length === 1 ? '' : 's'}</small></div>
            <div className="a-scroll grow" style={{ flex: 1 }} data-day>
              <table className="a-table">
                <thead><tr><th>Time</th><th>Class or session</th><th>Coach · room</th><th>Seats</th><th /></tr></thead>
                <tbody>
                  {[...daySessions.filter(passes).map((s) => ({ at: s.startsAt, kind: 'class' as const, s })), ...pts.map((p) => ({ at: p.starts_at, kind: 'pt' as const, p }))]
                    .sort((a, b) => a.at.localeCompare(b.at)).map((r) => r.kind === 'class' ? (
                      <tr key={r.s.id} data-day-row>
                        <td><b>{timeOf(r.s.startsAt)}</b><div className="a-sub">{r.s.durationMinutes} min</div></td>
                        <td><b>{r.s.name}</b><div className="a-sub">Group class</div></td>
                        <td>{trainerName(r.s.trainerId)}<div className="a-sub">{r.s.location ?? '—'}</div></td>
                        <td><div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><div className="a-bar" style={{ maxWidth: 90 }}><i style={{ width: `${r.s.capacity ? Math.min(100, (r.s.booked / r.s.capacity) * 100) : 0}%` }} /></div><span className="a-sub">{r.s.booked}/{r.s.capacity}</span></div></td>
                        <td style={{ textAlign: 'right' }}><button type="button" className="a-btn sm" onClick={() => { setWeekStart(weekStartOf(day)); setSelId(r.s.id); setView('week'); }}>Open</button></td>
                      </tr>
                    ) : (
                      <tr key={r.p.id} data-day-row>
                        <td><b>{timeOf(r.p.starts_at)}</b><div className="a-sub">{r.p.duration_minutes} min</div></td>
                        <td><b>1-on-1 · {memberName(r.p.member_id)}</b><div className="a-sub">Personal training</div></td>
                        <td>{trainerName(r.p.trainer_id)}<div className="a-sub">—</div></td>
                        <td><span className={`a-pill ${r.p.status === 'approved' ? 'v' : r.p.status === 'pending' ? 'a' : ''}`}>{r.p.status === 'approved' ? 'Confirmed' : r.p.status === 'pending' ? 'Waiting' : 'Declined'}</span></td>
                        <td />
                      </tr>
                    ))}
                </tbody>
              </table>
              {daySessions.length === 0 && pts.length === 0 && <p className="a-sub text-center" style={{ padding: 26 }}>Nothing on this day.</p>}
            </div>
          </div>
          <div className="a-card">
            <div className="a-ct"><h3><CalendarDays size={16} />{fmtDay(`${day.slice(0, 7)}-01`, { month: 'long', year: 'numeric' })}</h3>
              <div className="flex gap-1"><button type="button" className="a-link" onClick={() => setDay(addDays(`${day.slice(0, 7)}-01`, -1))} aria-label="Previous month"><ChevronLeft size={15} /></button>
                <button type="button" className="a-link" onClick={() => setDay(addDays(`${day.slice(0, 7)}-01`, 32).slice(0, 7) + '-01')} aria-label="Next month"><ChevronRight size={15} /></button></div></div>
            <div className="a-minical" data-minical>
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <small key={i}>{d}</small>)}
              {Array.from({ length: dowOf(`${day.slice(0, 7)}-01`) }, (_, i) => <span key={`b${i}`} />)}
              {Array.from({ length: new Date(Number(day.slice(0, 4)), Number(day.slice(5, 7)), 0).getDate() }, (_, i) => `${day.slice(0, 7)}-${String(i + 1).padStart(2, '0')}`).map((k) => (
                <button key={k} type="button" className={`${k === day ? 'on' : monthHas.has(k) ? 'has' : ''}`} onClick={() => setDay(k)}>{Number(k.slice(8))}</button>
              ))}
            </div>
            <div className="a-hint" style={{ marginTop: 12 }}><Info size={15} />Pick any day to see its classes and 1-on-1s. Underlined days have classes.</div>
          </div>
        </div>
      ) : view === 'plan' ? (
        <div className="a-grid" style={{ gridTemplateColumns: 'minmax(0,1fr) 320px', flex: 1 }}>
          <div className="a-card" data-board>
            <div className="a-ct"><h3><Repeat size={16} />The weekly timetable</h3><small>each class repeats every week · sessions are made four weeks ahead</small></div>
            <div className="a-scroll grow" style={{ flex: 1 }}>
              <table className="a-table">
                <thead><tr><th>Day</th><th>Time</th><th>Class</th><th>Coach</th><th>Room</th><th>Seats</th><th /></tr></thead>
                <tbody>
                  {[...templates].sort((a, b) => Number(b.active) - Number(a.active) || a.day_of_week - b.day_of_week || a.start_time.localeCompare(b.start_time)).map((t) => (
                    <tr key={t.id} style={{ opacity: t.active ? 1 : 0.55 }} data-template-row>
                      <td><b>{DAY_NAMES[t.day_of_week]}</b></td>
                      <td className="whitespace-nowrap">{clock(t.start_time)}<div className="a-sub">{t.duration_minutes} min</div></td>
                      <td><b>{t.name}</b> {flagged.has(t.id) && <span className="a-pill a">Clash</span>} {!t.active && <span className="a-pill">Retired</span>}
                        <div className="a-sub">{t.level === 'all_levels' ? 'All levels' : t.level[0].toUpperCase() + t.level.slice(1)}</div></td>
                      <td>{trainerName(t.trainer_id)}</td>
                      <td>{t.location ?? '—'}</td>
                      <td>{t.capacity}</td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button type="button" className="a-btn ghost sm" onClick={() => openEdit(t)}><Pencil size={12} />Edit</button>{' '}
                        <button type="button" className="a-btn ghost sm" onClick={() => setToRetire(t)} aria-label={t.active ? `Retire ${t.name}` : `Restore ${t.name}`}>
                          {t.active ? <Trash2 size={12} /> : <RotateCcw size={12} />}{t.active ? 'Retire' : 'Restore'}</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {templates.length === 0 && <p className="a-sub text-center" style={{ padding: 26 }}>No classes on the timetable. Add one and its sessions are made automatically.</p>}
            </div>
          </div>
          <div className="a-card">
            <div className="a-ct"><h3><Info size={16} />How the timetable works</h3></div>
            <p className="a-sub" style={{ lineHeight: 1.55 }}>A class here repeats every week. From it, the dated sessions members book are made four weeks ahead. Editing a class changes the sessions made from now on — ones already booked keep their time. Retiring stops new sessions; booked ones stay.</p>
            {conflicts.length > 0 && <div className="a-hint" style={{ marginTop: 12, borderColor: '#5a4512' }}><AlertTriangle size={15} /><span>{conflicts.map((c) => c.message).join(' ')}</span></div>}
          </div>
        </div>
      ) : (
        <div className="a-grid" style={{ gridTemplateColumns: 'minmax(0,1fr) 340px', flex: 1 }} data-hours>
          <div className="a-card">
            <div className="a-ct"><h3><Clock size={16} />When members can book 1-on-1</h3><small>each coach's own hours · × removes a window</small></div>
            <div className="a-scroll grow" style={{ flex: 1 }}>
              <table className="a-table">
                <thead><tr><th>Coach</th>{[1, 2, 3, 4, 5, 6, 0].map((d) => <th key={d}>{DAY_NAMES[d].slice(0, 3)}</th>)}<th>Week</th></tr></thead>
                <tbody>
                  {trainers.filter((t) => t.profile.status === 'active').map((t) => {
                    const rows = availability.filter((a) => a.trainer_id === t.profile.id);
                    const total = rows.reduce((s, a) => s + (Number(a.end_time.slice(0, 2)) * 60 + Number(a.end_time.slice(3, 5)) - Number(a.start_time.slice(0, 2)) * 60 - Number(a.start_time.slice(3, 5))) / 60, 0);
                    return (
                      <tr key={t.profile.id} data-hours-row>
                        <td><div className="a-who"><Av name={`${t.profile.first_name} ${t.profile.last_name}`} photo={t.profile.photo_url} small /><b>{t.profile.first_name} {t.profile.last_name}</b></div></td>
                        {rows.length === 0 ? (
                          <td colSpan={7}><span className="a-pill a"><AlertTriangle size={12} />No hours — members cannot book them</span></td>
                        ) : [1, 2, 3, 4, 5, 6, 0].map((d) => (
                          <td key={d} style={{ cursor: 'pointer' }} onClick={() => setHoursForm({ ...emptyHours, trainerId: t.profile.id, dayOfWeek: String(d) })}>
                            <div className="flex flex-col gap-1">
                              {rows.filter((a) => a.day_of_week === d).map((a) => (
                                <span key={a.id} className="a-slot" style={{ display: 'inline-flex', gap: 4, alignItems: 'center', whiteSpace: 'nowrap' }}>
                                  {shortClock(a.start_time)}–{shortClock(a.end_time)}
                                  <button type="button" onClick={(e) => { e.stopPropagation(); setToDeleteHours(a); }} aria-label={`Remove ${DAY_NAMES[a.day_of_week]} ${clock(a.start_time)} hours`}><X size={11} /></button>
                                </span>
                              ))}
                              {!rows.some((a) => a.day_of_week === d) && <span className="a-sub">—</span>}
                            </div>
                          </td>
                        ))}
                        <td>{rows.length === 0 ? <button type="button" className="a-btn amber sm" onClick={() => setHoursForm({ ...emptyHours, trainerId: t.profile.id })}>Set hours</button> : <b>{Math.round(total * 10) / 10} h</b>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <div className="a-card glow" style={{ overflow: 'auto' }}>
            <div className="a-ct"><h3><Plus size={16} />Add hours</h3></div>
            <RdSelect label="Coach" value={hoursForm.trainerId} onChange={(v) => setHoursForm({ ...hoursForm, trainerId: v })} className="w-full">
              <option value="">Select a coach…</option>
              {trainers.filter((t) => t.profile.status === 'active').map((t) => <option key={t.profile.id} value={t.profile.id}>{t.profile.first_name} {t.profile.last_name}</option>)}
            </RdSelect>
            <div className="flex gap-1.5 flex-wrap" role="group" aria-label="Day of week" style={{ marginTop: 10 }}>
              {[1, 2, 3, 4, 5, 6, 0].map((i) => (
                <button key={i} type="button" onClick={() => setHoursForm({ ...hoursForm, dayOfWeek: String(i) })} aria-pressed={hoursForm.dayOfWeek === String(i)}
                  className={`a-chip ${hoursForm.dayOfWeek === String(i) ? 'v' : ''}`}>{DAY_NAMES[i].slice(0, 3)}</button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2.5" style={{ marginTop: 10 }}>
              <RdField label="From"><TimePicker value={hoursForm.start} onChange={(v) => setHoursForm({ ...hoursForm, start: v })} /></RdField>
              <RdField label="Until"><TimePicker value={hoursForm.end} onChange={(v) => setHoursForm({ ...hoursForm, end: v })} /></RdField>
            </div>
            <RdField label="Each booking is">
              <div className="flex gap-1.5" style={{ marginTop: 2 }}>
                {['30', '45', '60', '90'].map((m) => <button key={m} type="button" className={`a-chip ${hoursForm.slot === m ? 'on' : ''}`} onClick={() => setHoursForm({ ...hoursForm, slot: m })}>{m} min</button>)}
              </div>
            </RdField>
            <button type="button" className="a-btn violet" style={{ marginTop: 12 }} onClick={() => void handleAddHours()} disabled={saving}><Plus size={14} />{saving ? 'Adding…' : 'Add these hours'}</button>
            <div className="a-hint" style={{ marginTop: 12 }}><Info size={15} />Coaches usually set their own hours in the app; fix or add them here. A member booking 1-on-1 sees only times inside these hours that are not already taken.</div>
          </div>
        </div>
      )}

      <ConfirmDialog isOpen={!!toRetire} onClose={() => setToRetire(null)} onConfirm={handleRetire}
        title={toRetire?.active ? 'Retire class' : 'Put the class back'}
        message={toRetire?.active
          ? `Retire "${toRetire?.name}"? It stops making new sessions, but every session already scheduled from it stays — including anyone who has booked. Reversible at any time.`
          : `Put "${toRetire?.name}" back on the timetable? It starts making sessions again.`}
        confirmText={toRetire?.active ? 'Retire' : 'Put back'} type={toRetire?.active ? 'warning' : 'info'} />
      <ConfirmDialog isOpen={!!toDeleteHours} onClose={() => setToDeleteHours(null)} onConfirm={handleDeleteHours} title="Remove working hours"
        message={toDeleteHours ? `Remove ${trainerName(toDeleteHours.trainer_id)}'s ${DAY_NAMES[toDeleteHours.day_of_week]} ${clock(toDeleteHours.start_time)}–${clock(toDeleteHours.end_time)}? No new 1-on-1 slots will be offered then. Sessions already booked are not cancelled.` : ''}
        confirmText="Remove" type="danger" />

      <Modal isOpen={msgOpen} onClose={() => setMsgOpen(false)} size="md" title={`Message everyone booked into ${selected?.name ?? 'this class'}`}
        subtitle={selected ? `${roster?.filter((r) => r.status === 'approved').length ?? 0} confirmed · in the app` : undefined}
        footer={<><RdButton variant="ghost" onClick={() => setMsgOpen(false)}>Cancel</RdButton><RdButton variant="primary" onClick={() => void sendMessage()} disabled={!msg.trim()}>Send</RdButton></>}>
        <textarea className={RD_INPUT} style={{ ...RD_INPUT_STYLE, minHeight: 110 }} value={msg} onChange={(e) => setMsg(e.target.value)} maxLength={500}
          placeholder="e.g. Bring water — we're doing intervals today." aria-label="Message" />
      </Modal>

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
              <option value="">No coach</option>
              {trainers.map((t) => <option key={t.profile.id} value={t.profile.id}>{t.profile.first_name} {t.profile.last_name}</option>)}
            </RdSelect>
          </RdField>
          <div>
            <span className="block text-[13px] font-medium mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>Repeats every</span>
            <div className="flex gap-1.5 flex-wrap" role="group" aria-label="Repeats every">
              {DAY_NAMES.map((d, i) => (
                <button key={d} type="button" onClick={() => setTemplateForm({ ...templateForm, dayOfWeek: String(i) })} aria-pressed={templateForm.dayOfWeek === String(i)}
                  className="h-10 px-3 rounded-xl text-[13.5px] font-semibold"
                  style={templateForm.dayOfWeek === String(i) ? { background: 'rgba(124,58,237,0.22)', color: '#EDE9FE', border: '1px solid rgba(139,92,246,0.7)' }
                    : { color: 'var(--color-text-secondary)', border: '1px solid rgba(255,255,255,0.1)' }}>{d.slice(0, 3)}</button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <RdField label="Start time"><TimePicker value={templateForm.startTime} onChange={(v) => setTemplateForm({ ...templateForm, startTime: v })} /></RdField>
            <RdField label="Minutes"><input type="number" min="15" step="15" value={templateForm.duration} onChange={(e) => setTemplateForm({ ...templateForm, duration: e.target.value })} className={RD_INPUT} style={RD_INPUT_STYLE} /></RdField>
            <RdField label="Capacity"><input type="number" min="1" value={templateForm.capacity} onChange={(e) => setTemplateForm({ ...templateForm, capacity: e.target.value })} className={RD_INPUT} style={RD_INPUT_STYLE} /></RdField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <RdField label="Level" hint="Members see a “For you” badge on a match">
              <RdSelect label="Level" value={templateForm.level} onChange={(v) => setTemplateForm({ ...templateForm, level: v as ClassLevel })} className="w-full">
                {LEVELS.map((l) => <option key={l} value={l}>{l === 'all_levels' ? 'All levels' : l[0].toUpperCase() + l.slice(1)}</option>)}
              </RdSelect>
            </RdField>
            <RdField label="Room">
              <input type="text" list="schedule-rooms" value={templateForm.location} placeholder="e.g. Studio A" onChange={(e) => setTemplateForm({ ...templateForm, location: e.target.value })} className={RD_INPUT} style={RD_INPUT_STYLE} />
              <datalist id="schedule-rooms">{rooms.map((r) => <option key={r} value={r} />)}</datalist>
            </RdField>
          </div>
        </div>
      </Modal>
    </div>
  );
}

