import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import Avatar from '../components/ui/Avatar';
import Pagination from '../components/ui/Pagination';
import QRScanner from '../components/ui/QRScanner';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import {
  QrCode, UserCheck, Search, Calendar, TrendingUp, Camera, Undo2, Download,
  Info, History, ChevronRight,
} from 'lucide-react';
import { showToast } from '../utils/toast';
import { checkInCodeOf, formatCheckInCode, matchesCheckInCode } from '../utils/checkInCode';
import { todayKey, localDateKey, addDays } from '../utils/dates';
import { exportToCSV } from '../utils/exportUtils';
import { supabase } from '../lib/supabaseClient';
import { listMembers, getMemberByQrCode, type MemberWithProfile } from '../lib/api/members';
import { listAttendance, recordCheckIn, deleteCheckIn } from '../lib/api/attendance';
import { getCurrentMembership, membershipIsUsable } from '../lib/api/memberships';
import { getGymSettings } from '../lib/api/settings';
import { notifyUser } from '../lib/api/notify';
import type { AttendanceRow } from '../types/db';

const ITEMS_PER_PAGE = 10;

const QR_TTL_SECONDS = 60;

interface ParsedQr {
  memberId: string;
  timestamp: number;
}

/** Current member-app format: `CF1.<timestamp base36>.<member id>`. */
const parseCompactQr = (qrCode: string): ParsedQr | null => {
  const parts = qrCode.trim().split('.');
  if (parts.length !== 3 || parts[0].toUpperCase() !== 'CF1') return null;
  const timestamp = parseInt(parts[1], 36);
  if (!Number.isFinite(timestamp) || timestamp <= 0 || !parts[2]) return null;
  return { memberId: parts[2].toLowerCase(), timestamp };
};

/**
 * Legacy base64(JSON) payload. Still accepted because an installed phone app
 * keeps serving its cached bundle until the next deploy reaches it — dropping
 * this would lock those members out of check-in in the meantime.
 */
const parseLegacyQr = (qrCode: string): ParsedQr | null => {
  try {
    const data = JSON.parse(atob(qrCode));
    if (!data?.memberId || typeof data.timestamp !== 'number') return null;
    return { memberId: String(data.memberId).toLowerCase(), timestamp: data.timestamp };
  } catch {
    return null;
  }
};

/**
 * Tolerance, in each direction, for the member's phone and this PC disagreeing
 * about what time it is.
 *
 * The timestamp exists to stop a screenshot being reused, and nothing else. It
 * was compared against a bare 60-second window, which quietly assumed two
 * unsynchronised devices agree on the current time to within a minute. They
 * often do not: `Date.now()` is UTC epoch so time zones are irrelevant, but a
 * desk PC that has been off for a while, or whose clock service has not run,
 * drifts by minutes.
 *
 * The failure that produces is the nastiest kind. If this PC's clock is more
 * than 60 seconds AHEAD of the phone, every code the member generates is
 * already expired by the time it is scanned — so the desk tells them to refresh,
 * they refresh, it fails again, forever. Nothing about that loop points at the
 * clock.
 *
 * Three minutes of grace keeps a stolen screenshot useless while absorbing the
 * drift that actually occurs. When a code falls outside even that, the desk is
 * told the measured offset instead of "expired", because at that point the clock
 * is the thing to fix and no amount of refreshing will help.
 */
const CLOCK_SKEW_GRACE_SECONDS = 180;

type QrVerdict =
  | { kind: 'ok'; data: ParsedQr }
  /** Not one of our payloads at all — a short code or a UUID may still follow. */
  | { kind: 'not-ours' }
  | { kind: 'stale'; ageSeconds: number }
  | { kind: 'future'; aheadSeconds: number };

const validateQR = (qrCode: string): QrVerdict => {
  const data = parseCompactQr(qrCode) ?? parseLegacyQr(qrCode);
  if (!data) return { kind: 'not-ours' };

  const ageMs = Date.now() - data.timestamp;
  if (ageMs < -CLOCK_SKEW_GRACE_SECONDS * 1000) {
    return { kind: 'future', aheadSeconds: Math.round(-ageMs / 1000) };
  }
  if (ageMs > (QR_TTL_SECONDS + CLOCK_SKEW_GRACE_SECONDS) * 1000) {
    return { kind: 'stale', ageSeconds: Math.round(ageMs / 1000) };
  }
  return { kind: 'ok', data };
};

