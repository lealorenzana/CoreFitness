import { useEffect, useMemo, useState } from 'react';
import {
  CalendarCheck, Download, AlertTriangle, QrCode, Users, BarChart3, X, ArrowRight, ArrowDown, ScanLine, Keyboard,
} from 'lucide-react';
import DatePicker from '../components/ui/DatePicker';
import { RdHeader, RdCard, StatTile, SearchField, RdSelect, RdButton, Pill, RdTable, Tr, Td, TableFooter, EmptyBlock, Initials } from '../components/ui/rd';
import { ATTENDANCE_TABS } from '../components/ui/rdTokens';
import { useGymFirstDay } from '../hooks/useGymFirstDay';
import AttendanceCalendar from '../components/ui/AttendanceCalendar';
import { exportToCSV } from '../utils/exportUtils';
import { listAttendanceBetween } from '../lib/api/attendance';
import { listMembers } from '../lib/api/members';
import { getGymSettings } from '../lib/api/settings';
import type { AttendanceRow } from '../types/db';

/**
 * Attendance over a range, rather than one day at a time.
 *
 * The Attendance screen is a *desk* screen — scan, check in, undo a mistake —
 * and its log is deliberately one day, because that is the day the person at
 * the desk is working. What it could not answer is every question asked
 * afterwards: who came last month, which days are busy, is this member actually
 * turning up, how many check-ins were scanned versus typed in by hand.
 *
 * ## Manila dates, not UTC
 *
 * The range bounds are converted to Manila timestamps in the query
 * (`listAttendanceBetween`). Comparing a `timestamptz` to a bare date compares
 * against UTC midnight — 8am Manila — which would drop every early-morning
 * check-in from the first day of any range. That exact off-by-eight-hours hid
 * every pre-8am check-in until 0045, and it is the easiest bug in this codebase
 * to reintroduce.
 *
 * ## Everything is derived
 *
 * Busiest day, per-member counts, the daily bars — all computed from the rows
 * on screen. Nothing is stored, so nothing can disagree with the log below it.
 */

