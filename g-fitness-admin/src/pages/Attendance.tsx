import PageGuide from '../components/guides/PageGuide';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import QRScanner from '../components/ui/QRScanner';
import DetailSheet from '../components/ui/DetailSheet';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { useFitRows } from '../hooks/useFitRows';
import {
  QrCode, Download, Tablet, Tag, Search, Check, MonitorPlay, UserCheck, Smartphone, Users, Banknote, Dumbbell, DoorOpen, RefreshCw, CalendarClock,
} from 'lucide-react';
import { showToast } from '../utils/toast';
import { recordReason, REASON_FIELD } from '../lib/api/reasons';
import { checkInCodeOf, formatCheckInCode, normaliseCheckInCode } from '../utils/checkInCode';
import { todayKey, localDateKey, addDays, daysBetween } from '../utils/dates';
import { exportToCSV } from '../utils/exportUtils';
import { supabase } from '../lib/supabaseClient';
import { listMembers, type MemberWithProfile } from '../lib/api/members';
import { listMemberships } from '../lib/api/memberships';
import { listAttendanceBetween, deleteCheckIn } from '../lib/api/attendance';
import { getGymSettings } from '../lib/api/settings';
import { getDoorSettings, listDoorCoaches, listTodayPicks, undoCoachCheckin, type DoorCoach, type DoorSettings } from '../lib/api/door';
import { performCheckIn, performCoachCheckIn, resolveCheckInCode } from '../services/checkInService';
import { membershipIsUsable } from '../lib/api/memberships';
import type { AttendanceRow } from '../types/db';
import { Av, HowPill, AttHead, Pager } from './attendance/parts';
import { CountUp, Skel, Spark, EmptyBlock } from '../components/ui/rd';
import { useAttCounts, peso, clock } from './attendance/attData';
import './attendance/att.css';
import OfflineScans from './attendance/OfflineScans';
import { isOffline, resolveOffline, saveScan } from '../lib/checkinOutbox';
import { getGymContext } from '../lib/gymContext';
import { loadToday, type Today } from '../services/todayService';

const ITEMS_PER_PAGE = 10;
type Who = { plan: string; status: string; expiry: string | null; usable: boolean };
type Way = 'all' | 'kiosk' | 'desk' | 'typed';
type Show = 'all' | 'in' | 'out';
const wayOf = (r: AttendanceRow): Exclude<Way, 'all'> => (r.source === 'kiosk' ? 'kiosk' : r.method === 'qr' ? 'desk' : 'typed');
const WAY_LABEL: Record<Way, string> = { all: 'Any way', kiosk: 'Kiosk', desk: 'Desk scan', typed: 'Typed' };
const fmtDay = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });

/** One check-in taken today: the list and the View all window draw the same row. */
function LogRow({ row: r, name, photo, plan, by, onUndo, height, fresh, leaving }: {
  row: AttendanceRow; name: string; photo?: string | null; plan?: string; by: string; onUndo: () => void; height?: number; fresh?: boolean; leaving?: boolean;
}) {
  return (
    <tr data-log-row data-in style={{ height }} data-fresh={fresh || undefined} data-leaving={leaving || undefined}>
      <td>
        <div className="a-who">
          <Av name={name} photo={photo} small />
          <span className="min-w-0"><b className="truncate block">{name}</b><small className="a-sub">{plan ?? 'No plan'}</small></span>
        </div>
      </td>
      <td><span className="a-pill v" data-in-at>In at {clock(r.check_in_time)}</span></td>
      <td><HowPill row={r} /></td>
      {/* The activity tag (0018), and whose it is (0200). Nobody picked one: "Not recorded", never a guess. */}
      <td>
        {r.activity ? (
          <span className="inline-flex items-center gap-2">
            {r.activity}
            {r.activity_by === 'member' && <span className="a-pill v" data-tag-by="member"><Smartphone size={12} />their pick</span>}
            {r.activity_by === 'desk' && <span className="a-pill a" data-tag-by="desk"><Tag size={12} />desk</span>}
          </span>
        ) : <span className="a-sub">Not recorded</span>}
      </td>
      <td className={by ? '' : 'a-sub'}>{by}</td>
      <td style={{ width: 120, textAlign: 'right' }}><button type="button" className="a-link" onClick={onUndo} data-tip="Undo this check-in">Undo</button></td>
    </tr>
  );
}

/**
 * Attendance → Check-ins, the desk (owner's mock-up D, 2026-11-27; design/admin-v2/attendance-d.html).
 *
 * The search box and the log are one list of every member: who is in today first (newest first), then
 * everyone not in yet, A to Z, each with Check in. Typing narrows it, and whoever can be checked in rises
 * to the top. A scanned or typed code checks in at once; Enter on a name only when exactly one person
 * matches. A member the rules refuse shows why instead of a button. Above it, the day's three figures in
 * one strip; on the right, only what is at the door: the kiosk, the lobby TV and the coaches.
 */
