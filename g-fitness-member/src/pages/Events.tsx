import { motion } from 'framer-motion';
import { Calendar, Clock, MapPin, Users, Heart, Share2, Bell, ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { showSuccessToast } from '../utils/errorHandler';

interface Event {
  id: string; title: string; description: string; date: string; time: string;
  location: string; attendees: number; maxAttendees: number;
  color: string; category: 'class' | 'workshop' | 'competition' | 'social'; isRegistered: boolean;
}

export default function Events() {
  const navigate = useNavigate();
  const [events, setEvents] = useState<Event[]>([
    { id: '1', title: 'BMS - Bible & Movement Study', description: 'Weekly Bible study combined with light stretching and fellowship. All welcome!', date: '2024-06-12', time: '7:00 PM - 8:30 PM', location: 'Core Fitness Mamburao', attendees: 15, maxAttendees: 25, color: 'var(--color-primary)', category: 'social', isRegistered: false },
    { id: '2', title: 'HIIT Bootcamp Challenge', description: 'Intense 60-minute HIIT session. Push your limits and burn calories!', date: '2024-06-15', time: '6:00 PM - 7:00 PM', location: 'Core Fitness Mamburao', attendees: 12, maxAttendees: 20, color: 'var(--color-secondary)', category: 'class', isRegistered: false },
    { id: '3', title: 'Nutrition Workshop', description: 'Learn proper nutrition for muscle gain and fat loss from our certified nutritionist.', date: '2024-06-18', time: '10:00 AM - 12:00 PM', location: 'Core Fitness Mamburao', attendees: 8, maxAttendees: 15, color: 'var(--color-primary)', category: 'workshop', isRegistered: true },
    { id: '4', title: 'Summer Body Challenge', description: '8-week transformation challenge with prizes! Track your progress and compete.', date: '2024-06-20', time: 'All Day', location: 'All Core Fitness Locations', attendees: 45, maxAttendees: 100, color: 'var(--color-secondary)', category: 'competition', isRegistered: false },
    { id: '5', title: 'Yoga & Meditation', description: 'Relax and rejuvenate with our morning yoga session. Perfect for all skill levels.', date: '2026-06-22', time: '7:00 AM - 8:00 AM', location: 'Core Fitness Mamburao', attendees: 10, maxAttendees: 15, color: 'var(--color-primary)', category: 'class', isRegistered: false },
    { id: '6', title: 'Member Appreciation Day', description: 'Free smoothies, raffles, and special discounts! Bring a friend.', date: '2026-06-25', time: '5:00 PM - 9:00 PM', location: 'Core Fitness Mamburao', attendees: 67, maxAttendees: 150, color: 'var(--color-primary)', category: 'social', isRegistered: false },
  ]);

  const [filter, setFilter] = useState<'all' | 'class' | 'workshop' | 'competition' | 'social'>('all');

  const handleRegister = (id: string) => {
    setEvents(prev => prev.map(e => e.id === id
      ? { ...e, isRegistered: !e.isRegistered, attendees: e.isRegistered ? e.attendees - 1 : e.attendees + 1 }
      : e
    ));
  };

  const filteredEvents = filter === 'all' ? events : events.filter(e => e.category === filter);

  const filterLabels = { all: 'All', class: 'Classes', workshop: 'Workshops', competition: 'Competitions', social: 'Social' };

  return (
    <div className="space-y-5 pb-4">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3">
        <button onClick={() => navigate('/member/home')}
          className="w-10 h-10 rounded-xl flex items-center justify-center transition-colors"
          style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}
          onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--color-secondary)')}
          onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--color-border)')}>
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-white">Events</h1>
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Join our fitness community</p>
        </div>
      </motion.div>

      {/* Filter Tabs */}
      <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
        {(['all', 'class', 'workshop', 'competition', 'social'] as const).map(cat => (
          <button key={cat} onClick={() => setFilter(cat)}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors flex-shrink-0"
            style={{
              background: filter === cat ? 'var(--color-secondary)' : 'var(--color-surface-raised)',
              color: filter === cat ? '#000' : 'var(--color-text-muted)',
              border: `1px solid ${filter === cat ? 'var(--color-secondary)' : 'var(--color-border)'}`,
            }}>
            {filterLabels[cat]}
          </button>
        ))}
      </div>

      {/* Events */}
      <div className="space-y-4">
        {filteredEvents.map((event, i) => (
          <motion.div key={event.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}
            className="rounded-2xl overflow-hidden" style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>

            {/* Banner */}
            <div className="h-28 relative flex items-end p-4" style={{ background: `${event.color}20`, borderBottom: `2px solid ${event.color}40` }}>
              <div className="absolute top-3 right-3 flex gap-2">
                <button onClick={() => showSuccessToast(`${event.title} link copied!`)}
                  className="w-8 h-8 rounded-full flex items-center justify-center transition-colors"
                  style={{ background: 'rgba(0,0,0,0.4)', color: '#fff' }}>
                  <Share2 size={14} />
                </button>
                <button onClick={() => showSuccessToast(`Reminder set for ${event.title}!`)}
                  className="w-8 h-8 rounded-full flex items-center justify-center transition-colors"
                  style={{ background: 'rgba(0,0,0,0.4)', color: '#fff' }}>
                  <Bell size={14} />
                </button>
              </div>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full uppercase"
                style={{ background: `${event.color}30`, color: event.color, border: `1px solid ${event.color}50` }}>
                {event.category}
              </span>
            </div>

            {/* Details */}
            <div className="p-4">
              <h3 className="text-white font-bold mb-1">{event.title}</h3>
              <p className="text-xs mb-3" style={{ color: 'var(--color-text-muted)' }}>{event.description}</p>

              <div className="space-y-1.5 mb-3">
                {[
                  { icon: Calendar, text: new Date(event.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) },
                  { icon: Clock, text: event.time },
                  { icon: MapPin, text: event.location },
                  { icon: Users, text: `${event.attendees}/${event.maxAttendees} attending` },
                ].map((row, idx) => {
                  const Icon = row.icon;
                  return (
                    <div key={idx} className="flex items-center gap-2 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                      <Icon size={13} style={{ color: event.color }} /> {row.text}
                    </div>
                  );
                })}
              </div>

              {/* Progress bar */}
              <div className="h-1.5 rounded-full mb-3" style={{ background: 'var(--color-border)' }}>
                <div className="h-full rounded-full transition-all" style={{ width: `${(event.attendees / event.maxAttendees) * 100}%`, background: event.color }} />
              </div>

              {/* Action */}
              <button onClick={() => handleRegister(event.id)}
                disabled={event.attendees >= event.maxAttendees && !event.isRegistered}
                className="w-full py-2.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  background: event.isRegistered ? 'var(--color-primary-light)' : event.attendees >= event.maxAttendees ? 'rgba(107,96,128,0.1)' : event.color,
                  color: event.isRegistered ? 'var(--color-primary)' : event.attendees >= event.maxAttendees ? 'var(--color-text-muted)' : '#000',
                  border: event.isRegistered ? '1px solid rgba(124,58,237,0.30)' : 'none',
                }}>
                {event.isRegistered ? <><Heart size={15} fill="currentColor" /> Registered</> : event.attendees >= event.maxAttendees ? 'Event Full' : 'Register Now'}
              </button>
            </div>
          </motion.div>
        ))}

        {filteredEvents.length === 0 && (
          <div className="text-center py-12" style={{ color: 'var(--color-text-muted)' }}>
            <Calendar size={40} className="mx-auto mb-3 opacity-30" />
            <p>No events in this category</p>
          </div>
        )}
      </div>
    </div>
  );
}