/** 'YYYY-MM-DD' in Manila, never `toISOString()` — see the note above. */
function manilaDate(offsetDays = 0): string {
  const t = Date.now() + 8 * 3600_000 + offsetDays * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

const PAGE = 25;

type Preset = '7' | '30' | '90' | 'custom';


export default function AttendanceHistory() {
  const [from, setFrom] = useState(manilaDate(-29));
  const [to, setTo] = useState(manilaDate());
  const firstDay = useGymFirstDay();
  const [preset, setPreset] = useState<Preset>('30');
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [people, setPeople] = useState<Map<string, { name: string; photo: string | null; since: string | null }>>(new Map());
  const [showAllTop, setShowAllTop] = useState(false);
  const [activities, setActivities] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [search, setSearch] = useState('');
  const [activity, setActivity] = useState('');
  const [method, setMethod] = useState<'' | 'qr' | 'manual'>('');
  const [page, setPage] = useState(1);
  /** A day clicked in the calendar, narrowing the log to it. Null = whole range. */
  const [dayFilter, setDayFilter] = useState<string | null>(null);
  const [calMonth, setCalMonth] = useState<string>(() => manilaDate().slice(0, 7));

  useEffect(() => {
    let alive = true;
    (async () => {
      const [att, members, settings] = await Promise.all([
        listAttendanceBetween(from, to).catch(() => null),
        listMembers().catch(() => []),
        getGymSettings().catch(() => null),
      ]);
      if (!alive) return;
      if (att === null) { setFailed(true); setLoading(false); return; }
      setRows(att);
      setPeople(new Map(members.map((m) =>
        [m.profile.id, { name: `${m.profile.first_name} ${m.profile.last_name}`.trim(), photo: m.profile.photo_url ?? null, since: m.profile.created_at ?? null }])));
      setActivities(settings?.activity_options ?? []);
      setFailed(false);
      setLoading(false);
      setPage(1);
      // A day picked inside the old range is meaningless in the new one, and
      // leaving it set would show an empty log with no visible reason why.
      setDayFilter(null);
      setCalMonth(to.slice(0, 7));
    })();
    return () => { alive = false; };
  }, [from, to]);

  const applyPreset = (p: Preset) => {
    setPreset(p);
    if (p === 'custom') return;
    setFrom(manilaDate(-(Number(p) - 1)));
    setTo(manilaDate());
  };

  /**
   * Everything matching the search/method/activity filters, across the whole
   * range — *before* a calendar day narrows it.
   *
   * The split matters: the calendar and the summary describe the range, so they
   * must not shrink to the day you clicked. Deriving the grid from the
   * day-filtered rows would leave exactly one day lit the moment you picked
   * one, and the picture you were navigating by would vanish under the click.
   */
  const inRange = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (method && r.method !== method) return false;
      if (activity && r.activity !== activity) return false;
      if (q && !(people.get(r.member_id)?.name ?? '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, search, activity, method, people]);

  /** Manila calendar day of a check-in — the +8h shift, not `toISOString()`. */
  const dayOf = (iso: string) =>
    new Date(new Date(iso).getTime() + 8 * 3600_000).toISOString().slice(0, 10);

  const filtered = useMemo(
    () => (dayFilter ? inRange.filter((r) => dayOf(r.check_in_time) === dayFilter) : inRange),
    [inRange, dayFilter]
  );

  const stats = useMemo(() => {
    const byDay: Record<string, number> = {};
    const byMember = new Map<string, number>();
    let qr = 0;
    for (const r of inRange) {
      const d = dayOf(r.check_in_time);
      byDay[d] = (byDay[d] ?? 0) + 1;
      byMember.set(r.member_id, (byMember.get(r.member_id) ?? 0) + 1);
      if (r.method === 'qr') qr += 1;
    }
    const entries = Object.entries(byDay);
    const busiest = [...entries].sort((a, b) => b[1] - a[1])[0] ?? null;
    const topList = [...byMember.entries()].sort((a, b) => b[1] - a[1]);
    const top = topList.slice(0, 5);
    const spanDays = Math.max(1,
      Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86_400_000) + 1);
    return {
      total: inRange.length,
      uniqueMembers: byMember.size,
      qr,
      manual: inRange.length - qr,
      perDay: (inRange.length / spanDays).toFixed(1),
      busiest,
      top,
      topList: topList.slice(0, 50),
      topAll: topList.length,
      byDay,
      activeDays: entries.length,
      spanDays,
    };
  }, [inRange, from, to]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const current = Math.min(page, pages);
  const visible = filtered.slice((current - 1) * PAGE, current * PAGE);

  const timeLabel = (iso: string) =>
    new Date(iso).toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  const rangeLabel = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });

  if (loading) {
    return <div className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Loading attendance…</div>;
  }

  if (failed) {
    return (
      <RdCard className="p-6">
        <EmptyBlock icon={AlertTriangle} title="Couldn't load attendance"
          body="A connection problem, not an empty log — no check-in has been lost. Reload to try again." />
      </RdCard>
    );
  }

  const exportRows = () => exportToCSV(
    filtered.map((r) => ({
      member: people.get(r.member_id)?.name ?? r.member_id,
      when: timeLabel(r.check_in_time),
      method: r.method,
      activity: r.activity ?? '',
    })),
    `attendance-${from}-to-${to}`,
  );
  const presetBtn = (p: Preset, label: string) => (
    <button key={p} type="button" onClick={() => applyPreset(p)} aria-pressed={preset === p}
      className="h-11 px-4 rounded-xl text-[14.5px] font-semibold whitespace-nowrap transition-colors"
      style={preset === p
        ? { background: 'linear-gradient(180deg,#8B5CF6,#7C3AED)', color: '#fff', border: '1px solid rgba(167,139,250,0.6)' }
        : { background: 'rgba(255,255,255,0.04)', color: 'var(--color-text-secondary)', border: '1px solid rgba(255,255,255,0.06)' }}>
      {label}
    </button>
  );

  return (
    <div className="flex flex-col gap-6" data-attendance-history>
      <RdHeader title="Attendance" subtitle="Review check-ins across any date range." tabs={ATTENDANCE_TABS}
        actions={<RdButton variant="primary" icon={Download} onClick={exportRows} data-tip="Export the check-ins shown below as CSV">Export {filtered.length}</RdButton>} />

      {/* ── Range and filters ── */}
      <RdCard className="p-4 flex flex-wrap items-end gap-4" data-history-range>
        <div className="flex gap-2">
          {presetBtn('7', 'Last 7 days')}{presetBtn('30', 'Last 30 days')}{presetBtn('90', 'Last 90 days')}
        </div>
        <span className="hidden lg:block w-px self-stretch" style={{ background: 'rgba(255,255,255,0.08)' }} />
        <label className="w-44">
          <span className="text-[13px]" style={{ color: 'var(--color-text-secondary)' }}>From</span>
          <DatePicker mode="history" bounds={{ earliest: firstDay }} value={from} max={to}
            onChange={(v) => { setFrom(v || from); setPreset('custom'); }} />
        </label>
        <label className="w-44">
          <span className="text-[13px]" style={{ color: 'var(--color-text-secondary)' }}>To</span>
          <DatePicker mode="history" bounds={{ earliest: firstDay }} value={to} min={from}
            onChange={(v) => { setTo(v || to); setPreset('custom'); }} />
        </label>
        <div className="flex-1 min-w-[220px]"><SearchField value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search member…" /></div>
        <RdSelect value={method} onChange={(v) => { setMethod(v as '' | 'qr' | 'manual'); setPage(1); }} label="Filter by method" className="w-[170px]">
          <option value="">Any method</option>
          <option value="qr">QR scan</option>
          <option value="manual">Manual</option>
        </RdSelect>
        {activities.length > 0 && (
          <RdSelect value={activity} onChange={(v) => { setActivity(v); setPage(1); }} label="Filter by activity" className="w-[190px]">
            <option value="">Any activity</option>
            {activities.map((a) => <option key={a} value={a}>{a}</option>)}
          </RdSelect>
        )}
      </RdCard>

      {/* ── What the range says ── */}
      <div className="grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))' }}>
        <StatTile icon={CalendarCheck} label="Check-ins" value={stats.total} />
        <StatTile icon={Users} label="Unique members" value={stats.uniqueMembers} />
        <StatTile icon={BarChart3} label="Average per day" value={stats.perDay} />
        <StatTile icon={QrCode} label="Scanned vs typed" value={`${stats.qr} / ${stats.manual}`}
          onClick={() => { setMethod(method === 'qr' ? '' : 'qr'); setPage(1); }} tip="Show only scanned check-ins" active={method === 'qr'} />
      </div>

      <div className="rd-history-grid">
        {/* ── Which days anyone came in ── */}
        <RdCard className="p-6">
          <AttendanceCalendar
            month={calMonth}
            counts={stats.byDay}
            selected={dayFilter}
            today={manilaDate()}
            onMonthChange={setCalMonth}
            // Clicking the picked day again clears it — the calendar is its own way back out.
            onSelect={(d) => { setDayFilter(dayFilter === d ? null : d); setPage(1); }}
          />
          <p className="text-[13px] mt-3" style={{ color: 'var(--color-text-secondary)' }}>
            {stats.activeDays} of {stats.spanDays} day{stats.spanDays === 1 ? '' : 's'} in range had check-ins
            {stats.busiest ? ` · busiest ${new Date(`${stats.busiest[0]}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })} (${stats.busiest[1]})` : ''} · click a day to open it
          </p>
          {/* An empty month outside the loaded range would read as "nobody came" when it was never fetched. */}
          {(calMonth < from.slice(0, 7) || calMonth > to.slice(0, 7)) && (
            <p className="text-[13px] mt-2 flex items-center gap-1.5" style={{ color: 'var(--color-secondary)' }}>
              <AlertTriangle size={14} /> This month is outside the range above, so it shows nothing. Widen the range to load it.
            </p>
          )}
        </RdCard>

        {/* ── Who came most ── */}
        <RdCard className="p-6" data-most-regular>
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-[21px] font-semibold text-white">Most regular</h3>
            {stats.top.length > 0 && !showAllTop && stats.topAll > 5 && (
              <button type="button" onClick={() => setShowAllTop(true)} className="text-[14.5px] font-semibold inline-flex items-center gap-1.5" style={{ color: '#A78BFA' }}>View all <ArrowRight size={15} /></button>
            )}
          </div>
          <p className="text-[14px] mt-1" style={{ color: 'var(--color-text-secondary)' }}>Members with the most check-ins in this period.</p>
          {stats.top.length === 0 ? (
            <p className="text-[14px] mt-6" style={{ color: 'var(--color-text-muted)' }}>Nobody yet.</p>
          ) : (
            <div className="mt-4 flex flex-col">
              {(showAllTop ? stats.topList : stats.top).map(([id, n], i) => {
                const p = people.get(id);
                return (
                  <button key={id} type="button" onClick={() => { setSearch(p?.name ?? ''); setPage(1); }} data-tip="Show only their check-ins"
                    className="flex items-center gap-3.5 py-3 text-left hover:bg-white/[0.02] rounded-xl px-1" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                    <span className="w-6 text-[15px] tabular-nums" style={{ color: 'var(--color-text-secondary)' }}>{i + 1}</span>
                    <Initials name={p?.name ?? '?'} photo={p?.photo} size={44} />
                    <span className="flex-1 min-w-0">
                      <span className="block text-[15.5px] font-semibold text-white truncate">{p?.name ?? 'Archived member'}</span>
                      {p?.since && <span className="block text-[13px]" style={{ color: 'var(--color-text-secondary)' }}>Member since {new Date(p.since).toLocaleDateString('en-PH', { month: 'short', year: 'numeric' })}</span>}
                    </span>
                    <span className="text-right">
                      <span className="block text-[21px] font-bold tabular-nums" style={{ color: '#A78BFA' }}>{n}</span>
                      <span className="block text-[12.5px]" style={{ color: 'var(--color-text-secondary)' }}>visits</span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </RdCard>
      </div>

      {/* ── The log ── */}
      <RdCard className="overflow-hidden" data-history-log>
        <div className="flex items-center justify-between gap-3 flex-wrap p-5">
          <div>
            <h3 className="text-[21px] font-semibold text-white">Check-ins</h3>
            <p className="text-[14px]" style={{ color: 'var(--color-text-secondary)' }}>
              {filtered.length} check-in{filtered.length === 1 ? '' : 's'} • {rangeLabel(from)} – {rangeLabel(to)}
            </p>
          </div>
          {/* Narrowed to a day — said out loud, with the way out attached. */}
          {dayFilter && (
            <button type="button" onClick={() => { setDayFilter(null); setPage(1); }}
              className="h-9 px-3 rounded-full inline-flex items-center gap-1.5 text-[13.5px] font-semibold"
              style={{ background: 'rgba(245,158,11,0.13)', color: '#FBBF24', border: '1px solid rgba(245,158,11,0.45)' }}>
              {new Date(`${dayFilter}T00:00:00`).toLocaleDateString('en-PH', { weekday: 'short', day: 'numeric', month: 'short' })}
              <X size={14} />
            </button>
          )}
        </div>
        <RdTable head={['Member', { label: <span className="inline-flex items-center gap-1">When <ArrowDown size={13} /></span> }, 'How', 'Activity']}
          empty={visible.length === 0 ? <EmptyBlock icon={CalendarCheck} title="No check-ins match those filters." /> : undefined}>
          {visible.map((r) => {
            const p = people.get(r.member_id);
            return (
              <Tr key={r.id}>
                <Td>
                  <div className="flex items-center gap-3">
                    <Initials name={p?.name ?? '?'} photo={p?.photo} size={34} />
                    {/* An archived member's rows stay — deleting history to tidy a name would be worse. */}
                    {p ? <span className="font-medium text-white">{p.name}</span> : <span style={{ color: 'var(--color-text-muted)' }}>Archived member</span>}
                  </div>
                </Td>
                <Td className="tabular-nums whitespace-nowrap">{timeLabel(r.check_in_time)}</Td>
                <Td>{r.method === 'qr' ? <Pill tone="violet" icon={ScanLine}>Scanned</Pill> : <Pill tone="gray" icon={Keyboard}>Typed</Pill>}</Td>
                {/* Never invented: a check-in taken without picking one says so. */}
                <Td>{r.activity ?? <span style={{ color: 'var(--color-text-muted)' }}>Not recorded</span>}</Td>
              </Tr>
            );
          })}
        </RdTable>
        <TableFooter page={current} perPage={PAGE} total={filtered.length} noun="check-ins" onPage={setPage} />
      </RdCard>
    </div>
  );
}