export default function Attendance() {
  const navigate = useNavigate();
  const counts = useAttCounts();
  const [members, setMembers] = useState<MemberWithProfile[]>([]);
  const [whoOf, setWhoOf] = useState<Record<string, Who>>({});
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [staff, setStaff] = useState<Record<string, string>>({});
  const [adminId, setAdminId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  /** When the rows were read: "last week, up to this time" is measured from it, not from each render. */
  const [readAt, setReadAt] = useState(0);
  const [door, setDoor] = useState<DoorSettings | null>(null);
  const [coaches, setCoaches] = useState<DoorCoach[]>([]);
  const [picks, setPicks] = useState<Map<string, string>>(new Map());
  const [walkIns, setWalkIns] = useState<{ amount: number; method: string; kind: string; voided: boolean }[] | null>(null);
  /** Today's classes and 1-on-1 sessions for the rail (the dashboard's own service). Null: it could not load. */
  const [day, setDay] = useState<Today | null>(null);
  const [hours, setHours] = useState<{ open: number; close: number; closing: string | null }>({ open: 6, close: 21, closing: null });

  const [query, setQuery] = useState('');
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [activity, setActivity] = useState('');
  const [activityOptions, setActivityOptions] = useState<string[]>([]);
  const [listPage, setListPage] = useState(1);
  const [toUndo, setToUndo] = useState<AttendanceRow | null>(null);
  const [coachesOpen, setCoachesOpen] = useState(false);
  /** The check-in just taken, with its own Undo: the desk sees it worked without reading the list. */
  const [last, setLast] = useState<{ kind: 'member' | 'coach'; id: string; name: string; at: string; activity: string | null; by: 'member' | 'desk' | null } | null>(null);
  const [show, setShow] = useState<Show>('all');
  const [way, setWay] = useState<Way>('all');
  /** The list's Plan filter (owner, 2026-11-27): it replaced the View all window, the one thing that window added. */
  const [logPlan, setLogPlan] = useState('all');
  /** Rows that fit the list's own box: the page never scrolls (2026-10-11). */
  const { ref: fitRef, perPage, rowHeight: fitRowHeight } = useFitRows(ITEMS_PER_PAGE);

  const loadData = async (): Promise<AttendanceRow[]> => {
    try {
      const [memberRows, attendanceRows, { data: { user } }] = await Promise.all([
        listMembers(),
        // Eight days: today, the week's members, and the same weekday last week.
        listAttendanceBetween(addDays(todayKey(), -7), todayKey()),
        supabase.auth.getUser(),
      ]);
      setMembers(memberRows);
      setRows(attendanceRows);
      setReadAt(Date.now());
      setAdminId(user?.id ?? null);
      // Everything below is optional: check-in never depends on it.
      const [ms, settings, d, pk, wv, dy] = await Promise.all([
        listMemberships().catch(() => []),
        getGymSettings().catch(() => null),
        getDoorSettings(),
        listTodayPicks(),
        supabase.rpc('guest_visits_on', { p_day: todayKey() }).then(({ data, error }) => (error ? null
          : ((data ?? []) as { amount: number; method: string; kind: string; voided: boolean }[]).map((v) => ({ ...v, amount: Number(v.amount) }))), () => null),
        loadToday().catch(() => null),
      ]);
      setDay(dy);
      const map: Record<string, Who> = {};
      for (const m of ms) {
        if (map[m.member_id]) continue;
        map[m.member_id] = { plan: m.membership_plans?.name ?? 'No plan', status: m.status, expiry: m.expiry_date ?? null,
          usable: membershipIsUsable(m.status, m.expiry_date, m.never_expires) };
      }
      setWhoOf(map);
      setActivityOptions(settings?.activity_options ?? []);
      const hour = (t: string | null | undefined, fb: number) => (t ? Number(t.slice(0, 2)) : fb);
      setHours({ open: hour(settings?.opening_time, 6), close: Math.max(hour(settings?.opening_time, 6) + 1, hour(settings?.closing_time, 21)), closing: settings?.closing_time ?? null });
      setDoor(d);
      setPicks(pk);
      setWalkIns(wv);
      setCoaches(d?.coachCheckin ? await listDoorCoaches().catch(() => []) : []);
      // Who took each check-in, for the By column. A failed read leaves it blank.
      const ids = [...new Set(attendanceRows.map((r) => r.recorded_by).filter((x): x is string => !!x))];
      if (ids.length) {
        const { data } = await supabase.from('gym_people').select('id, first_name, last_name').in('id', ids);
        setStaff(Object.fromEntries(((data ?? []) as { id: string; first_name: string | null; last_name: string | null }[])
          .map((p) => [p.id, [p.first_name, p.last_name].filter(Boolean).join(' ')])));
      }
      return attendanceRows;
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to load attendance', 'error');
      return [];
    } finally {
      setLoading(false);
    }
  };

  // An IIFE, so no setState runs synchronously in the effect body.
  useEffect(() => { void (async () => { await loadData(); })(); }, []);

  const memberById = useMemo(() => {
    const map: Record<string, MemberWithProfile> = {};
    for (const m of members) map[m.profile.id] = m;
    return map;
  }, [members]);
  const nameOf = (id: string) => {
    const m = memberById[id];
    return m ? `${m.profile.first_name} ${m.profile.last_name}` : 'Unknown member';
  };
  const byOf = (r: AttendanceRow) => (r.source === 'kiosk' ? 'Kiosk' : (r.recorded_by && staff[r.recorded_by]) || '');

  // Manila dates from utils/dates, never the UTC date out of the timestamp.
  const todayStr = todayKey();
  const today = useMemo(() => rows.filter((a) => localDateKey(a.check_in_time) === todayStr), [rows, todayStr]);
  const inToday = useMemo(() => new Set(today.map((a) => a.member_id)), [today]);
  const todayRowOf = useMemo(() => {
    const map: Record<string, AttendanceRow> = {};
    for (const r of today) if (!map[r.member_id] || r.check_in_time > map[r.member_id].check_in_time) map[r.member_id] = r;
    return map;
  }, [today]);
  /** The same weekday last week, up to this time of day: a fair comparison at 10 am. */
  const lastWeek = useMemo(() => {
    const day = addDays(todayStr, -7), cut = readAt - 7 * 86_400_000;
    return rows.filter((a) => localDateKey(a.check_in_time) === day && new Date(a.check_in_time).getTime() <= cut).length;
  }, [rows, todayStr, readAt]);
  const weekIds = useMemo(() => {
    const from = addDays(todayStr, -6);
    return new Set(rows.filter((a) => localDateKey(a.check_in_time) >= from).map((a) => a.member_id));
  }, [rows, todayStr]);
  const activeMembers = useMemo(() => Object.values(whoOf).filter((w) => w.usable).length, [whoOf]);
  /** Of this week's visitors, those whose plan is usable now: the share can never pass 100% (it once read "40 of 39"). */
  const activeCame = useMemo(() => [...weekIds].filter((id) => whoOf[id]?.usable).length, [weekIds, whoOf]);
  const perHourOf = useCallback((list: AttendanceRow[]) => {
    const out: number[] = [];
    for (let h = hours.open; h < hours.close; h++) out.push(0);
    for (const a of list) {
      const h = Number(new Date(a.check_in_time).toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'Asia/Manila' }));
      if (h >= hours.open && h < hours.close) out[h - hours.open] += 1;
    }
    return out;
  }, [hours]);
  const perHour = useMemo(() => perHourOf(today), [perHourOf, today]);
  const lastWeekPerHour = useMemo(() => perHourOf(rows.filter((a) => localDateKey(a.check_in_time) === addDays(todayStr, -7))), [perHourOf, rows, todayStr]);
  const nowHour = Number(new Date().toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'Asia/Manila' }));
  /** Rows on their way out after Undo: they fade while the list reloads, instead of vanishing. */
  const [leaving, setLeaving] = useState<Set<string>>(new Set());

  const byWay = useMemo(() => {
    const c = { kiosk: 0, desk: 0, typed: 0 };
    for (const r of today) c[wayOf(r)] += 1;
    return c;
  }, [today]);
  const tagCount = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of today) if (r.activity) c[r.activity] = (c[r.activity] ?? 0) + 1;
    return c;
  }, [today]);
  /** The tag list: the activities used most today first, then the gym's own order. */
  const tagOrder = useMemo(() => [...activityOptions].sort((a, b) => (tagCount[b] ?? 0) - (tagCount[a] ?? 0)), [activityOptions, tagCount]);

  /** Plans a member here is on, for the Plan filter: only when there are two or more to choose from. */
  const plans = useMemo(() => [...new Set(Object.values(whoOf).map((p) => p.plan))].filter((p) => p !== 'No plan').sort(), [whoOf]);
  const planOk = (id: string) => logPlan === 'all' || (whoOf[id]?.plan ?? 'No plan') === logPlan;
  /** What Export writes: today's check-ins under the list's How and Plan filters, newest first. */
  const logRecords = useMemo(() => today
    .filter((r) => way === 'all' || wayOf(r) === way)
    .filter((r) => logPlan === 'all' || (whoOf[r.member_id]?.plan ?? 'No plan') === logPlan)
    .sort((a, b) => b.check_in_time.localeCompare(a.check_in_time)), [today, way, logPlan, whoOf]);

  /** No connection (0211): saved on this computer with the time it was scanned, recorded when it is back. */
  const saveOffline = async (memberId: string, name: string, method: 'qr' | 'manual') => {
    if (inToday.has(memberId)) { showToast(`${name} already checked in today`, 'error'); return; }
    const gym = (await getGymContext().catch(() => null))?.gymId ?? null;
    if (!gym || !saveScan(gym, { memberId, name, method, source: 'desk' })) {
      showToast('No connection, and this computer could not save the check-in. Write it down and record it later.', 'error');
      return;
    }
    showToast(`No connection. ${name}'s check-in is saved on this computer and is recorded when it is back.`, 'success');
    setQuery('');
  };

  const doCheckIn = async (member: MemberWithProfile, method: 'qr' | 'manual') => {
    if (isOffline()) return saveOffline(member.profile.id, member.profile.first_name, method);
    const result = await performCheckIn(member, method, {
      alreadyInToday: inToday.has(member.profile.id), adminId, activity: activity || undefined, where: 'desk', picked: picks.get(member.profile.id),
    });
    if (!result.ok && isOffline(result.message)) return saveOffline(member.profile.id, member.profile.first_name, method);
    if (!result.ok && result.reason === 'slot') {
      // The owner may let the desk let someone in past a slot (0259); the database checks that, and every other rule.
      if (!window.confirm(`${result.message}

Let ${member.profile.first_name} in anyway?`)) return;
      const { error } = await supabase.rpc('desk_let_in', { p_member: member.profile.id });
      if (error) { showToast(error.message, 'error'); return; }
      showToast(`${member.profile.first_name} let in past the time slot`, 'success');
      setQuery('');
      await loadData();
      return;
    }
    if (!result.ok) { showToast(result.message, 'error'); return; }
    showToast(result.points === null
      ? `${member.profile.first_name} checked in successfully!`
      : `${member.profile.first_name} checked in · ${result.points.toLocaleString('en-PH')} CORE Points`, 'success');
    setQuery('');
    const fresh = await loadData();
    const row = fresh.find((r) => r.member_id === member.profile.id && localDateKey(r.check_in_time) === todayKey());
    setLast(row ? { kind: 'member', id: row.id, name: `${member.profile.first_name} ${member.profile.last_name}`, at: row.check_in_time, activity: row.activity, by: row.activity_by ?? null } : null);
  };

  const reloadAfterSend = useCallback(() => { void loadData(); }, []);

  const doCoachCheckIn = async (coach: DoorCoach, method: 'qr' | 'manual') => {
    const res = await performCoachCheckIn(coach, method, 'desk');
    if (!res.ok) { showToast(res.message, 'error'); return; }
    showToast(`${coach.name.split(' ')[0]} (coach) checked in`, 'success');
    setQuery('');
    const fresh = await listDoorCoaches().catch(() => coaches);
    setCoaches(fresh);
    const c = fresh.find((x) => x.id === coach.id);
    setLast(c?.checkinId ? { kind: 'coach', id: c.checkinId, name: coach.name, at: c.checkedInAt ?? new Date().toISOString(), activity: null, by: null } : null);
  };

  /** A scanned or typed code: the member app's QR, a coach's QR, the six-character code, a pasted id. */
  const checkInCode = async (raw: string) => {
    const code = raw.trim();
    if (!code) return showToast('Scan a code or type one in', 'error');
    const offlineRead = () => {
      const local = resolveOffline(code, members);
      return 'error' in local ? showToast(local.error, 'error') : saveOffline(local.memberId, local.name, local.method);
    };
    if (isOffline()) return offlineRead();
    const found = await resolveCheckInCode(code, members, coaches);
    if ('error' in found && isOffline(found.error)) return offlineRead();
    if ('error' in found) return showToast(found.error, 'error');
    if ('coach' in found) return doCoachCheckIn(found.coach, found.method);
    await doCheckIn(found.member, found.method);
  };

  const q = query.trim().toLowerCase();
  const qCode = normaliseCheckInCode(q);
  /**
   * Who the box means (2026-10-18). One character matched nearly everyone (the search also looked inside
   * each full member id), so: a name by the start of any word (one letter is enough), anywhere in it from
   * two letters; an email from three; the six-character code by its start from three; the full id only
   * whole. Never a substring of a UUID.
   */
  const nameHit = (name: string) => (q.length === 1
    ? name.toLowerCase().split(/\s+/).some((w) => w.startsWith(q))
    : name.toLowerCase().includes(q));
  const codeHit = (id: string) => qCode.length >= 3 && /^[0-9a-f]+$/.test(qCode) && checkInCodeOf(id).startsWith(qCode);
  const memberHits = q ? members.filter((m) =>
    nameHit(`${m.profile.first_name} ${m.profile.last_name}`) ||
    (q.length >= 3 && (m.profile.email ?? '').toLowerCase().includes(q)) ||
    (m.member.qr_code ?? '').toLowerCase() === q ||
    codeHit(m.profile.id)) : [];
  const coachHits = q ? coaches.filter((c) => nameHit(c.name) || codeHit(c.id)) : [];
  const matches = memberHits.length + coachHits.length;

  /** Enter: a code (or a QR's text) is checked in; a name only when exactly one person matches. */
  const submitQuery = () => {
    const looksLikeCode = /^cfc?1\./i.test(query.trim()) || /^[0-9a-f]{6}$/.test(normaliseCheckInCode(query)) || /^[0-9a-f-]{36}$/i.test(query.trim());
    if (looksLikeCode) return void checkInCode(query);
    if (matches === 1) return memberHits.length ? void doCheckIn(memberHits[0], 'manual') : void doCoachCheckIn(coachHits[0], 'manual');
    showToast(matches === 0 ? 'Nobody matches that.' : 'More than one match. Pick one from the list.', 'error');
  };

  /** Undo a check-in (0035): the wrong person scanned. Only today's, which is what RLS allows. */
  const handleUndo = async (why?: string) => {
    if (!toUndo) return;
    try {
      await deleteCheckIn(toUndo.id);
      setLeaving((s) => new Set(s).add(toUndo.id));
      if (why) await recordReason({ action: 'checkin.removed', subjectType: 'attendance', subjectId: null, memberId: toUndo.member_id,
        summary: `Removed ${nameOf(toUndo.member_id)}'s check-in`, reason: why });
      showToast(`Check-in removed for ${nameOf(toUndo.member_id)}`, 'success');
      if (last?.id === toUndo.id) setLast(null);
      setToUndo(null);
      await loadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not undo that check-in', 'error');
    }
  };
  /** Undoing a coach's check-in asks why, as a member's does (owner, 2026-10-28). */
  const [toUndoCoach, setToUndoCoach] = useState<{ id: string; name: string } | null>(null);
  const undoCoach = async (checkinId: string, name: string, why?: string) => {
    try {
      await undoCoachCheckin(checkinId);
      if (why) await recordReason({ action: 'coach_checkin.removed', subjectType: 'coach_checkin', subjectId: null, summary: `Removed ${name}'s check-in`, reason: why });
      setToUndoCoach(null);
      showToast(`Check-in removed for ${name}`, 'success');
      if (last?.id === checkinId) setLast(null);
      setCoaches(await listDoorCoaches().catch(() => coaches));
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not undo that check-in', 'error');
    }
  };

  /** Exports today's check-ins as the list's How filter shows them, built from the real row shape. */
  const exportLog = () => {
    if (logRecords.length === 0) return showToast('Nothing to export yet. Nobody has checked in today.', 'error');
    exportToCSV(logRecords.map((r) => ({
      Date: localDateKey(r.check_in_time), Time: clock(r.check_in_time), Member: nameOf(r.member_id), 'Check-in Code': formatCheckInCode(r.member_id),
      How: WAY_LABEL[wayOf(r)], Membership: whoOf[r.member_id]?.plan ?? '', Activity: r.activity ?? '', 'Tagged by': r.activity_by ?? '', By: byOf(r),
    })), `attendance_${todayStr}`, false);
  };

  // Grey shapes where the desk will be, instead of a line of text.
  if (loading) return (
    <div className="att" data-attendance-loading aria-busy="true">
      <AttHead counts={{ today: null, walkIns: counts.walkIns }} sub={<Skel w={240} h={12} />} />
      <div className="a-v2">
        <div className="a-v2-main">
          <div className="a-card" style={{ flex: 'none', display: 'grid', gridTemplateColumns: '1.3fr 1fr 1fr', gap: 16 }}><Skel w={120} h={40} /><Skel w={90} h={40} /><Skel w={90} h={40} /></div>
          <div className="a-card" style={{ flex: 1, display: 'grid', alignContent: 'start', gap: 14 }}>
            <Skel w="100%" h={46} />{[0, 1, 2, 3, 4, 5].map((i) => <Skel key={i} w="100%" h={22} />)}
          </div>
        </div>
        <div className="a-v2-side">
          <div className="a-card" style={{ flex: 1, display: 'grid', alignContent: 'start', gap: 14 }}><Skel w={100} h={14} /><Skel w="100%" h={40} /><Skel w="100%" h={40} /></div>
        </div>
      </div>
    </div>
  );

  const longDate = new Date().toLocaleDateString('en-PH', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Manila' });
  const closesAt = hours.closing ? new Date(`2000-01-01T${hours.closing}`).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' }).toLowerCase() : null;
  const lastWeekday = new Date(`${addDays(todayStr, -7)}T12:00:00`).toLocaleDateString('en-PH', { weekday: 'long' });
  const diff = today.length - lastWeek;
  const coachesIn = coaches.filter((c) => c.checkedInAt);
  const kioskRows = today.filter((r) => r.source === 'kiosk');
  const lastKiosk = kioskRows.reduce<string | null>((m, r) => (!m || r.check_in_time > m ? r.check_in_time : m), null);
  const liveWalkIns = walkIns?.filter((v) => !v.voided) ?? [];
  const walkCash = liveWalkIns.filter((v) => v.method === 'cash').reduce((a, v) => a + v.amount, 0);
  const packVisits = liveWalkIns.filter((v) => v.kind === 'pack_visit').length;
  // Running totals by the hour: today up to now, last week's whole day as the dashed line.
  const running = (v: number[]) => v.reduce<number[]>((acc, n) => [...acc, (acc.at(-1) ?? 0) + n], []);
  const todayLine = running(perHour).slice(0, Math.max(0, Math.min(perHour.length, nowHour - hours.open + 1)));
  const lastWeekLine = running(lastWeekPerHour);
  const lastWeekAll = lastWeekLine.at(-1) ?? 0;
  const weekShare = activeMembers ? Math.round((activeCame / activeMembers) * 100) : null;
  // The check-in just taken here, or else the newest one today: the desk always sees the latest, with Undo.
  const newest = today.reduce<AttendanceRow | null>((m, r) => (!m || r.check_in_time > m.check_in_time ? r : m), null);
  const shown = last ?? (newest ? { kind: 'member' as const, id: newest.id, name: nameOf(newest.member_id), at: newest.check_in_time, activity: newest.activity, by: newest.activity_by ?? null } : null);

  // ── The one list ──
  const byName = (a: MemberWithProfile, b: MemberWithProfile) =>
    `${a.profile.first_name} ${a.profile.last_name}`.localeCompare(`${b.profile.first_name} ${b.profile.last_name}`);
  type Item = { k: 'in'; row: AttendanceRow } | { k: 'out'; m: MemberWithProfile } | { k: 'coach'; c: DoorCoach };
  const notInCount = members.filter((m) => !inToday.has(m.profile.id)).length;
  const items: Item[] = (() => {
    const inRows = (list: AttendanceRow[]) => list.filter((r) => (way === 'all' || wayOf(r) === way) && planOk(r.member_id))
      .sort((a, b) => b.check_in_time.localeCompare(a.check_in_time)).map((row) => ({ k: 'in' as const, row }));
    if (q) {
      // Searching: whoever can be checked in first, then those already in.
      const outs = memberHits.filter((m) => !inToday.has(m.profile.id) && planOk(m.profile.id)).sort(byName).map((m) => ({ k: 'out' as const, m }));
      const ins = inRows(memberHits.map((m) => todayRowOf[m.profile.id]).filter((r): r is AttendanceRow => !!r));
      return [...coachHits.map((c) => ({ k: 'coach' as const, c })), ...(show === 'in' ? [] : outs), ...(show === 'out' ? [] : ins)];
    }
    const ins = show === 'out' ? [] : inRows(today);
    const outs = show === 'in' || way !== 'all' ? [] : members.filter((m) => !inToday.has(m.profile.id) && planOk(m.profile.id)).sort(byName).map((m) => ({ k: 'out' as const, m }));
    return [...ins, ...outs];
  })();
  const realCount = items.length;
  /** The "Not in yet" heading sits right above the first member not in, on whichever page that falls (never alone at a page's end). */
  const firstOut = !q && show === 'all' ? items.findIndex((i) => i.k === 'out') : -1;
  // The heading takes about a row's height, so a list that has it pages one row shorter: no row is ever cut off.
  const per = firstOut > 0 ? Math.max(1, perPage - 1) : perPage;
  const pages = Math.max(1, Math.ceil(items.length / per));
  const page = Math.min(listPage, pages);
  const pageItems = items.slice((page - 1) * per, page * per);
  const onlyOne = q && matches === 1;
  const rowH = items.length > per ? fitRowHeight : undefined;

  /** A member not in yet: why the desk cannot check them in, when the plan says so (the service still decides). */
  const outState = (id: string): { text: string; tone: 'v' | 'a' | ''; blocked: boolean } => {
    const w = whoOf[id];
    if (!w) return { text: 'Not in yet · no plan', tone: '', blocked: false };
    if (w.usable) {
      const left = w.expiry ? daysBetween(todayStr, w.expiry) : null;
      return { text: left === null || left > 7 ? 'Not in yet' : left === 0 ? 'Not in yet · plan ends today' : `Not in yet · plan ends in ${left} day${left === 1 ? '' : 's'}`, tone: '', blocked: false };
    }
    if (w.status === 'frozen') return { text: 'Frozen', tone: 'a', blocked: true };
    if (w.status === 'pending') return { text: 'Plan waiting for payment', tone: 'a', blocked: true };
    return { text: w.expiry ? `Plan ended ${fmtDay(w.expiry)}` : 'Plan ended', tone: 'a', blocked: true };
  };
  const setShowTo = (s: Show) => { setShow(s); setListPage(1); };

  /** Plans ending within a week, and those that ended in the last week: the desk can renew them as they walk in. */
  const ending = members.map((m) => {
    const w = whoOf[m.profile.id];
    if (!w?.expiry || w.status === 'frozen' || w.status === 'pending') return null;
    const left = daysBetween(todayStr, w.expiry);
    const ok = w.usable ? left >= 0 && left <= 7 : left < 0 && left >= -7;
    return ok ? { m, w, left } : null;
  }).filter((x): x is { m: MemberWithProfile; w: Who; left: number } => !!x)
    .sort((a, b) => Number(inToday.has(b.m.profile.id)) - Number(inToday.has(a.m.profile.id)) || a.left - b.left);
  const endsText = (left: number, expiry: string) => (left < 0 ? `ended ${fmtDay(expiry)}` : left === 0 ? 'ends today' : left === 1 ? 'ends tomorrow' : `ends in ${left} days`);
  /** Coming up: the gym's classes today, or its confirmed 1-on-1 sessions when it runs none. */
  const upClasses = day?.classes ?? null, upSessions = day?.sessions ?? null;
  const useClasses = !!upClasses?.length;
  const upAll: (NonNullable<Today['classes']>[number] | NonNullable<Today['sessions']>[number])[] = useClasses ? upClasses! : upSessions ?? [];
  const upNext = upAll.filter((x) => !x.done);
  const upDone = upAll.length - upNext.length;

  return (
    <div className="att" data-attendance-today>
      <AttHead counts={{ today: today.length, walkIns: walkIns ? liveWalkIns.length : counts.walkIns }}
        sub={<><span className="a-live">Live</span>&nbsp; {longDate}{closesAt ? ` · open until ${closesAt}` : ''}</>} />
      <OfflineScans onRecorded={reloadAfterSend} />

      {/* Owner's mock-up D (2026-11-27): the figures in one strip, then one box that finds, checks in and lists
          everyone; the rail is only what is at the door. */}
      <div className="a-v2" data-att-v2>
        <div className="a-v2-main">
          {/* ── The day's three figures ── */}
          <div className="a-figs3" data-att-figures>
            <div className="a-card" data-fig-today>
              <div className="a-lbl">Checked in today</div>
              <div className="a-fig-row">
                <div className="a-num"><CountUp value={today.length} /></div>
                {/* Today's running total by the hour over last week's same day (dashed); before two hours have passed there is no line to draw. */}
                {today.length + lastWeekAll > 0 && todayLine.length > 1 && (
                  <div className="a-trend" data-today-trend data-tip={`Today so far, with last ${lastWeekday} dashed (${lastWeekAll} all day), ${hours.open}:00 to ${hours.close}:00`}>
                    <Spark values={todayLine} compare={lastWeekLine} label={`Check-ins so far today by the hour, against ${lastWeekAll} all of last ${lastWeekday}`} />
                  </div>
                )}
              </div>
              <div className="a-sub" data-vs-last-week>{today.length === 0
                ? (lastWeek > 0 ? `By this time last ${lastWeekday}, ${lastWeek} had checked in` : `Nobody yet. Last ${lastWeekday} had none by now either`)
                : diff === 0 ? `Same as last ${lastWeekday} by now`
                  : <><b className={diff > 0 ? 'a-up' : 'a-dn'}>{Math.abs(diff)} {diff > 0 ? 'more' : 'fewer'}</b> than last {lastWeekday} by now</>}</div>
            </div>
            <button type="button" className="a-card press text-left" onClick={() => navigate('/attendance/walk-ins')} data-tip="Open Walk-ins">
              <div className="a-lbl">Walk-ins today</div>
              <div className="a-num">{walkIns ? <CountUp value={liveWalkIns.length} /> : '0'}</div>
              <div className="a-sub inline-flex items-center gap-1.5">
                <Banknote size={13} />{walkIns ? `${peso(walkCash)} in the drawer${packVisits ? ` · ${packVisits} pack visit${packVisits === 1 ? '' : 's'}` : ''}` : 'Walk-ins are not set up'}
              </div>
            </button>
            <button type="button" className="a-card press text-left" onClick={() => navigate('/attendance-history')} data-tip="Open History" data-fig-week>
              <div className="a-lbl">Members this week</div>
              <div className="a-num"><CountUp value={weekIds.size} /></div>
              <div className="a-sub">{weekShare === null ? 'No active members yet' : `${activeCame} of ${activeMembers} active members came, ${weekShare}%`}</div>
            </button>
          </div>

          {/* ── Find, check in, and the list of everyone ── */}
          <div className="a-card a-desk" data-att-desk>
            <div className="a-desk-find">
              <label className="a-input big" style={{ flex: 1, minWidth: 0 }}>
                <Search size={19} />
                <input value={query} onChange={(e) => { setQuery(e.target.value); setListPage(1); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') submitQuery(); if (e.key === 'Escape') setQuery(''); }}
                  placeholder={`${door?.coachCheckin ? 'Member or coach' : 'Member'}: name, email or the code under their QR`} aria-label="Check-in code or name" />
                {query && <button type="button" className="a-link" onClick={() => setQuery('')}>Clear</button>}
                {query && <span className="a-kbd">{onlyOne ? 'Enter checks in' : 'Enter ↵'}</span>}
              </label>
              {/* The next check-in's tag: the activities used most today first. Set, it shows in amber; the desk's tag beats a member's own pick. */}
              {activityOptions.length > 0 && (
                <label className={`a-tagsel ${activity ? 'on' : ''}`} data-tag-picker data-tip="Tag the next check-in with an activity">
                  <Tag size={15} />Tag
                  <select value={activity} onChange={(e) => setActivity(e.target.value)} aria-label="Tag the next check-in" data-tag-select>
                    <option value="">None</option>
                    {tagOrder.map((o) => <option key={o} value={o}>{o}{tagCount[o] ? ` (${tagCount[o]})` : ''}</option>)}
                  </select>
                </label>
              )}
              <button type="button" className="a-btn amber a-scan" onClick={() => setIsScannerOpen(true)} data-scan-qr
                data-tip="Open the camera to scan a member's or coach's code"><QrCode size={19} />Scan QR</button>
            </div>

            {!q && shown && (
              <div key={shown.id} className="a-toast a-desk-last" data-last-checkin>
                <span className="ok"><Check size={14} /></span>
                <div className="min-w-0 flex-1 truncate">
                  <b>{shown.name} is in</b>
                  <span className="a-sub">&nbsp; {clock(shown.at)}{shown.kind === 'coach' ? ' · coach' : shown.activity ? ` · ${shown.activity} · ${shown.by === 'member' ? 'their pick' : 'set at the desk'}` : ''}{!last ? ' · the latest today' : ''}</span>
                </div>
                <button type="button" className="a-btn ghost sm" onClick={() => {
                  if (shown.kind === 'coach') return setToUndoCoach({ id: shown.id, name: shown.name });
                  const row = today.find((r) => r.id === shown.id);
                  if (row) setToUndo(row);
                }}>Undo</button>
              </div>
            )}

            <div className="a-desk-bar">
              <nav className="a-tabs a-show" aria-label="Who to show">
                {([['all', 'Everyone', members.length], ['in', 'In today', today.length], ['out', 'Not in yet', notInCount]] as const).map(([k, label, n]) => (
                  <button key={k} type="button" className={show === k ? 'on' : ''} onClick={() => setShowTo(k)} aria-pressed={show === k} data-show={k}>{label}<em>{n}</em></button>
                ))}
              </nav>
              {q && <span className="a-sub" data-found><b>{matches}</b> found for “{query.trim()}”</span>}
              <div className="a-desk-tools">
                {plans.length > 1 && (
                  <label className={`a-tagsel sm ${logPlan !== 'all' ? 'on' : ''}`} data-tip="Show only members on this plan">
                    Plan
                    <select value={logPlan} onChange={(e) => { setLogPlan(e.target.value); setListPage(1); }} aria-label="Filter by membership" data-plan-select>
                      <option value="all">All plans</option>
                      {plans.map((p) => <option key={p} value={p}>{p}</option>)}
                      <option value="No plan">No plan</option>
                    </select>
                  </label>
                )}
                <label className="a-tagsel sm" data-tip="How today's check-ins were taken">
                  How
                  <select value={way} onChange={(e) => { setWay(e.target.value as Way); setListPage(1); }} aria-label="How they checked in" data-way-select>
                    {(['all', 'kiosk', 'desk', 'typed'] as Way[]).map((k) => <option key={k} value={k}>{WAY_LABEL[k]}{k === 'all' ? '' : ` (${byWay[k]})`}</option>)}
                  </select>
                </label>
                <button type="button" className="a-btn sm" onClick={exportLog} data-tip="Export today's check-ins as CSV"><Download size={14} />Export</button>
              </div>
            </div>

            <div ref={fitRef} className="a-scroll" style={{ flex: 1 }} data-rd-table data-att-list>
              {members.length === 0 && coaches.length === 0 ? (
                <EmptyBlock icon={Users} title="No members yet" body="Members show here once they join, each with a Check in button."
                  action={<Link to="/members" className="a-link" style={{ color: 'var(--a-p300)' }}>Open Members →</Link>} />
              ) : realCount === 0 ? (
                <div className="a-sub text-center" style={{ padding: '32px 16px', fontSize: 13 }} data-no-match>
                  {q ? <><b className="block" style={{ color: 'var(--a-ink)', fontSize: 14, marginBottom: 4 }}>Nobody matches “{query.trim()}”</b>Check the spelling, or try their email or the code under their QR.</>
                    : logPlan !== 'all' ? <>Nobody on {logPlan} here. <button type="button" className="a-link" style={{ color: 'var(--a-p300)' }} onClick={() => setLogPlan('all')}>Show all plans</button></>
                    : show === 'in' || way !== 'all' ? <>Nobody has checked in {way === 'all' ? '' : `by ${WAY_LABEL[way].toLowerCase()} `}yet today. <Link to="/attendance-history" className="a-link" style={{ color: 'var(--a-p300)' }}>See other days →</Link></>
                      : 'Everyone is in today.'}
                </div>
              ) : (
                <table className="a-table">
                  <thead><tr><th>Member</th><th>Today</th><th>How</th><th>Activity</th><th>By</th><th /></tr></thead>
                  <tbody>
                    {pageItems.map((it, i) => [
                      firstOut > 0 && (page - 1) * per + i === firstOut
                        && <tr key="sub" className="a-subrow" data-not-in-head><td colSpan={6}>Not in yet · A to Z</td></tr>,
                      (() => {
                      if (it.k === 'in') return (
                        <LogRow key={it.row.id} row={it.row} name={nameOf(it.row.member_id)} photo={memberById[it.row.member_id]?.profile.photo_url}
                          plan={whoOf[it.row.member_id]?.plan} by={byOf(it.row)} onUndo={() => setToUndo(it.row)} height={rowH}
                          fresh={last?.id === it.row.id} leaving={leaving.has(it.row.id)} />
                      );
                      if (it.k === 'coach') {
                        const c = it.c;
                        return (
                          <tr key={`c-${c.id}`} style={{ height: rowH }} data-quick-coach>
                            <td><div className="a-who"><Av name={c.name} photo={c.photo} small /><span className="min-w-0"><b className="truncate block">{c.name}</b><small className="a-sub">Coach · <span className="a-code">{formatCheckInCode(c.id)}</span></small></span></div></td>
                            <td>{c.checkedInAt ? <span className="a-pill v">In at {clock(c.checkedInAt)}</span> : <span className="a-pill">Not in yet</span>}</td>
                            <td><span className="a-pill"><Dumbbell size={12} />Coach</span></td><td /><td />
                            <td style={{ textAlign: 'right' }}>{c.checkedInAt ? null
                              : <button type="button" className={`a-btn sm ${onlyOne ? 'amber' : ''}`} onClick={() => void doCoachCheckIn(c, 'manual')}>Check in</button>}</td>
                          </tr>
                        );
                      }
                      const m = it.m, id = m.profile.id, name = `${m.profile.first_name} ${m.profile.last_name}`;
                      const st = outState(id), pick = picks.get(id);
                      return (
                        <tr key={id} style={{ height: rowH }} data-out>
                          <td><div className="a-who"><Av name={name} photo={m.profile.photo_url} small /><span className="min-w-0"><b className="truncate block">{name}</b><small className="a-sub">{whoOf[id]?.plan ?? 'No plan'} · <span className="a-code">{formatCheckInCode(id)}</span></small></span></div></td>
                          <td><span className={`a-pill ${st.tone}`}>{st.text}</span></td>
                          <td />
                          <td>{pick && !activity && <span className="a-pill v" data-tip="What they picked on their QR screen"><Smartphone size={12} />picked {pick}</span>}</td>
                          <td />
                          <td style={{ textAlign: 'right' }}>
                            {st.blocked
                              ? <span className="a-sub" data-tip={`${st.text}. Renew or unfreeze the plan on Members first.`}>Can't check in</span>
                              : <button type="button" className={`a-btn sm ${onlyOne ? 'amber' : ''}`} onClick={() => void doCheckIn(m, 'manual')} data-check-in>Check in</button>}
                          </td>
                        </tr>
                      );
                    })()])}
                  </tbody>
                </table>
              )}
            </div>
            {realCount > 0 && (
              <div className="a-sub a-desk-foot" data-rd-footer>
                <span>{q ? `${realCount} found` : show === 'in' ? `${realCount} checked in today` : show === 'out' ? `${realCount} not in yet` : `${today.length} in today, ${notInCount} not in yet`}</span>
                <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <Pager page={page} pages={pages} onPage={setListPage} />
                  <Link to="/attendance-history" className="a-link" style={{ color: 'var(--a-p300)', marginLeft: 4 }}>Other days →</Link>
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="a-v2-side">
          {/* ── At the door (owner, 2026-11-27): one short row each, the same shape: what it is, what it did today, one button. ── */}
          <div className="a-card a-railcard a-doorcard" data-at-the-door>
            <div className="a-ct"><h3><DoorOpen size={15} />At the door</h3></div>
            <div className="a-row" data-door-screen="kiosk">
              <span className="a-ic"><Tablet size={15} /></span>
              {/* What the kiosk did today, never a "Running" it cannot know. */}
              <div className="t"><b>Kiosk</b><small className={`a-status ${kioskRows.length ? '' : 'off'}`} data-kiosk-status
                data-tip={`Members scan their own QR on a tablet by the door${door?.coachCheckin ? '. Coaches scan theirs too' : ''}.`}>
                {kioskRows.length ? `${kioskRows.length} today · last ${clock(lastKiosk!)}` : 'No scans yet'}</small></div>
              <button type="button" className="a-btn sm" onClick={() => navigate('/kiosk')} aria-label="Open kiosk">Open</button>
            </div>
            <div className="a-row" data-door-screen="tv">
              <span className="a-ic"><MonitorPlay size={15} /></span>
              <div className="t"><b>Lobby TV</b><small>Classes, records and the gym goal</small></div>
              <button type="button" className="a-btn sm" onClick={() => navigate('/tv')} aria-label="Open lobby TV">Open</button>
            </div>
            {door?.coachCheckin ? (
              <div className="a-row" data-coaches-row-wrap>
                <span className="a-ic"><UserCheck size={15} /></span>
                <div className="t"><b>Coaches</b><small>{coachesIn.length ? `${coachesIn.length} of ${coaches.length} in · ${coachesIn.map((c) => c.name.split(' ')[0]).join(', ')}` : `0 of ${coaches.length} in yet`}</small></div>
                <button type="button" className="a-btn sm" onClick={() => setCoachesOpen(true)} data-coaches-row>See</button>
              </div>
            ) : door ? (
              <div className="a-row" data-coaches-off>
                <span className="a-ic"><UserCheck size={15} /></span>
                <div className="t"><b>Coaches</b><small>Coach check-in is off</small></div>
                <Link to="/settings?tab=gym" className="a-btn sm">Turn on</Link>
              </div>
            ) : null}
            <div className="a-doorfoot"><PageGuide id="kiosk" label="How the kiosk works" /></div>
          </div>

          {/* ── Plans ending soon (owner, 2026-11-27): renew them while they are at the desk. ── */}
          <div className="a-card a-railcard" data-plans-ending>
            <div className="a-ct"><h3><RefreshCw size={15} />Plans ending soon</h3>{ending.length > 0 && <small>{ending.length}</small>}</div>
            <div className="a-railbody">
              {ending.length === 0 ? <p className="a-sub a-railempty">No plan ends this week, and none ended last week.</p>
                : ending.map(({ m, w, left }) => {
                  const name = `${m.profile.first_name} ${m.profile.last_name}`;
                  const here = inToday.has(m.profile.id);
                  return (
                    <div key={m.profile.id} className="a-row" data-ending-row>
                      <Av name={name} photo={m.profile.photo_url} small />
                      <div className="t"><b>{name}</b><small>{w.plan} · {endsText(left, w.expiry!)}{here ? ' · in today' : ''}</small></div>
                      <button type="button" className="a-btn sm" onClick={() => navigate(`/members?open=${m.profile.id}`)} data-tip={`Open ${m.profile.first_name} on Members to renew`}>Renew</button>
                    </div>
                  );
                })}
            </div>
          </div>

          {/* ── Coming up today: classes by time, or 1-on-1 sessions when the gym runs no classes. ── */}
          <div className="a-card a-railcard" data-coming-up>
            <div className="a-ct"><h3><CalendarClock size={15} />Coming up today</h3>
              <Link to={useClasses ? '/schedule' : '/personal-training?tab=sessions'} className="a-link" style={{ color: 'var(--a-p300)', marginLeft: 'auto' }}>{useClasses ? 'Schedule' : 'Sessions'} →</Link></div>
            <div className="a-railbody">
              {day === null || (upClasses === null && upSessions === null) ? <p className="a-sub a-railempty">Today's classes and sessions could not be read.</p>
                : upNext.length === 0 ? <p className="a-sub a-railempty">{upAll.length ? `Nothing more today. ${upDone} earlier.` : 'No classes or sessions today.'}</p>
                : <>
                  {upNext.map((x) => {
                    const at = clock(x.startsAt);
                    if ('booked' in x) return (
                      <div key={x.id} className="a-row" data-up-class>
                        <span className="a-time">{at}</span>
                        <div className="t"><b>{x.name}</b><small>{[x.coach, x.location].filter(Boolean).join(' · ') || 'No coach set'}</small></div>
                        <span className="a-sub" style={{ whiteSpace: 'nowrap' }}>{x.capacity ? `${x.booked} of ${x.capacity}` : `${x.booked} booked`}</span>
                      </div>
                    );
                    const here = inToday.has(x.memberId);
                    return (
                      <div key={x.id} className="a-row" data-up-session>
                        <span className="a-time">{at}</span>
                        <div className="t"><b>{x.member ?? 'A member'}</b><small>with {x.coach ?? 'a coach'} · {x.minutes} min</small></div>
                        <span className={`a-pill ${here ? 'v' : ''}`}>{here ? 'In' : 'Not in yet'}</span>
                      </div>
                    );
                  })}
                  {upDone > 0 && <p className="a-sub" style={{ padding: '6px 16px 10px', fontSize: 12 }}>{upDone} earlier today</p>}
                </>}
            </div>
          </div>
        </div>
      </div>

      <QRScanner isOpen={isScannerOpen} onClose={() => setIsScannerOpen(false)} onScan={(code) => void checkInCode(code)} />

      {/* Coaches (0200): who is in, and checking one in by hand when their phone is not with them. */}
      <DetailSheet open={coachesOpen} onClose={() => setCoachesOpen(false)} title="Coaches today"
        subtitle={`${coachesIn.length} of ${coaches.length} in · never counted as member visits`}>
        <div className="att" style={{ height: 'auto', overflow: 'visible' }} data-coaches-sheet>
          {coaches.length === 0 && <p className="a-sub text-center" style={{ padding: 24 }}>This gym has no active coaches yet.</p>}
          {coaches.map((c) => (
            <div key={c.id} className="a-row">
              <Av name={c.name} photo={c.photo} />
              <div className="t"><b>{c.name}</b><small>{c.checkedInAt ? `In at ${clock(c.checkedInAt)}` : 'Not in yet'} · <span className="a-code">{formatCheckInCode(c.id)}</span></small></div>
              {c.checkinId
                ? <button type="button" className="a-btn ghost sm" onClick={() => setToUndoCoach({ id: c.checkinId!, name: c.name })}>Undo</button>
                : <button type="button" className="a-btn amber sm" onClick={() => void doCoachCheckIn(c, 'manual')}>Check in</button>}
            </div>
          ))}
        </div>
      </DetailSheet>

      <ConfirmDialog
        isOpen={!!toUndoCoach}
        onClose={() => setToUndoCoach(null)}
        onConfirm={(why) => { if (toUndoCoach) void undoCoach(toUndoCoach.id, toUndoCoach.name, why); }} reason={REASON_FIELD}
        title="Undo the coach's check-in"
        message={toUndoCoach ? `Remove ${toUndoCoach.name}'s check-in? Use this when the wrong coach was scanned. They can check in again.` : ''}
        confirmText="Undo it"
        type="danger"
      />
      <ConfirmDialog
        isOpen={!!toUndo}
        onClose={() => setToUndo(null)}
        onConfirm={(why) => void handleUndo(why)} reason={REASON_FIELD}
        title="Undo Check-in"
        message={toUndo
          ? `Remove ${nameOf(toUndo.member_id)}'s ${clock(toUndo.check_in_time)} check-in? ` +
            `Use this when the wrong member was scanned. The visit stops counting toward their training days and toward today's totals. They can simply check in again.`
          : ''}
        confirmText="Undo it"
        type="danger"
      />
    </div>
  );
}
