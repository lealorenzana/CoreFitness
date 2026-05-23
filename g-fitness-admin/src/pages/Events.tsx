import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import { Plus, Edit2, Trash2, X, Calendar, MapPin, Users, Clock } from 'lucide-react';
import { showToast } from '../utils/toast';

interface GymEvent {
  id: string;
  title: string;
  description: string;
  date: string;
  time: string;
  location: string;
  capacity: number;
  registered: number;
  status: 'Upcoming' | 'Ongoing' | 'Completed' | 'Cancelled';
}

const MOCK_EVENTS: GymEvent[] = [
  { id: 'evt-001', title: 'Summer Fitness Challenge', description: 'Join our 30-day fitness challenge! Track your progress and win prizes.', date: '2026-06-01', time: '6:00 AM', location: 'Main Floor', capacity: 50, registered: 32, status: 'Upcoming' },
  { id: 'evt-002', title: 'Free Boxing Workshop', description: 'Learn boxing basics with Coach Nathanniel. Open to all members.', date: '2026-05-28', time: '4:00 PM', location: 'Boxing Area', capacity: 20, registered: 18, status: 'Upcoming' },
  { id: 'evt-003', title: 'Yoga & Meditation Day', description: 'A full day of relaxation, yoga, and guided meditation sessions.', date: '2026-06-15', time: '7:00 AM', location: 'Studio B', capacity: 25, registered: 10, status: 'Upcoming' },
  { id: 'evt-004', title: 'Member Appreciation Night', description: 'Free food, music, and fun activities for all active members!', date: '2026-05-20', time: '6:00 PM', location: 'Lobby Area', capacity: 100, registered: 85, status: 'Completed' },
];

const emptyForm = { title: '', description: '', date: '', time: '', location: '', capacity: '30' };

