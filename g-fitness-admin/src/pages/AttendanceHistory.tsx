import { Fragment, useEffect, useMemo, useState } from 'react';
import { Download, AlertTriangle, Calendar, ChevronLeft, ChevronRight, Medal, ArrowRight, Search, X } from 'lucide-react';
import DatePicker from '../components/ui/DatePicker';
import DetailSheet from '../components/ui/DetailSheet';
import { useGymFirstDay } from '../hooks/useGymFirstDay';
import { checkInCodeOf } from '../utils/checkInCode';
import { exportToCSV } from '../utils/exportUtils';
import { listAttendanceBetween } from '../lib/api/attendance';
import { listMembers } from '../lib/api/members';
import { listMemberships, membershipIsUsable } from '../lib/api/memberships';
import { getGymSettings } from '../lib/api/settings';
import type { AttendanceRow } from '../types/db';
import { Av, HowPill, AttHead } from './attendance/parts';
import { CountUp, Skel, Spark } from '../components/ui/rd';
import { useAttCounts, clock } from './attendance/attData';
import './attendance/att.css';

/**
 * Attendance → History — built to the owner's v2 mock-up (2026-10-18), in its
 * own stylesheet (attendance/att.css).
 *
 * Mock-up B (owner, 2026-11-27, design/admin-v2/history-b.html): check-ins grouped by day, each with
 * a 6 am to 10 pm bar; a weekday by hour busy grid under the calendar; a flat figure strip.
 *
 * Any day, any range, back to the gym's first record. Four figures compare the
 * range with the same length of time just before it; a calendar with each day's
 * count (click a day to open just that day) and the average for each weekday;
 * Most regular, whose "See all" opens beside the page; and the check-ins, with
 * their own search (a name or the code) and filters.
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
 * Busiest day and hour, per-member counts, the calendar — all computed from the
 * rows on screen. Nothing is stored, so nothing can disagree with the log.
 */

/** 'YYYY-MM-DD' in Manila, never `toISOString()` — see the note above. */
function manilaDate(offsetDays = 0): string {
  const t = Date.now() + 8 * 3600_000 + offsetDays * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}
