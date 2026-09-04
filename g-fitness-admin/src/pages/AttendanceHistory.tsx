import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  CalendarCheck, Search, Download, AlertTriangle, QrCode, Hand, Users, TrendingUp,
} from 'lucide-react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import DatePicker from '../components/ui/DatePicker';
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
  const [preset, setPreset] = useState<Preset>('30');
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [activities, setActivities] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [search, setSearch] = useState('');
  const [activity, setActivity] = useState('');
  const [method, setMethod] = useState<'' | 'qr' | 'manual'>('');
  const [page, setPage] = useState(1);

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
      setNames(new Map(members.map((m) =>
        [m.profile.id, `${m.profile.first_name} ${m.profile.last_name}`.trim()])));
      setActivities(settings?.activity_options ?? []);
      setFailed(false);
      setLoading(false);
      setPage(1);
    })();
    return () => { alive = false; };
  }, [from, to]);

  const applyPreset = (p: Preset) => {
    setPreset(p);
    if (p === 'custom') return;
    setFrom(manilaDate(-(Number(p) - 1)));
    setTo(manilaDate());
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (method && r.method !== method) return false;
      if (activity && r.activity !== activity) return false;
      if (q && !(names.get(r.member_id) ?? '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, search, activity, method, names]);

  const stats = useMemo(() => {
    const byDay = new Map<string, number>();
    const byMember = new Map<string, number>();
    let qr = 0;
    for (const r of filtered) {
      const d = new Date(new Date(r.check_in_time).getTime() + 8 * 3600_000)
        .toISOString().slice(0, 10);
      byDay.set(d, (byDay.get(d) ?? 0) + 1);
      byMember.set(r.member_id, (byMember.get(r.member_id) ?? 0) + 1);
      if (r.method === 'qr') qr += 1;
    }
    const days = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    const busiest = [...byDay.entries()].sort((a, b) => b[1] - a[1])[0] ?? null;
    const top = [...byMember.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    const spanDays = Math.max(1,
      Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86_400_000) + 1);
    return {
      total: filtered.length,
      uniqueMembers: byMember.size,
      qr,
      manual: filtered.length - qr,
      perDay: (filtered.length / spanDays).toFixed(1),
      busiest,
      top,
      days,
      peak: Math.max(...days.map((d) => d[1]), 1),
    };
  }, [filtered, from, to]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const visible = filtered.slice((page - 1) * PAGE, page * PAGE);

  const timeLabel = (iso: string) =>
    new Date(iso).toLocaleString('en-PH', {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    });

  if (loading) {
    return <div className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Loading attendance…</div>;
  }

  if (failed) {
    return (
      <Card className="!p-4">
        <div className="flex items-start gap-2">
          <AlertTriangle size={14} className="mt-0.5" style={{ color: 'var(--color-secondary)' }} />
          <div>
            <p className="text-xs font-semibold text-white">Couldn&apos;t load attendance</p>
            <p className="text-[10px] mt-1" style={{ color: 'var(--color-text-muted)' }}>
              A connection problem, not an empty log — no check-in has been lost. Reload to try again.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Attendance History</h1>
          <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
            Who came in, when, and how they checked in — over any range
          </p>
        </div>
        <Button variant="secondary"
          onClick={() => exportToCSV(
            filtered.map((r) => ({
              member: names.get(r.member_id) ?? r.member_id,
              when: timeLabel(r.check_in_time),
              method: r.method,
              activity: r.activity ?? '',
            })),
            `attendance-${from}-to-${to}`
          )}>
          <Download size={15} /> Export {filtered.length}
        </Button>
      </motion.div>

      {/* ── Range ────────────────────────────────────────────────────────── */}
      <Card className="!p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex gap-1.5">
            {([['7', 'Last 7 days'], ['30', 'Last 30'], ['90', 'Last 90']] as [Preset, string][])
              .map(([p, label]) => (
                <button key={p} onClick={() => applyPreset(p)}
                  className="px-3 py-2 rounded-lg text-[11px] font-semibold"
                  style={{
                    background: preset === p ? 'var(--color-primary)' : 'var(--color-surface-high)',
                    border: `1px solid ${preset === p ? 'var(--color-primary)' : 'var(--color-border)'}`,
                    color: preset === p ? '#fff' : 'var(--color-text-secondary)',
                  }}>
                  {label}
                </button>
              ))}
          </div>
          <label className="w-40">
            <span className="text-[10px] uppercase" style={{ color: 'var(--color-text-muted)' }}>From</span>
            <DatePicker value={from} max={to}
              onChange={(v) => { setFrom(v || from); setPreset('custom'); }} />
          </label>
          <label className="w-40">
            <span className="text-[10px] uppercase" style={{ color: 'var(--color-text-muted)' }}>To</span>
            <DatePicker value={to} min={from} max={manilaDate()}
              onChange={(v) => { setTo(v || to); setPreset('custom'); }} />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2 mt-3 pt-3"
          style={{ borderTop: '1px solid var(--color-border)' }}>
          <div className="relative flex-1 min-w-[180px]">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2"
              style={{ color: 'var(--color-text-muted)' }} />
            <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search member…"
              className="w-full h-9 pl-8 pr-3 rounded-lg text-xs text-white"
              style={{ background: 'var(--color-surface-high)', border: '1px solid var(--color-border)' }} />
          </div>
          <select value={method} onChange={(e) => { setMethod(e.target.value as '' | 'qr' | 'manual'); setPage(1); }}
            className="h-9 px-3 rounded-lg text-xs text-white"
            style={{ background: 'var(--color-surface-high)', border: '1px solid var(--color-border)' }}>
            <option value="">Any method</option>
            <option value="qr">QR scan</option>
            <option value="manual">Manual</option>
          </select>
          {activities.length > 0 && (
            <select value={activity} onChange={(e) => { setActivity(e.target.value); setPage(1); }}
              className="h-9 px-3 rounded-lg text-xs text-white"
              style={{ background: 'var(--color-surface-high)', border: '1px solid var(--color-border)' }}>
              <option value="">Any activity</option>
              {activities.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          )}
        </div>
      </Card>

      {/* ── What the range says ──────────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Check-ins', value: String(stats.total), icon: CalendarCheck },
          { label: 'Unique members', value: String(stats.uniqueMembers), icon: Users },
          { label: 'Average per day', value: stats.perDay, icon: TrendingUp },
          { label: 'Scanned vs typed', value: `${stats.qr} / ${stats.manual}`, icon: QrCode },
        ].map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="rounded-xl p-3 flex items-center gap-3"
              style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
              <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: 'var(--color-primary-light)' }}>
                <Icon size={16} style={{ color: 'var(--color-primary)' }} />
              </div>
              <div className="min-w-0">
                <p className="text-[9px] uppercase" style={{ color: 'var(--color-text-muted)' }}>{s.label}</p>
                <p className="text-lg font-bold text-white tabular-nums">{s.value}</p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* ── Daily shape ────────────────────────────────────────────────── */}
        <Card className="!p-4 col-span-2">
          <div className="flex items-baseline justify-between mb-3">
            <h3 className="text-sm font-bold text-white">Check-ins per day</h3>
            {stats.busiest && (
              <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                Busiest: {new Date(stats.busiest[0]).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}
                {' '}({stats.busiest[1]})
              </p>
            )}
          </div>
          {stats.days.length === 0 ? (
            <p className="text-xs py-8 text-center" style={{ color: 'var(--color-text-muted)' }}>
              No check-ins in this range.
            </p>
          ) : (
            <div className="flex items-end gap-0.5" style={{ height: 120 }}>
              {stats.days.map(([day, n]) => (
                <div key={day} className="flex-1 flex flex-col justify-end h-full"
                  title={`${new Date(day).toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' })} — ${n} check-in${n === 1 ? '' : 's'}`}>
                  <div className="w-full rounded-t"
                    style={{
                      height: `${Math.max(3, (n / stats.peak) * 112)}px`,
                      background: n >= stats.peak * 0.8 ? 'var(--color-secondary)' : 'var(--color-primary)',
                    }} />
                </div>
              ))}
            </div>
          )}
          <p className="text-[10px] mt-2" style={{ color: 'var(--color-text-muted)' }}>
            {new Date(from).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}
            {' → '}
            {new Date(to).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}
            {' · hover a bar for the day'}
          </p>
        </Card>

        {/* ── Who came most ──────────────────────────────────────────────── */}
        <Card className="!p-4">
          <h3 className="text-sm font-bold text-white mb-3">Most regular</h3>
          {stats.top.length === 0 ? (
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Nobody yet.</p>
          ) : (
            <div className="space-y-2">
              {stats.top.map(([id, n], i) => (
                <div key={id} className="flex items-center gap-2.5">
                  <span className="w-5 text-[10px] font-bold tabular-nums"
                    style={{ color: 'var(--color-text-muted)' }}>{i + 1}</span>
                  <span className="flex-1 text-xs text-white truncate">
                    {names.get(id) ?? 'Unknown member'}
                  </span>
                  <span className="text-xs font-bold tabular-nums" style={{ color: 'var(--color-primary)' }}>
                    {n}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* ── The log ──────────────────────────────────────────────────────── */}
      <Card className="!p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-white">
            {filtered.length} check-in{filtered.length === 1 ? '' : 's'}
          </h3>
          {pages > 1 && (
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}>Previous</Button>
              <span className="text-[11px] tabular-nums" style={{ color: 'var(--color-text-muted)' }}>
                {page} / {pages}
              </span>
              <Button variant="ghost" size="sm" disabled={page === pages}
                onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          )}
        </div>

        {visible.length === 0 ? (
          <p className="text-xs py-8 text-center" style={{ color: 'var(--color-text-muted)' }}>
            No check-ins match those filters.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full" style={{ minWidth: 520 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                  {['Member', 'When', 'How', 'Activity'].map((h) => (
                    <th key={h} className="text-left py-2 px-2 text-[10px] font-semibold uppercase"
                      style={{ color: 'var(--color-text-muted)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <tr key={r.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <td className="py-2 px-2 text-xs text-white">
                      {names.get(r.member_id) ?? (
                        // An archived member's rows stay in the log — deleting
                        // history to tidy a name would be worse than this.
                        <span style={{ color: 'var(--color-text-muted)' }}>Archived member</span>
                      )}
                    </td>
                    <td className="py-2 px-2 text-xs tabular-nums" style={{ color: 'var(--color-text-secondary)' }}>
                      {timeLabel(r.check_in_time)}
                    </td>
                    <td className="py-2 px-2">
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold inline-flex items-center gap-1"
                        style={{
                          background: r.method === 'qr' ? 'var(--color-primary-light)' : 'var(--color-surface-high)',
                          color: r.method === 'qr' ? 'var(--color-primary)' : 'var(--color-text-muted)',
                        }}>
                        {r.method === 'qr' ? <QrCode size={9} /> : <Hand size={9} />}
                        {r.method === 'qr' ? 'Scanned' : 'By hand'}
                      </span>
                    </td>
                    <td className="py-2 px-2 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                      {/* Never invented. A check-in recorded before the field
                          existed, or taken without picking one, says so. */}
                      {r.activity ?? <span style={{ color: 'var(--color-text-muted)' }}>Not recorded</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
