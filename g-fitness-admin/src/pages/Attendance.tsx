import { useState, useEffect, useMemo, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import QRScanner from '../components/ui/QRScanner';
import { useFitRows } from '../hooks/useFitRows';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import {
  QrCode, UserPlus, Users, TrendingUp, Download, Undo2, Zap, Dumbbell, Sparkles, Calendar,
  MonitorPlay, Tablet, Tag, History, ArrowRight, KeyRound,
} from 'lucide-react';
import { showToast } from '../utils/toast';
import { checkInCodeOf, formatCheckInCode } from '../utils/checkInCode';
import { todayKey, localDateKey, addDays } from '../utils/dates';
import { exportToCSV } from '../utils/exportUtils';
import { supabase } from '../lib/supabaseClient';
import { listMembers, type MemberWithProfile } from '../lib/api/members';
import { listMemberships } from '../lib/api/memberships';
import { listAttendanceBetween, deleteCheckIn } from '../lib/api/attendance';
import { getGymSettings } from '../lib/api/settings';
import { performCheckIn, resolveCheckInCode } from '../services/checkInService';
import type { AttendanceRow } from '../types/db';
import {
  RdHeader, RdCard, IconTile, Ring, StatTile, SearchField, RdSelect, RdButton, Pill, RdTable, Tr, Td,
  TableFooter, EmptyBlock, RailCard, RailAction, FitBody, Initials,
} from '../components/ui/rd';
import { ATTENDANCE_TABS, TONE, type Tone } from '../components/ui/rdTokens';

const ITEMS_PER_PAGE = 10;

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

/**
 * Attendance → Today: the desk (redesigned 2026-10-11 from the owner's mock-up).
 *
 * A hero with today's count and the share of the roster, Scan QR and Manual
 * check-in; three tiles (QR, manual, the week's unique members); today's log
 * with its filters, export and undo; and a rail for checking someone in fast —
 * search, a typed code, the activity tag, and the door's own screens (kiosk,
 * lobby TV). The log is today only; any other day is History.
 */
export default function Attendance() {
  const navigate = useNavigate();
  const [members, setMembers] = useState<MemberWithProfile[]>([]);
  const [planOf, setPlanOf] = useState<Record<string, { plan: string; status: string }>>({});
  const [allAttendance, setAllAttendance] = useState<AttendanceRow[]>([]);
  const [adminId, setAdminId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [qrInput, setQrInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [activity, setActivity] = useState('');
  const [activityOptions, setActivityOptions] = useState<string[]>([]);
  const [logPage, setLogPage] = useState(1);
  const [toUndo, setToUndo] = useState<AttendanceRow | null>(null);
  // The log's own filters.
  const [logMethod, setLogMethod] = useState<'all' | 'qr' | 'manual'>('all');
  const [logPlan, setLogPlan] = useState('all');
  const [logSearch, setLogSearch] = useState('');
  const quickSearch = useRef<HTMLDivElement>(null);
  /** Rows that fit the log's own box — the page never scrolls (2026-10-11). */
  const fit = useFitRows(ITEMS_PER_PAGE);

  const loadData = async () => {
    setLoading(true);
    try {
      const [memberRows, attendanceRows, { data: { user } }] = await Promise.all([
        listMembers(),
        // The last seven days: today's log and the week's count are all this
        // page shows. It read every check-in the gym ever had (2026-10-10).
        listAttendanceBetween(addDays(todayKey(), -6), todayKey()),
        supabase.auth.getUser(),
      ]);
      setMembers(memberRows);
      setAllAttendance(attendanceRows);
      setAdminId(user?.id ?? null);
      // Each member's current plan and state, for the log and the quick list. Optional:
      // check-in never depends on it.
      const ms = await listMemberships().catch(() => []);
      const map: Record<string, { plan: string; status: string }> = {};
      for (const m of ms) if (!map[m.member_id]) map[m.member_id] = { plan: m.membership_plans?.name ?? '—', status: m.status };
      setPlanOf(map);
      // The gym's own activity list (0018). If settings can't be read the
      // picker simply doesn't appear — check-in must never depend on it.
      const settings = await getGymSettings().catch(() => null);
      setActivityOptions(settings?.activity_options ?? []);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to load attendance', 'error');
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
      .filter((r) => !q || nameOf(r.member_id).toLowerCase().includes(q) || (r.activity ?? '').toLowerCase().includes(q))
      .sort((a, b) => b.check_in_time.localeCompare(a.check_in_time));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayAttendance, logMethod, logPlan, logSearch, planOf, memberById]);
  const perPage = fit.perPage;
  const page = Math.min(logPage, Math.max(1, Math.ceil(logRecords.length / perPage)));

  const doCheckIn = async (member: MemberWithProfile, method: 'qr' | 'manual') => {
    const result = await performCheckIn(member, method, {
      alreadyInToday: !!todayAttendance.find((a) => a.member_id === member.profile.id),
      adminId,
      activity: activity || undefined,
    });
    if (!result.ok) { showToast(result.message, 'error'); return; }
    showToast(
      result.points === null
        ? `${member.profile.first_name} checked in successfully!`
        : `${member.profile.first_name} checked in · ${result.points.toLocaleString('en-PH')} CORE Points`,
      'success',
    );
    setQrInput('');
    setSearchTerm('');
    await loadData();
  };

  const handleQRCheckIn = async (qrCodeValue?: string) => {
    const qr = (qrCodeValue || qrInput).trim();
    if (!qr) return showToast('Scan a code or type one in', 'error');
    // Three shapes reach this desk — the rotating QR, the six-character code,
    // a pasted member id. Resolved in checkInService, shared with the kiosk.
    const found = await resolveCheckInCode(qr, members);
    if ('error' in found) return showToast(found.error, 'error');
    await doCheckIn(found.member, found.method);
  };

  /** Undo a check-in (0035): the wrong person scanned. Only today's — what RLS allows. */
  const handleUndo = async () => {
    if (!toUndo) return;
    try {
      await deleteCheckIn(toUndo.id);
      showToast(`Check-in removed for ${nameOf(toUndo.member_id)}`, 'success');
      setToUndo(null);
      await loadData();
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
        Membership: planOf[r.member_id]?.plan ?? '',
        Activity: r.activity ?? '',
      })),
      `attendance_${todayStr}`,
      false,
    );
  };

  const filteredMembers = members.filter((m) => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return true;
    return (
      `${m.profile.first_name} ${m.profile.last_name}`.toLowerCase().includes(q) ||
      (m.profile.email ?? '').toLowerCase().includes(q) ||
      (m.member.qr_code ?? '').toLowerCase().includes(q) ||
      checkInCodeOf(m.profile.id).includes(q.replace(/[\s-]/g, ''))
    );
  });

  if (loading) {
    return <div className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Loading attendance…</div>;
  }

  const qrCount = todayAttendance.filter((a) => a.method === 'qr').length;
  const manualCount = todayAttendance.filter((a) => a.method === 'manual').length;
  const share = members.length ? todayAttendance.length / members.length : null;
  const todayLabel = new Date().toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  const focusQuick = () => {
    quickSearch.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    quickSearch.current?.querySelector('input')?.focus();
  };

  return (
    <div className="rd-fit" data-attendance-today>
      <RdHeader title="Attendance" subtitle="Track member check-ins and keep your gym running strong." tabs={ATTENDANCE_TABS}
        actions={(
          <Link to="/attendance-history" className="h-12 px-4 rounded-xl inline-flex items-center gap-3 text-[15px] text-white"
            style={{ border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.02)' }} data-tip="Another day? Open History">
            <Calendar size={18} style={{ color: 'var(--color-text-secondary)' }} /> {todayLabel}
          </Link>
        )} />

      <FitBody rail={(
        <>
          <RailCard icon={Zap} title="Quick check-in" sub="Search for a member and check them in instantly.">
            <div ref={quickSearch}>
              <SearchField value={searchTerm} onChange={setSearchTerm} placeholder="Search members by name, email or code…" label="Search member" />
            </div>
            <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto pr-0.5" data-quick-list>
              {filteredMembers.length === 0 ? (
                <p className="text-[14px] py-3 text-center" style={{ color: 'var(--color-text-muted)' }}>No members found</p>
              ) : filteredMembers.slice(0, searchTerm ? 20 : 3).map((m) => {
                const st = memberState(planOf[m.profile.id]?.status);
                const name = `${m.profile.first_name} ${m.profile.last_name}`;
                return (
                  <div key={m.profile.id} className="flex items-center gap-3 p-2.5 rounded-xl" style={{ border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.015)' }}>
                    <Initials name={name} photo={m.profile.photo_url} size={40} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[14.5px] font-semibold text-white truncate">{name}</p>
                      <p className="text-[12.5px] truncate" style={{ color: 'var(--color-text-secondary)' }}>{m.profile.email}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[11.5px] px-2 py-0.5 rounded-md" style={{ background: TONE[st.tone].bg, color: TONE[st.tone].fg }}>{st.label}</span>
                        {/* The code the member reads off their phone — to confirm the right person. */}
                        <span className="text-[11.5px] font-mono tracking-wider" style={{ color: 'var(--color-secondary)' }}>{formatCheckInCode(m.profile.id)}</span>
                      </div>
                    </div>
                    <RdButton variant="primary" size="sm" onClick={() => void doCheckIn(m, 'manual')}>Check in</RdButton>
                  </div>
                );
              })}
            </div>
            <Link to="/members" className="text-[14.5px] font-semibold inline-flex items-center justify-center gap-2 py-1" style={{ color: '#A78BFA' }}>
              View all members <ArrowRight size={16} />
            </Link>
          </RailCard>

          <RailCard icon={KeyRound} title="Have a code?" sub="The member finds it under their QR. A full member ID works too.">
            <input type="text" placeholder="A3F 92B" value={qrInput} onChange={(e) => setQrInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleQRCheckIn()} aria-label="Check-in code"
              className="w-full h-12 px-4 rounded-xl text-[16px] text-white text-center tracking-[0.3em] uppercase outline-none"
              style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.1)' }} />
            <RdButton variant="soft" onClick={() => void handleQRCheckIn()}>Check in with this code</RdButton>
          </RailCard>

          {/* Applies to whichever check-in comes next — handy when a class arrives together.
              A blank is honest; a default is fiction. Amber while set, so it is never left on unseen. */}
          {activityOptions.length > 0 && (
            <RailCard icon={Tag} tone="amber" title="Tag check-ins" sub="Optional. Applies to the next check-in, whichever way you take it, and fills the activity breakdown on History.">
              <RdSelect value={activity} onChange={setActivity} label="Tag the next check-in with an activity">
                <option value="">Not recorded</option>
                {activityOptions.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
              </RdSelect>
              {activity !== '' && (
                <div className="flex items-center justify-between">
                  <Pill tone="amber" solidDot>Tagging: {activity}</Pill>
                  <button type="button" onClick={() => setActivity('')} className="text-[13px] underline" style={{ color: 'var(--color-text-secondary)' }}>Clear</button>
                </div>
              )}
            </RailCard>
          )}

          <RailCard icon={MonitorPlay} title="At the door" sub="Screens for the gym floor.">
            {/* Self-service: members scan themselves in. The lobby TV: goal, records, boards, classes. */}
            <RailAction icon={Tablet} label="Kiosk mode" onClick={() => navigate('/kiosk')} />
            <RailAction icon={MonitorPlay} label="Lobby TV" onClick={() => navigate('/tv')} />
          </RailCard>
        </>
      )}>
        {/* ── The hero ── */}
        <RdCard glow className="px-6 py-4 rd-hero rd-hero-tight" data-attendance-hero>
          <div className="flex items-center gap-6 min-w-0">
            <IconTile icon={Dumbbell} size={64} />
            <div className="min-w-0">
              <p className="text-[13px] font-semibold tracking-[0.14em]" style={{ color: '#A78BFA' }}>TODAY'S ATTENDANCE</p>
              <p className="text-[32px] leading-none font-bold text-white mt-1.5 tabular-nums">{todayAttendance.length} checked in</p>
              <p className="text-[15px] mt-2" style={{ color: 'var(--color-text-secondary)' }}>Get members in, keep the momentum going.</p>
            </div>
          </div>
          <Ring value={share} label={`${share === null ? 0 : Math.round(share * 100)}%`} sub="of roster" size={110} />
          <div className="flex flex-col gap-3 min-w-0 rd-hero-side">
            <div>
              <p className="text-[20px] font-bold text-white tabular-nums">{todayAttendance.length} / {members.length || '—'} <span className="text-[14px] font-normal" style={{ color: 'var(--color-text-secondary)' }}>members checked in today</span></p>
              {todayAttendance.length === 0 && (
                <p className="text-[14px] mt-2 inline-flex items-center gap-1.5" style={{ color: '#FBBF24' }}><Sparkles size={15} /> Be the first check-in today!</p>
              )}
            </div>
            <div className="flex gap-2.5">
              <button type="button" onClick={() => setIsScannerOpen(true)} data-scan-qr data-tip="Open the camera to scan a member's code"
                className="flex items-center gap-2 px-3.5 h-11 rounded-xl text-white transition-all hover:brightness-110"
                style={{ background: 'linear-gradient(180deg,#8B5CF6,#7C3AED)', boxShadow: '0 12px 30px -12px rgba(124,58,237,0.9)' }}>
                <QrCode size={20} /><b className="text-[14.5px] whitespace-nowrap">Scan QR</b>
              </button>
              <button type="button" onClick={focusQuick}
                className="flex items-center gap-2 px-3.5 h-11 rounded-xl text-white transition-colors hover:bg-white/[0.06]" data-tip="Search a member and check them in"
                style={{ border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)' }}>
                <UserPlus size={19} /><b className="text-[14.5px] whitespace-nowrap">Manual check-in</b>
              </button>
            </div>
          </div>
        </RdCard>

        {/* ── The tiles ── */}
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          <StatTile icon={QrCode} label="QR Check-ins" compact value={qrCount} sub="via QR code scan today"
            onClick={() => { setLogMethod(logMethod === 'qr' ? 'all' : 'qr'); setLogPage(1); }} active={logMethod === 'qr'} tip="Show only these in the log" />
          <StatTile icon={UserPlus} label="Manual Check-ins" compact value={manualCount} sub="via admin check-in today"
            onClick={() => { setLogMethod(logMethod === 'manual' ? 'all' : 'manual'); setLogPage(1); }} active={logMethod === 'manual'} tip="Show only these in the log" />
          <StatTile icon={TrendingUp} tone="amber" label="7-Day Unique Members" compact value={weekUnique} sub="unique members in the last 7 days"
            onClick={() => navigate('/attendance-history')} tip="Open History" />
        </div>

        {/* ── Today's log ── */}
        <RdCard className="overflow-hidden rd-fit-fill" data-today-log>
          <div className="flex items-center justify-between gap-3 flex-wrap px-5 py-3.5">
            <div className="flex items-center gap-3">
              <Users size={24} style={{ color: '#A78BFA' }} />
              <h2 className="text-[20px] font-semibold text-white">Today's check-ins</h2>
              <span className="text-[13px] px-2.5 py-0.5 rounded-full tabular-nums" style={{ background: TONE.violet.bg, color: TONE.violet.fg }}>{todayAttendance.length}</span>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <RdSelect value={logMethod} onChange={(v) => { setLogMethod(v as typeof logMethod); setLogPage(1); }} label="Filter by method" className="w-[160px]">
                <option value="all">All check-ins</option>
                <option value="qr">QR scans</option>
                <option value="manual">Manual</option>
              </RdSelect>
              <RdSelect value={logPlan} onChange={(v) => { setLogPlan(v); setLogPage(1); }} label="Filter by membership" className="w-[200px]">
                <option value="all">All membership types</option>
                {plans.map((p) => <option key={p} value={p}>{p}</option>)}
              </RdSelect>
              <div className="w-[220px]"><SearchField value={logSearch} onChange={(v) => { setLogSearch(v); setLogPage(1); }} placeholder="Search check-ins…" /></div>
              <RdButton icon={Download} onClick={exportLog} data-tip="Export what the log shows as CSV">Export</RdButton>
            </div>
          </div>
          <RdTable boxRef={fit.ref} head={['#', 'Member', 'Time in', 'Method', 'Membership', 'Notes', { label: '', align: 'right' }]}
            empty={logRecords.length === 0 ? (
              <EmptyBlock icon={Users} compact
                title={todayAttendance.length === 0 ? 'Nobody has checked in today yet.' : 'No check-ins match these filters.'}
                body={todayAttendance.length === 0 ? 'When members check in, they’ll appear here.' : 'Clear a filter to see the rest of today.'}
                action={todayAttendance.length === 0
                  ? <RdButton variant="soft" icon={QrCode} onClick={() => setIsScannerOpen(true)}>Scan QR to get started</RdButton>
                  : <RdButton onClick={() => { setLogMethod('all'); setLogPlan('all'); setLogSearch(''); }}>Clear filters</RdButton>} />
            ) : undefined}>
            {logRecords.slice((page - 1) * perPage, page * perPage).map((r, i) => {
              const m = memberById[r.member_id];
              const name = nameOf(r.member_id);
              return (
                <Tr key={r.id} data-log-row style={{ height: logRecords.length > perPage ? fit.rowHeight : undefined }}>
                  <Td className="w-12" style={{ color: 'var(--color-text-secondary)' }}>{(page - 1) * perPage + i + 1}</Td>
                  <Td>
                    <div className="flex items-center gap-3">
                      <Initials name={name} photo={m?.profile.photo_url} size={38} />
                      <div className="min-w-0">
                        <p className="font-semibold text-white truncate">{name}</p>
                        <p className="text-[12px] font-mono tracking-wider" style={{ color: 'var(--color-secondary)' }}>{formatCheckInCode(r.member_id)}</p>
                      </div>
                    </div>
                  </Td>
                  <Td className="whitespace-nowrap">{new Date(r.check_in_time).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}</Td>
                  <Td>{r.method === 'qr' ? <Pill tone="violet" icon={QrCode}>Scanned</Pill> : <Pill tone="gray" icon={UserPlus}>Manual</Pill>}</Td>
                  <Td style={{ color: 'var(--color-text-secondary)' }}>{planOf[r.member_id]?.plan ?? '—'}</Td>
                  {/* The activity tag (0018). A dash means nobody asked — not "no activity". */}
                  <Td style={{ color: 'var(--color-text-secondary)' }}>{r.activity || '—'}</Td>
                  <Td align="right">
                    {localDateKey(r.check_in_time) === todayStr && (
                      <RdButton size="sm" variant="ghost" icon={Undo2} onClick={() => setToUndo(r)} data-tip="Undo this check-in">Undo</RdButton>
                    )}
                  </Td>
                </Tr>
              );
            })}
          </RdTable>
          <div className="flex items-center justify-between flex-wrap" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
            <TableFooter page={page} perPage={perPage} total={logRecords.length} noun="check-ins today" onPage={setLogPage} />
            <Link to="/attendance-history" className="text-[14px] font-semibold inline-flex items-center gap-1.5 px-4 py-4" style={{ color: '#A78BFA' }}>
              <History size={15} /> Other days
            </Link>
          </div>
        </RdCard>
      </FitBody>

      <QRScanner isOpen={isScannerOpen} onClose={() => setIsScannerOpen(false)} onScan={(qrCode) => handleQRCheckIn(qrCode)} />

      <ConfirmDialog
        isOpen={!!toUndo}
        onClose={() => setToUndo(null)}
        onConfirm={handleUndo}
        title="Undo Check-in"
        message={
          toUndo
            ? `Remove ${nameOf(toUndo.member_id)}'s ${new Date(toUndo.check_in_time).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })} check-in? ` +
              `Use this when the wrong member was scanned — the visit stops counting toward their training days and toward today's totals. They can simply check in again.`
            : ''
        }
        confirmText="Undo it"
        type="danger"
      />
    </div>
  );
}
