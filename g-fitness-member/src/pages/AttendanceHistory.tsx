import { motion } from 'framer-motion';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Calendar, TrendingUp, Award, Flame } from 'lucide-react';

export default function AttendanceHistory() {
  const navigate = useNavigate();
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear] = useState(new Date().getFullYear());

  // Mock attendance data - days when user checked in
  const attendanceDays = [1, 3, 5, 7, 8, 10, 12, 14, 15, 17, 19, 21, 22, 24, 26, 28, 29];
  const currentStreak = 7;
  const longestStreak = 12;
  const totalCheckIns = 24;

  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const getDaysInMonth = (month: number, year: number) => {
    return new Date(year, month + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (month: number, year: number) => {
    return new Date(year, month, 1).getDay();
  };

  const daysInMonth = getDaysInMonth(selectedMonth, selectedYear);
  const firstDay = getFirstDayOfMonth(selectedMonth, selectedYear);

  const stats = [
    { label: 'Total Check-ins', value: totalCheckIns, icon: Calendar, color: 'from-blue-500 to-cyan-500' },
    { label: 'Current Streak', value: `${currentStreak} days`, icon: Flame, color: 'from-orange-500 to-red-500' },
    { label: 'Longest Streak', value: `${longestStreak} days`, icon: Award, color: 'from-purple-500 to-pink-500' },
    { label: 'Attendance Rate', value: '87%', icon: TrendingUp, color: 'from-green-500 to-emerald-500' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-4"
      >
        <button
          onClick={() => navigate('/member/progress')}
          className="w-10 h-10 rounded-xl bg-dark-lighter border border-dark-border flex items-center justify-center text-gray-400 hover:text-white hover:border-primary-start transition-all duration-200"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-3xl font-orbitron font-bold text-gradient">Attendance History</h1>
          <p className="text-gray-400 mt-1">Track your gym visits</p>
        </div>
      </motion.div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-4">
        {stats.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1 + index * 0.1 }}
              className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${stat.color} p-4 shadow-lg`}
            >
              <div className="relative z-10">
                <Icon size={24} className="text-white mb-2" />
                <p className="text-white/80 text-xs font-medium">{stat.label}</p>
                <p className="text-2xl font-bold text-white mt-1 font-orbitron">{stat.value}</p>
              </div>
              <div className="absolute top-0 right-0 w-16 h-16 bg-white/10 rounded-full blur-2xl"></div>
            </motion.div>
          );
        })}
      </div>

      {/* Month Selector */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="bg-dark-lighter border border-dark-border rounded-2xl p-4"
      >
        <select
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(Number(e.target.value))}
          className="w-full bg-dark border border-dark-border rounded-xl px-4 py-3 text-white focus:outline-none focus:border-primary-start transition-colors"
        >
          {months.map((month, index) => (
            <option key={month} value={index}>
              {month} {selectedYear}
            </option>
          ))}
        </select>
      </motion.div>

      {/* Calendar */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        className="bg-dark-lighter border border-dark-border rounded-2xl p-6"
      >
        {/* Day Headers */}
        <div className="grid grid-cols-7 gap-2 mb-4">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
            <div key={day} className="text-center text-gray-400 text-xs font-semibold py-2">
              {day}
            </div>
          ))}
        </div>

        {/* Calendar Days */}
        <div className="grid grid-cols-7 gap-2">
          {/* Empty cells for days before month starts */}
          {Array.from({ length: firstDay }).map((_, index) => (
            <div key={`empty-${index}`} className="aspect-square"></div>
          ))}

          {/* Days of the month */}
          {Array.from({ length: daysInMonth }).map((_, index) => {
            const day = index + 1;
            const isAttended = attendanceDays.includes(day);
            const isToday = day === new Date().getDate() && selectedMonth === new Date().getMonth();

            return (
              <motion.div
                key={day}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.7 + (index * 0.01) }}
                className={`aspect-square rounded-xl flex items-center justify-center text-sm font-semibold transition-all duration-200 ${
                  isAttended
                    ? 'bg-gradient-to-br from-green-500 to-emerald-500 text-white shadow-lg'
                    : isToday
                    ? 'bg-dark border-2 border-primary-start text-white'
                    : 'bg-dark border border-dark-border text-gray-400 hover:border-gray-600'
                }`}
              >
                {day}
              </motion.div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="mt-6 flex items-center justify-center gap-6 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-gradient-to-br from-green-500 to-emerald-500"></div>
            <span className="text-gray-400">Attended</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded border-2 border-primary-start"></div>
            <span className="text-gray-400">Today</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-dark border border-dark-border"></div>
            <span className="text-gray-400">No Visit</span>
          </div>
        </div>
      </motion.div>

      {/* Recent Check-ins */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.8 }}
        className="bg-dark-lighter border border-dark-border rounded-2xl p-6"
      >
        <h3 className="text-white font-semibold text-lg mb-4">Recent Check-ins</h3>
        <div className="space-y-3">
          {attendanceDays.slice(-5).reverse().map((day, index) => (
            <div
              key={day}
              className="flex items-center justify-between p-3 bg-dark rounded-xl border border-dark-border"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center">
                  <Calendar size={20} className="text-white" />
                </div>
                <div>
                  <p className="text-white font-semibold">
                    {months[selectedMonth]} {day}, {selectedYear}
                  </p>
                  <p className="text-gray-400 text-sm">Check-in via QR Code</p>
                </div>
              </div>
              <span className="text-gray-400 text-sm">
                {Math.floor(Math.random() * 12) + 1}:{Math.floor(Math.random() * 60).toString().padStart(2, '0')} {Math.random() > 0.5 ? 'AM' : 'PM'}
              </span>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