export default function Events() {
  const [events, setEvents] = useState<GymEvent[]>(() => {
    try { const s = localStorage.getItem('admin_events'); if (s) return JSON.parse(s); } catch {}
    localStorage.setItem('admin_events', JSON.stringify(MOCK_EVENTS));
    return MOCK_EVENTS;
  });
  const [showModal, setShowModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<GymEvent | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [viewAttendeesEvent, setViewAttendeesEvent] = useState<GymEvent | null>(null);

  // Mock attendees per event (in real app, this comes from API)
  const getEventAttendees = (eventId: string) => {
    const names = [
      'Aaron Diwa', 'Aaron Paglicawan Dionisio', 'Aj Aguirre', 'Ana Par Ituralde',
      'Anjeleca Avila', 'Arvin Dela Rosa', 'Bhebemon Bhebemon', 'Clairey Anne Belen',
      'Crizaldo Alboro', 'Cyrelle Joy Flordeliza', 'Carlos Villanueva', 'Patricia Bautista',
      'Ricardo Aquino', 'Sofia Lim', 'David Cruz', 'Angela Tan', 'Kevin Pascual',
      'Joy Manalo', 'Benjamin Ocampo', 'Celia Navarro',
    ];
    const evt = events.find(e => e.id === eventId);
    if (!evt) return [];
    // Deterministic subset based on event id hash
    const seed = eventId.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    return names.slice(0, evt.registered).map((name, i) => ({
      id: `att-${i}`,
      name,
      joinedAt: new Date(Date.now() - (i * 86400000 + seed * 1000)).toLocaleDateString(),
    }));
  };

  const saveEvents = (updated: GymEvent[]) => {
    setEvents(updated);
    localStorage.setItem('admin_events', JSON.stringify(updated));
  };

  const openAdd = () => { setEditingEvent(null); setForm(emptyForm); setShowModal(true); };
  const openEdit = (evt: GymEvent) => {
    setEditingEvent(evt);
    setForm({ title: evt.title, description: evt.description, date: evt.date, time: evt.time, location: evt.location, capacity: String(evt.capacity) });
    setShowModal(true);
  };

  const handleSave = () => {
    if (!form.title.trim() || !form.date || !form.time) { showToast('Title, date, and time are required', 'error'); return; }
    if (editingEvent) {
      const updated = events.map(e => e.id === editingEvent.id ? { ...e, ...form, capacity: Number(form.capacity) } : e);
      saveEvents(updated);
      showToast('Event updated!', 'success');
    } else {
      const created: GymEvent = { id: `evt-${Date.now()}`, ...form, capacity: Number(form.capacity), registered: 0, status: 'Upcoming' };
      saveEvents([created, ...events]);
      showToast('Event created!', 'success');
    }
    setShowModal(false);
  };

  const handleDelete = (id: string) => {
    if (!window.confirm('Delete this event?')) return;
    saveEvents(events.filter(e => e.id !== id));
    showToast('Event deleted', 'success');
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Events</h1>
          <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>Create and manage gym events for members</p>
        </div>
        <Button variant="secondary" onClick={openAdd}>
          <Plus size={16} /> Create Event
        </Button>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total Events', value: events.length },
          { label: 'Upcoming', value: events.filter(e => e.status === 'Upcoming').length },
          { label: 'Total Registered', value: events.reduce((s, e) => s + e.registered, 0) },
        ].map(s => (
          <div key={s.label} className="rounded-xl p-3 flex items-center gap-3"
            style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
            <Calendar size={16} style={{ color: 'var(--color-primary)' }} />
            <div>
              <p className="text-[10px] uppercase" style={{ color: 'var(--color-text-muted)' }}>{s.label}</p>
              <p className="text-lg font-bold text-white">{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Events List — 2 columns */}
      <div className="grid grid-cols-2 gap-3">
        {events.map((evt, i) => (
          <motion.div key={evt.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <Card className="!p-3">
              <div className="flex items-start justify-between mb-1.5">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <h3 className="text-xs font-bold text-white truncate">{evt.title}</h3>
                  </div>
                  <Badge variant={evt.status === 'Upcoming' ? 'Active' : evt.status === 'Completed' ? 'Expired' : 'Pending'}>{evt.status}</Badge>
                </div>
                <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                  <button onClick={() => openEdit(evt)} className="p-1.5 rounded-lg"
                    style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary)' }}>
                    <Edit2 size={11} />
                  </button>
                  <button onClick={() => handleDelete(evt.id)} className="p-1.5 rounded-lg"
                    style={{ background: 'var(--color-secondary-light)', color: 'var(--color-secondary)' }}>
                    <Trash2 size={11} />
                  </button>
                </div>
              </div>
              <p className="text-[10px] mb-2 line-clamp-2" style={{ color: 'var(--color-text-muted)' }}>{evt.description}</p>
              <div className="flex flex-wrap gap-2 text-[9px]" style={{ color: 'var(--color-text-secondary)' }}>
                <span className="flex items-center gap-0.5"><Calendar size={9} /> {new Date(evt.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                <span className="flex items-center gap-0.5"><Clock size={9} /> {evt.time}</span>
                <span className="flex items-center gap-0.5"><MapPin size={9} /> {evt.location}</span>
              </div>
              <div className="mt-2 pt-2" style={{ borderTop: '1px solid var(--color-border)' }}>
                <button className="flex items-center gap-1 text-[10px] font-semibold cursor-pointer hover:text-white transition-colors"
                  style={{ color: 'var(--color-primary)' }}
                  onClick={(e) => { e.stopPropagation(); setViewAttendeesEvent(evt); }}>
                  <Users size={10} /> {evt.registered}/{evt.capacity} registered
                </button>
              </div>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Create/Edit Modal */}
      <AnimatePresence>
        {showModal && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/70 z-50" onClick={() => setShowModal(false)} />
            <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
                className="w-full max-w-md rounded-2xl shadow-2xl overflow-hidden"
                style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
                onClick={e => e.stopPropagation()}>
                <div className="p-5 flex items-center justify-between" style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <h2 className="text-lg font-bold text-white">{editingEvent ? 'Edit Event' : 'Create Event'}</h2>
                  <button onClick={() => setShowModal(false)} style={{ color: 'var(--color-text-muted)' }}><X size={18} /></button>
                </div>
                <div className="p-5 space-y-3">
                  <div>
                    <label className="text-xs block mb-1" style={{ color: 'var(--color-text-muted)' }}>Title *</label>
                    <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
                      placeholder="e.g. Summer Fitness Challenge"
                      className="w-full px-4 py-2.5 rounded-xl text-white text-sm focus:outline-none"
                      style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }} />
                  </div>
                  <div>
                    <label className="text-xs block mb-1" style={{ color: 'var(--color-text-muted)' }}>Description</label>
                    <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                      placeholder="Event details..."
                      rows={3}
                      className="w-full px-4 py-2.5 rounded-xl text-white text-sm focus:outline-none resize-none"
                      style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs block mb-1" style={{ color: 'var(--color-text-muted)' }}>Date *</label>
                      <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })}
                        className="w-full px-4 py-2.5 rounded-xl text-white text-sm focus:outline-none"
                        style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }} />
                    </div>
                    <div>
                      <label className="text-xs block mb-1" style={{ color: 'var(--color-text-muted)' }}>Time *</label>
                      <input value={form.time} onChange={e => setForm({ ...form, time: e.target.value })}
                        placeholder="e.g. 6:00 AM"
                        className="w-full px-4 py-2.5 rounded-xl text-white text-sm focus:outline-none"
                        style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs block mb-1" style={{ color: 'var(--color-text-muted)' }}>Location</label>
                      <input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })}
                        placeholder="e.g. Main Floor"
                        className="w-full px-4 py-2.5 rounded-xl text-white text-sm focus:outline-none"
                        style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }} />
                    </div>
                    <div>
                      <label className="text-xs block mb-1" style={{ color: 'var(--color-text-muted)' }}>Capacity</label>
                      <input type="number" value={form.capacity} onChange={e => setForm({ ...form, capacity: e.target.value })}
                        className="w-full px-4 py-2.5 rounded-xl text-white text-sm focus:outline-none"
                        style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }} />
                    </div>
                  </div>
                </div>
                <div className="p-5 flex gap-3" style={{ borderTop: '1px solid var(--color-border)' }}>
                  <button onClick={() => setShowModal(false)}
                    className="flex-1 py-2.5 rounded-full font-semibold text-sm"
                    style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>Cancel</button>
                  <button onClick={handleSave}
                    className="flex-1 py-2.5 rounded-full font-semibold text-sm text-black"
                    style={{ background: 'var(--color-secondary)' }}>{editingEvent ? 'Save Changes' : 'Create Event'}</button>
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>

      {/* View Attendees Modal */}
      <AnimatePresence>
        {viewAttendeesEvent && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/70 z-50" onClick={() => setViewAttendeesEvent(null)} />
            <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
                className="w-full max-w-md rounded-2xl shadow-2xl overflow-hidden"
                style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
                onClick={e => e.stopPropagation()}>
                <div className="p-5" style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <h2 className="text-lg font-bold text-white">{viewAttendeesEvent.title}</h2>
                  <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                    {viewAttendeesEvent.registered} / {viewAttendeesEvent.capacity} members registered
                  </p>
                </div>
                <div className="p-5 max-h-[400px] overflow-y-auto scrollbar-thin scrollbar-thumb-dark-border space-y-2">
                  {getEventAttendees(viewAttendeesEvent.id).map((att, i) => (
                    <div key={att.id} className="flex items-center gap-3 p-2.5 rounded-xl"
                      style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-[10px]"
                        style={{ background: 'var(--color-primary)' }}>
                        {att.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm text-white font-semibold">{att.name}</p>
                        <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>Joined {att.joinedAt}</p>
                      </div>
                      <span className="text-[10px] font-semibold" style={{ color: 'var(--color-text-muted)' }}>#{i + 1}</span>
                    </div>
                  ))}
                </div>
                <div className="p-4" style={{ borderTop: '1px solid var(--color-border)' }}>
                  <button onClick={() => setViewAttendeesEvent(null)}
                    className="w-full py-2.5 rounded-full font-semibold text-sm text-black"
                    style={{ background: 'var(--color-secondary)' }}>
                    Close
                  </button>
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
