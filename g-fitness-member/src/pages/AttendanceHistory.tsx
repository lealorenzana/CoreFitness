import { motion } from 'framer-motion';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Calendar, TrendingUp, Award, Flame } from 'lucide-react';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DAY_HEADERS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function AttendanceHistory() {
  const navigate = useNavigate();
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear] = useState(new Date().getFullYear());

  // Mock attendance data — days when user checked in
  const attendanceDays = [1, 3, 5, 7, 8, 10, 12, 14, 15, 17, 19, 21, 22, 24, 26, 28, 29];
  const currentStreak = 7;
  const longestStreak = 12;
  const totalCheckIns = 24;

  const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
  const firstDay = new Date(selectedYear, selectedMonth, 1).getDay();

  const stats = [
    { label: 'Total Check-ins',  value: totalCheckIns,            icon: Calendar,    color: 'var(--color-primary)' },
    { label: 'Current Streak',   value: `${currentStreak} days`,  icon: Flame,       color: 'var(--color-secondary)' },
    { label: 'Longest Streak',   value: `${longestStreak} days`,  icon: Award,       color: 'var(--color-primary)' },
    { label: 'Attendance Rate',  value: '87%',                    icon: TrendingUp,  color: 'var(--color-primary)' },
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
              <p className="text-[11px] uppercase" style={{ color: 'var(--color-text-muted)' }}>{s.label}</p>
              <p className="text-2xl font-bold mt-0.5" style={{ color: s.color }}>{s.value}</p>
            </motion.div>
          );
        })}
      </div>

      {/* Month selector */}
      <select
        value={selectedMonth}
        onChange={(e) => setSelectedMonth(Number(e.target.value))}
        className="w-full px-4 rounded-xl text-white text-sm focus:outline-none"
        style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', height: 40 }}
      >
        {MONTHS.map((m, i) => <option key={m} value={i}>{m} {selectedYear}</option>)}
      </select>

      {/* Calendar */}
      <div className="rounded-2xl p-4" style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
        <div className="grid grid-cols-7 gap-1.5 mb-2">
          {DAY_HEADERS.map((d) => (
            <div key={d} className="text-center text-[10px] font-semibold py-1" style={{ color: 'var(--color-text-muted)' }}>{d}</div>
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
        <div className="mt-4 flex items-center justify-center gap-4 text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
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
          {attendanceDays.slice(-5).reverse().map((day) => (
            <div key={day} className="flex items-center justify-between p-2.5 rounded-xl"
              style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ background: 'var(--color-primary)' }}>
                  <Calendar size={14} className="text-white" />
                </div>
                <div>
                  <p className="text-white font-semibold text-xs">{MONTHS[selectedMonth]} {day}, {selectedYear}</p>
                  <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>Check-in via QR Code</p>
                </div>
              </div>
              <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                {(((day * 13) % 12) || 12)}:{String((day * 7) % 60).padStart(2, '0')} {day % 2 === 0 ? 'AM' : 'PM'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
