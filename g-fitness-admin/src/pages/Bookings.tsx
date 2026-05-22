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

const emptyForm = { memberName: '', memberEmail: '', trainerName: '', sessionType: 'Strength Training', date: '', time: '6:00 AM', notes: '' };

export default function Bookings() {
  const [bookings, setBookings] = useState<Booking[]>(() => SharedStorage.getBookings());
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
    <div className="space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Bookings</h1>
          <p className="mt-1" style={{ color: 'var(--color-text-muted)' }}>Trainer session booking requests</p>
        </div>
        <button onClick={() => setShowAddModal(true)}
          className="px-5 py-2.5 rounded-xl font-semibold flex items-center gap-2 text-black transition-colors"
          style={{ background: 'var(--color-secondary)' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-secondary-hover)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'var(--color-secondary)')}>
          <Plus size={18} /> Add Booking
        </button>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Pending', value: pending, icon: Clock, color: 'var(--color-secondary)' },
          { label: 'Confirmed', value: confirmed, icon: CheckCircle, color: 'var(--color-primary)' },
          { label: 'Rejected', value: rejected, icon: XCircle, color: 'var(--color-secondary)' },
        ].map((s, i) => {
          const Icon = s.icon;
          return (
            <motion.div key={s.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}>
              <Card>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${s.color}20` }}>
                    <Icon size={20} style={{ color: s.color }} />
                  </div>
                  <div>
                    <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{s.label}</p>
                    <p className="text-2xl font-bold text-white">{s.value}</p>
                  </div>
                </div>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* Search + Filter row */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        <Card>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[220px] relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-text-muted)' }} />
              <input value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Search member, email or trainer…"
                className="w-full pl-9 pr-3 py-2.5 rounded-xl text-sm focus:outline-none"
                style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', color: '#fff' }} />
            </div>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)}
              className="px-3 py-2.5 rounded-xl text-sm focus:outline-none"
              style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
              <option value="all">All statuses</option>
              <option value="Pending">Pending</option>
              <option value="Confirmed">Confirmed</option>
              <option value="Rejected">Rejected</option>
              <option value="Completed">Completed</option>
              <option value="Cancelled">Cancelled</option>
            </select>
            <input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)}
              className="px-3 py-2.5 rounded-xl text-sm focus:outline-none"
              style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }} />
            {(search || statusFilter !== 'all' || dateFilter) && (
              <button onClick={() => { setSearch(''); setStatusFilter('all'); setDateFilter(''); }}
                className="px-3 py-2 rounded-xl text-xs font-semibold"
                style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
                Clear
              </button>
            )}
          </div>
        </Card>
      </motion.div>

      {/* Table */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
        <Card>
          {filtered.length > 0 ? (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--color-border)' }}>
                      {['Member', 'Trainer', 'Session Type', 'Date & Time', 'Status', 'Actions'].map(h => (
                        <th key={h} className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedBookings.map(b => (
                      <tr key={b.id} style={{ borderBottom: '1px solid var(--color-border)' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-surface-raised)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                        <td className="py-4 px-4">
                          <p className="text-white font-semibold">{b.memberName}</p>
                          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{b.memberEmail}</p>
                        </td>
                        <td className="py-4 px-4 text-sm text-white">{b.trainerName}</td>
                        <td className="py-4 px-4">
                          <span className="text-xs px-2 py-1 rounded-lg font-semibold" style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary)', border: '1px solid rgba(124,58,237,0.20)' }}>
                            {b.sessionType || b.className}
                          </span>
                        </td>
                        <td className="py-4 px-4">
                          <div className="flex items-center gap-1.5 text-sm text-white mb-1">
                            <Calendar size={13} style={{ color: 'var(--color-text-muted)' }} />
                            {b.day || new Date(b.date).toLocaleDateString()}
                          </div>
                          <div className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--color-text-muted)' }}>
                            <Clock size={13} /> {b.time}
                          </div>
                        </td>
                        <td className="py-4 px-4">
                          <Badge variant={b.status}>{b.status}</Badge>
                        </td>
                        <td className="py-4 px-4">
                          {b.status === 'Pending' && (
                            <div className="flex items-center gap-2">
                              <button onClick={() => handleApprove(b)}
                                className="p-2 rounded-lg transition-colors" title="Approve"
                                style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary)', border: '1px solid rgba(124,58,237,0.20)' }}>
                                <Check size={15} />
                              </button>
                              <button onClick={() => handleReject(b)}
                                className="p-2 rounded-lg transition-colors" title="Reject"
                                style={{ background: 'var(--color-secondary-light)', color: 'var(--color-secondary)', border: '1px solid rgba(245,158,11,0.20)' }}>
                                <X size={15} />
                              </button>
                            </div>
                          )}
                          {b.status === 'Confirmed' && <span className="text-xs text-violet font-semibold">✓ Approved</span>}
                          {b.status === 'Rejected' && <span className="text-xs text-yellow font-semibold">✗ Rejected</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination currentPage={currentPage} totalItems={filtered.length} itemsPerPage={ITEMS_PER_PAGE} onPageChange={setCurrentPage} />
            </>
          ) : (
            <div className="py-16 text-center">
              <Calendar size={56} className="mx-auto mb-4" style={{ color: 'var(--color-border)' }} />
              <p className="font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                {bookings.length === 0 ? 'No booking requests yet' : 'No bookings match your filters'}
              </p>
              <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>
                {bookings.length === 0
                  ? 'Trainer booking requests from members will appear here'
                  : 'Try clearing your search or filters'}
              </p>
            </div>
          )}
        </Card>
      </motion.div>

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
