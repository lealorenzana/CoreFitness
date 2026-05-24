import { motion } from 'framer-motion';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, Clock, Users, MapPin, Dumbbell, ChevronLeft, ChevronRight } from 'lucide-react';

interface ClassSession {
  id: string;
  name: string;
  trainer: string;
  time: string;
  duration: number; // minutes
  capacity: number;
  enrolled: number;
  location: string;
  level: 'Beginner' | 'Intermediate' | 'Advanced' | 'All Levels';
  type: 'Cardio' | 'Strength' | 'Yoga' | 'HIIT' | 'Boxing' | 'Flexibility';
}

interface DaySchedule {
  date: string;
  dayName: string;
  classes: ClassSession[];
}

const MOCK_CLASSES: ClassSession[] = [
  { id: 'cls-001', name: 'Morning Yoga', trainer: 'Ana Par Ituralde', time: '06:00', duration: 60, capacity: 20, enrolled: 15, location: 'Studio A', level: 'All Levels', type: 'Yoga' },
  { id: 'cls-002', name: 'HIIT Blast', trainer: 'Nathanniel Duhac', time: '07:00', duration: 45, capacity: 25, enrolled: 22, location: 'Main Floor', level: 'Intermediate', type: 'HIIT' },
  { id: 'cls-003', name: 'Strength Training', trainer: 'Arvin Dela Rosa', time: '08:00', duration: 60, capacity: 15, enrolled: 12, location: 'Weight Room', level: 'Intermediate', type: 'Strength' },
  { id: 'cls-004', name: 'Beginner Cardio', trainer: 'Ana Par Ituralde', time: '09:00', duration: 45, capacity: 30, enrolled: 18, location: 'Cardio Zone', level: 'Beginner', type: 'Cardio' },
  { id: 'cls-005', name: 'Boxing Basics', trainer: 'Nathanniel Duhac', time: '16:00', duration: 60, capacity: 20, enrolled: 16, location: 'Boxing Area', level: 'All Levels', type: 'Boxing' },
  { id: 'cls-006', name: 'Evening Yoga', trainer: 'Ana Par Ituralde', time: '18:00', duration: 60, capacity: 20, enrolled: 19, location: 'Studio A', level: 'All Levels', type: 'Yoga' },
  { id: 'cls-007', name: 'Power HIIT', trainer: 'Arvin Dela Rosa', time: '19:00', duration: 45, capacity: 25, enrolled: 20, location: 'Main Floor', level: 'Advanced', type: 'HIIT' },
];

