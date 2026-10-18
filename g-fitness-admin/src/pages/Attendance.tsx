import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useEscapeToClose } from '../hooks/useEscapeToClose';
import { Link, useNavigate } from 'react-router-dom';
import QRScanner from '../components/ui/QRScanner';
import DetailSheet from '../components/ui/DetailSheet';
import { useFitRows } from '../hooks/useFitRows';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import {
  QrCode, Users, Download, Undo2, Calendar, MonitorPlay, Tablet, Tag, History, Keyboard, CheckCircle2,
  UserCheck, Footprints, CalendarDays, ScanLine, Dumbbell, ArrowRight, Maximize2, X,
} from 'lucide-react';
import { showToast } from '../utils/toast';
import { checkInCodeOf, formatCheckInCode, normaliseCheckInCode } from '../utils/checkInCode';
import { todayKey, localDateKey, addDays } from '../utils/dates';
import { exportToCSV } from '../utils/exportUtils';
import { supabase } from '../lib/supabaseClient';
import { listMembers, type MemberWithProfile } from '../lib/api/members';
import { listMemberships } from '../lib/api/memberships';
import { listAttendanceBetween, deleteCheckIn } from '../lib/api/attendance';
import { getGymSettings } from '../lib/api/settings';
import { getDoorSettings, listDoorCoaches, listTodayPicks, undoCoachCheckin, type DoorCoach, type DoorSettings } from '../lib/api/door';
import { performCheckIn, performCoachCheckIn, resolveCheckInCode } from '../services/checkInService';
import type { AttendanceRow } from '../types/db';
import {
  RdHeader, RdCard, SearchField, RdSelect, RdButton, Pill, RdTable, Tr, Td, TableFooter, EmptyBlock, Initials,
} from '../components/ui/rd';
import { ATTENDANCE_TABS, TONE, type Tone } from '../components/ui/rdTokens';

const ITEMS_PER_PAGE = 10;
const time = (iso: string) => new Date(iso).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });

/** A membership's state, worded for the desk, with its pill colour. */
function memberState(status: string | undefined): { label: string; tone: Tone } {
  switch (status) {
    case 'active': return { label: 'Active', tone: 'green' };
    case 'frozen': return { label: 'Frozen', tone: 'amber' };
    case 'expired': return { label: 'Expired', tone: 'amber' };
    case 'cancelled': return { label: 'Cancelled', tone: 'gray' };
    case 'pending': return { label: 'Awaiting payment', tone: 'amber' };
    default: return { label: 'No plan', tone: 'gray' };
  }
}

/** Where and how a check-in was taken, as the log says it (0200 adds the kiosk). */
function HowPill({ row }: { row: AttendanceRow }) {
  if (row.source === 'kiosk') return <Pill tone="violet" icon={Tablet}>Kiosk</Pill>;
  if (row.method === 'qr') return <Pill tone="violet" icon={ScanLine}>{row.source === 'desk' ? 'Desk scan' : 'Scanned'}</Pill>;
  return <Pill tone="gray" icon={Keyboard}>Typed</Pill>;
}

