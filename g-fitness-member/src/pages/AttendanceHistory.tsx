import { SkeletonList } from '../components/ui/Skeleton';
import { motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Calendar, TrendingUp, Award, Flame } from 'lucide-react';
import { getCurrentUser } from '../utils/auth';
import { listMemberAttendance } from '../lib/api/attendance';
import type { AttendanceRow } from '../types/db';
import { dateKey, localDateKey } from '../utils/dates';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DAY_HEADERS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Longest run of consecutive calendar days (ending today counts as "current"). */
function computeStreaks(dateStrings: string[]): { current: number; longest: number } {
  const days = new Set(dateStrings);
  let longest = 0;
  let run = 0;
  const sorted = [...days].sort();
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0) {
      const prev = new Date(sorted[i - 1]);
      const cur = new Date(sorted[i]);
      const diffDays = Math.round((cur.getTime() - prev.getTime()) / 86400000);
      run = diffDays === 1 ? run + 1 : 1;
    } else {
      run = 1;
    }
    longest = Math.max(longest, run);
  }
  let current = 0;
  const cursor = new Date();
  // `dateKey`, not `toISOString()`: the set below is keyed on local dates, and
  // before 8am Manila the UTC key is yesterday — so the walk started on a day
  // that was never in the set and every streak read as 0.
  while (days.has(dateKey(cursor))) {
    current += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return { current, longest };
}

