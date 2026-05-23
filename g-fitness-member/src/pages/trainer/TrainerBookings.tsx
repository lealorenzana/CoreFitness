import { useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle, XCircle, Clock, Calendar, User } from 'lucide-react';

type BookingStatus = 'pending' | 'confirmed' | 'declined' | 'completed';

interface Booking {
  id: string;
  memberName: string;
  date: string;
  time: string;
  type: string;
  status: BookingStatus;
  notes?: string;
}

const INITIAL_BOOKINGS: Booking[] = [
  { id: 'b1', memberName: 'Aaron Diwa', date: '2026-05-26', time: '6:00 AM', type: 'Personal Training', status: 'pending', notes: 'Focus on upper body' },
  { id: 'b2', memberName: 'Clairey Anne Belen', date: '2026-05-26', time: '5:00 PM', type: '1-on-1 Session', status: 'pending' },
  { id: 'b3', memberName: 'Ana Par Ituralde', date: '2026-05-27', time: '7:00 AM', type: 'Personal Training', status: 'confirmed' },
  { id: 'b4', memberName: 'Aj Aguirre', date: '2026-05-25', time: '6:00 PM', type: 'Assessment', status: 'confirmed', notes: 'Initial fitness assessment' },
  { id: 'b5', memberName: 'Arvin Dela Rosa', date: '2026-05-24', time: '5:00 PM', type: 'Personal Training', status: 'completed' },
  { id: 'b6', memberName: 'Aaron Diwa', date: '2026-05-23', time: '6:00 AM', type: 'Personal Training', status: 'completed' },
  { id: 'b7', memberName: 'Clairey Anne Belen', date: '2026-05-22', time: '5:00 PM', type: '1-on-1 Session', status: 'declined', notes: 'Schedule conflict' },
];

export default function TrainerBookings() {
  const [bookings, setBookings] = useState<Booking[]>(INITIAL_BOOKINGS);
  const [filter, setFilter] = useState<'all' | BookingStatus>('all');

  const handleAction = (id: string, action: 'confirmed' | 'declined') => {
    setBookings(prev => prev.map(b => b.id === id ? { ...b, status: action } : b));
  };

  const filtered = filter === 'all' ? bookings : bookings.filter(b => b.status === filter);
  const pendingCount = bookings.filter(b => b.status === 'pending').length;

  const statusConfig: Record<BookingStatus, { bg: string; color: string; label: string }> = {
    pending: { bg: 'rgba(245,158,11,0.15)', color: 'var(--color-secondary)', label: 'Pending' },
    confirmed: { bg: 'rgba(34,197,94,0.15)', color: '#22c55e', label: 'Confirmed' },
    declined: { bg: 'rgba(239,68,68,0.15)', color: '#ef4444', label: 'Declined' },
    completed: { bg: 'var(--color-primary-light)', color: 'var(--color-primary)', label: 'Completed' },
  };

  return (
    <div className="space-y-4 pb-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-bold text-white">Bookings</h1>
          <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>Manage training session requests</p>
        </div>
        {pendingCount > 0 && (
          <span className="text-[10px] px-2.5 py-1 rounded-full font-bold"
            style={{ background: 'rgba(245,158,11,0.15)', color: 'var(--color-secondary)' }}>
            {pendingCount} pending
          </span>
        )}
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
        {(['all', 'pending', 'confirmed', 'completed', 'declined'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className="px-3 py-1.5 rounded-full text-[10px] font-semibold whitespace-nowrap flex-shrink-0 transition-colors capitalize"
            style={{
              background: filter === f ? 'var(--color-primary)' : 'var(--color-surface)',
              color: filter === f ? '#fff' : 'var(--color-text-muted)',
              border: `1px solid ${filter === f ? 'var(--color-primary)' : 'var(--color-border)'}`,
            }}>
            {f === 'all' ? `All (${bookings.length})` : `${f} (${bookings.filter(b => b.status === f).length})`}
          </button>
        ))}
      </div>

      {/* Bookings List */}
      <div className="space-y-2">
        {filtered.map((booking, i) => {
          const config = statusConfig[booking.status];
          return (
            <motion.div key={booking.id}
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
              className="p-3 rounded-xl"
              style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[9px] font-bold"
                    style={{ background: 'var(--color-primary)' }}>
                    {booking.memberName.split(' ').map(n => n[0]).join('').slice(0, 2)}
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-white">{booking.memberName}</p>
                    <p className="text-[9px]" style={{ color: 'var(--color-text-muted)' }}>{booking.type}</p>
                  </div>
                </div>
                <span className="text-[9px] px-2 py-0.5 rounded-full font-medium"
                  style={{ background: config.bg, color: config.color }}>
                  {config.label}
                </span>
              </div>

              <div className="flex items-center gap-3 mb-2">
                <span className="text-[10px] flex items-center gap-1" style={{ color: 'var(--color-text-muted)' }}>
                  <Calendar size={10} /> {new Date(booking.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
                <span className="text-[10px] flex items-center gap-1" style={{ color: 'var(--color-text-muted)' }}>
                  <Clock size={10} /> {booking.time}
                </span>
              </div>

              {booking.notes && (
                <p className="text-[10px] px-2 py-1.5 rounded-lg mb-2" style={{ background: 'var(--color-bg)', color: 'var(--color-text-muted)' }}>
                  Note: {booking.notes}
                </p>
              )}

              {booking.status === 'pending' && (
                <div className="flex gap-2">
                  <button onClick={() => handleAction(booking.id, 'confirmed')}
                    className="flex-1 flex items-center justify-center gap-1 py-2 rounded-full text-[10px] font-semibold active:scale-95 transition-transform"
                    style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)' }}>
                    <CheckCircle size={12} /> Accept
                  </button>
                  <button onClick={() => handleAction(booking.id, 'declined')}
                    className="flex-1 flex items-center justify-center gap-1 py-2 rounded-full text-[10px] font-semibold active:scale-95 transition-transform"
                    style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }}>
                    <XCircle size={12} /> Decline
                  </button>
                </div>
              )}
            </motion.div>
          );
        })}
        {filtered.length === 0 && (
          <p className="text-center py-8 text-[11px]" style={{ color: 'var(--color-text-muted)' }}>No bookings found</p>
        )}
      </div>
    </div>
  );
}
