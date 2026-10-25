import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import QRScanner from '../components/ui/QRScanner';
import DetailSheet from '../components/ui/DetailSheet';
import FloatingWindow from '../components/ui/FloatingWindow';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { useFitRows } from '../hooks/useFitRows';
import {
  QrCode, Download, Tablet, Tag, ScanLine, Search, Check, MonitorPlay, DoorOpen, UserCheck, ListChecks, Maximize2,
  Smartphone, ChevronLeft, ChevronRight, Users, Banknote, Dumbbell,
} from 'lucide-react';
import { showToast } from '../utils/toast';
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
import { Av, HowPill, AttHead } from './attendance/parts';
import { useAttCounts, peso, clock } from './attendance/attData';
import './attendance/att.css';
import OfflineScans from './attendance/OfflineScans';
import { isOffline, resolveOffline, saveScan } from '../lib/checkinOutbox';
import { getGymContext } from '../lib/gymContext';

const ITEMS_PER_PAGE = 10;
type Who = { plan: string; status: string; expiry: string | null; usable: boolean };
type Way = 'all' | 'kiosk' | 'desk' | 'typed';
const wayOf = (r: AttendanceRow): Exclude<Way, 'all'> => (r.source === 'kiosk' ? 'kiosk' : r.method === 'qr' ? 'desk' : 'typed');
const WAY_LABEL: Record<Way, string> = { all: 'All', kiosk: 'Kiosk', desk: 'Desk scan', typed: 'Typed' };

/** One row of today's log — the card and the floating window draw the same row. */
function LogRow({ row: r, name, photo, plan, by, onUndo, height }: {
  row: AttendanceRow; name: string; photo?: string | null; plan?: string; by: string; onUndo: () => void; height?: number;
}) {
  return (
    <tr data-log-row style={{ height }}>
      <td style={{ width: 90 }}><b>{clock(r.check_in_time)}</b></td>
      <td>
        <div className="a-who">
          <Av name={name} photo={photo} small />
          <b className="truncate">{name}</b>
          {plan && <span className="a-pill">{plan}</span>}
          <span className="a-code" style={{ fontSize: 10.5 }}>{formatCheckInCode(r.member_id)}</span>
        </div>
      </td>
      <td><HowPill row={r} /></td>
      {/* The activity tag (0018), and whose it is (0200). A dash means nobody picked one — not "no activity". */}
      <td>
        {r.activity ? (
          <span className="inline-flex items-center gap-2">
            {r.activity}
            {r.activity_by === 'member' && <span className="a-pill v" data-tag-by="member"><Smartphone size={12} />their pick</span>}
            {r.activity_by === 'desk' && <span className="a-pill a" data-tag-by="desk"><Tag size={12} />desk</span>}
          </span>
        ) : <span className="a-sub">—</span>}
      </td>
      <td className={by === '—' ? 'a-sub' : ''}>{by}</td>
      <td style={{ width: 60, textAlign: 'right' }}><button type="button" className="a-link" onClick={onUndo} data-tip="Undo this check-in">Undo</button></td>
    </tr>
  );
}