/** A date key shifted by whole days (UTC arithmetic on a date-only key is exact). */
function shift(key: string, days: number): string {
  const d = new Date(`${key}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
const span = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000) + 1;
/** Manila calendar day and hour of a check-in — the +8h shift, not `toISOString()`. */
const dayOf = (iso: string) => new Date(new Date(iso).getTime() + 8 * 3600_000).toISOString().slice(0, 10);
const hourOf = (iso: string) => new Date(new Date(iso).getTime() + 8 * 3600_000).getUTCHours();
/** 0 = Monday … 6 = Sunday, of a date key. */
const weekdayOf = (key: string) => (new Date(`${key}T00:00:00Z`).getUTCDay() + 6) % 7;
const WD = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const WD_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
// Dark shades by default; light.css gives the light ones (--hx-*), in the gym's own colour.
const STACK = ['var(--hx-1, #9578fb)', 'var(--hx-2, #6447c7)', 'var(--hx-3, #3b3560)'];

type Preset = '7' | '30' | '90' | 'year' | 'all' | 'custom';
const PAGE = 80;
/** The day bar and the busy grid run 6 am to 10 pm; an earlier or later check-in sits at the bar's end. */
const OPEN = 6, HOURS = 16;
const minuteOf = (iso: string) => new Date(new Date(iso).getTime() + 8 * 3600_000).getUTCMinutes();
const PRESETS: [Preset, string][] = [['7', 'Last 7 days'], ['30', 'Last 30 days'], ['90', 'Last 90 days'], ['year', 'This year'], ['all', 'All time']];

export default function AttendanceHistory() {
  const counts = useAttCounts();
  const [from, setFrom] = useState(manilaDate(-29));
  const [to, setTo] = useState(manilaDate());
  const firstDay = useGymFirstDay();
  const [preset, setPreset] = useState<Preset>('30');
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [prevTotal, setPrevTotal] = useState<number | null>(null);
  const [people, setPeople] = useState<Map<string, { name: string; photo: string | null }>>(new Map());
  const [activeCount, setActiveCount] = useState(0);
  const [showAllTop, setShowAllTop] = useState(false);
  const [activities, setActivities] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [search, setSearch] = useState('');
  const [activity, setActivity] = useState('');
  const [method, setMethod] = useState<'' | 'qr' | 'manual'>('');
  /** How many check-ins the log draws; more arrive as it scrolls (older days load as you scroll). */
  const [shown, setShown] = useState(PAGE);
  const resetShown = () => setShown(PAGE);
  /** A day clicked in the calendar, narrowing the log to it. Null = whole range. */
  const [dayFilter, setDayFilter] = useState<string | null>(null);
  const [calMonth, setCalMonth] = useState<string>(() => manilaDate().slice(0, 7));

  useEffect(() => {
    let alive = true;
    (async () => {
      const days = span(from, to);
      const [att, prev, members, ms, settings] = await Promise.all([
        listAttendanceBetween(from, to).catch(() => null),
        // The same length of time just before — the comparison under Check-ins. Optional.
        preset === 'all' ? Promise.resolve(null) : listAttendanceBetween(shift(from, -days), shift(from, -1)).catch(() => null),
        listMembers().catch(() => []),
        listMemberships().catch(() => []),
        getGymSettings().catch(() => null),
      ]);
      if (!alive) return;
      if (att === null) { setFailed(true); setLoading(false); return; }
      // Newest first, whatever the source returns: the log groups by day and a day must appear once.
      setRows([...att].sort((x, y) => y.check_in_time.localeCompare(x.check_in_time)));
      setPrevTotal(prev ? prev.length : null);
      setPeople(new Map(members.map((m) => [m.profile.id, { name: `${m.profile.first_name} ${m.profile.last_name}`.trim(), photo: m.profile.photo_url ?? null }])));
      const usable = new Set<string>();
      for (const m of ms) if (membershipIsUsable(m.status, m.expiry_date, m.never_expires)) usable.add(m.member_id);
      setActiveCount(usable.size);
      setActivities(settings?.activity_options ?? []);
      setFailed(false);
      setLoading(false);
      resetShown();
      // A day picked inside the old range is meaningless in the new one, and
      // leaving it set would show an empty log with no visible reason why.
      setDayFilter(null);
      setCalMonth(to.slice(0, 7));
    })();
    return () => { alive = false; };
  }, [from, to, preset]);

  const applyPreset = (p: Preset) => {
    setPreset(p);
    if (p === 'custom') return;
    // "All time" starts at the gym's first record (useGymFirstDay), never an invented 2002.
    setFrom(p === 'year' ? `${manilaDate().slice(0, 4)}-01-01` : p === 'all' ? (firstDay ?? manilaDate(-364)) : manilaDate(-(Number(p) - 1)));
    setTo(manilaDate());
  };

  /**
   * Everything matching the search/method/activity filters, across the whole
   * range — *before* a calendar day narrows it. The calendar and the cards
   * describe the range, so they must not shrink to the day you clicked.
   */
  const inRange = useMemo(() => {
    const q = search.trim().toLowerCase();
    const code = q.replace(/[\s-]/g, '');
    return rows.filter((r) => {
      if (method && r.method !== method) return false;
      if (activity && r.activity !== activity) return false;
      // A name, or the six-character code the member reads off their phone.
      if (q && !(people.get(r.member_id)?.name ?? '').toLowerCase().includes(q)
        && !(code.length >= 3 && checkInCodeOf(r.member_id).includes(code))) return false;
      return true;
    });
  }, [rows, search, activity, method, people]);
  const filtered = useMemo(() => (dayFilter ? inRange.filter((r) => dayOf(r.check_in_time) === dayFilter) : inRange), [inRange, dayFilter]);

  const stats = useMemo(() => {
    const byDay: Record<string, number> = {};
    const byMember = new Map<string, number>();
    const byHour = new Array(24).fill(0) as number[];
    const byActivity = new Map<string, number>();
    for (const r of inRange) {
      const d = dayOf(r.check_in_time);
      byDay[d] = (byDay[d] ?? 0) + 1;
      byMember.set(r.member_id, (byMember.get(r.member_id) ?? 0) + 1);
      byHour[hourOf(r.check_in_time)] += 1;
      const a = r.activity || 'Not recorded';
      byActivity.set(a, (byActivity.get(a) ?? 0) + 1);
    }
    const days = span(from, to);
    // The average for each weekday: its check-ins over how many of that weekday the range holds.
    const wdCount = new Array(7).fill(0) as number[], wdDays = new Array(7).fill(0) as number[];
    for (let i = 0; i < days; i++) wdDays[weekdayOf(shift(from, i))] += 1;
    for (const [d, n] of Object.entries(byDay)) wdCount[weekdayOf(d)] += n;
    const wdAvg = wdCount.map((n, i) => (wdDays[i] ? n / wdDays[i] : 0));
    // Busy hours: each weekday by hour, the average check-ins in that hour on that weekday.
    const grid = Array.from({ length: 7 }, () => new Array(HOURS).fill(0) as number[]);
    for (const r of inRange) {
      const h = hourOf(r.check_in_time) - OPEN;
      if (h >= 0 && h < HOURS) grid[weekdayOf(dayOf(r.check_in_time))][h] += 1;
    }
    const busy = grid.map((row, w) => row.map((n) => (wdDays[w] ? n / wdDays[w] : 0)));
    let peak: [number, number] | null = null;
    busy.forEach((row, w) => row.forEach((v, h) => { if (v > 0 && (!peak || v > busy[peak[0]][peak[1]])) peak = [w, h]; }));
    const busiestWd = inRange.length ? wdAvg.indexOf(Math.max(...wdAvg)) : null;
    const busiestHour = inRange.length ? byHour.indexOf(Math.max(...byHour)) : null;
    const topList = [...byMember.entries()].sort((a, b) => b[1] - a[1]);
    const acts = [...byActivity.entries()].sort((a, b) => b[1] - a[1]);
    return { byDay, days, wdAvg, busy, peak: peak as [number, number] | null, busiestWd, busiestHour, topList, top: topList.slice(0, 8), acts, unique: byMember.size };
  }, [inRange, from, to]);

  // The log, day by day (rows arrive newest first).
  const visible = filtered.slice(0, shown);
  const groups: [string, AttendanceRow[]][] = [];
  for (const r of visible) {
    const d = dayOf(r.check_in_time);
    if (groups.length && groups[groups.length - 1][0] === d) groups[groups.length - 1][1].push(r); else groups.push([d, [r]]);
  }
  const rangeLabel = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-PH', { day: 'numeric', month: 'short', year: 'numeric' });

  // Grey shapes where the range, the figures and the log will be, instead of a line of text.
  if (loading) return (
    <div className="att" data-history-loading aria-busy="true">
      <AttHead counts={counts} sub={<Skel w={260} h={12} />} />
      <div className="a-card flex-none" style={{ padding: '12px 14px' }}><Skel w="55%" h={24} /></div>
      <div className="a-figs3 hb-figs">
        {[0, 1, 2, 3].map((i) => <div key={i} className="a-card" style={{ display: 'grid', gap: 10 }}><Skel w={90} h={12} /><Skel w={70} h={30} /><Skel w="70%" h={12} /></div>)}
      </div>
      <div className="hb-wrap">
        {[0, 1, 2].map((i) => <div key={i} className="a-card" style={{ display: 'grid', alignContent: 'start', gap: 14 }}><Skel w={120} h={14} />{[0, 1, 2, 3].map((j) => <Skel key={j} w="100%" h={22} />)}</div>)}
      </div>
    </div>
  );
  if (failed) {
    return (
      <div className="att"><div className="a-card" style={{ padding: 28, alignItems: 'center', textAlign: 'center' }}>
        <AlertTriangle size={36} style={{ color: 'var(--a-a300)' }} />
        <b style={{ marginTop: 10, fontSize: 15 }}>Couldn't load attendance</b>
        <p className="a-sub" style={{ marginTop: 4 }}>A connection problem, not an empty log. No check-in has been lost. Reload to try again.</p>
      </div></div>
    );
  }

  const exportRows = () => exportToCSV(filtered.map((r) => ({
    member: people.get(r.member_id)?.name ?? r.member_id,
    date: dayOf(r.check_in_time), time: clock(r.check_in_time),
    method: r.method, where: r.source ?? '', activity: r.activity ?? '', tagged_by: r.activity_by ?? '',
  })), `attendance-${from}-to-${to}`);

  const total = inRange.length;
  const change = prevTotal ? Math.round(((total - prevTotal) / prevTotal) * 100) : null;
  const avg = total / Math.max(1, stats.days);
  const hourLabel = (h: number) => `${h % 12 || 12} ${h < 12 ? 'am' : 'pm'}`;
  const actTop = stats.acts.slice(0, 3);
  const dayLine = Array.from({ length: stats.days }, (_, i) => stats.byDay[shift(from, i)] ?? 0);
  // The calendar: Monday-first weeks of the month, each day lit by its count against the range's busiest day.
  const [cy, cm] = calMonth.split('-').map(Number);
  const firstOfMonth = `${calMonth}-01`;
  const lead = weekdayOf(firstOfMonth);
  const monthDays = new Date(Date.UTC(cy, cm, 0)).getUTCDate();
  const maxDay = Math.max(1, ...Object.values(stats.byDay));
  const level = (n: number) => (n === 0 ? 'l0' : n / maxDay > 0.75 ? 'l4' : n / maxDay > 0.5 ? 'l3' : n / maxDay > 0.25 ? 'l2' : 'l1');
  const outsideMonth = calMonth < from.slice(0, 7) || calMonth > to.slice(0, 7);
    const todayKey = manilaDate();

  return (
    <div className="att" data-attendance-history data-history-b>
      <AttHead counts={counts}
        sub={firstDay ? `Any day, any range, back to your first record on ${rangeLabel(firstDay)}` : 'Review check-ins across any date range.'}
        actions={<button type="button" className="a-btn amber" onClick={exportRows} data-tip="Export the check-ins shown below as CSV"><Download size={16} />Export {filtered.length}</button>} />

      {/* ── The range: presets and dates in one row ── */}
      <div className="hb-filters" data-history-range>
        <span className="hb-chips">
          {PRESETS.map(([p, label]) => (
            <button key={p} type="button" className={preset === p ? 'on' : ''} onClick={() => applyPreset(p)} aria-pressed={preset === p}>{label}</button>
          ))}
        </span>
        <Calendar size={15} style={{ color: 'var(--a-muted)', marginLeft: 6 }} />
        <span className="a-sub">From</span>
        <div style={{ width: 150 }}><DatePicker mode="history" bounds={{ earliest: firstDay }} value={from} max={to} onChange={(v) => { setFrom(v || from); setPreset('custom'); }} /></div>
        <span className="a-sub">to</span>
        <div style={{ width: 150 }}><DatePicker mode="history" bounds={{ earliest: firstDay }} value={to} min={from} onChange={(v) => { setTo(v || to); setPreset('custom'); }} /></div>
        <span className="a-sub" style={{ marginLeft: 'auto', whiteSpace: 'nowrap' }}>{preset === 'all' ? 'Since your first record' : `Compared with the ${stats.days} day${stats.days === 1 ? '' : 's'} before`}</span>
      </div>

      {/* ── The figures: one flat strip ── */}
      <div className="a-figs3 hb-figs" data-history-figures>
        <div className="a-card" data-fig-today>
          <div className="a-lbl">Check-ins</div>
          <div className="a-fig-row">
            <div className="a-num"><CountUp value={total} /></div>
            {/* Check-ins day by day across the range (the calendar's numbers, as a line). */}
            {total > 0 && <div className="a-trend" data-history-trend><Spark values={dayLine} label={`Check-ins each day, ${rangeLabel(from)} to ${rangeLabel(to)}`} /></div>}
          </div>
          <div className="a-sub">{change === null ? (prevTotal === 0 ? 'none in the days before' : `${rangeLabel(from)} to ${rangeLabel(to)}`)
            : <><span className={change >= 0 ? 'a-up' : 'a-dn'}>{change >= 0 ? '▲' : '▼'} {Math.abs(change)}%</span> vs {prevTotal!.toLocaleString('en-PH')} before</>}</div>
        </div>
        <div className="a-card">
          <div className="a-lbl">Different members</div>
          <div className="a-num"><CountUp value={stats.unique} /></div>
          <div className="a-sub">{activeCount ? `${Math.min(100, Math.round((stats.unique / activeCount) * 100))}% of active members came` : 'no active members yet'}</div>
        </div>
        <div className="a-card">
          <div className="a-lbl">Average a day</div>
          <div className="a-num">{avg >= 10 ? Math.round(avg) : avg.toFixed(1)}</div>
          <div className="a-sub">{stats.busiestWd === null ? 'nobody yet' : `busiest: ${WD_LONG[stats.busiestWd]}, ${hourLabel(stats.busiestHour!)}`}</div>
        </div>
        <div className="a-card">
          <div className="a-lbl">What they came for</div>
          <div className="a-stack">{total > 0 && actTop.map(([a, n], i) => <i key={a} style={{ flex: n, background: STACK[i] }} />)}</div>
          <div className="a-legend">
            {total === 0 ? <span>nothing yet</span> : actTop.map(([a, n], i) => (
              <button key={a} type="button" onClick={() => { if (a !== 'Not recorded') { setActivity(activity === a ? '' : a); resetShown(); } }} data-tip={a === 'Not recorded' ? undefined : 'Show only these'}>
                <span className="a-dot" style={{ background: STACK[i] }} />{a} {Math.round((n / total) * 100)}%
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="hb-wrap">
        <div className="hb-col">
          {/* ── The calendar ── */}
          <div className="a-card hb-cal" data-attendance-calendar>
            <div className="a-ct">
              <h3><Calendar size={16} />{new Date(Date.UTC(cy, cm - 1, 1)).toLocaleDateString('en-PH', { month: 'long', year: cy === Number(todayKey.slice(0, 4)) ? undefined : 'numeric', timeZone: 'UTC' })}</h3>
              <div style={{ display: 'flex', gap: 4 }}>
                <button type="button" className="a-btn ghost sm" aria-label="Previous month" onClick={() => setCalMonth(shift(firstOfMonth, -1).slice(0, 7))}><ChevronLeft size={14} /></button>
                <button type="button" className="a-btn ghost sm" aria-label="Next month" disabled={calMonth >= todayKey.slice(0, 7)} onClick={() => setCalMonth(shift(firstOfMonth, monthDays).slice(0, 7))}><ChevronRight size={14} /></button>
              </div>
            </div>
            <div className="a-cal">
              {WD.map((w, i) => <span key={i}>{w}</span>)}
              {Array.from({ length: lead }, (_, i) => <span key={`b${i}`} />)}
              {Array.from({ length: monthDays }, (_, i) => {
                const d = `${calMonth}-${String(i + 1).padStart(2, '0')}`;
                const n = stats.byDay[d] ?? 0;
                const loaded = d >= from && d <= to;
                return (
                  <button key={d} type="button" disabled={!loaded || d > todayKey} data-day={d}
                    className={`${loaded ? level(n) : 'l0 a-out'} ${dayFilter === d ? 'sel' : ''} ${d === todayKey ? 'today' : ''}`}
                    onClick={() => { setDayFilter(dayFilter === d ? null : d); resetShown(); }} data-tip={loaded ? `${n} check-in${n === 1 ? '' : 's'}` : 'Outside the range'}>
                    {i + 1}{loaded && n > 0 && <small>{n}</small>}
                  </button>
                );
              })}
            </div>
            <div className="a-sub" style={{ marginTop: 6 }}>
              {/* An empty month outside the loaded range would read as "nobody came" when it was never fetched. */}
              {outsideMonth ? <span style={{ color: 'var(--a-a300)' }}>This month is outside the range above. Widen the range to load it.</span> : 'Pick a day to open just that day'}
            </div>
          </div>

          {/* ── Busy hours: each weekday by hour (replaces the weekday bars) ── */}
          <div className="a-card hb-heat" data-busy-hours>
            <div className="a-ct"><h3>Busy hours <span className="a-sub" style={{ fontWeight: 500 }}>average check-ins</span></h3></div>
            <div className="hb-heatg" data-weekday-bars>
              <div className="hb-hrow"><span />{Array.from({ length: HOURS }, (_, i) => <span key={i}>{(i + OPEN) % 3 === 0 ? (i + OPEN) % 12 || 12 : ''}</span>)}</div>
              {stats.busy.map((row, w) => (
                <div key={w} className="hb-hrow">
                  <span className="d">{WD[w]}</span>
                  {row.map((v, h) => {
                    const max = stats.peak ? stats.busy[stats.peak[0]][stats.peak[1]] : 1;
                    return <u key={h} style={{ background: v ? `color-mix(in srgb, var(--color-primary) ${Math.round(15 + (v / max) * 70)}%, var(--a-raised))` : undefined }}
                      data-tip={`${WD_LONG[w]}, ${hourLabel(h + OPEN)}: ${v >= 10 ? Math.round(v) : v.toFixed(1).replace(/\.0$/, '')} on average`} />;
                  })}
                </div>
              ))}
            </div>
            <p className="a-sub hb-note">{stats.peak ? <>Busiest: <b>{WD_LONG[stats.peak[0]]}, {hourLabel(stats.peak[1] + OPEN)} to {hourLabel(stats.peak[1] + OPEN + 1)}</b></> : 'Nobody between 6 am and 10 pm in this range.'}</p>
          </div>
        </div>

        {/* ── The check-ins, day by day ── */}
        <div className="a-card hb-log" data-history-log>
          <div className="hb-logbar">
            <h3>Check-ins <span className="a-sub" style={{ fontWeight: 500 }}>{filtered.length.toLocaleString('en-PH')}</span></h3>
            {/* Narrowed to a day: said out loud, with the way out attached. */}
            {dayFilter && (
              <button type="button" className="a-chip on" onClick={() => { setDayFilter(null); resetShown(); }}>
                {new Date(`${dayFilter}T00:00:00`).toLocaleDateString('en-PH', { weekday: 'short', day: 'numeric', month: 'short' })} <X size={12} />
              </button>
            )}
            <div className="hb-tools">
              <label className="a-input sm" style={{ width: 160, minWidth: 0 }} data-history-search><Search size={14} />
                <input value={search} onChange={(e) => { setSearch(e.target.value); resetShown(); }} placeholder="Name or code" aria-label="Search check-ins" /></label>
              <select className="a-chip" value={method} onChange={(e) => { setMethod(e.target.value as '' | 'qr' | 'manual'); resetShown(); }} aria-label="Filter by method" style={{ maxWidth: 118 }}>
                <option value="">Any method</option><option value="qr">Scanned</option><option value="manual">Typed</option>
              </select>
              {activities.length > 0 && (
                <select className="a-chip" value={activity} onChange={(e) => { setActivity(e.target.value); resetShown(); }} aria-label="Filter by activity" style={{ maxWidth: 118 }}>
                  <option value="">Any activity</option>{activities.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              )}
            </div>
          </div>
          <div className="hb-days" data-rd-table
            onScroll={(e) => { const el = e.currentTarget; if (shown < filtered.length && el.scrollTop + el.clientHeight > el.scrollHeight - 200) setShown((n) => n + PAGE); }}>
            {groups.map(([d, list]) => {
              const label = d === todayKey ? 'Today' : d === shift(todayKey, -1) ? 'Yesterday' : WD_LONG[weekdayOf(d)];
              return (
                <Fragment key={d}>
                  <div className="hb-dh" data-log-day={d}>
                    <span><b>{label}</b><small>{new Date(`${d}T00:00:00`).toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', year: d.slice(0, 4) === todayKey.slice(0, 4) ? undefined : 'numeric' })}</small></span>
                    <div className="hb-tl" aria-hidden>
                      <span className="track" />
                      {[6, 10, 14, 18, 22].map((x) => <em key={x} style={{ left: `${((x - OPEN) / HOURS) * 100}%` }}>{hourLabel(x)}</em>)}
                      {list.map((r, i) => <i key={`${r.id}:${i}`} style={{ left: `${Math.min(100, Math.max(0, ((hourOf(r.check_in_time) + minuteOf(r.check_in_time) / 60 - OPEN) / HOURS) * 100))}%` }} />)}
                    </div>
                    <span className="n">{list.length}</span>
                  </div>
                  <table className="a-table hb-rows">
                    <tbody>
                      {list.map((r, i) => {
                        const p = people.get(r.member_id);
                        return (
                          <tr key={`${r.id}:${i}`}>
                            <td className="hb-time">{clock(r.check_in_time)}</td>
                            <td><div className="a-who"><Av name={p?.name ?? '?'} photo={p?.photo} small />{p ? <b className="truncate">{p.name}</b> : <span className="a-sub">Archived member</span>}</div></td>
                            <td><HowPill row={r} /></td>
                            {/* Never invented: a check-in taken without picking one says so. Whose tag it is (0200). */}
                            <td>{r.activity ? (
                              <span className="inline-flex items-center gap-2">{r.activity}
                                {r.activity_by === 'member' && <span className="a-pill v">their pick</span>}
                                {r.activity_by === 'desk' && <span className="a-pill a">desk</span>}
                              </span>
                            ) : <span className="a-sub">Not recorded</span>}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </Fragment>
              );
            })}
            {filtered.length === 0 && <p className="a-sub text-center" style={{ padding: 22 }}>No check-ins match those filters.</p>}
            {shown < filtered.length && <p className="a-sub" style={{ padding: '12px 16px' }}>Older days load as you scroll.</p>}
          </div>
          {filtered.length > 0 && (
            <div className="hb-foot a-sub" data-rd-footer>
              <span>Showing {Math.min(shown, filtered.length).toLocaleString('en-PH')} of {filtered.length.toLocaleString('en-PH')}</span>
            </div>
          )}
        </div>

        {/* ── Most regular ── */}
        <div className="a-card hb-reg" data-most-regular>
          <div className="a-ct">
            <h3><Medal size={16} />Most regular</h3>
            {/* The whole list opens beside the page; it used to expand in place and push everything else down. */}
            {stats.topList.length > stats.top.length && (
              <button type="button" className="a-btn sm" onClick={() => setShowAllTop(true)} data-see-all-regulars>See all {stats.topList.length} <ArrowRight size={13} /></button>
            )}
          </div>
          <div className="a-scroll" style={{ flex: 1 }}>
            {stats.top.length === 0 ? <p className="a-sub" style={{ padding: '10px 16px' }}>Nobody yet.</p> : stats.top.map(([id, n], i) => {
              const p = people.get(id);
              return (
                <button key={id} type="button" className="a-row w-full text-left" onClick={() => { setSearch(p?.name ?? ''); resetShown(); }} data-tip="Show only their check-ins">
                  <span className={`a-rank ${i === 0 ? 'g' : ''}`}>{i + 1}</span>
                  <Av name={p?.name ?? '?'} photo={p?.photo} small />
                  <div className="t">
                    {/* An archived member's rows stay; deleting history to tidy a name would be worse. */}
                    <b>{p?.name ?? 'Archived member'}</b>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 3 }}>
                      <div className="a-bar"><i style={{ width: `${(n / (stats.top[0]?.[1] || 1)) * 100}%` }} /></div><span className="a-sub">{n}</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Everyone who came in the range, by visits — beside the page, never pushing it down. */}
      <DetailSheet open={showAllTop} onClose={() => setShowAllTop(false)} title="Most regular"
        subtitle={`${stats.topList.length} member${stats.topList.length === 1 ? '' : 's'} came · ${rangeLabel(from)} to ${rangeLabel(to)}`}>
        <div className="att" style={{ height: 'auto', overflow: 'visible' }} data-regulars-sheet>
          {stats.topList.map(([id, n], i) => {
            const p = people.get(id);
            return (
              <button key={id} type="button" className="a-row w-full text-left" onClick={() => { setSearch(p?.name ?? ''); resetShown(); setShowAllTop(false); }}>
                <span className={`a-rank ${i === 0 ? 'g' : ''}`}>{i + 1}</span>
                <Av name={p?.name ?? '?'} photo={p?.photo} small />
                <div className="t"><b>{p?.name ?? 'Archived member'}</b>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 3 }}><div className="a-bar"><i style={{ width: `${(n / (stats.topList[0]?.[1] || 1)) * 100}%` }} /></div><span className="a-sub">{n}</span></div>
                </div>
              </button>
            );
          })}
        </div>
      </DetailSheet>
    </div>
  );
}
