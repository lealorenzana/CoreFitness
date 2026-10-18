import { useEffect, useMemo, useState } from 'react';
import { Download, AlertTriangle, Calendar, ChevronLeft, ChevronRight, Medal, ListChecks, ArrowRight, Search, X } from 'lucide-react';
import DatePicker from '../components/ui/DatePicker';
import DetailSheet from '../components/ui/DetailSheet';
import { useGymFirstDay } from '../hooks/useGymFirstDay';
import { useFitRows } from '../hooks/useFitRows';
import { checkInCodeOf } from '../utils/checkInCode';
import { exportToCSV } from '../utils/exportUtils';
import { listAttendanceBetween } from '../lib/api/attendance';
import { listMembers } from '../lib/api/members';
import { listMemberships, membershipIsUsable } from '../lib/api/memberships';
import { getGymSettings } from '../lib/api/settings';
import type { AttendanceRow } from '../types/db';
import { Av, HowPill, AttHead } from './attendance/parts';
import { useAttCounts, clock } from './attendance/attData';
import './attendance/att.css';

/**
 * Attendance → History — built to the owner's v2 mock-up (2026-10-18), in its
 * own stylesheet (attendance/att.css).
 *
 * Any day, any range, back to the gym's first record. Four cards compare the
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
const STACK = ['#9578fb', '#6447c7', '#3b3560'];

type Preset = '7' | '30' | '90' | 'year' | 'all' | 'custom';
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
  const [page, setPage] = useState(1);
  /** A day clicked in the calendar, narrowing the log to it. Null = whole range. */
  const [dayFilter, setDayFilter] = useState<string | null>(null);
  const [calMonth, setCalMonth] = useState<string>(() => manilaDate().slice(0, 7));
  const { ref: fitRef, perPage, rowHeight } = useFitRows(8);

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
      setRows(att);
      setPrevTotal(prev ? prev.length : null);
      setPeople(new Map(members.map((m) => [m.profile.id, { name: `${m.profile.first_name} ${m.profile.last_name}`.trim(), photo: m.profile.photo_url ?? null }])));
      const usable = new Set<string>();
      for (const m of ms) if (membershipIsUsable(m.status, m.expiry_date, m.never_expires)) usable.add(m.member_id);
      setActiveCount(usable.size);
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
    const busiestWd = inRange.length ? wdAvg.indexOf(Math.max(...wdAvg)) : null;
    const busiestHour = inRange.length ? byHour.indexOf(Math.max(...byHour)) : null;
    const topList = [...byMember.entries()].sort((a, b) => b[1] - a[1]);
    const acts = [...byActivity.entries()].sort((a, b) => b[1] - a[1]);
    return { byDay, days, wdAvg, busiestWd, busiestHour, topList, top: topList.slice(0, 8), acts, unique: byMember.size };
  }, [inRange, from, to]);

  const pages = Math.max(1, Math.ceil(filtered.length / perPage));
  const current = Math.min(page, pages);
  const visible = filtered.slice((current - 1) * perPage, current * perPage);
  const rangeLabel = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-PH', { day: 'numeric', month: 'short', year: 'numeric' });

  if (loading) return <div className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Loading attendance…</div>;
  if (failed) {
    return (
      <div className="att"><div className="a-card" style={{ padding: 28, alignItems: 'center', textAlign: 'center' }}>
        <AlertTriangle size={36} style={{ color: 'var(--a-a300)' }} />
        <b style={{ marginTop: 10, fontSize: 15 }}>Couldn't load attendance</b>
        <p className="a-sub" style={{ marginTop: 4 }}>A connection problem, not an empty log — no check-in has been lost. Reload to try again.</p>
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
  // The calendar: Monday-first weeks of the month, each day lit by its count against the range's busiest day.
  const [cy, cm] = calMonth.split('-').map(Number);
  const firstOfMonth = `${calMonth}-01`;
  const lead = weekdayOf(firstOfMonth);
  const monthDays = new Date(Date.UTC(cy, cm, 0)).getUTCDate();
  const maxDay = Math.max(1, ...Object.values(stats.byDay));
  const level = (n: number) => (n === 0 ? 'l0' : n / maxDay > 0.75 ? 'l4' : n / maxDay > 0.5 ? 'l3' : n / maxDay > 0.25 ? 'l2' : 'l1');
  const outsideMonth = calMonth < from.slice(0, 7) || calMonth > to.slice(0, 7);
  const maxWd = Math.max(1, ...stats.wdAvg);
  const todayKey = manilaDate();

  return (
    <div className="att" data-attendance-history>
      <AttHead counts={counts}
        sub={firstDay ? `Any day, any range — back to your first record, ${rangeLabel(firstDay)}` : 'Review check-ins across any date range.'}
        actions={<button type="button" className="a-btn amber" onClick={exportRows} data-tip="Export the check-ins shown below as CSV"><Download size={16} />Export {filtered.length}</button>} />

      {/* ── The range ── */}
      <div className="a-card flex-none" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: '9px 12px' }} data-history-range>
        {PRESETS.map(([p, label]) => (
          <button key={p} type="button" className={`a-chip ${preset === p ? 'on' : ''}`} onClick={() => applyPreset(p)} aria-pressed={preset === p}>{label}</button>
        ))}
        <span style={{ width: 1, alignSelf: 'stretch', background: 'var(--a-line)', margin: '0 6px' }} />
        <Calendar size={15} style={{ color: 'var(--a-muted)' }} />
        <span className="a-sub">From</span>
        <div style={{ width: 150 }}><DatePicker mode="history" bounds={{ earliest: firstDay }} value={from} max={to} onChange={(v) => { setFrom(v || from); setPreset('custom'); }} /></div>
        <span className="a-sub">to</span>
        <div style={{ width: 150 }}><DatePicker mode="history" bounds={{ earliest: firstDay }} value={to} min={from} onChange={(v) => { setTo(v || to); setPreset('custom'); }} /></div>
        <span className="a-sub" style={{ marginLeft: 'auto' }}>{preset === 'all' ? 'Since your first record' : `Compared with the ${stats.days} day${stats.days === 1 ? '' : 's'} before`}</span>
      </div>

      {/* ── Four cards ── */}
      <div className="a-grid flex-none" style={{ gridTemplateColumns: 'repeat(4,minmax(0,1fr))' }}>
        <div className="a-card">
          <div className="a-lbl">Check-ins</div>
          <div className="a-num">{total.toLocaleString('en-PH')}</div>
          <div className="a-sub">{change === null ? (prevTotal === 0 ? 'none in the days before' : `${rangeLabel(from)} – ${rangeLabel(to)}`)
            : <><span className={change >= 0 ? 'a-up' : 'a-dn'}>{change >= 0 ? '▲' : '▼'} {Math.abs(change)}%</span> vs {prevTotal!.toLocaleString('en-PH')} before</>}</div>
        </div>
        <div className="a-card">
          <div className="a-lbl">Different members</div>
          <div className="a-num">{stats.unique}</div>
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
              <button key={a} type="button" onClick={() => { if (a !== 'Not recorded') { setActivity(activity === a ? '' : a); setPage(1); } }} data-tip={a === 'Not recorded' ? undefined : 'Show only these'}>
                <span className="a-dot" style={{ background: STACK[i] }} />{a} {Math.round((n / total) * 100)}%
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="a-grid" style={{ gridTemplateColumns: 'minmax(0,1.05fr) minmax(0,.95fr) minmax(0,1.9fr)', flex: 1 }}>
        {/* ── The calendar ── */}
        <div className="a-card" data-attendance-calendar>
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
                  onClick={() => { setDayFilter(dayFilter === d ? null : d); setPage(1); }} data-tip={loaded ? `${n} check-in${n === 1 ? '' : 's'}` : 'Outside the range'}>
                  {i + 1}{loaded && n > 0 && <small>{n}</small>}
                </button>
              );
            })}
          </div>
          <div className="a-sub" style={{ marginTop: 6 }}>
            {/* An empty month outside the loaded range would read as "nobody came" when it was never fetched. */}
            {outsideMonth ? <span style={{ color: 'var(--a-a300)' }}>This month is outside the range above. Widen the range to load it.</span> : 'Click a day to open just that day'}
          </div>
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--a-border)', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div className="a-lbl" style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}><span>By day of the week</span><span>avg check-ins</span></div>
            <div style={{ display: 'flex', alignItems: 'stretch', gap: 6, flex: 1, minHeight: 60 }} data-weekday-bars>
              {stats.wdAvg.map((v, i) => (
                <div key={i} style={{ flex: 1, textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                  <div className="a-sub" style={{ fontSize: 10, marginBottom: 3 }}>{v >= 10 ? Math.round(v) : v.toFixed(1).replace(/\.0$/, '')}</div>
                  <div style={{ height: `${Math.max(2, (v / maxWd) * 75)}%`, background: i === stats.busiestWd ? '#9578fb' : v / maxWd < 0.7 ? '#2a2250' : '#41317f', borderRadius: '5px 5px 2px 2px' }} />
                  <div className="a-sub" style={{ fontSize: 10, marginTop: 3, color: i === stats.busiestWd ? '#fff' : undefined }}>{WD[i]}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Most regular ── */}
        <div className="a-card" data-most-regular>
          <div className="a-ct">
            <h3><Medal size={16} />Most regular</h3>
            {/* The whole list opens beside the page — it used to expand in place and push everything else down. */}
            {stats.topList.length > stats.top.length && (
              <button type="button" className="a-btn sm" onClick={() => setShowAllTop(true)} data-see-all-regulars>See all {stats.topList.length} <ArrowRight size={13} /></button>
            )}
          </div>
          <div className="a-scroll" style={{ flex: 1 }}>
            {stats.top.length === 0 ? <p className="a-sub" style={{ paddingTop: 10 }}>Nobody yet.</p> : stats.top.map(([id, n], i) => {
              const p = people.get(id);
              return (
                <button key={id} type="button" className="a-row w-full text-left" onClick={() => { setSearch(p?.name ?? ''); setPage(1); }} data-tip="Show only their check-ins">
                  <span className={`a-rank ${i === 0 ? 'g' : ''}`}>{i + 1}</span>
                  <Av name={p?.name ?? '?'} photo={p?.photo} small />
                  <div className="t">
                    {/* An archived member's rows stay — deleting history to tidy a name would be worse. */}
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

        {/* ── The check-ins ── */}
        <div className="a-card" data-history-log>
          <div className="a-ct">
            <h3><ListChecks size={16} />Check-ins</h3>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', minWidth: 0 }}>
              <label className="a-input sm" style={{ width: 160, minWidth: 0 }} data-history-search><Search size={14} />
                <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Name or code…" aria-label="Search check-ins" /></label>
              <select className="a-chip" value={method} onChange={(e) => { setMethod(e.target.value as '' | 'qr' | 'manual'); setPage(1); }} aria-label="Filter by method" style={{ maxWidth: 118 }}>
                <option value="">Any method</option><option value="qr">Scanned</option><option value="manual">Typed</option>
              </select>
              {activities.length > 0 && (
                <select className="a-chip" value={activity} onChange={(e) => { setActivity(e.target.value); setPage(1); }} aria-label="Filter by activity" style={{ maxWidth: 118 }}>
                  <option value="">Any activity</option>{activities.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              )}
            </div>
          </div>
          {/* Narrowed to a day — said out loud, with the way out attached. */}
          {dayFilter && (
            <button type="button" className="a-chip on self-start" style={{ marginBottom: 8 }} onClick={() => { setDayFilter(null); setPage(1); }}>
              {new Date(`${dayFilter}T00:00:00`).toLocaleDateString('en-PH', { weekday: 'short', day: 'numeric', month: 'short' })} <X size={12} />
            </button>
          )}
          <div ref={fitRef} className="a-scroll" style={{ flex: 1 }} data-rd-table>
            <table className="a-table">
              <thead><tr><th>When</th><th>Member</th><th>How</th><th>Activity</th></tr></thead>
              <tbody>
                {visible.map((r) => {
                  const p = people.get(r.member_id);
                  return (
                    <tr key={r.id} style={{ height: filtered.length > perPage ? rowHeight : undefined }}>
                      <td className="whitespace-nowrap"><b>{new Date(`${dayOf(r.check_in_time)}T00:00:00`).toLocaleDateString('en-PH', { day: 'numeric', month: 'short' })}</b> <span className="a-sub">{clock(r.check_in_time)}</span></td>
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
            {visible.length === 0 && <p className="a-sub text-center" style={{ padding: 22 }}>No check-ins match those filters.</p>}
          </div>
          {filtered.length > 0 && (
            <div className="a-sub" style={{ paddingTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }} data-rd-footer>
              <span>{(current - 1) * perPage + 1}–{Math.min(filtered.length, current * perPage)} of {filtered.length.toLocaleString('en-PH')}</span>
              {pages > 1 && (
                <span style={{ display: 'flex', gap: 4 }}>
                  {[...new Set([1, current - 1, current, current + 1, pages])].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b).map((n, i, arr) => (
                    <span key={n} style={{ display: 'flex', gap: 4 }}>
                      {i > 0 && n - arr[i - 1] > 1 && <span className="a-chip" style={{ padding: '3px 9px', cursor: 'default' }}>…</span>}
                      <button type="button" className={`a-chip ${n === current ? 'v' : ''}`} style={{ padding: '3px 9px' }} onClick={() => setPage(n)} aria-current={n === current ? 'page' : undefined}>{n}</button>
                    </span>
                  ))}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Everyone who came in the range, by visits — beside the page, never pushing it down. */}
      <DetailSheet open={showAllTop} onClose={() => setShowAllTop(false)} title="Most regular"
        subtitle={`${stats.topList.length} member${stats.topList.length === 1 ? '' : 's'} came · ${rangeLabel(from)} – ${rangeLabel(to)}`}>
        <div className="att" style={{ height: 'auto', overflow: 'visible' }} data-regulars-sheet>
          {stats.topList.map(([id, n], i) => {
            const p = people.get(id);
            return (
              <button key={id} type="button" className="a-row w-full text-left" onClick={() => { setSearch(p?.name ?? ''); setPage(1); setShowAllTop(false); }}>
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