/**
 * Attendance → Today, the desk — built to the owner's v2 mock-up (2026-10-18),
 * in its own stylesheet (attendance/att.css).
 *
 * One box checks anyone in: scan, a name, or the six-character code under their
 * QR, members and — when the owner has it on (0200) — coaches. The tag chips
 * are the activities used most today, with a "More" list for the rest (a gym
 * can have thirty). At the door: the kiosk and lobby TV, and the coaches who are
 * in. Four cards: today against the same weekday last week (up to this hour)
 * with the day's hours, how they came in, walk-ins and the drawer, and the
 * week's members. The log says how each check-in was taken, whose activity
 * tag it carries and who took it; View all floats the whole day over the page.
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
  const [hours, setHours] = useState<{ open: number; close: number; closing: string | null }>({ open: 6, close: 21, closing: null });

  const [query, setQuery] = useState('');
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [activity, setActivity] = useState('');
  const [activityOptions, setActivityOptions] = useState<string[]>([]);
  const [logPage, setLogPage] = useState(1);
  const [toUndo, setToUndo] = useState<AttendanceRow | null>(null);
  const [coachesOpen, setCoachesOpen] = useState(false);
  const [fullOpen, setFullOpen] = useState(false);
  /** The check-in just taken, with its own Undo — the desk sees it worked without reading the log. */
  const [last, setLast] = useState<{ kind: 'member' | 'coach'; id: string; name: string; at: string; activity: string | null; by: 'member' | 'desk' | null } | null>(null);
  const [way, setWay] = useState<Way>('all');
  const [logPlan, setLogPlan] = useState('all');
  const [logSearch, setLogSearch] = useState('');
  /** Rows that fit the log's own box — the page never scrolls (2026-10-11). */
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
      const [ms, settings, d, pk, wv] = await Promise.all([
        listMemberships().catch(() => []),
        getGymSettings().catch(() => null),
        getDoorSettings(),
        listTodayPicks(),
        supabase.rpc('guest_visits_on', { p_day: todayKey() }).then(({ data, error }) => (error ? null
          : ((data ?? []) as { amount: number; method: string; kind: string; voided: boolean }[]).map((v) => ({ ...v, amount: Number(v.amount) }))), () => null),
      ]);
      const map: Record<string, Who> = {};
      for (const m of ms) {
        if (map[m.member_id]) continue;
        map[m.member_id] = { plan: m.membership_plans?.name ?? '—', status: m.status, expiry: m.expiry_date ?? null,
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
      // Who took each check-in, for the log's By column. A failed read leaves a dash.
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
  const byOf = (r: AttendanceRow) => (r.source === 'kiosk' ? '—' : (r.recorded_by && staff[r.recorded_by]) || '—');

  // Manila dates from utils/dates — never the UTC date out of the timestamp.
  const todayStr = todayKey();
  const today = useMemo(() => rows.filter((a) => localDateKey(a.check_in_time) === todayStr), [rows, todayStr]);
  const inToday = useMemo(() => new Set(today.map((a) => a.member_id)), [today]);
  /** The same weekday last week, up to this time of day — a fair comparison at 10 am. */
  const lastWeek = useMemo(() => {
    const day = addDays(todayStr, -7), cut = readAt - 7 * 86_400_000;
    return rows.filter((a) => localDateKey(a.check_in_time) === day && new Date(a.check_in_time).getTime() <= cut).length;
  }, [rows, todayStr, readAt]);
  const weekUnique = useMemo(() => {
    const from = addDays(todayStr, -6);
    return new Set(rows.filter((a) => localDateKey(a.check_in_time) >= from).map((a) => a.member_id)).size;
  }, [rows, todayStr]);
  const activeMembers = useMemo(() => Object.values(whoOf).filter((w) => w.usable).length, [whoOf]);
  /** Today's check-ins per opening hour, for the little bars. */
  const perHour = useMemo(() => {
    const out: number[] = [];
    for (let h = hours.open; h < hours.close; h++) out.push(0);
    for (const a of today) {
      const h = Number(new Date(a.check_in_time).toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'Asia/Manila' }));
      if (h >= hours.open && h < hours.close) out[h - hours.open] += 1;
    }
    return out;
  }, [today, hours]);
  const nowHour = Number(new Date().toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'Asia/Manila' }));

  const byWay = useMemo(() => {
    const c = { kiosk: 0, desk: 0, typed: 0 };
    for (const r of today) c[wayOf(r)] += 1;
    return c;
  }, [today]);
  /** The tag chips: the activities used most today (then the gym's own order), four of them; the rest under More. */
  const tagCount = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of today) if (r.activity) c[r.activity] = (c[r.activity] ?? 0) + 1;
    return c;
  }, [today]);
  const topTags = useMemo(() => [...activityOptions].sort((a, b) => (tagCount[b] ?? 0) - (tagCount[a] ?? 0)).slice(0, 4), [activityOptions, tagCount]);

  const plans = useMemo(() => [...new Set(Object.values(whoOf).map((p) => p.plan))].filter((p) => p !== '—').sort(), [whoOf]);
  const logRecords = useMemo(() => {
    const q = logSearch.trim().toLowerCase();
    return today
      .filter((r) => way === 'all' || wayOf(r) === way)
      .filter((r) => logPlan === 'all' || whoOf[r.member_id]?.plan === logPlan)
      .filter((r) => !q || nameOf(r.member_id).toLowerCase().includes(q) || (r.activity ?? '').toLowerCase().includes(q)
        || checkInCodeOf(r.member_id).includes(q.replace(/[\s-]/g, '')))
      .sort((a, b) => b.check_in_time.localeCompare(a.check_in_time));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today, way, logPlan, logSearch, whoOf, memberById]);
  const pages = Math.max(1, Math.ceil(logRecords.length / perPage));
  const page = Math.min(logPage, pages);

  /** No connection (0211): saved on this computer with the time it was scanned, recorded when it is back. */
  const saveOffline = async (memberId: string, name: string, method: 'qr' | 'manual') => {
    if (inToday.has(memberId)) { showToast(`${name} already checked in today`, 'error'); return; }
    const gym = (await getGymContext().catch(() => null))?.gymId ?? null;
    if (!gym || !saveScan(gym, { memberId, name, method, source: 'desk' })) {
      showToast('No connection, and this computer could not save the check-in. Write it down and record it later.', 'error');
      return;
    }
    showToast(`No connection — ${name}'s check-in is saved on this computer and is recorded when it is back.`, 'success');
    setQuery('');
  };

  const doCheckIn = async (member: MemberWithProfile, method: 'qr' | 'manual') => {
    if (isOffline()) return saveOffline(member.profile.id, member.profile.first_name, method);
    const result = await performCheckIn(member, method, {
      alreadyInToday: inToday.has(member.profile.id), adminId, activity: activity || undefined, where: 'desk', picked: picks.get(member.profile.id),
    });
    if (!result.ok && isOffline(result.message)) return saveOffline(member.profile.id, member.profile.first_name, method);
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

  /** A scanned or typed code — the member app's QR, a coach's QR, the six-character code, a pasted id. */
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
   * Who the box means (2026-10-18). One character matched nearly everyone — the
   * search also looked inside each full member id — so: a name by the start of
   * any word (one letter is enough), anywhere in it from two letters; an email
   * from three; the six-character code by its start from three; the full id only
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

  /** Enter: a code (or a QR's text) is checked in; a name with exactly one match is that person. */
  const submitQuery = () => {
    const looksLikeCode = /^cfc?1\./i.test(query.trim()) || /^[0-9a-f]{6}$/.test(normaliseCheckInCode(query)) || /^[0-9a-f-]{36}$/i.test(query.trim());
    if (looksLikeCode) return void checkInCode(query);
    if (memberHits.length + coachHits.length === 1) {
      return memberHits.length ? void doCheckIn(memberHits[0], 'manual') : void doCoachCheckIn(coachHits[0], 'manual');
    }
    showToast(memberHits.length + coachHits.length === 0 ? 'Nobody matches that.' : 'More than one match — pick from the list.', 'error');
  };

  /** Undo a check-in (0035): the wrong person scanned. Only today's — what RLS allows. */
  const handleUndo = async () => {
    if (!toUndo) return;
    try {
      await deleteCheckIn(toUndo.id);
      showToast(`Check-in removed for ${nameOf(toUndo.member_id)}`, 'success');
      if (last?.id === toUndo.id) setLast(null);
      setToUndo(null);
      await loadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not undo that check-in', 'error');
    }
  };
  const undoCoach = async (checkinId: string, name: string) => {
    try {
      await undoCoachCheckin(checkinId);
      showToast(`Check-in removed for ${name}`, 'success');
      if (last?.id === checkinId) setLast(null);
      setCoaches(await listDoorCoaches().catch(() => coaches));
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not undo that check-in', 'error');
    }
  };

  /** Exports what the log shows, built from the real row shape. */
  const exportLog = () => {
    if (logRecords.length === 0) return showToast('Nothing to export — nobody has checked in today', 'error');
    exportToCSV(logRecords.map((r) => ({
      Date: localDateKey(r.check_in_time), Time: clock(r.check_in_time), Member: nameOf(r.member_id), 'Check-in Code': formatCheckInCode(r.member_id),
      How: WAY_LABEL[wayOf(r)], Membership: whoOf[r.member_id]?.plan ?? '', Activity: r.activity ?? '', 'Tagged by': r.activity_by ?? '', By: byOf(r),
    })), `attendance_${todayStr}`, false);
  };

  if (loading) return <div className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Loading attendance…</div>;

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
  const maxHour = Math.max(1, ...perHour);
  const weekShare = activeMembers ? Math.min(100, Math.round((weekUnique / activeMembers) * 100)) : null;
  const scanned = byWay.kiosk + byWay.desk;
  // The check-in just taken here, or else the newest one today — so the desk always sees the latest, with Undo.
  const newest = today.reduce<AttendanceRow | null>((m, r) => (!m || r.check_in_time > m.check_in_time ? r : m), null);
  const shown = last ?? (newest ? { kind: 'member' as const, id: newest.id, name: nameOf(newest.member_id), at: newest.check_in_time, activity: newest.activity, by: newest.activity_by ?? null } : null);

  return (
    <div className="att" data-attendance-today>
      <AttHead counts={{ today: today.length, walkIns: walkIns ? liveWalkIns.length : counts.walkIns }}
        sub={<><span className="a-live">Live</span>&nbsp; {longDate}{closesAt ? ` · open until ${closesAt}` : ''}</>} />
      <OfflineScans onRecorded={reloadAfterSend} />

      <div className="a-grid flex-none" style={{ gridTemplateColumns: 'minmax(0,1.5fr) minmax(0,1fr)' }}>
        {/* ── Check someone in ── */}
        <div className="a-card glow" data-checkin-box>
          <div className="a-ct"><h3><ScanLine size={16} />Check someone in</h3><small>scan, type a name, or the code under their QR</small></div>
          <div style={{ display: 'flex', gap: 10 }}>
            <label className="a-input big" style={{ flex: 1 }}>
              <Search size={19} />
              <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submitQuery()}
                placeholder="Name, email or code (A3F 92B)" aria-label="Check-in code or name" />
              {query && <span className="a-kbd">Enter ↵</span>}
            </label>
            <button type="button" className="a-btn violet" style={{ padding: '0 20px', fontSize: 13 }} onClick={() => setIsScannerOpen(true)} data-scan-qr
              data-tip="Open the camera to scan a member's or coach's code"><QrCode size={19} />Scan QR</button>
          </div>

          {/* What the box found — members, and coaches when the owner has coach check-in on. A fixed box that scrolls itself. */}
          <div className="a-scroll" data-quick-list style={{ marginTop: 10, borderRadius: 14, background: '#0f0f19', border: '1px solid var(--a-line)', padding: '4px 12px', height: 96 }}>
            {!q && shown ? (
            <div className="a-toast" style={{ margin: '-4px -12px', height: 'calc(100% + 8px)', borderRadius: 13, border: 0 }} data-last-checkin>
              <span className="ok"><Check size={16} /></span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <b style={{ fontSize: 13 }}>{shown.name} is in</b>
                <div className="a-sub truncate">{clock(shown.at)}{shown.kind === 'coach' ? ' · coach' : shown.activity ? ` · ${shown.activity} · ${shown.by === 'member' ? 'their pick' : 'set at desk'}` : ''}{!last ? ' · the latest today' : ''}</div>
              </div>
              <button type="button" className="a-btn ghost sm" onClick={() => {
                if (shown.kind === 'coach') return void undoCoach(shown.id, shown.name);
                const row = today.find((r) => r.id === shown.id);
                if (row) setToUndo(row);
              }}>Undo</button>
            </div>
            ) : !q ? (
              <p className="a-sub h-full grid place-items-center text-center" style={{ fontSize: 12 }}>
                Start typing to find a member{door?.coachCheckin ? ' or a coach' : ''}. A scanned or typed code checks them in at once.
              </p>
            ) : memberHits.length + coachHits.length === 0 ? (
              <p className="a-sub h-full grid place-items-center" style={{ fontSize: 12 }}>No members found</p>
            ) : (
              <>
                {coachHits.slice(0, 5).map((c) => (
                  <div key={c.id} className="a-row" data-quick-coach>
                    <Av name={c.name} photo={c.photo} />
                    <div className="t"><b>{c.name}</b><small><span className="a-dot a" /> Coach · <span className="a-code">{formatCheckInCode(c.id)}</span></small></div>
                    <span className="a-pill a"><Dumbbell size={12} />Coach</span>
                    {c.checkedInAt ? <span className="a-sub">in at {clock(c.checkedInAt)}</span>
                      : <button type="button" className="a-btn amber sm" onClick={() => void doCoachCheckIn(c, 'manual')}>Check in</button>}
                  </div>
                ))}
                {memberHits.slice(0, 20).map((m) => {
                  const w = whoOf[m.profile.id];
                  const name = `${m.profile.first_name} ${m.profile.last_name}`;
                  const pick = picks.get(m.profile.id);
                  const left = w?.expiry ? daysBetween(todayStr, w.expiry) : null;
                  return (
                    <div key={m.profile.id} className="a-row">
                      <Av name={name} photo={m.profile.photo_url} />
                      <div className="t">
                        <b>{name}</b>
                        <small>
                          <span className={`a-dot ${w?.usable ? 'v' : 'a'}`} />
                          {w ? `${w.plan} · ${w.usable ? (left !== null && left <= 7 ? `ends in ${left} day${left === 1 ? '' : 's'}` : 'active') : w.status === 'frozen' ? 'frozen' : 'expired'}` : 'No plan'} ·
                          <span className="a-code">{formatCheckInCode(m.profile.id)}</span>
                        </small>
                      </div>
                      {pick && !activity && <span className="a-pill v" data-tip="What they picked on their QR screen"><Smartphone size={12} />picked {pick}</span>}
                      {inToday.has(m.profile.id) ? <span className="a-sub">already in</span>
                        : <button type="button" className="a-btn amber sm" onClick={() => void doCheckIn(m, 'manual')}>Check in</button>}
                    </div>
                  );
                })}
              </>
            )}
          </div>

          {/* The next check-in's tag: the four used most today, the rest under More. Amber while set, with None to clear.
              The desk's tag beats a member's own pick. */}
          {activityOptions.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 12, flexWrap: 'nowrap', minWidth: 0 }} data-tag-picker>
              <span className="a-lbl inline-flex items-center gap-1.5 flex-none" style={{ marginRight: 3, color: activity ? 'var(--a-a300)' : undefined }}><Tag size={13} />Tag the next check-in</span>
              <div className="flex items-center gap-[7px] min-w-0 overflow-hidden" data-tag-chips>
                <button type="button" className={`a-chip ${activity === '' ? 'v' : ''}`} onClick={() => setActivity('')} aria-pressed={activity === ''}>None</button>
                {[...topTags, ...(activity && !topTags.includes(activity) ? [activity] : [])].map((t) => (
                  <button key={t} type="button" className={`a-chip ${activity === t ? 'on' : ''}`} onClick={() => setActivity(activity === t ? '' : t)} aria-pressed={activity === t}>
                    {activity === t && <Check size={12} />}{t}{tagCount[t] ? <em>{tagCount[t]}</em> : null}
                  </button>
                ))}
              </div>
              {activityOptions.length > topTags.length && (
                <select className="a-chip flex-none" value="" onChange={(e) => e.target.value && setActivity(e.target.value)} aria-label="More activities" data-tag-select>
                  <option value="">More…</option>
                  {activityOptions.filter((o) => !topTags.includes(o)).map((o) => <option key={o} value={o}>{o}{tagCount[o] ? ` (${tagCount[o]})` : ''}</option>)}
                </select>
              )}
            </div>
          )}

        </div>

        {/* ── At the door ── */}
        <div className="a-card" data-at-the-door>
          <div className="a-ct"><h3><DoorOpen size={16} />At the door</h3><small>screens for the gym floor</small></div>
          <div className="a-grid" style={{ gridTemplateColumns: '1fr 1fr', flex: 1 }}>
            <div className="a-door" data-door-screen="kiosk">
              {/* What the kiosk did today — never a "Running" it cannot know. */}
              <div className="a-screen"><span className="a-qrm"><QrCode size={24} /></span></div>
              <div><div className="flex items-center justify-between gap-2"><b>Kiosk</b>
                <span className={`a-status ${kioskRows.length ? '' : 'off'}`} style={{ position: 'static' }} data-kiosk-status>{kioskRows.length ? `${kioskRows.length} today · last ${clock(lastKiosk!)}` : 'No scans yet'}</span></div><div className="a-sub">Members scan their own QR on a tablet by the door{door?.coachCheckin ? ' — coaches too' : ''}.</div></div>
              <button type="button" className="a-btn amber" style={{ marginTop: 'auto' }} onClick={() => navigate('/kiosk')}><Tablet size={16} />Open kiosk</button>
            </div>
            <div className="a-door" data-door-screen="tv">
              <div className="a-screen"><div className="a-tv"><span /><span /><span /><span /><span /></div></div>
              <div><b>Lobby TV</b><div className="a-sub">Today’s classes, records and the gym goal, big.</div></div>
              <button type="button" className="a-btn" style={{ marginTop: 'auto' }} onClick={() => navigate('/tv')}><MonitorPlay size={16} />Open lobby TV</button>
            </div>
          </div>
          {door?.coachCheckin ? (
            <button type="button" className="a-row text-left w-full" style={{ marginTop: 8, borderTop: '1px solid var(--a-border)', paddingTop: 8, paddingBottom: 0 }}
              onClick={() => setCoachesOpen(true)} data-coaches-row>
              <span className="a-ic"><UserCheck size={15} /></span>
              <div className="t">
                <b>{coachesIn.length} of {coaches.length} coaches in</b>
                <small>{coachesIn.length ? coachesIn.map((c) => `${c.name} ${clock(c.checkedInAt!)}`).join(' · ') : 'Nobody yet today — they scan their own QR'}</small>
              </div>
              <div style={{ display: 'flex' }}>
                {coachesIn.slice(0, 3).map((c, i) => <span key={c.id} style={{ marginLeft: i ? -8 : 0, borderRadius: 999, border: '2px solid var(--a-surface)' }}><Av name={c.name} photo={c.photo} small /></span>)}
              </div>
            </button>
          ) : door ? (
            <Link to="/settings?tab=gym" className="a-row" style={{ marginTop: 8, borderTop: '1px solid var(--a-border)', paddingTop: 8, paddingBottom: 0 }} data-coaches-off>
              <span className="a-ic"><UserCheck size={15} /></span>
              <div className="t"><b>Coaches can check in too</b><small>The owner turns it on in Settings → Gym Information</small></div>
            </Link>
          ) : null}
        </div>
      </div>

      {/* ── Four cards ── */}
      <div className="a-grid flex-none" style={{ gridTemplateColumns: 'repeat(4,minmax(0,1fr))' }} data-stats-strip>
        <div className="a-card">
          <div className="a-lbl">Checked in today</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <div className="a-num">{today.length}</div>
            <span className="a-sub"><span className={diff >= 0 ? 'a-up' : 'a-dn'}>{diff >= 0 ? '▲' : '▼'} {Math.abs(diff)}</span> vs last {lastWeekday}</span>
          </div>
          <div className="a-spark" data-tip={`Check-ins by hour, ${hours.open}:00–${hours.close}:00`}>
            {perHour.map((n, i) => <i key={i} className={hours.open + i === nowHour ? 'now' : ''} style={{ height: `${Math.max(6, (n / maxHour) * 100)}%`, opacity: hours.open + i > nowHour ? 0.35 : 1 }} />)}
          </div>
        </div>
        <div className="a-card">
          <div className="a-lbl">How they came in</div>
          <div className="a-num">{scanned} <span style={{ fontSize: 15, color: 'var(--a-text2)', fontWeight: 600 }}>scanned</span></div>
          <div className="a-stack">
            {today.length > 0 && <><i style={{ flex: byWay.kiosk, background: '#9578fb' }} /><i style={{ flex: byWay.desk, background: '#6447c7' }} /><i style={{ flex: byWay.typed, background: '#3b3560' }} /></>}
          </div>
          <div className="a-legend">
            {(['kiosk', 'desk', 'typed'] as const).map((k) => (
              <button key={k} type="button" onClick={() => { setWay(way === k ? 'all' : k); setLogPage(1); }} style={way === k ? { color: '#fff' } : undefined} data-tip="Show only these in the log">
                <span className={`a-dot ${k === 'kiosk' ? 'v' : k === 'desk' ? 'd' : 'm'}`} />{WAY_LABEL[k]} {byWay[k]}
              </button>
            ))}
          </div>
        </div>
        <button type="button" className="a-card press text-left" onClick={() => navigate('/attendance/walk-ins')} data-tip="Open Walk-ins">
          <div className="a-lbl">Walk-ins today</div>
          <div className="a-num">{walkIns ? liveWalkIns.length : '—'}</div>
          <div className="a-sub inline-flex items-center gap-1.5" style={{ marginTop: 6 }}>
            <Banknote size={13} />{walkIns ? `${peso(walkCash)} in the drawer · ${packVisits} pack visit${packVisits === 1 ? '' : 's'}` : 'Walk-ins are not set up'}
          </div>
        </button>
        <button type="button" className="a-card press text-left" onClick={() => navigate('/attendance-history')} data-tip="Open History">
          <div className="a-lbl">Members this week</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}><div className="a-num">{weekUnique}</div><span className="a-sub">of {activeMembers} active</span></div>
          {weekShare !== null && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}><div className="a-bar"><i style={{ width: `${weekShare}%` }} /></div><span className="a-sub">{weekShare}%</span></div>
          )}
        </button>
      </div>

      {/* ── Today's log ── */}
      <div className="a-card" style={{ flex: 1 }} data-today-log>
        <div className="a-ct">
          <h3><ListChecks size={16} />Today’s check-ins</h3>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {(['all', 'kiosk', 'desk', 'typed'] as Way[]).map((k) => (
              <button key={k} type="button" className={`a-chip ${way === k ? 'v' : ''}`} onClick={() => { setWay(k); setLogPage(1); }} data-way={k}>
                {WAY_LABEL[k]} <em>{k === 'all' ? today.length : byWay[k]}</em>
              </button>
            ))}
            <label className="a-input sm" style={{ width: 210 }}><Search size={14} />
              <input value={logSearch} onChange={(e) => { setLogSearch(e.target.value); setLogPage(1); }} placeholder="Search today…" aria-label="Search today" /></label>
            <button type="button" className="a-btn sm" onClick={exportLog} data-tip="Export what the log shows as CSV"><Download size={14} />Export</button>
            <button type="button" className="a-btn sm" onClick={() => setFullOpen(true)} data-open-full-log data-tip="Every check-in today in one window"><Maximize2 size={14} />View all</button>
          </div>
        </div>
        <div ref={fitRef} className="a-scroll" style={{ flex: 1 }} data-rd-table>
          <table className="a-table">
            <thead><tr><th>Time</th><th>Member</th><th>How</th><th>Activity</th><th>By</th><th /></tr></thead>
            <tbody>
              {logRecords.slice((page - 1) * perPage, page * perPage).map((r) => (
                <LogRow key={r.id} row={r} name={nameOf(r.member_id)} photo={memberById[r.member_id]?.profile.photo_url} plan={whoOf[r.member_id]?.plan}
                  by={byOf(r)} onUndo={() => setToUndo(r)} height={logRecords.length > perPage ? fitRowHeight : undefined} />
              ))}
            </tbody>
          </table>
          {logRecords.length === 0 && (
            <div className="a-sub text-center" style={{ padding: '22px 0', fontSize: 12.5 }}>
              {today.length === 0 ? 'Nobody has checked in today yet. When members check in, they’ll appear here.' : 'No check-ins match these filters.'}
              {today.length > 0 && <> <button type="button" className="a-link" style={{ color: 'var(--a-p300)' }} onClick={() => { setWay('all'); setLogSearch(''); setLogPlan('all'); }}>Clear filters</button></>}
            </div>
          )}
        </div>
        {logRecords.length > 0 && (
          <div className="a-sub" style={{ paddingTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }} data-rd-footer>
            <span>Showing {(page - 1) * perPage + 1}–{Math.min(logRecords.length, page * perPage)} of {logRecords.length} check-ins today</span>
            <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {pages > 1 && <>
                <button type="button" className="a-chip" style={{ padding: '3px 8px' }} disabled={page <= 1} onClick={() => setLogPage(page - 1)} aria-label="Previous page"><ChevronLeft size={13} /></button>
                <span>{page} / {pages}</span>
                <button type="button" className="a-chip" style={{ padding: '3px 8px' }} disabled={page >= pages} onClick={() => setLogPage(page + 1)} aria-label="Next page"><ChevronRight size={13} /></button>
              </>}
              <Link to="/attendance-history" className="a-link" style={{ color: 'var(--a-p300)', marginLeft: 8 }}>Other days →</Link>
            </span>
          </div>
        )}
      </div>

      <FloatingWindow open={fullOpen} onClose={() => setFullOpen(false)} title="Today's check-ins" icon={Users} count={logRecords.length} data-full-log
        tools={(
          <div className="att" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 'auto', overflow: 'visible' }}>
            {(['all', 'kiosk', 'desk', 'typed'] as Way[]).map((k) => (
              <button key={k} type="button" className={`a-chip ${way === k ? 'v' : ''}`} onClick={() => setWay(k)}>{WAY_LABEL[k]} <em>{k === 'all' ? today.length : byWay[k]}</em></button>
            ))}
            <select className="a-chip" value={logPlan} onChange={(e) => setLogPlan(e.target.value)} aria-label="Filter by membership">
              <option value="all">All memberships</option>
              {plans.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <label className="a-input sm" style={{ width: 220 }}><Search size={14} />
              <input autoFocus value={logSearch} onChange={(e) => setLogSearch(e.target.value)} placeholder="Search today…" aria-label="Search today" /></label>
            <button type="button" className="a-btn sm" onClick={exportLog}><Download size={14} />Export</button>
          </div>
        )}>
        <div className="att" style={{ height: 'auto', overflow: 'visible', padding: '0 12px' }}>
          <table className="a-table">
            <thead><tr><th>Time</th><th>Member</th><th>How</th><th>Activity</th><th>By</th><th /></tr></thead>
            <tbody>
              {logRecords.map((r) => (
                <LogRow key={r.id} row={r} name={nameOf(r.member_id)} photo={memberById[r.member_id]?.profile.photo_url} plan={whoOf[r.member_id]?.plan}
                  by={byOf(r)} onUndo={() => setToUndo(r)} />
              ))}
            </tbody>
          </table>
          {logRecords.length === 0 && <p className="a-sub text-center" style={{ padding: 24 }}>{today.length === 0 ? 'Nobody has checked in today yet.' : 'No check-ins match these filters.'}</p>}
        </div>
      </FloatingWindow>

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
                ? <button type="button" className="a-btn ghost sm" onClick={() => void undoCoach(c.checkinId!, c.name)}>Undo</button>
                : <button type="button" className="a-btn amber sm" onClick={() => void doCoachCheckIn(c, 'manual')}>Check in</button>}
            </div>
          ))}
        </div>
      </DetailSheet>

      <ConfirmDialog
        isOpen={!!toUndo}
        onClose={() => setToUndo(null)}
        onConfirm={handleUndo}
        title="Undo Check-in"
        message={toUndo
          ? `Remove ${nameOf(toUndo.member_id)}'s ${clock(toUndo.check_in_time)} check-in? ` +
            `Use this when the wrong member was scanned — the visit stops counting toward their training days and toward today's totals. They can simply check in again.`
          : ''}
        confirmText="Undo it"
        type="danger"
      />
    </div>
  );
}
