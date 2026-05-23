import { useState } from 'react';
import { motion } from 'framer-motion';
import { Calendar, Clock, Dumbbell, Users } from 'lucide-react';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const MY_CLASSES = [
  { id: 'c1', name: 'Morning Strength', day: 'Monday', time: '6:00 AM', duration: '60 min', members: 8, capacity: 12 },
  { id: 'c2', name: 'Power Hour', day: 'Monday', time: '5:00 PM', duration: '60 min', members: 10, capacity: 12 },
  { id: 'c3', name: 'Core Blast', day: 'Wednesday', time: '6:00 AM', duration: '45 min', members: 6, capacity: 10 },
  { id: 'c4', name: 'Full Body HIIT', day: 'Wednesday', time: '5:00 PM', duration: '50 min', members: 11, capacity: 12 },
  { id: 'c5', name: 'Strength Basics', day: 'Friday', time: '6:00 AM', duration: '60 min', members: 7, capacity: 10 },
  { id: 'c6', name: 'Weekend Pump', day: 'Friday', time: '5:00 PM', duration: '60 min', members: 9, capacity: 12 },
  { id: 'c7', name: 'Saturday Burn', day: 'Saturday', time: '8:00 AM', duration: '45 min', members: 5, capacity: 8 },
];

export default function TrainerSchedule() {
  const [availability, setAvailability] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('trainer_availability');
      if (saved) return JSON.parse(saved);
    } catch {}
    return ['Monday', 'Wednesday', 'Friday', 'Saturday'];
  });

  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const toggleDay = (day: string) => {
    const updated = availability.includes(day)
      ? availability.filter(d => d !== day)
      : [...availability, day];
    setAvailability(updated);
    localStorage.setItem('trainer_availability', JSON.stringify(updated));
  };

  const filteredClasses = selectedDay
    ? MY_CLASSES.filter(c => c.day === selectedDay)
    : MY_CLASSES;

  return (
    <div className="space-y-4 pb-4">
      {/* Header */}
      <div>
        <h1 className="text-base font-bold text-white">My Schedule</h1>
        <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>Manage your availability and view classes</p>
      </div>

      {/* Availability Toggle */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        className="rounded-xl p-3" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[11px] font-semibold text-white flex items-center gap-1.5">
            <Calendar size={12} style={{ color: 'var(--color-primary)' }} /> My Availability
          </p>
          <span className="text-[9px] px-2 py-0.5 rounded-full" style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary)' }}>
            {availability.length} days
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {DAYS.map(day => {
            const isAvail = availability.includes(day);
            return (
              <button key={day} onClick={() => toggleDay(day)}
                className="px-3 py-1.5 rounded-full text-[10px] font-semibold transition-all active:scale-95"
                style={{
                  background: isAvail ? 'var(--color-primary)' : 'var(--color-bg)',
                  color: isAvail ? '#fff' : 'var(--color-text-muted)',
                  border: `1px solid ${isAvail ? 'var(--color-primary)' : 'var(--color-border)'}`,
                }}>
                {day.slice(0, 3)}
              </button>
            );
          })}
        </div>
      </motion.div>

      {/* Day Filter */}
      <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-1">
        <button onClick={() => setSelectedDay(null)}
          className="px-3 py-1.5 rounded-full text-[10px] font-semibold whitespace-nowrap flex-shrink-0 transition-colors"
          style={{
            background: !selectedDay ? 'var(--color-secondary)' : 'var(--color-surface)',
            color: !selectedDay ? '#000' : 'var(--color-text-muted)',
            border: `1px solid ${!selectedDay ? 'var(--color-secondary)' : 'var(--color-border)'}`,
          }}>
          All Days
        </button>
        {DAYS.filter(d => availability.includes(d)).map(day => (
          <button key={day} onClick={() => setSelectedDay(day)}
            className="px-3 py-1.5 rounded-full text-[10px] font-semibold whitespace-nowrap flex-shrink-0 transition-colors"
            style={{
              background: selectedDay === day ? 'var(--color-secondary)' : 'var(--color-surface)',
              color: selectedDay === day ? '#000' : 'var(--color-text-muted)',
              border: `1px solid ${selectedDay === day ? 'var(--color-secondary)' : 'var(--color-border)'}`,
            }}>
            {day}
          </button>
        ))}
      </div>

      {/* Classes List */}
      <div>
        <p className="text-[10px] uppercase font-semibold mb-2" style={{ color: 'var(--color-text-muted)' }}>
          Assigned Classes ({filteredClasses.length})
        </p>
        <div className="space-y-2">
          {filteredClasses.map((cls, i) => (
            <motion.div key={cls.id}
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
              className="flex items-center gap-3 p-3 rounded-xl"
              style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'var(--color-primary-light)' }}>
                <Dumbbell size={16} style={{ color: 'var(--color-primary)' }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-white">{cls.name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[9px] flex items-center gap-0.5" style={{ color: 'var(--color-text-muted)' }}>
                    <Calendar size={9} /> {cls.day}
                  </span>
                  <span className="text-[9px] flex items-center gap-0.5" style={{ color: 'var(--color-text-muted)' }}>
                    <Clock size={9} /> {cls.time}
                  </span>
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="flex items-center gap-1">
                  <Users size={10} style={{ color: 'var(--color-primary)' }} />
                  <span className="text-[11px] font-bold" style={{ color: 'var(--color-primary)' }}>{cls.members}/{cls.capacity}</span>
                </div>
                <p className="text-[8px]" style={{ color: 'var(--color-text-muted)' }}>{cls.duration}</p>
              </div>
            </motion.div>
          ))}
          {filteredClasses.length === 0 && (
            <p className="text-center py-6 text-[11px]" style={{ color: 'var(--color-text-muted)' }}>No classes on this day</p>
          )}
        </div>
      </div>
    </div>
  );
}