/** One of the door's two screens: what it is for, how it is doing, and the button that opens it. */
function DoorScreen({ kind, title, body, status, action, onOpen }: {
  kind: 'kiosk' | 'tv'; title: string; body: string; status: React.ReactNode; action: string; onOpen: () => void;
}) {
  const Icon = kind === 'kiosk' ? Tablet : MonitorPlay;
  return (
    <div className="rounded-2xl p-3 flex flex-col gap-2 min-w-0" data-door-screen={kind}
      style={{ background: 'radial-gradient(120% 120% at 0% 0%, rgba(124,58,237,0.16), transparent 60%), rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="w-9 h-9 rounded-xl grid place-items-center flex-none" style={{ background: kind === 'kiosk' ? TONE.amber.bg : TONE.violet.bg, border: `1px solid ${kind === 'kiosk' ? TONE.amber.line : TONE.violet.line}` }}>
          <Icon size={18} style={{ color: kind === 'kiosk' ? TONE.amber.fg : TONE.violet.fg }} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[15px] font-bold text-white">{title}</p>
            <span className="text-[11.5px] truncate" style={{ color: 'var(--color-text-secondary)' }}>{status}</span>
          </div>
          <p className="text-[12px] leading-snug line-clamp-2" title={body} style={{ color: 'var(--color-text-secondary)' }}>{body}</p>
        </div>
      </div>
      <RdButton size="sm" variant={kind === 'kiosk' ? 'amber' : 'secondary'} icon={Icon} onClick={onOpen} className="mt-auto w-full justify-center !h-10 !text-[14px]">{action}</RdButton>
    </div>
  );
}

/** One cell of the stats strip; a cell that filters or opens something is a button. */
function StripCell({ icon: Icon, label, value, sub, onClick, active, tip, tone = 'violet' }: {
  icon: typeof Users; label: string; value: React.ReactNode; sub: string; onClick?: () => void; active?: boolean; tip?: string; tone?: Tone;
}) {
  const body = (
    <>
      <span className="w-9 h-9 rounded-xl grid place-items-center flex-none" style={{ background: TONE[tone].bg, border: `1px solid ${TONE[tone].line}` }}>
        <Icon size={17} style={{ color: TONE[tone].fg }} />
      </span>
      <span className="min-w-0 text-left">
        <span className="block text-[12.5px] truncate" style={{ color: 'var(--color-text-secondary)' }}>{label}</span>
        <span className="flex items-baseline gap-2 min-w-0">
          <b className="text-[22px] leading-tight text-white tabular-nums">{value}</b>
          <span className="text-[12px] truncate" style={{ color: 'var(--color-text-secondary)' }}>{sub}</span>
        </span>
      </span>
    </>
  );
  const cls = 'flex items-center gap-3 px-4 py-2.5 min-w-0 transition-colors';
  const st: React.CSSProperties = active ? { background: 'rgba(124,58,237,0.16)' } : {};
  return onClick
    ? <button type="button" onClick={onClick} data-tip={tip} aria-pressed={active} className={`${cls} hover:bg-white/[0.03]`} style={st}>{body}</button>
    : <div className={cls}>{body}</div>;
}

/** One row of today's log — the card and the floating window draw the same row. */
function LogRow({ row: r, name, photo, plan, onUndo, height }: {
  row: AttendanceRow; name: string; photo?: string | null; plan?: string; onUndo: () => void; height?: number;
}) {
  return (
    <Tr data-log-row style={{ height }}>
      <Td className="whitespace-nowrap font-semibold">{time(r.check_in_time)}</Td>
      <Td>
        <div className="flex items-center gap-3">
          <Initials name={name} photo={photo} size={34} />
          <div className="min-w-0">
            <p className="font-semibold text-white truncate">{name}</p>
            <p className="text-[12px] font-mono tracking-wider" style={{ color: 'var(--color-secondary)' }}>{formatCheckInCode(r.member_id)}</p>
          </div>
        </div>
      </Td>
      <Td><HowPill row={r} /></Td>
      {/* The activity tag (0018), and whose it is (0200). A dash means nobody picked one — not "no activity". */}
      <Td>
        {r.activity ? (
          <span className="inline-flex items-center gap-2">
            {r.activity}
            {r.activity_by === 'member' && <span data-tag-by="member"><Pill tone="violet">their pick</Pill></span>}
            {r.activity_by === 'desk' && <span data-tag-by="desk"><Pill tone="amber">desk</Pill></span>}
          </span>
        ) : <span style={{ color: 'var(--color-text-muted)' }}>—</span>}
      </Td>
      <Td style={{ color: 'var(--color-text-secondary)' }}>{plan ?? '—'}</Td>
      <Td align="right">
        <RdButton size="sm" variant="ghost" icon={Undo2} onClick={onUndo} data-tip="Undo this check-in">Undo</RdButton>
      </Td>
    </Tr>
  );
}

/**
 * Today's whole log in a floating window over the page (the owner's ask,
 * 2026-10-18): every row at once, scrolling in the window, with the same
 * filters, search, export and undo — no page change, Escape or the scrim closes it.
 */
function FullLog({ open, onClose, total, children, filters }: {
  open: boolean; onClose: () => void; total: number; children: React.ReactNode; filters: React.ReactNode;
}) {
  useEscapeToClose(open, onClose);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-6" onClick={onClose}
      style={{ background: 'rgba(5,4,10,0.72)', backdropFilter: 'blur(6px)' }}>
      <div role="dialog" aria-modal="true" aria-label="Today's check-ins" data-full-log onClick={(e) => e.stopPropagation()}
        className="w-full flex flex-col rounded-2xl overflow-hidden"
        style={{ maxWidth: 1240, height: 'min(88vh, 980px)', background: 'var(--color-surface)', border: '1px solid rgba(139,92,246,0.35)',
          boxShadow: '0 40px 120px -30px rgba(124,58,237,0.6)' }}>
        <div className="flex items-center justify-between gap-3 flex-wrap px-5 py-3.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="flex items-center gap-3">
            <Users size={22} style={{ color: '#A78BFA' }} />
            <h2 className="text-[19px] font-semibold text-white">Today's check-ins</h2>
            <span className="text-[13px] px-2.5 py-0.5 rounded-full tabular-nums" style={{ background: TONE.violet.bg, color: TONE.violet.fg }}>{total}</span>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {filters}
            <button type="button" onClick={onClose} aria-label="Close" className="w-11 h-11 rounded-xl grid place-items-center hover:bg-white/[0.06]"
              style={{ border: '1px solid rgba(255,255,255,0.1)', color: 'var(--color-text-secondary)' }}><X size={18} /></button>
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto rd-fit-scroll" data-full-log-body>{children}</div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Attendance → Today: the desk (redesigned 2026-10-18 from the owner's pick of
 * the v2 mock-ups).
 *
 * One box checks anyone in — scan, a name, or the six-character code under
 * their QR — with the next check-in's activity tag beside it. "At the door"
 * is the kiosk and the lobby TV, big, with the coaches who are in (0200, when
 * the owner turns coach check-in on). The tiles filter the log; the log is
 * today only, and says how each check-in was taken and whose activity tag it
 * carries — the member's own pick, or the desk's (0200). Any other day is History.
 */
export default function Attendance() {
  const navigate = useNavigate();
  const [members, setMembers] = useState<MemberWithProfile[]>([]);
  const [planOf, setPlanOf] = useState<Record<string, { plan: string; status: string }>>({});
  const [allAttendance, setAllAttendance] = useState<AttendanceRow[]>([]);
  const [adminId, setAdminId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [door, setDoor] = useState<DoorSettings | null>(null);
  const [coaches, setCoaches] = useState<DoorCoach[]>([]);
  const [picks, setPicks] = useState<Map<string, string>>(new Map());
  const [walkIns, setWalkIns] = useState<number | null>(null);
  const [closing, setClosing] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [activity, setActivity] = useState('');
  const [activityOptions, setActivityOptions] = useState<string[]>([]);
  const [logPage, setLogPage] = useState(1);
  const [toUndo, setToUndo] = useState<AttendanceRow | null>(null);
  const [coachesOpen, setCoachesOpen] = useState(false);
  /** Today's whole log, floating over the page. */
  const [fullOpen, setFullOpen] = useState(false);
  /** The check-in just taken, with its own Undo — the desk sees it worked without reading the log. */
  const [last, setLast] = useState<{ kind: 'member' | 'coach'; id: string; name: string; at: string; activity: string | null } | null>(null);
  // The log's own filters.
  const [logMethod, setLogMethod] = useState<'all' | 'qr' | 'manual'>('all');
  const [logPlan, setLogPlan] = useState('all');
  const [logSearch, setLogSearch] = useState('');
  /** Rows that fit the log's own box — the page never scrolls (2026-10-11). */
  const fit = useFitRows(ITEMS_PER_PAGE);

  const loadData = async (): Promise<AttendanceRow[]> => {
    try {
      const [memberRows, attendanceRows, { data: { user } }] = await Promise.all([
        listMembers(),
        // The last seven days: today's log and the week's count are all this page shows.
        listAttendanceBetween(addDays(todayKey(), -6), todayKey()),
        supabase.auth.getUser(),
      ]);
      setMembers(memberRows);
      setAllAttendance(attendanceRows);
      setAdminId(user?.id ?? null);
      // Everything below is optional: check-in never depends on it.
      const [ms, settings, d, pk, wv] = await Promise.all([
        listMemberships().catch(() => []),
        getGymSettings().catch(() => null),
        getDoorSettings(),
        listTodayPicks(),
        supabase.rpc('guest_visits_on', { p_day: todayKey() }).then(({ data, error }) => (error ? null : ((data ?? []) as { voided: boolean }[]).filter((v) => !v.voided).length), () => null),
      ]);
      const map: Record<string, { plan: string; status: string }> = {};
      for (const m of ms) if (!map[m.member_id]) map[m.member_id] = { plan: m.membership_plans?.name ?? '—', status: m.status };
      setPlanOf(map);
      setActivityOptions(settings?.activity_options ?? []);
      setClosing(settings?.closing_time ?? null);
      setDoor(d);
      setPicks(pk);
      setWalkIns(wv);
      setCoaches(d?.coachCheckin ? await listDoorCoaches().catch(() => []) : []);
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

  // Manila dates from utils/dates — never the UTC date out of the timestamp.
  const todayStr = todayKey();
  const todayAttendance = useMemo(
    () => allAttendance.filter((a) => localDateKey(a.check_in_time) === todayStr),
    [allAttendance, todayStr],
  );
  const inToday = useMemo(() => new Set(todayAttendance.map((a) => a.member_id)), [todayAttendance]);
  /** Distinct members over the last 7 local days, ending today. */
  const weekUnique = useMemo(() => {
    const from = addDays(todayStr, -6);
    const seen = new Set<string>();
    for (const a of allAttendance) {
      const k = localDateKey(a.check_in_time);
      if (k >= from && k <= todayStr) seen.add(a.member_id);
    }
    return seen.size;
  }, [allAttendance, todayStr]);

  const plans = useMemo(() => [...new Set(Object.values(planOf).map((p) => p.plan))].filter((p) => p !== '—').sort(), [planOf]);
  const logRecords = useMemo(() => {
    const q = logSearch.trim().toLowerCase();
    return todayAttendance
      .filter((r) => logMethod === 'all' || r.method === logMethod)
      .filter((r) => logPlan === 'all' || planOf[r.member_id]?.plan === logPlan)
      .filter((r) => !q || nameOf(r.member_id).toLowerCase().includes(q) || (r.activity ?? '').toLowerCase().includes(q)
        || checkInCodeOf(r.member_id).includes(q.replace(/[\s-]/g, '')))
      .sort((a, b) => b.check_in_time.localeCompare(a.check_in_time));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayAttendance, logMethod, logPlan, logSearch, planOf, memberById]);
  const perPage = fit.perPage;
  const page = Math.min(logPage, Math.max(1, Math.ceil(logRecords.length / perPage)));

  const doCheckIn = async (member: MemberWithProfile, method: 'qr' | 'manual') => {
    const picked = picks.get(member.profile.id);
    const result = await performCheckIn(member, method, {
      alreadyInToday: inToday.has(member.profile.id),
      adminId,
      activity: activity || undefined,
      where: 'desk',
      picked,
    });
    if (!result.ok) { showToast(result.message, 'error'); return; }
    showToast(
      result.points === null
        ? `${member.profile.first_name} checked in successfully!`
        : `${member.profile.first_name} checked in · ${result.points.toLocaleString('en-PH')} CORE Points`,
      'success',
    );
    setQuery('');
    const rows = await loadData();
    const row = rows.find((r) => r.member_id === member.profile.id && localDateKey(r.check_in_time) === todayKey());
    setLast(row ? { kind: 'member', id: row.id, name: `${member.profile.first_name} ${member.profile.last_name}`, at: row.check_in_time, activity: row.activity } : null);
  };

  const doCoachCheckIn = async (coach: DoorCoach, method: 'qr' | 'manual') => {
    const res = await performCoachCheckIn(coach, method, 'desk');
    if (!res.ok) { showToast(res.message, 'error'); return; }
    showToast(`${coach.name.split(' ')[0]} (coach) checked in`, 'success');
    setQuery('');
    const fresh = await listDoorCoaches().catch(() => coaches);
    setCoaches(fresh);
    const c = fresh.find((x) => x.id === coach.id);
    setLast(c?.checkinId ? { kind: 'coach', id: c.checkinId, name: coach.name, at: c.checkedInAt ?? new Date().toISOString(), activity: null } : null);
  };

  /** A scanned or typed code — the member app's QR, a coach's QR, the six-character code, a pasted id. */
  const checkInCode = async (raw: string) => {
    const code = raw.trim();
    if (!code) return showToast('Scan a code or type one in', 'error');
    const found = await resolveCheckInCode(code, members, coaches);
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
    exportToCSV(
      logRecords.map((r) => ({
        Date: localDateKey(r.check_in_time),
        Time: new Date(r.check_in_time).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' }),
        Member: nameOf(r.member_id),
        'Check-in Code': formatCheckInCode(r.member_id),
        Method: r.method,
        Where: r.source ?? '',
        Membership: planOf[r.member_id]?.plan ?? '',
        Activity: r.activity ?? '',
        'Tagged by': r.activity_by ?? '',
      })),
      `attendance_${todayStr}`,
      false,
    );
  };

  if (loading) {
    return <div className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Loading attendance…</div>;
  }

  const qrCount = todayAttendance.filter((a) => a.method === 'qr').length;
  const manualCount = todayAttendance.filter((a) => a.method === 'manual').length;
  const kioskCount = todayAttendance.filter((a) => a.source === 'kiosk').length;
  const share = members.length ? Math.round((todayAttendance.length / members.length) * 100) : null;
  const todayLabel = new Date().toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  const longDate = new Date().toLocaleDateString('en-PH', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Manila' });
  const closesAt = closing ? new Date(`2000-01-01T${closing}`).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' }) : null;
  const coachesIn = coaches.filter((c) => c.checkedInAt);

  return (
    <div className="rd-fit" data-attendance-today>
      <RdHeader title="Attendance" subtitle={`Live · ${longDate}${closesAt ? ` · open until ${closesAt}` : ''}`} tabs={ATTENDANCE_TABS}
        actions={(
          <Link to="/attendance-history" className="h-12 px-4 rounded-xl inline-flex items-center gap-3 text-[15px] text-white"
            style={{ border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.02)' }} data-tip="Another day? Open History">
            <Calendar size={18} style={{ color: 'var(--color-text-secondary)' }} /> {todayLabel}
          </Link>
        )} />

      <div className="grid gap-4 flex-none" style={{ gridTemplateColumns: 'minmax(0, 1.45fr) minmax(0, 1fr)' }}>
        {/* ── Check someone in ── */}
        <RdCard glow className="p-4 flex flex-col gap-2.5 min-w-0" data-checkin-box>
          <div className="flex gap-2.5">
            <label className="flex-1 min-w-0 h-12 px-4 rounded-xl flex items-center gap-3" style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(139,92,246,0.45)' }}>
              <ScanLine size={19} style={{ color: '#A78BFA' }} />
              <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submitQuery()}
                placeholder="Check someone in — name, email or code (A3F 92B)" aria-label="Check-in code or name"
                className="flex-1 min-w-0 bg-transparent outline-none text-[15.5px] text-white" />
              {query && <kbd className="text-[11px] px-1.5 py-0.5 rounded" style={{ border: '1px solid rgba(255,255,255,0.15)', color: 'var(--color-text-secondary)' }}>Enter ↵</kbd>}
            </label>
            <button type="button" onClick={() => setIsScannerOpen(true)} data-scan-qr data-tip="Open the camera to scan a member's or coach's code"
              className="flex items-center gap-2 px-4 h-12 rounded-xl text-white transition-all hover:brightness-110 flex-none"
              style={{ background: 'linear-gradient(180deg,#8B5CF6,#7C3AED)', boxShadow: '0 12px 30px -12px rgba(124,58,237,0.9)' }}>
              <QrCode size={20} /><b className="text-[14.5px] whitespace-nowrap">Scan QR</b>
            </button>
          </div>

          {/* What the box found — members, and coaches when the owner has coach check-in on. */}
          <div className="h-[86px] flex-none overflow-y-auto rounded-xl" data-quick-list style={{ border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.015)' }}>
            {!q && last ? (
              <div className="h-full flex items-center gap-3 px-3" data-last-checkin style={{ background: 'rgba(124,58,237,0.12)' }}>
                <CheckCircle2 size={24} style={{ color: '#A78BFA' }} />
                <p className="flex-1 min-w-0 text-[14px] truncate">
                  <b className="text-white">{last.name} is in</b>
                  <span style={{ color: 'var(--color-text-secondary)' }}> · {time(last.at)}{last.kind === 'coach' ? ' · coach' : last.activity ? ` · ${last.activity}` : ''}</span>
                </p>
                <RdButton size="sm" variant="ghost" icon={Undo2} onClick={() => {
                  if (last.kind === 'coach') return void undoCoach(last.id, last.name);
                  const row = todayAttendance.find((r) => r.id === last.id);
                  if (row) setToUndo(row);
                }}>Undo</RdButton>
              </div>
            ) : !q ? (
              <p className="h-full grid place-items-center text-[13.5px] px-4 text-center" style={{ color: 'var(--color-text-muted)' }}>
                Start typing to find a member{door?.coachCheckin ? ' or a coach' : ''}. A scanned or typed code checks them in at once.
              </p>
            ) : memberHits.length + coachHits.length === 0 ? (
              <p className="h-full grid place-items-center text-[13.5px]" style={{ color: 'var(--color-text-muted)' }}>No members found</p>
            ) : (
              <>
                {coachHits.slice(0, 5).map((c) => (
                  <div key={c.id} className="flex items-center gap-3 px-3 py-1.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }} data-quick-coach>
                    <Initials name={c.name} photo={c.photo} size={34} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] font-semibold text-white truncate">{c.name} <span className="ml-1 align-middle"><Pill tone="amber" icon={Dumbbell}>Coach</Pill></span></p>
                      <p className="text-[12px] font-mono tracking-wider" style={{ color: 'var(--color-secondary)' }}>{formatCheckInCode(c.id)}</p>
                    </div>
                    {c.checkedInAt
                      ? <span className="text-[12.5px]" style={{ color: 'var(--color-text-secondary)' }}>in at {time(c.checkedInAt)}</span>
                      : <RdButton variant="amber" size="sm" onClick={() => void doCoachCheckIn(c, 'manual')}>Check in</RdButton>}
                  </div>
                ))}
                {memberHits.slice(0, 20).map((m) => {
                  const st = memberState(planOf[m.profile.id]?.status);
                  const name = `${m.profile.first_name} ${m.profile.last_name}`;
                  const pick = picks.get(m.profile.id);
                  return (
                    <div key={m.profile.id} className="flex items-center gap-3 px-3 py-1.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <Initials name={name} photo={m.profile.photo_url} size={34} />
                      <div className="min-w-0 flex-1">
                        <p className="text-[14px] font-semibold text-white truncate">{name}</p>
                        <p className="text-[12px] flex items-center gap-2 truncate">
                          <span style={{ color: TONE[st.tone].fg }}>{planOf[m.profile.id]?.plan ?? 'No plan'} · {st.label}</span>
                          {/* The code the member reads off their phone — to confirm the right person. */}
                          <span className="font-mono tracking-wider" style={{ color: 'var(--color-secondary)' }}>{formatCheckInCode(m.profile.id)}</span>
                        </p>
                      </div>
                      {pick && !activity && <span data-tip="What they picked on their QR screen"><Pill tone="violet" icon={Tag}>picked {pick}</Pill></span>}
                      {inToday.has(m.profile.id)
                        ? <span className="text-[12.5px]" style={{ color: 'var(--color-text-secondary)' }}>already in</span>
                        : <RdButton variant="amber" size="sm" onClick={() => void doCheckIn(m, 'manual')}>Check in</RdButton>}
                    </div>
                  );
                })}
              </>
            )}
          </div>

          {/* Applies to whichever check-in comes next — handy when a class arrives together. A dropdown
              (2026-10-18): a gym can list thirty activities. Amber while set, so it is never left on
              unseen, with a Clear beside it. The desk's tag beats a member's own pick. */}
          {activityOptions.length > 0 && (
            <div className="flex items-center gap-3" data-tag-picker>
              <span className="text-[12.5px] inline-flex items-center gap-1.5 flex-none whitespace-nowrap" style={{ color: activity ? TONE.amber.fg : 'var(--color-text-secondary)' }}>
                <Tag size={14} />Tag the next check-in
              </span>
              <select value={activity} onChange={(e) => setActivity(e.target.value)} aria-label="Tag the next check-in with an activity" data-tag-select
                className="h-8 flex-1 min-w-0 px-3 rounded-lg text-[13.5px] font-semibold outline-none"
                style={activity
                  ? { background: TONE.amber.bg, color: TONE.amber.fg, border: `1px solid ${TONE.amber.line}`, colorScheme: 'dark' }
                  : { background: 'rgba(255,255,255,0.03)', color: 'var(--color-text-secondary)', border: '1px solid rgba(255,255,255,0.1)', colorScheme: 'dark' }}>
                <option value="">None — their own pick, or untagged</option>
                {activityOptions.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
              </select>
              {activity && <RdButton size="sm" variant="ghost" className="!h-8" onClick={() => setActivity('')}>Clear</RdButton>}
            </div>
          )}
        </RdCard>

        {/* ── At the door ── */}
        <RdCard className="p-4 flex flex-col gap-2.5 min-w-0" data-at-the-door>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[16px] font-bold text-white inline-flex items-center gap-2"><MonitorPlay size={18} style={{ color: '#A78BFA' }} />At the door</h2>
            {door?.coachCheckin ? (
              <button type="button" onClick={() => setCoachesOpen(true)} data-coaches-row
                data-tip={coachesIn.length ? coachesIn.map((c) => `${c.name.split(' ')[0]} ${time(c.checkedInAt!)}`).join(' · ') : 'Nobody yet today — they scan their own QR'}
                className="h-8 pl-1.5 pr-3 rounded-full inline-flex items-center gap-2 text-[13px] font-semibold transition-colors hover:brightness-110"
                style={{ background: TONE.amber.bg, color: TONE.amber.fg, border: `1px solid ${TONE.amber.line}` }}>
                <span className="flex -space-x-2">
                  {coachesIn.length ? coachesIn.slice(0, 3).map((c) => <Initials key={c.id} name={c.name} photo={c.photo} size={22} />) : <UserCheck size={16} className="ml-1" />}
                </span>
                {coachesIn.length} of {coaches.length} coaches in{coachesIn[0] ? ` · ${coachesIn[0].name.split(' ')[0]} ${time(coachesIn[0].checkedInAt!)}` : ''}
                <ArrowRight size={14} />
              </button>
            ) : door ? (
              <Link to="/settings?tab=gym" className="text-[12.5px] inline-flex items-center gap-1.5" data-coaches-off style={{ color: 'var(--color-text-secondary)' }}
                data-tip="The owner turns it on in Settings → Gym Information">
                <UserCheck size={15} /> Coaches can check in too
              </Link>
            ) : <span className="text-[12.5px]" style={{ color: 'var(--color-text-secondary)' }}>screens for the gym floor</span>}
          </div>
          <div className="grid grid-cols-2 gap-3 flex-1 min-h-0">
            <DoorScreen kind="kiosk" title="Kiosk" status={`${kioskCount} today`} action="Open kiosk" onOpen={() => navigate('/kiosk')}
              body={`Members scan their own QR on a tablet by the door${door?.coachCheckin ? ' — coaches too' : ''}.`} />
            <DoorScreen kind="tv" title="Lobby TV" status="any screen" action="Open lobby TV" onOpen={() => navigate('/tv')}
              body="Today's classes, records and the gym goal, big." />
          </div>
        </RdCard>
      </div>

      {/* ── The strip: each cell filters the log, or opens the page it counts ── */}
      <RdCard className="grid flex-none overflow-hidden divide-x divide-white/[0.06]" style={{ gridTemplateColumns: 'repeat(5, minmax(0, 1fr))' }} data-stats-strip>
        <StripCell icon={Users} label="Checked in today" value={todayAttendance.length}
          sub={share === null ? 'no members yet' : `${share}% of ${members.length}`} />
        <StripCell icon={QrCode} label="Scanned" value={qrCount} sub={`${kioskCount} kiosk · ${qrCount - Math.min(qrCount, kioskCount)} desk`}
          onClick={() => { setLogMethod(logMethod === 'qr' ? 'all' : 'qr'); setLogPage(1); }} active={logMethod === 'qr'} tip="Show only these in the log" />
        <StripCell icon={Keyboard} label="Typed" value={manualCount} sub="code or name"
          onClick={() => { setLogMethod(logMethod === 'manual' ? 'all' : 'manual'); setLogPage(1); }} active={logMethod === 'manual'} tip="Show only these in the log" />
        <StripCell icon={Footprints} tone="amber" label="Walk-ins" value={walkIns ?? '—'} sub="today"
          onClick={() => navigate('/attendance/walk-ins')} tip="Open Walk-ins" />
        <StripCell icon={CalendarDays} label="This week" value={weekUnique} sub="different members"
          onClick={() => navigate('/attendance-history')} tip="Open History" />
      </RdCard>

      {/* ── Today's log ── */}
      <RdCard className="overflow-hidden rd-fit-fill" data-today-log>
        <div className="flex items-center justify-between gap-3 flex-wrap px-5 py-3">
          <div className="flex items-center gap-3">
            <Users size={22} style={{ color: '#A78BFA' }} />
            <h2 className="text-[18px] font-semibold text-white">Today's check-ins</h2>
            <span className="text-[13px] px-2.5 py-0.5 rounded-full tabular-nums" style={{ background: TONE.violet.bg, color: TONE.violet.fg }}>{todayAttendance.length}</span>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <RdSelect value={logMethod} onChange={(v) => { setLogMethod(v as typeof logMethod); setLogPage(1); }} label="Filter by method" className="w-[150px]">
              <option value="all">All check-ins</option>
              <option value="qr">Scanned</option>
              <option value="manual">Typed</option>
            </RdSelect>
            <RdSelect value={logPlan} onChange={(v) => { setLogPlan(v); setLogPage(1); }} label="Filter by membership" className="w-[190px]">
              <option value="all">All membership types</option>
              {plans.map((p) => <option key={p} value={p}>{p}</option>)}
            </RdSelect>
            <div className="w-[210px]"><SearchField value={logSearch} onChange={(v) => { setLogSearch(v); setLogPage(1); }} placeholder="Search today…" /></div>
            <RdButton icon={Download} onClick={exportLog} data-tip="Export what the log shows as CSV">Export</RdButton>
            <RdButton variant="soft" icon={Maximize2} onClick={() => setFullOpen(true)} data-open-full-log data-tip="Every check-in today in one window">View all</RdButton>
          </div>
        </div>
        <RdTable boxRef={fit.ref} head={['Time', 'Member', 'How', 'Activity', 'Membership', { label: '', align: 'right' }]}
          empty={logRecords.length === 0 ? (
            <EmptyBlock icon={Users} compact
              title={todayAttendance.length === 0 ? 'Nobody has checked in today yet.' : 'No check-ins match these filters.'}
              body={todayAttendance.length === 0 ? 'When members check in, they’ll appear here.' : 'Clear a filter to see the rest of today.'}
              action={todayAttendance.length === 0
                ? <RdButton variant="soft" icon={QrCode} onClick={() => setIsScannerOpen(true)}>Scan QR to get started</RdButton>
                : <RdButton onClick={() => { setLogMethod('all'); setLogPlan('all'); setLogSearch(''); }}>Clear filters</RdButton>} />
          ) : undefined}>
          {logRecords.slice((page - 1) * perPage, page * perPage).map((r) => (
            <LogRow key={r.id} row={r} name={nameOf(r.member_id)} photo={memberById[r.member_id]?.profile.photo_url} plan={planOf[r.member_id]?.plan}
              onUndo={() => setToUndo(r)} height={logRecords.length > perPage ? fit.rowHeight : undefined} />
          ))}
        </RdTable>
        <div className="flex items-center justify-between flex-wrap" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <TableFooter page={page} perPage={perPage} total={logRecords.length} noun="check-ins today" onPage={setLogPage} />
          <Link to="/attendance-history" className="text-[14px] font-semibold inline-flex items-center gap-1.5 px-4 py-4" style={{ color: '#A78BFA' }}>
            <History size={15} /> Other days
          </Link>
        </div>
      </RdCard>

      <FullLog open={fullOpen} onClose={() => setFullOpen(false)} total={logRecords.length}
        filters={(
          <>
            <RdSelect value={logMethod} onChange={(v) => setLogMethod(v as typeof logMethod)} label="Filter by method" className="w-[150px]">
              <option value="all">All check-ins</option>
              <option value="qr">Scanned</option>
              <option value="manual">Typed</option>
            </RdSelect>
            <RdSelect value={logPlan} onChange={setLogPlan} label="Filter by membership" className="w-[190px]">
              <option value="all">All membership types</option>
              {plans.map((p) => <option key={p} value={p}>{p}</option>)}
            </RdSelect>
            <div className="w-[230px]"><SearchField value={logSearch} onChange={setLogSearch} placeholder="Search today…" autoFocus /></div>
            <RdButton icon={Download} onClick={exportLog}>Export</RdButton>
          </>
        )}>
        <RdTable head={['Time', 'Member', 'How', 'Activity', 'Membership', { label: '', align: 'right' }]}
          empty={logRecords.length === 0 ? <EmptyBlock icon={Users} compact title={todayAttendance.length === 0 ? 'Nobody has checked in today yet.' : 'No check-ins match these filters.'} /> : undefined}>
          {logRecords.map((r) => (
            <LogRow key={r.id} row={r} name={nameOf(r.member_id)} photo={memberById[r.member_id]?.profile.photo_url} plan={planOf[r.member_id]?.plan}
              onUndo={() => setToUndo(r)} />
          ))}
        </RdTable>
      </FullLog>

      <QRScanner isOpen={isScannerOpen} onClose={() => setIsScannerOpen(false)} onScan={(code) => void checkInCode(code)} />

      {/* Coaches (0200): who is in, and checking one in by hand when their phone is not with them. */}
      <DetailSheet open={coachesOpen} onClose={() => setCoachesOpen(false)} title="Coaches today"
        subtitle={`${coachesIn.length} of ${coaches.length} in · never counted as member visits`}>
        <div className="flex flex-col" data-coaches-sheet>
          {coaches.length === 0 && <p className="text-[14px] py-6 text-center" style={{ color: 'var(--color-text-muted)' }}>This gym has no active coaches yet.</p>}
          {coaches.map((c) => (
            <div key={c.id} className="flex items-center gap-3 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <Initials name={c.name} photo={c.photo} size={40} />
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold text-white truncate">{c.name}</p>
                <p className="text-[12.5px]" style={{ color: c.checkedInAt ? '#C4B5FD' : 'var(--color-text-secondary)' }}>
                  {c.checkedInAt ? `In at ${time(c.checkedInAt)}` : 'Not in yet'} · <span className="font-mono tracking-wider" style={{ color: 'var(--color-secondary)' }}>{formatCheckInCode(c.id)}</span>
                </p>
              </div>
              {c.checkinId
                ? <RdButton size="sm" variant="ghost" icon={Undo2} onClick={() => void undoCoach(c.checkinId!, c.name)}>Undo</RdButton>
                : <RdButton size="sm" variant="amber" onClick={() => void doCoachCheckIn(c, 'manual')}>Check in</RdButton>}
            </div>
          ))}
        </div>
      </DetailSheet>

      <ConfirmDialog
        isOpen={!!toUndo}
        onClose={() => setToUndo(null)}
        onConfirm={handleUndo}
        title="Undo Check-in"
        message={
          toUndo
            ? `Remove ${nameOf(toUndo.member_id)}'s ${time(toUndo.check_in_time)} check-in? ` +
              `Use this when the wrong member was scanned — the visit stops counting toward their training days and toward today's totals. They can simply check in again.`
            : ''
        }
        confirmText="Undo it"
        type="danger"
      />
    </div>
  );
}
