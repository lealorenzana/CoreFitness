import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect, useMemo } from 'react';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Pagination from '../components/ui/Pagination';
import { Calendar, CheckCircle, Clock, XCircle, Plus, X, Check, AlertTriangle, Search } from 'lucide-react';
import { SharedStorage } from '../utils/sharedStorage';
import { showToast } from '../utils/toast';

interface Booking {
  id: string; memberName: string; memberId: string; memberEmail: string;
  trainerName: string; sessionType: string; date: string; time: string;
  status: 'Pending' | 'Confirmed' | 'Rejected' | 'Completed' | 'Cancelled';
  className?: string; day?: string; notes?: string;
}

const ITEMS_PER_PAGE = 10;

const MOCK_BOOKINGS: Booking[] = [
  { id: 'bk-001', memberId: 'aaron.diwa@email.com', memberName: 'Aaron Diwa', memberEmail: 'aaron.diwa@email.com', className: 'Strength Training', classType: 'Strength Training', trainerName: 'Cyrelle Joy Duhac', trainerId: 'trainer-001', day: 'Monday', time: '6:00 AM', date: '2026-05-23', status: 'Pending', createdAt: '2026-05-23T08:00:00Z' },
  { id: 'bk-002', memberId: 'aj.aguirre@email.com', memberName: 'Aj Aguirre', memberEmail: 'aj.aguirre@email.com', className: 'HIIT', classType: 'HIIT', trainerName: 'Ana Par Iturralde', trainerId: 'trainer-002', day: 'Tuesday', time: '7:00 AM', date: '2026-05-22', status: 'Confirmed', createdAt: '2026-05-22T07:30:00Z' },
  { id: 'bk-003', memberId: 'anjeleca.avila@email.com', memberName: 'Anjeleca Avila', memberEmail: 'anjeleca.avila@email.com', className: 'Boxing', classType: 'Boxing', trainerName: 'Nathanniel Ucol', trainerId: 'trainer-003', day: 'Wednesday', time: '5:00 PM', date: '2026-05-21', status: 'Confirmed', createdAt: '2026-05-21T14:00:00Z' },
  { id: 'bk-004', memberId: 'clairey.belen@email.com', memberName: 'Clairey Anne Belen', memberEmail: 'clairey.belen@email.com', className: 'Yoga', classType: 'Yoga', trainerName: 'Cyrelle Joy Duhac', trainerId: 'trainer-001', day: 'Thursday', time: '6:00 AM', date: '2026-05-20', status: 'Rejected', createdAt: '2026-05-20T05:00:00Z' },
  { id: 'bk-005', memberId: 'crizaldo.alboro@email.com', memberName: 'Crizaldo Alboro', memberEmail: 'crizaldo.alboro@email.com', className: 'CrossFit', classType: 'CrossFit', trainerName: 'Nathanniel Ucol', trainerId: 'trainer-003', day: 'Friday', time: '6:00 PM', date: '2026-05-19', status: 'Pending', createdAt: '2026-05-19T16:00:00Z' },
  { id: 'bk-006', memberId: 'cyrelle.flordeliza@email.com', memberName: 'Cyrelle Joy Flordeliza', memberEmail: 'cyrelle.flordeliza@email.com', className: 'Strength Training', classType: 'Strength Training', trainerName: 'Ana Par Iturralde', trainerId: 'trainer-002', day: 'Saturday', time: '8:00 AM', date: '2026-05-18', status: 'Confirmed', createdAt: '2026-05-18T07:00:00Z' },
  { id: 'bk-007', memberId: 'bhebemon@email.com', memberName: 'Bhebemon Bhebemon', memberEmail: 'bhebemon@email.com', className: 'HIIT', classType: 'HIIT', trainerName: 'Cyrelle Joy Duhac', trainerId: 'trainer-001', day: 'Monday', time: '5:00 PM', date: '2026-05-17', status: 'Pending', createdAt: '2026-05-17T15:00:00Z' },
  { id: 'bk-008', memberId: 'arvin.delarosa@email.com', memberName: 'Arvin Dela Rosa', memberEmail: 'arvin.delarosa@email.com', className: 'Boxing', classType: 'Boxing', trainerName: 'Nathanniel Ucol', trainerId: 'trainer-003', day: 'Wednesday', time: '7:00 PM', date: '2026-05-16', status: 'Confirmed', createdAt: '2026-05-16T18:00:00Z' },
];