/** "4 minutes" / "40 seconds" — for a message the desk can act on. */
const describeGap = (seconds: number): string => {
  const s = Math.abs(seconds);
  if (s < 90) return `${s} seconds`;
  return `${Math.round(s / 60)} minutes`;
};

export default function Attendance() {
  const [members, setMembers] = useState<MemberWithProfile[]>([]);
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

  const loadData = async () => {
    setLoading(true);
    try {
      const [memberRows, attendanceRows, { data: { user } }] = await Promise.all([
        listMembers(),
        listAttendance(),
        supabase.auth.getUser(),
      ]);
      setMembers(memberRows);
      setAllAttendance(attendanceRows);
      setAdminId(user?.id ?? null);
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

  useEffect(() => {
    loadData();
  }, []);

  const memberNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const m of members) map[m.profile.id] = `${m.profile.first_name} ${m.profile.last_name}`;
    return map;
  }, [members]);

  /*
   * Both of these compared `check_in_time.slice(0, 10)` — the **UTC** date out of
   * the timestamp text — against a `toISOString()` "today". Manila is UTC+8, so
   * every check-in before 8am local was filed under the previous day. The gym
   * opens early; a 6am visit is ordinary. The visible damage: "Today's Check-ins"
   * read 0 until 8am, and the duplicate guard below compared the wrong day, so
   * somebody who came at 7am and again at 9am was never flagged.
   */
  const todayStr = todayKey();
  const todayAttendance = useMemo(
    () => allAttendance.filter((a) => localDateKey(a.check_in_time) === todayStr),
    [allAttendance, todayStr]
  );
  /**
   * The log is **today**, and only today.
   *
   * It used to carry its own day-stepper, month grid, per-day search and
   * by-hour chart — a second, smaller copy of Attendance History sitting on top
   * of the check-in desk. Two screens answering "who came in on the 14th?"
   * differently is how they drift apart; this one is the desk, where the only
   * day that exists is the one being worked. Every other day is one link away.
   */
  const logRecords = todayAttendance;

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

  const doCheckIn = async (member: MemberWithProfile, method: 'qr' | 'manual') => {
    if (todayAttendance.find((a) => a.member_id === member.profile.id)) {
      showToast(`${member.profile.first_name} already checked in today`, 'error');
      return;
    }
    const membership = await getCurrentMembership(member.profile.id).catch(() => null);
    if (!membership) {
      showToast(`${member.profile.first_name} has no membership on file`, 'error');
      return;
    }
    // membershipIsUsable covers the cases a plain status check gets wrong: a
    // *cancelled* membership still admits the member until expiry (they paid for
    // those days), and a *frozen* one doesn't, however far off its expiry is.
    if (!membershipIsUsable(membership.status, membership.expiry_date, membership.never_expires)) {
      showToast(
        membership.status === 'frozen'
          ? `${member.profile.first_name}'s membership is frozen`
          : `${member.profile.first_name}'s membership has expired`,
        'error'
      );
      return;
    }
    if (!adminId) {
      // Falling back to the member's own id would file a false audit record: it would
      // read as the member having checked themselves in, which RLS forbids by design.
      showToast('Your admin session could not be verified. Please refresh and try again.', 'error');
      return;
    }
    try {
      await recordCheckIn({
        memberId: member.profile.id,
        method,
        recordedBy: adminId,
        // Left off entirely when the desk didn't pick one — a NULL says
        // "nobody asked", a default would say "they did Strength".
        activity: activity || undefined,
      });
      showToast(`${member.profile.first_name} checked in successfully!`, 'success');

      // Tell the member too. The desk saw a toast; the phone being held out at
      // the counter said nothing, so the member had to ask whether it worked.
      //
      // Fire-and-forget, and deliberately after the check-in is already written:
      // the attendance row is the record and the message is only the alert, so a
      // notification failure must never fail a check-in that has happened. Same
      // rule as booking approvals.
      notifyUser({
        userId: member.profile.id,
        // 'system', not a category of its own. The four preference categories
        // (booking/payment/membership/event) are what a member can mute, and a
        // check-in confirmation is not one of them — it is the app reporting
        // something that just happened to them at the desk.
        type: 'system',
        title: 'Checked in',
        message: activity
          ? `Your QR code was scanned at the front desk and logged as ${activity}.`
          : 'Your QR code was scanned at the front desk and your attendance is logged.',
        actionUrl: '/member/attendance-history',
      }).catch(() => undefined);

      setQrInput('');
      setSearchTerm('');
      await loadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Check-in failed', 'error');
    }
  };

  const handleQRCheckIn = async (qrCodeValue?: string) => {
    const qr = (qrCodeValue || qrInput).trim();
    if (!qr) return showToast('Scan a code or type one in', 'error');

    // Three shapes reach this desk:
    //   1. the member app's rotating QR payload (carries a timestamp),
    //   2. the six-character check-in code the member reads out when the camera
    //      won't focus or their battery is flat,
    //   3. a full member UUID, pasted from the Members page.
    const verdict = validateQR(qr);

    if (verdict.kind === 'stale') {
      // Distinguished from a genuine expiry on purpose. Past the grace window
      // the member refreshing again cannot help, so saying "ask them to refresh"
      // would send the desk round a loop that never terminates.
      return showToast(
        verdict.ageSeconds > (QR_TTL_SECONDS + CLOCK_SKEW_GRACE_SECONDS) * 2
          ? `That code was made ${describeGap(verdict.ageSeconds)} ago. If the member just refreshed it, this PC's clock is wrong.`
          : 'That QR code has expired. Ask the member to refresh it.',
        'error'
      );
    }

    if (verdict.kind === 'future') {
      return showToast(
        `That code is stamped ${describeGap(verdict.aheadSeconds)} in the future — this PC's clock is behind the member's phone.`,
        'error'
      );
    }

    if (verdict.kind === 'ok') {
      // Not `.catch(() => null)`. That reported a permission error, a dropped
      // connection and an unknown member as the same sentence, which is how a
      // broken lookup can look like a member who does not exist.
      let member: MemberWithProfile | null;
      try {
        member = await getMemberByQrCode(verdict.data.memberId);
      } catch (err) {
        return showToast(
          `Could not look that member up: ${err instanceof Error ? err.message : 'unknown error'}`,
          'error'
        );
      }
      if (!member) {
        return showToast('That code is valid but no member matches it.', 'error');
      }
      return doCheckIn(member, 'qr');
    }

    // Short code — resolved against the roster already in memory rather than
    // with a prefix query, so an ambiguous code can be refused outright instead
    // of silently checking in whichever row the database happened to return.
    const typed = qr.replace(/[\s-]/g, '');
    if (typed.length === 6) {
      const matches = members.filter((m) => matchesCheckInCode(m.profile.id, typed));
      if (matches.length === 1) return doCheckIn(matches[0], 'manual');
      if (matches.length > 1) {
        return showToast('More than one member has that code — use the search instead.', 'error');
      }
      return showToast(`No member has the code ${typed.toUpperCase()}.`, 'error');
    }

    // A full member UUID, pasted from the Members page. Same reasoning as above:
    // a failed lookup and an unknown member are different problems and must not
    // share a message.
    let member: MemberWithProfile | null;
    try {
      member = await getMemberByQrCode(qr);
    } catch (err) {
      return showToast(
        `Could not look that member up: ${err instanceof Error ? err.message : 'unknown error'}`,
        'error'
      );
    }
    if (!member) {
      return showToast(
        typed.length > 6
          ? 'No member matches that. Six-character codes go in as-is; anything longer must be a full member ID.'
          : 'No member matches that code.',
        'error'
      );
    }
    await doCheckIn(member, 'manual');
  };

  const handleManualCheckIn = (member: MemberWithProfile) => doCheckIn(member, 'manual');

  /**
   * Undo a check-in (0035). The desk scans the wrong person often enough that
   * "permanent and uncorrectable" was not a workable answer — the row counted
   * toward that member's training days and against the gym in Retention.
   */
  const handleUndo = async () => {
    if (!toUndo) return;
    try {
      await deleteCheckIn(toUndo.id);
      showToast(`Check-in removed for ${memberNameById[toUndo.member_id] ?? 'that member'}`, 'success');
      setToUndo(null);
      await loadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not undo that check-in', 'error');
    }
  };

  /**
   * Exports the day on screen. The shared `exportAttendanceToCSV` helper reads
   * `record.date` / `record.time` / `record.memberName` — none of which exist on
   * an `AttendanceRow` — so it would have written a file of empty columns, the
   * same way the members export did. Built here from the real shape instead.
   */
  const exportLog = () => {
    if (logRecords.length === 0) return showToast('Nothing to export — nobody has checked in today', 'error');
    exportToCSV(
      logRecords.map((r) => {
        const at = new Date(r.check_in_time);
        return {
          Date: localDateKey(r.check_in_time),
          Time: at.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' }),
          Member: memberNameById[r.member_id] ?? 'Unknown member',
          'Check-in Code': formatCheckInCode(r.member_id),
          Method: r.method,
          Activity: r.activity ?? '',
        };
      }),
      `attendance_${todayStr}`,
      false, // the day is already in the name
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

  const stats = [
    { label: "Today", value: todayAttendance.length, icon: UserCheck, color: 'var(--color-primary)' },
    { label: 'QR', value: todayAttendance.filter((a) => a.method === 'qr').length, icon: QrCode, color: 'var(--color-primary)' },
    { label: 'Manual', value: todayAttendance.filter((a) => a.method === 'manual').length, icon: Search, color: 'var(--color-primary)' },
    // Renamed. "Attendance Rate" implied a rate over time; it is the share of
    // the roster that came in on the selected day, so it now says that.
    { label: '% of roster', value: `${members.length ? Math.round((todayAttendance.length / members.length) * 100) : 0}%`, icon: TrendingUp, color: 'var(--color-secondary)' },
    { label: '7-day unique', value: weekUnique, icon: Calendar, color: 'var(--color-secondary)' },
  ];

  if (loading) {
    return <div className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Loading attendance…</div>;
  }

  return (
    <div className="h-full flex flex-col gap-3 overflow-hidden" style={{ maxHeight: 'calc(100vh - 5rem)' }}>
      {/* Header + Stats row */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-xl font-bold text-white">Attendance</h1>
          <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>Hybrid check-in: QR scan or manual entry</p>
        </div>
        <div className="flex items-center gap-2">
          {stats.map(s => {
            const Icon = s.icon;
            return (
              <div key={s.label} className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
                style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
                <Icon size={12} style={{ color: s.color }} />
                <span className="text-[9px] uppercase" style={{ color: 'var(--color-text-muted)' }}>{s.label}</span>
                <span className="text-sm font-bold text-white">{s.value}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Activity applies to whichever check-in method is used next, so it sits
          above both columns rather than being duplicated into each.

          "Today's activity" read like a status — as if the gym were doing one
          thing today. It is a *tag applied to the next check-in*, a different
          claim, and that difference is why it looked pointless.

          It used to be a loose row of chips with a four-line paragraph
          underneath, floating between the header and the columns with nothing
          holding it together. Same control, now in its own strip with the
          rationale on the hint icon: one line of chrome instead of five. */}
      {activityOptions.length > 0 && (
        <div className="flex items-center gap-2.5 flex-shrink-0 rounded-lg px-3 py-2"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          <span className="text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap"
            style={{ color: 'var(--color-text-muted)' }}>
            Tag check-ins as
          </span>

          {/*
            A dropdown, not thirty chips.

            The gym has 29 activity options. As buttons they wrapped onto two
            full rows and took more vertical space than the QR scanner — for an
            optional tag that is left on "Not recorded" most of the day. Chips
            are for a handful of choices you compare at a glance; this is a list
            you pick one from, which is a select.

            Amber when something is set, so an activity left on from an earlier
            class is visible rather than silently tagging the next walk-in.
          */}
          <select
            value={activity}
            onChange={(e) => setActivity(e.target.value)}
            aria-label="Tag the next check-in with an activity"
            className="rounded-full px-3 h-7 text-[11px] font-semibold min-w-[180px]"
            style={{
              background: activity === '' ? 'var(--color-surface-high)' : 'var(--color-secondary)',
              color: activity === '' ? 'var(--color-text-muted)' : '#000',
              border: `1px solid ${activity === '' ? 'var(--color-border)' : 'var(--color-secondary)'}`,
            }}
          >
            <option value="">Not recorded</option>
            {activityOptions.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>

          {activity !== '' && (
            <button onClick={() => setActivity('')}
              className="text-[10px] font-semibold underline whitespace-nowrap"
              style={{ color: 'var(--color-text-muted)' }}>
              clear
            </button>
          )}

          <span
            className="flex items-center gap-1 text-[10px] whitespace-nowrap cursor-help ml-auto"
            style={{ color: 'var(--color-text-muted)' }}
            data-tip={
              'Optional, and it applies to the next check-in you take whichever way you take it — '
              + 'handy when a class arrives together. '
              + 'It is what fills the activity breakdown on Attendance history. Leave it on '
              + '"Not recorded" for an ordinary walk-in rather than guessing: a blank is honest, '
              + 'a default is fiction.'
            }>
            <Info size={11} /> applies to the next check-in
          </span>
        </div>
      )}

      {/* Two panels, not three.

          Scanning a QR and typing a name are the same job — get this person
          checked in — and they were two equal thirds of the screen, which
          left the log, the thing anybody actually reads, squeezed into the
          last third. The two ways in stack on the left; the record gets the
          room. 2:3 of a five-column grid. */}
      {/* Three tiles, sized to their jobs.

          It was a 2:3 split of five columns with the two ways in stacked
          inside the left half — which meant the QR panel and the member
          list were the same width whatever they needed, and the whole
          left column had to be re-reasoned about to change either. Same
          bento as the dashboard now: twelve columns, six rows, each panel
          placed on the grid rather than nested inside a flex column.

          Scanning and the member list take half the column each: at two
          rows the QR panel scrolled inside its own cell, which put the
          Check In link under a scrollbar. The
          log takes eight columns and the full height, because it is what
          the desk actually reads. */}
      <div
        className="flex-1 min-h-0 grid gap-3"
        style={{
          gridTemplateColumns: 'repeat(12, minmax(0, 1fr))',
          gridTemplateRows: 'repeat(6, minmax(0, 1fr))',
        }}
      >
        {/* Scanning: two rows, top-left. */}
        <div className="rounded-xl overflow-hidden flex flex-col"
          style={{ gridColumn: '1 / 5', gridRow: '1 / 4',
                   background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          <div className="p-2.5 flex items-center gap-2 flex-shrink-0" style={{ borderBottom: '1px solid var(--color-border)' }}>
            <QrCode size={13} style={{ color: 'var(--color-secondary)' }} />
            <h3 className="text-[11px] font-semibold text-white">QR Code Scan</h3>
          </div>
          <div className="flex-1 overflow-y-auto p-3 flex flex-col items-center justify-center text-center space-y-3">
            <QrCode size={36} style={{ color: 'var(--color-secondary)' }} />
            <div>
              <h3 className="text-white font-semibold text-xs">Scan Member QR</h3>
              <p className="text-[9px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>Use camera or enter code</p>
            </div>
            <Button onClick={() => setIsScannerOpen(true)} variant="primary" size="sm"
              className="w-full flex items-center justify-center gap-1.5 !text-[10px]">
              <Camera size={12} /> Open Camera
            </Button>
            <div className="flex items-center gap-2 w-full">
              <div className="flex-1 h-px" style={{ background: 'var(--color-border)' }} />
              <span className="text-[8px]" style={{ color: 'var(--color-text-muted)' }}>OR</span>
              <div className="flex-1 h-px" style={{ background: 'var(--color-border)' }} />
            </div>
            <div className="w-full space-y-1.5">
              <input type="text" placeholder="Check-in code, e.g. A3F 92B"
                value={qrInput} onChange={(e) => setQrInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleQRCheckIn()}
                className="w-full px-3 py-2 rounded-xl text-[11px] text-white text-center tracking-widest uppercase"
                style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }} />
              <p className="text-[9px]" style={{ color: 'var(--color-text-muted)' }}>
                The member finds this under their QR. A full member ID works too.
              </p>
              <Button onClick={() => handleQRCheckIn()} variant="ghost" size="sm" className="w-full !text-[10px]">
                Check In
              </Button>
            </div>
          </div>
        </div>

        {/* The member list: four rows, so it has room to scroll. */}
        <div className="rounded-xl overflow-hidden flex flex-col min-h-0"
          style={{ gridColumn: '1 / 5', gridRow: '4 / 7',
                   background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          <div className="p-2.5 flex items-center gap-2 flex-shrink-0" style={{ borderBottom: '1px solid var(--color-border)' }}>
            <Search size={13} style={{ color: 'var(--color-primary)' }} />
            <h3 className="text-[11px] font-semibold text-white">Manual Check-in</h3>
          </div>
          <div className="flex-1 overflow-hidden flex flex-col p-3">
            <div className="relative flex-shrink-0 mb-2">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-text-muted)' }} />
              <input type="text" placeholder="Search member..."
                value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-7 pr-3 py-1.5 rounded-xl text-[11px] text-white"
                style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }} />
            </div>
            <div className="flex-1 overflow-y-auto space-y-1 scrollbar-thin scrollbar-thumb-dark-border">
              {filteredMembers.length > 0 ? filteredMembers.slice(0, 20).map(member => (
                <div key={member.profile.id} className="flex items-center justify-between p-2 rounded-lg"
                  style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
                  <div className="flex items-center gap-2 min-w-0">
                    <Avatar name={`${member.profile.first_name} ${member.profile.last_name}`}
                      photoUrl={member.profile.photo_url} size={24} tone="secondary" />
                    <div className="min-w-0">
                      <p className="text-[10px] text-white font-semibold truncate">{member.profile.first_name} {member.profile.last_name}</p>
                      <p className="text-[8px] truncate" style={{ color: 'var(--color-text-muted)' }}>{member.profile.email}</p>
                      {/* Same code the member reads off their phone — shown so
                          the desk can confirm they matched the right person. */}
                      <p className="text-[8px] font-mono tracking-wider" style={{ color: 'var(--color-secondary)' }}>
                        {formatCheckInCode(member.profile.id)}
                      </p>
                    </div>
                  </div>
                  <Button onClick={() => handleManualCheckIn(member)} variant="primary" size="sm" className="!text-[9px] !px-2 !py-1 !h-6">
                    Check In
                  </Button>
                </div>
              )) : (
                <div className="text-center py-4 text-[10px]" style={{ color: 'var(--color-text-muted)' }}>No members found</div>
              )}
            </div>
          </div>
        </div>


        {/* The record — the whole right side, because it is what the desk reads. */}
        <div className="rounded-xl overflow-hidden flex flex-col min-h-0"
          style={{ gridColumn: '5 / 13', gridRow: '1 / 7',
                   background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          {/* One line: what this is, how many, and the two things you can do
              with it. The day-stepper, month grid, per-day search and by-hour
              chart that used to live here all exist on Attendance History,
              which is where a question about any day but today belongs. */}
          <div className="p-2.5 flex-shrink-0 flex items-center justify-between gap-2"
            style={{ borderBottom: '1px solid var(--color-border)' }}>
            <div className="flex items-center gap-2 min-w-0">
              <Calendar size={13} style={{ color: 'var(--color-secondary)' }} className="flex-shrink-0" />
              <h3 className="text-[11px] font-semibold text-white truncate">Today&apos;s check-ins</h3>
              <span className="text-[10px] tabular-nums px-1.5 rounded-full flex-shrink-0"
                style={{
                  background: 'var(--color-surface-high)',
                  color: logRecords.length > 0 ? 'var(--color-secondary)' : 'var(--color-text-muted)',
                }}>
                {logRecords.length}
              </span>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <button onClick={exportLog} data-tip="Export today as CSV"
                className="p-1.5 rounded-lg" style={{ color: 'var(--color-secondary)' }}>
                <Download size={12} />
              </button>
              {/* Another day, a range, a member's own record, who is most
                  regular — all one click away, and none of it duplicated here. */}
              <Link to="/attendance-history"
                className="flex items-center gap-1 pl-2 pr-1.5 h-6 rounded-lg text-[10px] font-semibold"
                style={{
                  background: 'var(--color-surface-high)',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-text-secondary)',
                }}>
                <History size={11} />
                Other days
                <ChevronRight size={10} />
              </Link>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-dark-border">
            {logRecords.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-6">
                <UserCheck size={24} style={{ color: 'var(--color-border)' }} className="mb-1" />
                <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                  Nobody has checked in today yet
                </p>
              </div>
            ) : (
              <table className="w-full">
                <thead className="sticky top-0" style={{ background: 'var(--color-surface)' }}>
                  <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                    {['Member', 'Time', 'Activity', 'Method', ''].map((h, i) => (
                      <th key={h || i} className="text-left py-1.5 px-2 text-[8px] font-semibold uppercase tracking-wider"
                        style={{ color: 'var(--color-text-muted)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {logRecords.slice((logPage - 1) * ITEMS_PER_PAGE, logPage * ITEMS_PER_PAGE).map(r => (
                    <tr key={r.id} className="group" style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <td className="py-1.5 px-2">
                        <p className="text-[10px] text-white font-semibold truncate">{memberNameById[r.member_id] ?? 'Unknown member'}</p>
                      </td>
                      <td className="py-1.5 px-2 text-[9px] whitespace-nowrap" style={{ color: 'var(--color-text-secondary)' }}>
                        {new Date(r.check_in_time).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      {/* The desk records this (0018) and the page never showed it
                          back, so there was no way to tell whether it had stuck.
                          A dash means nobody asked — not "no activity". */}
                      <td className="py-1.5 px-2 text-[9px] truncate" style={{ color: 'var(--color-text-muted)' }}>
                        {r.activity || '—'}
                      </td>
                      <td className="py-1.5 px-2">
                        <Badge variant={r.method === 'qr' ? 'QR' : 'Manual'}>
                          {r.method === 'qr' ? 'QR' : 'Manual'}
                        </Badge>
                      </td>
                      <td className="py-1.5 px-2">
                        {/* Only today's rows are undoable — that is what the RLS
                            policy allows, so offering it on older days would be a
                            button that always fails. */}
                        {localDateKey(r.check_in_time) === todayStr && (
                          <button onClick={() => setToUndo(r)} data-tip="Undo this check-in"
                            className="opacity-0 group-hover:opacity-100 transition-opacity"
                            style={{ color: 'var(--color-secondary)' }}>
                            <Undo2 size={11} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          {logRecords.length > 0 && (
            <div className="flex-shrink-0 px-2 py-1" style={{ borderTop: '1px solid var(--color-border)' }}>
              <Pagination currentPage={logPage} totalItems={logRecords.length}
                itemsPerPage={ITEMS_PER_PAGE} onPageChange={setLogPage} />
            </div>
          )}
        </div>
      </div>

      <QRScanner
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScan={(qrCode) => handleQRCheckIn(qrCode)}
      />

      <ConfirmDialog
        isOpen={!!toUndo}
        onClose={() => setToUndo(null)}
        onConfirm={handleUndo}
        title="Undo Check-in"
        message={
          toUndo
            ? `Remove ${memberNameById[toUndo.member_id] ?? 'this member'}'s ${new Date(toUndo.check_in_time).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })} check-in? ` +
              `Use this when the wrong member was scanned — the visit stops counting toward their training days and toward today's totals. They can simply check in again.`
            : ''
        }
        confirmText="Undo it"
        type="danger"
      />
    </div>
  );
}