export default function ClassSchedule() {
  const navigate = useNavigate();
  const [currentWeekStart, setCurrentWeekStart] = useState(() => {
    const today = new Date();
    const day = today.getDay();
    const diff = today.getDate() - day + (day === 0 ? -6 : 1); // Adjust to Monday
    return new Date(today.setDate(diff));
  });

  const [selectedType, setSelectedType] = useState<string | null>(null);

  const getWeekDays = (): DaySchedule[] => {
    const days: DaySchedule[] = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(currentWeekStart);
      date.setDate(currentWeekStart.getDate() + i);
      days.push({
        date: date.toISOString().split('T')[0],
        dayName: date.toLocaleDateString('en-US', { weekday: 'short' }),
        classes: MOCK_CLASSES, // In real app, filter by date
      });
    }
    return days;
  };

  const weekDays = getWeekDays();

  const goToPreviousWeek = () => {
    const newDate = new Date(currentWeekStart);
    newDate.setDate(newDate.getDate() - 7);
    setCurrentWeekStart(newDate);
  };

  const goToNextWeek = () => {
    const newDate = new Date(currentWeekStart);
    newDate.setDate(newDate.getDate() + 7);
    setCurrentWeekStart(newDate);
  };

  const goToToday = () => {
    const today = new Date();
    const day = today.getDay();
    const diff = today.getDate() - day + (day === 0 ? -6 : 1);
    setCurrentWeekStart(new Date(today.setDate(diff)));
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'Cardio': return '#ef4444';
      case 'Strength': return '#f59e0b';
      case 'Yoga': return '#10b981';
      case 'HIIT': return '#8b5cf6';
      case 'Boxing': return '#ec4899';
      case 'Flexibility': return '#06b6d4';
      default: return 'var(--color-primary)';
    }
  };

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'Beginner': return 'var(--color-primary)';
      case 'Intermediate': return 'var(--color-secondary)';
      case 'Advanced': return '#ef4444';
      default: return 'var(--color-text-muted)';
    }
  };

  const classTypes = ['All', 'Cardio', 'Strength', 'Yoga', 'HIIT', 'Boxing', 'Flexibility'];

  const filteredClasses = (classes: ClassSession[]) => {
    if (!selectedType || selectedType === 'All') return classes;
    return classes.filter(c => c.type === selectedType);
  };

  return (
    <div className="space-y-4 pb-4">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-bold text-white">Class Schedule</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
          View and book upcoming fitness classes
        </p>
      </motion.div>

      {/* Week Navigation */}
      <div className="flex items-center justify-between rounded-2xl p-4"
        style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
        <button onClick={goToPreviousWeek}
          className="p-2 rounded-lg"
          style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
          <ChevronLeft size={18} />
        </button>
        <div className="text-center">
          <p className="text-white font-bold">
            {currentWeekStart.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} -{' '}
            {new Date(currentWeekStart.getTime() + 6 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          </p>
          <button onClick={goToToday}
            className="text-xs mt-1 font-semibold"
            style={{ color: 'var(--color-secondary)' }}>
            Today
          </button>
        </div>
        <button onClick={goToNextWeek}
          className="p-2 rounded-lg"
          style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
          <ChevronRight size={18} />
        </button>
      </div>

      {/* Class Type Filter */}
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
        {classTypes.map(type => (
          <button key={type} onClick={() => setSelectedType(type === 'All' ? null : type)}
            className="px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex-shrink-0"
            style={{
              background: (selectedType === type || (type === 'All' && !selectedType)) ? 'var(--color-secondary)' : 'var(--color-surface-raised)',
              color: (selectedType === type || (type === 'All' && !selectedType)) ? '#000' : 'var(--color-text-muted)',
              border: `1px solid ${(selectedType === type || (type === 'All' && !selectedType)) ? 'var(--color-secondary)' : 'var(--color-border)'}`,
            }}>
            {type}
          </button>
        ))}
      </div>

      {/* Weekly Schedule */}
      <div className="space-y-4">
        {weekDays.map((day, dayIdx) => {
          const isToday = day.date === new Date().toISOString().split('T')[0];
          const dayClasses = filteredClasses(day.classes);
          
          return (
            <motion.div key={day.date} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: dayIdx * 0.05 }}>
              <div className="rounded-2xl overflow-hidden"
                style={{ background: 'var(--color-surface-raised)', border: `1px solid ${isToday ? 'var(--color-secondary)' : 'var(--color-border)'}` }}>
                {/* Day Header */}
                <div className="p-4 flex items-center justify-between"
                  style={{ background: isToday ? 'var(--color-secondary-light)' : 'var(--color-bg)', borderBottom: '1px solid var(--color-border)' }}>
                  <div className="flex items-center gap-3">
                    <div className="text-center">
                      <p className="text-xs font-semibold" style={{ color: isToday ? 'var(--color-secondary)' : 'var(--color-text-muted)' }}>
                        {day.dayName}
                      </p>
                      <p className="text-2xl font-bold text-white">
                        {new Date(day.date).getDate()}
                      </p>
                    </div>
                    {isToday && (
                      <span className="text-xs px-2 py-1 rounded-full font-semibold"
                        style={{ background: 'var(--color-secondary)', color: '#000' }}>
                        Today
                      </span>
                    )}
                  </div>
                  <span className="text-xs font-semibold" style={{ color: 'var(--color-text-muted)' }}>
                    {dayClasses.length} classes
                  </span>
                </div>

                {/* Classes */}
                <div className="p-3 space-y-2">
                  {dayClasses.length === 0 ? (
                    <p className="text-center text-sm py-4" style={{ color: 'var(--color-text-muted)' }}>
                      No classes scheduled
                    </p>
                  ) : (
                    dayClasses.map((cls, clsIdx) => {
                      const isFull = cls.enrolled >= cls.capacity;
                      const occupancy = Math.round((cls.enrolled / cls.capacity) * 100);
                      return (
                        <div key={cls.id}
                          onClick={() => navigate('/member/book-class')}
                          className="rounded-xl p-3 cursor-pointer transition-colors"
                          style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}
                          onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--color-secondary)')}
                          onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--color-border)')}>
                          <div className="flex items-start gap-3">
                            <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                              style={{ background: `${getTypeColor(cls.type)}20` }}>
                              <Dumbbell size={18} style={{ color: getTypeColor(cls.type) }} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2 mb-1">
                                <div className="flex-1">
                                  <h3 className="text-sm font-bold text-white">{cls.name}</h3>
                                  <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                                    with {cls.trainer}
                                  </p>
                                </div>
                                <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold flex-shrink-0"
                                  style={{ background: `${getLevelColor(cls.level)}20`, color: getLevelColor(cls.level) }}>
                                  {cls.level}
                                </span>
                              </div>
                              <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] mb-2" style={{ color: 'var(--color-text-secondary)' }}>
                                <span className="flex items-center gap-1">
                                  <Clock size={10} /> {cls.time} ({cls.duration}min)
                                </span>
                                <span className="flex items-center gap-1">
                                  <MapPin size={10} /> {cls.location}
                                </span>
                                <span className="flex items-center gap-1">
                                  <Users size={10} /> {cls.enrolled}/{cls.capacity}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--color-surface-raised)' }}>
                                  <div className="h-full rounded-full transition-all"
                                    style={{ width: `${occupancy}%`, background: isFull ? '#ef4444' : 'var(--color-secondary)' }} />
                                </div>
                                <span className="text-[9px] font-bold" style={{ color: isFull ? '#ef4444' : 'var(--color-secondary)' }}>
                                  {isFull ? 'Full' : `${occupancy}%`}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