const emptyForm = { memberName: '', memberEmail: '', trainerName: '', sessionType: 'Strength Training', date: '', time: '6:00 AM', notes: '' };

export default function Bookings() {
  const [bookings, setBookings] = useState<Booking[]>(() => {
    const stored = SharedStorage.getBookings();
    if (stored.length === 0) {
      // Seed with mock data if empty
      MOCK_BOOKINGS.forEach(b => SharedStorage.addBooking(b));
      return MOCK_BOOKINGS;
    }
    return stored;
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [showAddModal, setShowAddModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState('');

  // Search + filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'Pending' | 'Confirmed' | 'Rejected' | 'Completed' | 'Cancelled'>('all');
  const [dateFilter, setDateFilter] = useState('');

  useEffect(() => {
    const interval = setInterval(() => setBookings(SharedStorage.getBookings()), 2000);
    return () => clearInterval(interval);
  }, []);

  const handleApprove = (b: Booking) => {
    SharedStorage.updateBookingStatus(b.id, 'Confirmed');
    setBookings(SharedStorage.getBookings());
    showToast(`Booking for ${b.memberName} approved!`, 'success');
  };

  const handleReject = (b: Booking) => {
    SharedStorage.updateBookingStatus(b.id, 'Rejected');
    setBookings(SharedStorage.getBookings());
    showToast(`Booking rejected`, 'success');
  };

  const handleAddBooking = () => {
    if (!form.memberName.trim() || !form.trainerName.trim() || !form.date || !form.time) {
      setFormError('Member name, trainer, date and time are required.');
      return;
    }
    const newBooking = {
      id: `booking-${Date.now()}`,
      memberId: `manual-${Date.now()}`,
      memberName: form.memberName,
      memberEmail: form.memberEmail,
      trainerName: form.trainerName,
      sessionType: form.sessionType,
      className: form.sessionType,
      classType: form.sessionType,
      date: form.date,
      day: new Date(form.date).toLocaleDateString('en-US', { weekday: 'long' }),
      time: form.time,
      status: 'Confirmed',
      notes: form.notes,
      createdAt: new Date().toISOString(),
      createdByAdmin: true,
    };
    SharedStorage.addBooking(newBooking);
    setBookings(SharedStorage.getBookings());
    setShowAddModal(false);
    setForm(emptyForm);
    setFormError('');
    showToast(`Booking created for ${form.memberName}!`, 'success');
  };

  const filtered = useMemo(() => {
    return bookings.filter((b) => {
      const matchSearch = search.trim() === '' ||
        b.memberName.toLowerCase().includes(search.toLowerCase()) ||
        (b.memberEmail || '').toLowerCase().includes(search.toLowerCase()) ||
        b.trainerName.toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === 'all' || b.status === statusFilter;
      const matchDate   = !dateFilter || b.date === dateFilter;
      return matchSearch && matchStatus && matchDate;
    });
  }, [bookings, search, statusFilter, dateFilter]);

  useEffect(() => { setCurrentPage(1); }, [search, statusFilter, dateFilter]);

  const paginatedBookings = filtered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  const pending = bookings.filter(b => b.status === 'Pending').length;
  const confirmed = bookings.filter(b => b.status === 'Confirmed').length;
  const rejected = bookings.filter(b => b.status === 'Rejected').length;

  return (
    <div className="h-[calc(100vh-5rem)] flex flex-col gap-3 overflow-hidden">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-xl font-bold text-white">Bookings</h1>
          <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>Trainer session booking requests</p>
        </div>
        <button onClick={() => setShowAddModal(true)}
          className="px-4 h-9 rounded-full font-semibold text-xs flex items-center gap-2 text-black transition-colors"
          style={{ background: 'var(--color-secondary)' }}>
          <Plus size={14} /> Add Booking
        </button>
      </motion.div>

      {/* Stats + Search row */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          {[
            { label: 'Pending', value: pending, icon: Clock, color: 'var(--color-secondary)' },
            { label: 'Confirmed', value: confirmed, icon: CheckCircle, color: 'var(--color-primary)' },
            { label: 'Rejected', value: rejected, icon: XCircle, color: '#ef4444' },
          ].map(s => {
            const Icon = s.icon;
            return (
              <div key={s.label} className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
                style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
                <Icon size={12} style={{ color: s.color }} />
                <span className="text-[9px] uppercase" style={{ color: 'var(--color-text-muted)' }}>{s.label}</span>
                <span className="text-sm font-bold text-white">{s.value}</span>
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-text-muted)' }} />
            <input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              className="w-40 pl-8 pr-3 h-8 rounded-full text-xs text-white focus:outline-none"
              style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }} />
          </div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)}
            className="px-2 h-8 rounded-full text-[11px] focus:outline-none"
            style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
            <option value="all">All</option>
            <option value="Pending">Pending</option>
            <option value="Confirmed">Confirmed</option>
            <option value="Rejected">Rejected</option>
          </select>
          <input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)}
            className="px-2 h-8 rounded-full text-[11px] focus:outline-none"
            style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }} />
          {(search || statusFilter !== 'all' || dateFilter) && (
            <button onClick={() => { setSearch(''); setStatusFilter('all'); setDateFilter(''); }}
              className="px-2 h-8 rounded-full text-[10px] font-semibold"
              style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Table — fills remaining height */}
      <div className="flex-1 min-h-0 rounded-xl overflow-hidden flex flex-col"
        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
        {filtered.length > 0 ? (
          <>
            <div className="overflow-y-auto scrollbar-thin scrollbar-thumb-dark-border">
              <table className="w-full table-fixed">
                <thead className="sticky top-0 z-10" style={{ background: 'var(--color-surface)' }}>
                  <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <th className="text-left py-2 px-3 text-[10px] font-semibold uppercase tracking-wider w-[20%]" style={{ color: 'var(--color-text-muted)' }}>Member</th>
                    <th className="text-left py-2 px-3 text-[10px] font-semibold uppercase tracking-wider w-[15%]" style={{ color: 'var(--color-text-muted)' }}>Trainer</th>
                    <th className="text-left py-2 px-3 text-[10px] font-semibold uppercase tracking-wider w-[15%]" style={{ color: 'var(--color-text-muted)' }}>Session</th>
                    <th className="text-left py-2 px-3 text-[10px] font-semibold uppercase tracking-wider w-[18%]" style={{ color: 'var(--color-text-muted)' }}>Date & Time</th>
                    <th className="text-left py-2 px-3 text-[10px] font-semibold uppercase tracking-wider w-[12%]" style={{ color: 'var(--color-text-muted)' }}>Status</th>
                    <th className="text-left py-2 px-3 text-[10px] font-semibold uppercase tracking-wider w-[14%]" style={{ color: 'var(--color-text-muted)' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedBookings.map(b => (
                    <tr key={b.id} style={{ borderBottom: '1px solid var(--color-border)' }}
                      className="transition-colors"
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-surface-raised)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      <td className="py-2 px-3">
                        <p className="text-xs text-white font-semibold truncate">{b.memberName}</p>
                        <p className="text-[9px] truncate" style={{ color: 'var(--color-text-muted)' }}>{b.memberEmail}</p>
                      </td>
                      <td className="py-2 px-3 text-[11px] text-white truncate">{b.trainerName}</td>
                      <td className="py-2 px-3">
                        <span className="text-[9px] px-2 py-0.5 rounded-full font-semibold" style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary)' }}>
                          {b.sessionType || b.className}
                        </span>
                      </td>
                      <td className="py-2 px-3">
                        <p className="text-[11px] text-white flex items-center gap-1">
                          <Calendar size={10} style={{ color: 'var(--color-text-muted)' }} />
                          {b.day || new Date(b.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </p>
                        <p className="text-[10px] flex items-center gap-1" style={{ color: 'var(--color-text-muted)' }}>
                          <Clock size={9} /> {b.time}
                        </p>
                      </td>
                      <td className="py-2 px-3">
                        <Badge variant={b.status}>{b.status}</Badge>
                      </td>
                      <td className="py-2 px-3">
                        {b.status === 'Pending' && (
                          <div className="flex items-center gap-1">
                            <button onClick={() => handleApprove(b)}
                              className="p-1.5 rounded-full" title="Approve"
                              style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary)' }}>
                              <Check size={12} />
                            </button>
                            <button onClick={() => handleReject(b)}
                              className="p-1.5 rounded-full" title="Reject"
                              style={{ background: 'var(--color-secondary-light)', color: 'var(--color-secondary)' }}>
                              <X size={12} />
                            </button>
                          </div>
                        )}
                        {b.status === 'Confirmed' && <span className="text-[10px] font-semibold" style={{ color: 'var(--color-primary)' }}>✓ Approved</span>}
                        {b.status === 'Rejected' && <span className="text-[10px] font-semibold" style={{ color: 'var(--color-secondary)' }}>✗ Rejected</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex-shrink-0 px-3 py-1" style={{ borderTop: '1px solid var(--color-border)' }}>
              <Pagination currentPage={currentPage} totalItems={filtered.length} itemsPerPage={ITEMS_PER_PAGE} onPageChange={setCurrentPage} />
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center">
            <Calendar size={32} className="mb-2" style={{ color: 'var(--color-border)' }} />
            <p className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
              {bookings.length === 0 ? 'No booking requests yet' : 'No bookings match your filters'}
            </p>
          </div>
        )}
      </div>

      {/* Add Booking Modal */}
      <AnimatePresence>
        {showAddModal && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/70 z-50" onClick={() => setShowAddModal(false)} />
            <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
                className="w-full max-w-md rounded-2xl shadow-2xl overflow-hidden"
                style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
                onClick={e => e.stopPropagation()}>
                <div className="p-5 flex items-center justify-between" style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <h2 className="text-xl font-bold text-white">Add Booking</h2>
                  <button onClick={() => setShowAddModal(false)} style={{ color: 'var(--color-text-muted)' }}
                    onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-text-muted)')}>
                    <X size={22} />
                  </button>
                </div>
                <div className="p-5 space-y-4">
                  {formError && (
                    <div className="flex items-center gap-2 p-3 rounded-xl text-sm" style={{ background: 'var(--color-secondary-light)', border: '1px solid rgba(245,158,11,0.30)', color: 'var(--color-secondary)' }}>
                      <AlertTriangle size={16} /> {formError}
                    </div>
                  )}
                  {[
                    { label: 'Member Name *', key: 'memberName', placeholder: 'Juan Dela Cruz' },
                    { label: 'Member Email', key: 'memberEmail', placeholder: 'juan@email.com' },
                    { label: 'Trainer Name *', key: 'trainerName', placeholder: 'Coach Maria' },
                  ].map(f => (
                    <div key={f.key}>
                      <label className="text-sm block mb-1.5" style={{ color: 'var(--color-text-muted)' }}>{f.label}</label>
                      <input value={(form as any)[f.key]} onChange={e => setForm({ ...form, [f.key]: e.target.value })}
                        placeholder={f.placeholder}
                        className="w-full px-4 py-2.5 rounded-xl text-white text-sm focus:outline-none"
                        style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }} />
                    </div>
                  ))}
                  <div>
                    <label className="text-sm block mb-1.5" style={{ color: 'var(--color-text-muted)' }}>Session Type</label>
                    <select value={form.sessionType} onChange={e => setForm({ ...form, sessionType: e.target.value })}
                      className="w-full px-4 py-2.5 rounded-xl text-white text-sm focus:outline-none"
                      style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
                      {['Strength Training', 'HIIT', 'Yoga', 'Boxing', 'CrossFit', 'Personal Training'].map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm block mb-1.5" style={{ color: 'var(--color-text-muted)' }}>Date *</label>
                      <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })}
                        className="w-full px-4 py-2.5 rounded-xl text-white text-sm focus:outline-none"
                        style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }} />
                    </div>
                    <div>
                      <label className="text-sm block mb-1.5" style={{ color: 'var(--color-text-muted)' }}>Time *</label>
                      <input value={form.time} onChange={e => setForm({ ...form, time: e.target.value })}
                        placeholder="6:00 AM"
                        className="w-full px-4 py-2.5 rounded-xl text-white text-sm focus:outline-none"
                        style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }} />
                    </div>
                  </div>
                  <div>
                    <label className="text-sm block mb-1.5" style={{ color: 'var(--color-text-muted)' }}>Notes (optional)</label>
                    <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
                      rows={2} placeholder="Any special instructions…"
                      className="w-full px-4 py-2.5 rounded-xl text-white text-sm focus:outline-none resize-none"
                      style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }} />
                  </div>
                  <div className="flex gap-3 pt-2" style={{ borderTop: '1px solid var(--color-border)' }}>
                    <button onClick={() => setShowAddModal(false)}
                      className="flex-1 py-2.5 rounded-xl font-semibold text-sm"
                      style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
                      Cancel
                    </button>
                    <button onClick={handleAddBooking}
                      className="flex-1 py-2.5 rounded-xl font-semibold text-sm text-black"
                      style={{ background: 'var(--color-secondary)' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-secondary-hover)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'var(--color-secondary)')}>
                      Create Booking
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