export default function AttendanceHistory() {
  const navigate = useNavigate();
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear] = useState(new Date().getFullYear());
  const [records, setRecords] = useState<AttendanceRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const user = getCurrentUser();
    if (!user) { setLoading(false); return; }
    listMemberAttendance(user.id)
      .then(setRecords)
      .catch(() => setRecords([]))
      .finally(() => setLoading(false));
  }, []);

  // `localDateKey`, not `.slice(0, 10)` on the raw column. That text is UTC, so
  // a 7am visit was filed to the previous day — while the calendar heatmap below
  // plots the same rows with `new Date()`, which is local. The page showed one
  // check-in on two different days depending on which half you looked at.
  const checkInDates = useMemo(() => records.map((r) => localDateKey(r.check_in_time)), [records]);
  const attendanceDays = useMemo(
    () =>
      checkInDates
        .filter((d) => {
          const dt = new Date(d);
          return dt.getFullYear() === selectedYear && dt.getMonth() === selectedMonth;
        })
        .map((d) => Number(d.slice(8, 10))),
    [checkInDates, selectedMonth, selectedYear]
  );
  const { current: currentStreak, longest: longestStreak } = useMemo(() => computeStreaks(checkInDates), [checkInDates]);
  const totalCheckIns = records.length;
  const attendanceRate = useMemo(() => {
    const uniqueDays = new Set(checkInDates);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    let recentCount = 0;
    for (const d of uniqueDays) if (new Date(d) >= cutoff) recentCount += 1;
    return Math.round((recentCount / 30) * 100);
  }, [checkInDates]);
  const recentRecords = useMemo(
    () => [...records].sort((a, b) => b.check_in_time.localeCompare(a.check_in_time)).slice(0, 5),
    [records]
  );

  const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
  const firstDay = new Date(selectedYear, selectedMonth, 1).getDay();

  const stats = [
    { label: 'Total Check-ins',  value: totalCheckIns,             icon: Calendar,    color: 'var(--color-primary)' },
    { label: 'Current Streak',   value: `${currentStreak} days`,   icon: Flame,       color: 'var(--color-secondary)' },
    { label: 'Longest Streak',   value: `${longestStreak} days`,   icon: Award,       color: 'var(--color-primary)' },
    { label: 'Attendance Rate',  value: `${attendanceRate}%`,      icon: TrendingUp,  color: 'var(--color-primary)' },
  ];

  return (
    <div className="space-y-5 pb-4">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3">
        <button
          onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/member/progress'))}
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-white">Attendance History</h1>
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Track your gym visits</p>
        </div>
      </motion.div>

      {/* Stats grid — flat cards */}
      <div className="grid grid-cols-2 gap-3">
        {stats.map((s, idx) => {
          const Icon = s.icon;
          return (
            <motion.div key={s.label}
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.05 + idx * 0.05 }}
              className="rounded-2xl p-3"
              style={{ background: 'var(--color-surface-raised)', border: `1px solid ${s.color}30` }}>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-1.5"
                style={{ background: `${s.color}20` }}>
                <Icon size={16} style={{ color: s.color }} />
              </div>
              <p className="text-xs uppercase" style={{ color: 'var(--color-text-muted)' }}>{s.label}</p>
              <p className="text-2xl font-bold mt-0.5" style={{ color: s.color }}>{s.value}</p>
            </motion.div>
          );
        })}
      </div>

      {/* Month selector */}
      <select
        value={selectedMonth}
        onChange={(e) => setSelectedMonth(Number(e.target.value))}
        className="field-input w-full px-4 rounded-xl text-white text-sm"
        style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', height: 40 }}
      >
        {MONTHS.map((m, i) => <option key={m} value={i}>{m} {selectedYear}</option>)}
      </select>

      {/* Calendar */}
      <div className="rounded-2xl p-4" style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
        <div className="grid grid-cols-7 gap-1.5 mb-2">
          {DAY_HEADERS.map((d) => (
            <div key={d} className="text-center text-xs font-semibold py-1" style={{ color: 'var(--color-text-muted)' }}>{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {Array.from({ length: firstDay }).map((_, i) => <div key={`empty-${i}`} className="aspect-square" />)}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const isAttended = attendanceDays.includes(day);
            const isToday    = day === new Date().getDate() && selectedMonth === new Date().getMonth();
            return (
              <div key={day}
                className="aspect-square rounded-lg flex items-center justify-center text-xs font-semibold"
                style={{
                  background: isAttended ? 'var(--color-secondary)' : 'var(--color-bg)',
                  color:      isAttended ? '#000'    : isToday ? '#fff' : 'var(--color-text-muted)',
                  border:     `1px solid ${isAttended ? 'var(--color-secondary)' : isToday ? 'var(--color-primary)' : 'var(--color-border)'}`,
                }}>
                {day}
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="mt-4 flex items-center justify-center gap-4 text-xs" style={{ color: 'var(--color-text-muted)' }}>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded" style={{ background: 'var(--color-secondary)' }} /> Attended
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded" style={{ border: '2px solid var(--color-primary)' }} /> Today
          </div>
        </div>
      </div>

      {/* Recent Check-ins */}
      <div className="rounded-2xl p-4" style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
        <h3 className="text-white font-semibold text-sm mb-3">Recent Check-ins</h3>
        <div className="space-y-2">
          {loading ? (
            <SkeletonList count={3} />
          ) : recentRecords.length === 0 ? (
            <p className="text-xs text-center py-4" style={{ color: 'var(--color-text-muted)' }}>
              No check-ins yet
            </p>
          ) : recentRecords.map((r) => {
            const checkIn = new Date(r.check_in_time);
            return (
              <div key={r.id} className="flex items-center justify-between p-2.5 rounded-xl">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                    style={{ background: 'var(--color-primary)' }}>
                    <Calendar size={14} className="text-white" />
                  </div>
                  <div>
                    <p className="text-white font-semibold text-xs">{checkIn.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
                    <p className="text-xs flex items-center gap-1.5" style={{ color: 'var(--color-text-muted)' }}>
                      Check-in via {r.method === 'qr' ? 'QR Code' : 'Manual'}
                      {/* Only shown when it was actually recorded (0018). Older
                          check-ins have no activity and get no placeholder. */}
                      {r.activity && (
                        <span className="px-1.5 py-0.5 rounded-full text-xs font-semibold"
                          style={{ background: 'var(--color-secondary-light)', color: 'var(--color-secondary)' }}>
                          {r.activity}
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  {checkIn.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
