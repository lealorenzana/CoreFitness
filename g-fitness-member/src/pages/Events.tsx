import { motion } from 'framer-motion';
import { Calendar, Clock, MapPin, Users, Heart, Share2, Bell, ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { showSuccessToast } from '../utils/errorHandler';

interface Event {
  id: string;
  title: string;
  description: string;
  date: string;
  time: string;
  location: string;
  attendees: number;
  maxAttendees: number;
  image: string;
  category: 'class' | 'workshop' | 'competition' | 'social';
  isRegistered: boolean;
}

export default function Events() {
  const navigate = useNavigate();
  const [events, setEvents] = useState<Event[]>([
    {
      id: '1',
      title: 'BMS - Bible & Movement Study',
      description: 'Weekly Bible study session combined with light stretching and fellowship. All are welcome!',
      date: '2024-06-12',
      time: '7:00 PM - 8:30 PM',
      location: 'Core Fitness Mamburao',
      attendees: 15,
      maxAttendees: 25,
      image: 'from-purple-500 to-pink-500',
      category: 'social',
      isRegistered: false,
    },
    {
      id: '2',
      title: 'HIIT Bootcamp Challenge',
      description: 'Join us for an intense 60-minute HIIT session. Push your limits and burn calories!',
      date: '2024-06-15',
      time: '6:00 PM - 7:00 PM',
      location: 'Core Fitness Mamburao',
      attendees: 12,
      maxAttendees: 20,
      image: 'from-red-500 to-orange-500',
      category: 'class',
      isRegistered: false,
    },
    {
      id: '3',
      title: 'Nutrition Workshop',
      description: 'Learn about proper nutrition for muscle gain and fat loss from our certified nutritionist.',
      date: '2024-06-18',
      time: '10:00 AM - 12:00 PM',
      location: 'Core Fitness Mamburao',
      attendees: 8,
      maxAttendees: 15,
      image: 'from-green-500 to-emerald-500',
      category: 'workshop',
      isRegistered: true,
    },
    {
      id: '4',
      title: 'Summer Body Challenge',
      description: '8-week transformation challenge with prizes! Track your progress and compete with others.',
      date: '2024-06-20',
      time: 'All Day',
      location: 'All Core Fitness Locations',
      attendees: 45,
      maxAttendees: 100,
      image: 'from-yellow-500 to-orange-500',
      category: 'competition',
      isRegistered: false,
    },
    {
      id: '4b',
      title: 'Yoga & Meditation',
      description: 'Relax and rejuvenate with our morning yoga session. Perfect for all skill levels.',
      date: '2026-06-22',
      time: '7:00 AM - 8:00 AM',
      location: 'Core Fitness Mamburao',
      attendees: 10,
      maxAttendees: 15,
      image: 'from-purple-500 to-pink-500',
      category: 'class',
      isRegistered: false,
    },
    {
      id: '5',
      title: 'Member Appreciation Day',
      description: 'Free smoothies, raffles, and special discounts! Bring a friend and enjoy the celebration.',
      date: '2026-06-25',
      time: '5:00 PM - 9:00 PM',
      location: 'Core Fitness Mamburao',
      attendees: 67,
      maxAttendees: 150,
      image: 'from-blue-500 to-cyan-500',
      category: 'social',
      isRegistered: false,
    },
  ]);

  const [filter, setFilter] = useState<'all' | 'class' | 'workshop' | 'competition' | 'social'>('all');

  const handleRegister = (eventId: string) => {
    setEvents((prev) =>
      prev.map((event) =>
        event.id === eventId
          ? {
              ...event,
              isRegistered: !event.isRegistered,
              attendees: event.isRegistered ? event.attendees - 1 : event.attendees + 1,
            }
          : event
      )
    );
  };

  const filteredEvents = filter === 'all' ? events : events.filter((e) => e.category === filter);

  const categoryLabels = {
    all: 'All Events',
    class: 'Classes',
    workshop: 'Workshops',
    competition: 'Competitions',
    social: 'Social',
  };

  return (
    <div className="space-y-6">
      {/* Header with Back Button */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-4"
      >
        <button
          onClick={() => navigate('/member/home')}
          className="w-10 h-10 rounded-xl bg-dark-lighter border border-dark-border flex items-center justify-center text-gray-400 hover:text-white hover:border-primary-start transition-all"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <h1 className="text-3xl font-orbitron font-bold text-gradient">Events</h1>
          <p className="text-gray-400 mt-1">Join our fitness community</p>
        </div>
      </motion.div>

      {/* Filter Tabs */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="flex gap-2 overflow-x-auto scrollbar-hide pb-2"
      >
        {(['all', 'class', 'workshop', 'competition', 'social'] as const).map((category) => (
          <button
            key={category}
            onClick={() => setFilter(category)}
            className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${
              filter === category
                ? 'bg-gradient-to-r from-primary-start to-primary-end text-white shadow-lg'
                : 'bg-dark-lighter border border-dark-border text-gray-400 hover:border-primary-start'
            }`}
          >
            {categoryLabels[category]}
          </button>
        ))}
      </motion.div>

      {/* Events List */}
      <div className="space-y-4">
        {filteredEvents.map((event, index) => (
          <motion.div
            key={event.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 + index * 0.1 }}
            className="bg-dark-lighter border border-dark-border rounded-2xl overflow-hidden hover:border-primary-start transition-all duration-200"
          >
            {/* Event Image/Banner */}
            <div className={`h-32 bg-gradient-to-br ${event.image} relative`}>
              <div className="absolute inset-0 bg-black/30"></div>
              <div className="absolute top-4 right-4 flex gap-2">
                <button
                  onClick={() => showSuccessToast(`${event.title} link copied to clipboard!`)}
                  className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-white hover:bg-white/30 transition-all">
                  <Share2 size={18} />
                </button>
                <button
                  onClick={() => showSuccessToast(`Reminder set for ${event.title}!`)}
                  className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-white hover:bg-white/30 transition-all">
                  <Bell size={18} />
                </button>
              </div>
              <div className="absolute bottom-4 left-4">
                <span className="px-3 py-1 bg-white/20 backdrop-blur-sm rounded-full text-white text-xs font-semibold uppercase">
                  {event.category}
                </span>
              </div>
            </div>

            {/* Event Details */}
            <div className="p-4">
              <h3 className="text-lg font-bold text-white mb-2">{event.title}</h3>
              <p className="text-gray-400 text-sm mb-4">{event.description}</p>

              <div className="space-y-2 mb-4">
                <div className="flex items-center gap-2 text-sm text-gray-300">
                  <Calendar size={16} className="text-primary-start" />
                  <span>{new Date(event.date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-300">
                  <Clock size={16} className="text-primary-start" />
                  <span>{event.time}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-300">
                  <MapPin size={16} className="text-primary-start" />
                  <span>{event.location}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-300">
                  <Users size={16} className="text-primary-start" />
                  <span>
                    {event.attendees}/{event.maxAttendees} attending
                  </span>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="mb-4">
                <div className="w-full h-2 bg-dark rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-primary-start to-primary-end transition-all duration-300"
                    style={{ width: `${(event.attendees / event.maxAttendees) * 100}%` }}
                  ></div>
                </div>
              </div>

              {/* Action Button */}
              <button
                onClick={() => handleRegister(event.id)}
                disabled={event.attendees >= event.maxAttendees && !event.isRegistered}
                className={`w-full py-3 rounded-xl font-semibold transition-all duration-200 flex items-center justify-center gap-2 ${
                  event.isRegistered
                    ? 'bg-green-500/20 border-2 border-green-500 text-green-400 hover:bg-green-500/30'
                    : event.attendees >= event.maxAttendees
                    ? 'bg-gray-500/20 border-2 border-gray-500 text-gray-400 cursor-not-allowed'
                    : 'bg-gradient-to-r from-primary-start to-primary-end text-white hover:shadow-lg hover:shadow-primary-start/30'
                }`}
              >
                {event.isRegistered ? (
                  <>
                    <Heart size={18} fill="currentColor" />
                    Registered
                  </>
                ) : event.attendees >= event.maxAttendees ? (
                  'Event Full'
                ) : (
                  'Register Now'
                )}
              </button>
            </div>
          </motion.div>
        ))}
      </div>

      {filteredEvents.length === 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center py-12"
        >
          <Calendar size={48} className="text-gray-600 mx-auto mb-4" />
          <p className="text-gray-400">No events found in this category</p>
        </motion.div>
      )}
    </div>
  );
}
