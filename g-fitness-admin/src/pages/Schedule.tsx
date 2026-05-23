import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect } from 'react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import { Calendar, Clock, X, Edit2, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { showToast } from '../utils/toast';
import { SharedStorage } from '../utils/sharedStorage';
import { TRAINERS } from '../data/trainers';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

interface GymHours { weekday: string; saturday: string; sunday: string; }
const DEFAULT_GYM_HOURS: GymHours = { weekday: '6:00 AM - 10:00 PM', saturday: '7:00 AM - 8:00 PM', sunday: '8:00 AM - 6:00 PM' };

function loadGymHours(): GymHours {
  try { const s = localStorage.getItem('gym_operating_hours'); return s ? JSON.parse(s) : DEFAULT_GYM_HOURS; } catch { return DEFAULT_GYM_HOURS; }
}

export default function Schedule() {
  // Gym hours
  const [gymHours, setGymHours] = useState<GymHours>(loadGymHours);
  const [editingHours, setEditingHours] = useState(false);
  const [hoursForm, setHoursForm] = useState<GymHours>(loadGymHours);

  // Trainer availability
  const [trainerAvailability, setTrainerAvailability] = useState<Record<string, Record<string, boolean>>>(() => {
    try { const s = localStorage.getItem('trainer_availability'); if (s) return JSON.parse(s); } catch {}
    const avail: Record<string, Record<string, boolean>> = {};
    TRAINERS.forEach(t => { avail[t.id] = {}; DAYS.forEach(d => { avail[t.id][d] = t.availability.some(a => a.day === d); }); });
    return avail;
  });

  // Trainer schedule modal
  const [selectedTrainer, setSelectedTrainer] = useState<any | null>(null);

  // Bookings (from member app)
  const [bookings, setBookings] = useState<any[]>([]);
  useEffect(() => {
    const refresh = () => setBookings(SharedStorage.getBookings());
    refresh();
    const interval = setInterval(refresh, 2000);
    return () => clearInterval(interval);
  }, []);

  const confirmedBookings = bookings.filter(b => b.status === 'Confirmed');
  const pendingBookings = bookings.filter(b => b.status === 'Pending');

  // Handlers
  const handleSaveHours = () => {
    setGymHours(hoursForm);
    localStorage.setItem('gym_operating_hours', JSON.stringify(hoursForm));
    setEditingHours(false);
    showToast('Operating hours updated!', 'success');
  };

  const toggleTrainerDay = (trainerId: string, day: string) => {
    setTrainerAvailability(prev => {
      const updated = { ...prev, [trainerId]: { ...prev[trainerId], [day]: !prev[trainerId]?.[day] } };
      localStorage.setItem('trainer_availability', JSON.stringify(updated));
      return updated;
    });
    showToast('Availability updated', 'success');
  };

  const handleApprove = (id: string) => {
    SharedStorage.updateBooking(id, { status: 'Confirmed', approvedAt: new Date().toISOString() });
    setBookings(SharedStorage.getBookings());
    showToast('Booking approved!', 'success');
  };

  const handleReject = (id: string) => {
    SharedStorage.updateBooking(id, { status: 'Rejected', rejectedAt: new Date().toISOString() });
    setBookings(SharedStorage.getBookings());
    showToast('Booking rejected', 'success');
  };

  // Get bookings for a specific trainer
  const getTrainerBookings = (trainerName: string) =>
    confirmedBookings.filter(b => b.trainerName?.toLowerCase() === trainerName.toLowerCase());

  return (
    <div className="space-y-5">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Schedule Management</h1>
          <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>Trainer availability, bookings calendar, and gym hours</p>
        </div>
      </motion.div>

      {/* Gym Operating Hours */}
      <Card className="!p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Clock size={16} style={{ color: 'var(--color-primary)' }} />
            <h3 className="text-xs font-bold text-white">Gym Operating Hours</h3>
          </div>
          {!editingHours && (
            <Button variant="ghost" size="sm" onClick={() => { setHoursForm(gymHours); setEditingHours(true); }}>
              <Edit2 size={12} /> Edit
            </Button>
          )}
        </div>
        {editingHours ? (
          <div className="space-y-2">
            {[{ label: 'Mon-Fri', key: 'weekday' as const }, { label: 'Saturday', key: 'saturday' as const }, { label: 'Sunday', key: 'sunday' as const }].map(row => (
              <div key={row.key} className="flex items-center gap-3">
                <span className="text-[11px] w-14 shrink-0" style={{ color: 'var(--color-text-muted)' }}>{row.label}</span>
                <input value={hoursForm[row.key]} onChange={e => setHoursForm({ ...hoursForm, [row.key]: e.target.value })}
                  className="flex-1 px-3 py-1.5 rounded-lg text-white text-xs focus:outline-none"
                  style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }} />
              </div>
            ))}
            <div className="flex gap-2 pt-1">
              <Button variant="secondary" size="sm" onClick={handleSaveHours}>Save</Button>
              <Button variant="outline" size="sm" onClick={() => setEditingHours(false)}>Cancel</Button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-4">
            {[{ label: 'Mon-Fri', value: gymHours.weekday }, { label: 'Saturday', value: gymHours.saturday }, { label: 'Sunday', value: gymHours.sunday }].map(row => (
              <div key={row.label}>
                <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>{row.label}</p>
                <p className="text-xs font-semibold text-white">{row.value}</p>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Trainer Availability */}
      <Card className="!p-4">
        <div className="flex items-center gap-2 mb-4">
          <Calendar size={16} style={{ color: 'var(--color-primary)' }} />
          <h3 className="text-xs font-bold text-white">Trainer Availability</h3>
          <span className="text-[10px] ml-auto" style={{ color: 'var(--color-text-muted)' }}>Click trainer to manage schedule</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {TRAINERS.filter(t => t.gymId === 'gym-001').map(trainer => (
            <button key={trainer.id}
              onClick={() => setSelectedTrainer(trainer)}
              className="rounded-xl p-4 text-left transition-all hover:scale-[1.01] active:scale-[0.99]"
              style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0" style={{ border: '2px solid var(--color-primary)' }}>
                  {trainer.photoUrl ? (
                    <img src={trainer.photoUrl} alt={trainer.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-white font-bold text-[10px]" style={{ background: 'var(--color-primary)' }}>
                      {trainer.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                    </div>
                  )}
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">{trainer.name}</p>
                  <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>{trainer.specialization}</p>
                </div>
              </div>
              {/* Weekly dots */}
              <div className="flex gap-1">
                {DAYS.map(d => (
                  <div key={d} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full h-5 rounded" style={{ background: trainerAvailability[trainer.id]?.[d] ? 'var(--color-primary)' : 'var(--color-border)' }} />
                    <span className="text-[7px]" style={{ color: 'var(--color-text-muted)' }}>{d.slice(0, 1)}</span>
                  </div>
                ))}
              </div>
              <p className="text-[10px] mt-2" style={{ color: 'var(--color-primary)' }}>
                {getTrainerBookings(trainer.name).length} confirmed sessions
              </p>
            </button>
          ))}
        </div>
      </Card>

      {/* Booking Calendar — Pending + Confirmed */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Pending Bookings */}
        <Card className="!p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold text-white flex items-center gap-2">
              <AlertTriangle size={14} style={{ color: 'var(--color-secondary)' }} />
              Pending Approval ({pendingBookings.length})
            </h3>
          </div>
          <div className="space-y-2 max-h-[300px] overflow-y-auto scrollbar-thin scrollbar-thumb-dark-border">
            {pendingBookings.length === 0 ? (
              <p className="text-xs text-center py-6" style={{ color: 'var(--color-text-muted)' }}>No pending bookings</p>
            ) : pendingBookings.map(b => (
              <div key={b.id} className="flex items-center justify-between p-3 rounded-xl"
                style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
                <div>
                  <p className="text-xs font-semibold text-white">{b.memberName}</p>
                  <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>{b.className} · {b.trainerName} · {b.day} {b.time}</p>
                </div>
                <div className="flex gap-1.5">
                  <button onClick={() => handleApprove(b.id)} className="p-1.5 rounded-lg"
                    style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary)' }}>
                    <CheckCircle size={14} />
                  </button>
                  <button onClick={() => handleReject(b.id)} className="p-1.5 rounded-lg"
                    style={{ background: 'var(--color-secondary-light)', color: 'var(--color-secondary)' }}>
                    <XCircle size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Confirmed Sessions */}
        <Card className="!p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold text-white flex items-center gap-2">
              <CheckCircle size={14} style={{ color: 'var(--color-primary)' }} />
              Confirmed Sessions ({confirmedBookings.length})
            </h3>
          </div>
          <div className="space-y-2 max-h-[300px] overflow-y-auto scrollbar-thin scrollbar-thumb-dark-border">
            {confirmedBookings.length === 0 ? (
              <p className="text-xs text-center py-6" style={{ color: 'var(--color-text-muted)' }}>No confirmed sessions</p>
            ) : confirmedBookings.map(b => (
              <div key={b.id} className="flex items-center justify-between p-3 rounded-xl"
                style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
                <div>
                  <p className="text-xs font-semibold text-white">{b.memberName}</p>
                  <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>{b.className} · {b.day} {b.time}</p>
                </div>
                <Badge variant="Confirmed">{b.trainerName}</Badge>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Trainer Schedule Modal */}
      <AnimatePresence>
        {selectedTrainer && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/70 z-50" onClick={() => setSelectedTrainer(null)} />
            <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
                className="w-full max-w-md rounded-2xl shadow-2xl overflow-hidden max-h-[80vh] overflow-y-auto"
                style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
                onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="p-5 flex items-center justify-between" style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full overflow-hidden" style={{ border: '2px solid var(--color-primary)' }}>
                      {selectedTrainer.photoUrl ? (
                        <img src={selectedTrainer.photoUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-white font-bold text-xs" style={{ background: 'var(--color-primary)' }}>
                          {selectedTrainer.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                        </div>
                      )}
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-white">{selectedTrainer.name}</h2>
                      <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>{selectedTrainer.specialization}</p>
                    </div>
                  </div>
                  <button onClick={() => setSelectedTrainer(null)} style={{ color: 'var(--color-text-muted)' }}><X size={18} /></button>
                </div>

                <div className="p-5 space-y-5">
                  {/* Weekly Availability */}
                  <div>
                    <h3 className="text-xs font-semibold text-white mb-2">Weekly Availability</h3>
                    <p className="text-[10px] mb-3" style={{ color: 'var(--color-text-muted)' }}>Click to toggle days on/off</p>
                    <div className="grid grid-cols-7 gap-1.5">
                      {DAYS.map(day => {
                        const on = trainerAvailability[selectedTrainer.id]?.[day] ?? false;
                        return (
                          <button key={day} onClick={() => toggleTrainerDay(selectedTrainer.id, day)}
                            className="rounded-lg p-2 text-center transition-all"
                            style={{ background: on ? 'var(--color-primary)' : 'var(--color-surface-raised)', border: `1px solid ${on ? 'var(--color-primary)' : 'var(--color-border)'}` }}>
                            <p className="text-[9px] font-bold" style={{ color: on ? '#fff' : 'var(--color-text-muted)' }}>{day.slice(0, 3)}</p>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Confirmed Sessions */}
                  <div>
                    <h3 className="text-xs font-semibold text-white mb-2">Confirmed Sessions</h3>
                    {getTrainerBookings(selectedTrainer.name).length === 0 ? (
                      <p className="text-[11px] text-center py-4" style={{ color: 'var(--color-text-muted)' }}>No confirmed sessions</p>
                    ) : (
                      <div className="space-y-1.5">
                        {getTrainerBookings(selectedTrainer.name).map(b => (
                          <div key={b.id} className="p-2.5 rounded-lg"
                            style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
                            <p className="text-[11px] font-semibold text-white">{b.memberName} — {b.className}</p>
                            <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>{b.day} · {b.time}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="p-4" style={{ borderTop: '1px solid var(--color-border)' }}>
                  <button onClick={() => setSelectedTrainer(null)}
                    className="w-full py-2.5 rounded-full font-semibold text-sm text-black"
                    style={{ background: 'var(--color-secondary)' }}>Close</button>
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
