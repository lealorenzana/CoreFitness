import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect } from 'react';
import Card from '../components/ui/Card';
import Pagination from '../components/ui/Pagination';
import Badge from '../components/ui/Badge';
import { Calendar, Clock, Plus, Edit2, Trash2, X, CheckCircle, XCircle, AlertTriangle, List, LayoutGrid } from 'lucide-react';
import { showToast } from '../utils/toast';
import { SharedStorage } from '../utils/sharedStorage';

interface ClassSchedule {
  id: string; name: string; instructor: string; day: string;
  time: string; duration: number; capacity: number; enrolled: number; room: string;
}

interface ClassForm {
  name: string; instructor: string; day: string; time: string;
  duration: string; capacity: string; room: string;
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const ITEMS_PER_PAGE = 8;

const defaultSchedules: ClassSchedule[] = [
  { id: '1', name: 'Morning HIIT', instructor: 'Coach Maria', day: 'Monday', time: '6:00 AM', duration: 45, capacity: 20, enrolled: 18, room: 'Studio A' },
  { id: '2', name: 'Yoga Flow', instructor: 'Coach Ana', day: 'Monday', time: '7:00 AM', duration: 60, capacity: 15, enrolled: 12, room: 'Studio B' },
  { id: '3', name: 'Strength Training', instructor: 'Coach Pedro', day: 'Monday', time: '6:00 PM', duration: 60, capacity: 25, enrolled: 22, room: 'Main Floor' },
  { id: '4', name: 'Zumba Dance', instructor: 'Coach Lisa', day: 'Tuesday', time: '7:00 PM', duration: 45, capacity: 30, enrolled: 28, room: 'Studio A' },
  { id: '5', name: 'Boxing Basics', instructor: 'Coach Carlos', day: 'Wednesday', time: '6:00 PM', duration: 60, capacity: 15, enrolled: 10, room: 'Boxing Ring' },
];

const emptyForm: ClassForm = { name: '', instructor: '', day: 'Monday', time: '', duration: '60', capacity: '20', room: '' };

export default function Schedule() {
  const [activeTab, setActiveTab] = useState<'classes' | 'bookings'>('classes');
  const [view, setView] = useState<'list' | 'grid'>('list');
  const [schedules, setSchedules] = useState<ClassSchedule[]>(defaultSchedules);
  const [classBookings, setClassBookings] = useState<any[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [bookingPage, setBookingPage] = useState(1);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingClass, setEditingClass] = useState<ClassSchedule | null>(null);
  const [form, setForm] = useState<ClassForm>(emptyForm);
  const [formError, setFormError] = useState('');
  const [formWarning, setFormWarning] = useState('');
  const [warningAcknowledged, setWarningAcknowledged] = useState(false);

  // View schedule modal
  const [viewSchedule, setViewSchedule] = useState<any | null>(null);

  useEffect(() => {
    const refresh = () => setClassBookings(SharedStorage.getBookings());
    refresh();
    const interval = setInterval(refresh, 2000);
    return () => clearInterval(interval);
  }, []);

  const openAddModal = () => {
    setEditingClass(null);
    setForm(emptyForm);
    setFormError('');
    setFormWarning('');
    setWarningAcknowledged(false);
    setShowModal(true);
  };

  const openEditModal = (c: ClassSchedule) => {
    setEditingClass(c);
    setForm({ name: c.name, instructor: c.instructor, day: c.day, time: c.time, duration: String(c.duration), capacity: String(c.capacity), room: c.room });
    setFormError('');
    setFormWarning('');
    setWarningAcknowledged(false);
    setShowModal(true);
  };

  const detectConflict = (f: ClassForm, excludeId?: string): string => {
    const conflict = schedules.find(s =>
      s.id !== excludeId &&
      s.instructor.toLowerCase() === f.instructor.toLowerCase() &&
      s.day === f.day &&
      s.time === f.time
    );
    if (conflict) return `Conflict: ${f.instructor} already has "${conflict.name}" on ${f.day} at ${f.time}.`;
    return '';
  };

  const handleSaveClass = () => {
    if (!form.name.trim() || !form.instructor.trim() || !form.time.trim() || !form.room.trim()) {
      setFormError('All fields are required.');
      return;
    }
    setFormError('');

    const conflict = detectConflict(form, editingClass?.id);
    if (conflict && !warningAcknowledged) {
      // Show yellow warning, but DO NOT block save. User must click save again to proceed.
      setFormWarning(conflict);
      setWarningAcknowledged(true);
      return;
    }

    if (editingClass) {
      setSchedules(prev => prev.map(s => s.id === editingClass.id
        ? { ...s, name: form.name, instructor: form.instructor, day: form.day, time: form.time, duration: Number(form.duration), capacity: Number(form.capacity), room: form.room }
        : s
      ));
      showToast(`${form.name} updated!`, 'success');
    } else {
      const newClass: ClassSchedule = {
        id: `class-${Date.now()}`, name: form.name, instructor: form.instructor,
        day: form.day, time: form.time, duration: Number(form.duration),
        capacity: Number(form.capacity), enrolled: 0, room: form.room,
      };
      setSchedules(prev => [...prev, newClass]);
      showToast(`${form.name} added!`, 'success');
    }
    setShowModal(false);
    setFormWarning('');
    setWarningAcknowledged(false);
  };

  const handleDelete = (c: ClassSchedule) => {
    if (window.confirm(`Delete "${c.name}"?`)) {
      setSchedules(prev => prev.filter(s => s.id !== c.id));
      showToast(`${c.name} deleted`, 'success');
    }
  };

  const handleConfirmBooking = (id: string) => {
    SharedStorage.updateBooking(id, { status: 'Confirmed', approvedAt: new Date().toISOString() });
    setClassBookings(SharedStorage.getBookings());
    showToast('Booking approved!', 'success');
  };

  const handleRejectBooking = (id: string) => {
    const reason = window.prompt('Reason for rejection:');
    if (!reason) return;
    SharedStorage.updateBooking(id, { status: 'Rejected', rejectionReason: reason, rejectedAt: new Date().toISOString() });
    setClassBookings(SharedStorage.getBookings());
    showToast('Booking rejected', 'success');
  };

  const paginatedSchedules = schedules.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);
  const paginatedBookings = classBookings.slice((bookingPage - 1) * ITEMS_PER_PAGE, bookingPage * ITEMS_PER_PAGE);

  const capacityColor = (enrolled: number, capacity: number) => {
    const pct = (enrolled / capacity) * 100;
    if (pct >= 90) return 'var(--color-secondary)';
    if (pct >= 70) return 'var(--color-secondary)';
    return 'var(--color-primary)';
  };

  const tabs = [
    { id: 'classes', label: 'Class Schedule' },
    { id: 'bookings', label: 'Class Bookings', badge: classBookings.filter(b => b.status === 'Pending').length },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Schedule Management</h1>
          <p className="mt-1" style={{ color: 'var(--color-text-muted)' }}>Manage class schedules and booking requests</p>
        </div>
        {activeTab === 'classes' && (
          <button onClick={openAddModal}
            className="px-5 py-2.5 rounded-xl font-semibold flex items-center gap-2 text-black transition-colors"
            style={{ background: 'var(--color-secondary)' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-secondary-hover)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'var(--color-secondary)')}>
            <Plus size={18} /> Add Class
          </button>
        )}
      </motion.div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id as any)}
            className="px-5 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2"
            style={{
              background: activeTab === tab.id ? 'var(--color-secondary)' : 'transparent',
              color: activeTab === tab.id ? '#000' : 'var(--color-text-secondary)',
            }}>
            {tab.label}
            {tab.badge ? (
              <span className="px-1.5 py-0.5 rounded-full text-xs font-bold" style={{ background: activeTab === tab.id ? '#000' : 'var(--color-secondary)', color: activeTab === tab.id ? 'var(--color-secondary)' : '#000' }}>
                {tab.badge}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {/* Class Schedule Tab */}
      {activeTab === 'classes' && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          {/* List ↔ Grid toggle */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
              {[
                { id: 'list', label: 'List',         icon: List },
                { id: 'grid', label: 'Weekly Grid',  icon: LayoutGrid },
              ].map(v => {
                const Icon = v.icon;
                const isActive = view === v.id;
                return (
                  <button key={v.id} onClick={() => setView(v.id as any)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
                    style={{
                      background: isActive ? 'var(--color-secondary)' : 'transparent',
                      color: isActive ? '#000' : 'var(--color-text-secondary)',
                    }}>
                    <Icon size={14} /> {v.label}
                  </button>
                );
              })}
            </div>
            <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{schedules.length} classes total</span>
          </div>

          {view === 'grid' ? (
            <Card>
              <div className="grid grid-cols-7 gap-2">
                {DAYS.map(day => (
                  <div key={day} className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--color-border)' }}>
                    <div className="p-2 text-center text-xs font-semibold uppercase tracking-wider"
                      style={{ background: 'var(--color-primary)', color: '#fff' }}>
                      {day.slice(0, 3)}
                    </div>
                    <div className="p-1.5 space-y-1.5 min-h-[280px]" style={{ background: 'var(--color-bg)' }}>
                      {schedules.filter(s => s.day === day).map(c => (
                        <button key={c.id} onClick={() => setViewSchedule(c)}
                          className="w-full text-left rounded-lg p-2 transition-colors"
                          style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
                          <p className="text-xs font-bold text-white truncate">{c.name}</p>
                          <p className="text-[10px]" style={{ color: 'var(--color-secondary)' }}>{c.time}</p>
                          <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>{c.instructor}</p>
                          <div className="mt-1 h-1 rounded-full" style={{ background: 'var(--color-border)' }}>
                            <div className="h-full rounded-full" style={{ width: `${(c.enrolled / c.capacity) * 100}%`, background: capacityColor(c.enrolled, c.capacity) }} />
                          </div>
                          <p className="text-[10px] mt-1" style={{ color: capacityColor(c.enrolled, c.capacity) }}>
                            {c.enrolled}/{c.capacity}
                          </p>
                        </button>
                      ))}
                      {schedules.filter(s => s.day === day).length === 0 && (
                        <p className="text-[10px] text-center py-3" style={{ color: 'var(--color-text-muted)' }}>No classes</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ) : (
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--color-border)' }}>
                    {['Class', 'Instructor', 'Day', 'Time', 'Members Enrolled', 'Room', 'Actions'].map(h => (
                      <th key={h} className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginatedSchedules.map(c => (
                    <tr key={c.id} style={{ borderBottom: '1px solid var(--color-border)' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-surface-raised)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: 'var(--color-primary)' }}>
                            <Calendar size={16} className="text-white" />
                          </div>
                          <p className="text-white font-semibold">{c.name}</p>
                        </div>
                      </td>
                      <td className="py-4 px-4 text-sm" style={{ color: 'var(--color-text-secondary)' }}>{c.instructor}</td>
                      <td className="py-4 px-4 text-sm" style={{ color: 'var(--color-text-secondary)' }}>{c.day}</td>
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                          <Clock size={13} style={{ color: 'var(--color-text-muted)' }} /> {c.time}
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-20 h-1.5 rounded-full" style={{ background: 'var(--color-border)' }}>
                            <div className="h-full rounded-full" style={{ width: `${(c.enrolled / c.capacity) * 100}%`, background: capacityColor(c.enrolled, c.capacity) }} />
                          </div>
                          <span className="text-sm font-semibold" style={{ color: capacityColor(c.enrolled, c.capacity) }}>
                            {c.enrolled}/{c.capacity}
                          </span>
                        </div>
                      </td>
                      <td className="py-4 px-4 text-sm" style={{ color: 'var(--color-text-secondary)' }}>{c.room}</td>
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-2">
                          <button onClick={() => openEditModal(c)}
                            className="p-2 rounded-lg transition-colors" title="Edit"
                            style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary)', border: '1px solid rgba(124,58,237,0.20)' }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(124,58,237,0.20)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'var(--color-primary-light)')}>
                            <Edit2 size={15} />
                          </button>
                          <button onClick={() => handleDelete(c)}
                            className="p-2 rounded-lg transition-colors" title="Delete"
                            style={{ background: 'var(--color-secondary-light)', color: 'var(--color-secondary)', border: '1px solid rgba(245,158,11,0.20)' }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(245,158,11,0.20)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'var(--color-secondary-light)')}>
                            <Trash2 size={15} />
                          </button>
                          <button onClick={() => setViewSchedule(c)}
                            className="p-2 rounded-lg transition-colors" title="View Schedule"
                            style={{ background: 'var(--color-secondary-light)', color: 'var(--color-secondary)', border: '1px solid rgba(245,158,11,0.20)' }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(245,158,11,0.20)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'var(--color-secondary-light)')}>
                            <Calendar size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {schedules.length === 0 && (
                    <tr><td colSpan={7} className="py-12 text-center" style={{ color: 'var(--color-text-muted)' }}>No classes scheduled yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <Pagination currentPage={currentPage} totalItems={schedules.length} itemsPerPage={ITEMS_PER_PAGE} onPageChange={setCurrentPage} />
          </Card>
          )}
        </motion.div>
      )}

      {/* Bookings Tab */}
      {activeTab === 'bookings' && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--color-border)' }}>
                    {['Member', 'Class', 'Trainer', 'Schedule', 'Status', 'Actions'].map(h => (
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
                      <td className="py-4 px-4 text-sm text-white">{b.className}</td>
                      <td className="py-4 px-4 text-sm" style={{ color: 'var(--color-text-secondary)' }}>{b.trainerName}</td>
                      <td className="py-4 px-4">
                        <p className="text-sm text-white">{b.day}</p>
                        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{b.time}</p>
                      </td>
                      <td className="py-4 px-4">
                        <Badge variant={b.status}>
                          {b.status}
                        </Badge>
                      </td>
                      <td className="py-4 px-4">
                        {b.status === 'Pending' && (
                          <div className="flex items-center gap-2">
                            <button onClick={() => handleConfirmBooking(b.id)}
                              className="p-2 rounded-lg transition-colors" title="Approve"
                              style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary)', border: '1px solid rgba(124,58,237,0.20)' }}>
                              <CheckCircle size={15} />
                            </button>
                            <button onClick={() => handleRejectBooking(b.id)}
                              className="p-2 rounded-lg transition-colors" title="Reject"
                              style={{ background: 'var(--color-secondary-light)', color: 'var(--color-secondary)', border: '1px solid rgba(245,158,11,0.20)' }}>
                              <XCircle size={15} />
                            </button>
                          </div>
                        )}
                        {b.status === 'Confirmed' && <span className="text-xs font-semibold text-violet">✓ Approved</span>}
                        {b.status === 'Rejected' && <span className="text-xs font-semibold text-yellow">✗ Rejected</span>}
                      </td>
                    </tr>
                  ))}
                  {classBookings.length === 0 && (
                    <tr><td colSpan={6} className="py-12 text-center" style={{ color: 'var(--color-text-muted)' }}>No bookings yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <Pagination currentPage={bookingPage} totalItems={classBookings.length} itemsPerPage={ITEMS_PER_PAGE} onPageChange={setBookingPage} />
          </Card>
        </motion.div>
      )}

      {/* Add/Edit Class Modal */}
      <AnimatePresence>
        {showModal && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/70 z-50" onClick={() => setShowModal(false)} />
            <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
                className="w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden"
                style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
                onClick={e => e.stopPropagation()}>
                <div className="p-5 flex items-center justify-between" style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <h2 className="text-xl font-bold text-white">{editingClass ? 'Edit Class' : 'Add New Class'}</h2>
                  <button onClick={() => setShowModal(false)} style={{ color: 'var(--color-text-muted)' }}
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
                  {formWarning && !formError && (
                    <div className="p-3 rounded-xl text-sm" style={{ background: 'var(--color-secondary-light)', border: '1px solid rgba(245,158,11,0.30)', color: 'var(--color-secondary)' }}>
                      <div className="flex items-start gap-2">
                        <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="font-semibold">Possible duplicate detected</p>
                          <p className="text-xs mt-1">{formWarning}</p>
                          <p className="text-xs mt-1.5 opacity-80">Click save again to proceed anyway.</p>
                        </div>
                      </div>
                    </div>
                  )}
                  {[
                    { label: 'Class Name', key: 'name', placeholder: 'e.g. Morning HIIT' },
                    { label: 'Instructor', key: 'instructor', placeholder: 'e.g. Coach Maria' },
                    { label: 'Time', key: 'time', placeholder: 'e.g. 6:00 AM' },
                    { label: 'Room', key: 'room', placeholder: 'e.g. Studio A' },
                  ].map(f => (
                    <div key={f.key}>
                      <label className="text-sm block mb-1.5" style={{ color: 'var(--color-text-muted)' }}>{f.label}</label>
                      <input value={(form as any)[f.key]} onChange={e => { setForm({ ...form, [f.key]: e.target.value }); setWarningAcknowledged(false); setFormWarning(''); }}
                        placeholder={f.placeholder}
                        className="w-full px-4 py-2.5 rounded-xl text-white text-sm focus:outline-none"
                        style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }} />
                    </div>
                  ))}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm block mb-1.5" style={{ color: 'var(--color-text-muted)' }}>Day</label>
                      <select value={form.day} onChange={e => { setForm({ ...form, day: e.target.value }); setWarningAcknowledged(false); setFormWarning(''); }}
                        className="w-full px-4 py-2.5 rounded-xl text-white text-sm focus:outline-none"
                        style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
                        {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-sm block mb-1.5" style={{ color: 'var(--color-text-muted)' }}>Duration (min)</label>
                      <input type="number" value={form.duration} onChange={e => setForm({ ...form, duration: e.target.value })}
                        className="w-full px-4 py-2.5 rounded-xl text-white text-sm focus:outline-none"
                        style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }} />
                    </div>
                    <div>
                      <label className="text-sm block mb-1.5" style={{ color: 'var(--color-text-muted)' }}>Max Capacity</label>
                      <input type="number" value={form.capacity} onChange={e => setForm({ ...form, capacity: e.target.value })}
                        className="w-full px-4 py-2.5 rounded-xl text-white text-sm focus:outline-none"
                        style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }} />
                    </div>
                  </div>
                  <div className="flex gap-3 pt-2" style={{ borderTop: '1px solid var(--color-border)' }}>
                    <button onClick={() => setShowModal(false)}
                      className="flex-1 py-2.5 rounded-xl font-semibold text-sm transition-colors"
                      style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
                      Cancel
                    </button>
                    <button onClick={handleSaveClass}
                      className="flex-1 py-2.5 rounded-xl font-semibold text-sm text-black transition-colors"
                      style={{ background: 'var(--color-secondary)' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-secondary-hover)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'var(--color-secondary)')}>
                      {warningAcknowledged && formWarning ? 'Save Anyway' : (editingClass ? 'Save Changes' : 'Add Class')}
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>

      {/* View Schedule Modal */}
      <AnimatePresence>
        {viewSchedule && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/70 z-50" onClick={() => setViewSchedule(null)} />
            <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
                className="w-full max-w-md rounded-2xl shadow-2xl overflow-hidden"
                style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
                onClick={e => e.stopPropagation()}>
                <div className="p-5 flex items-center justify-between" style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <h2 className="text-xl font-bold text-white">Class Details</h2>
                  <button onClick={() => setViewSchedule(null)} style={{ color: 'var(--color-text-muted)' }}
                    onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-text-muted)')}>
                    <X size={22} />
                  </button>
                </div>
                <div className="p-5 space-y-4">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: 'var(--color-primary)' }}>
                      <Calendar size={22} className="text-white" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-white">{viewSchedule.name}</h3>
                      <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>{viewSchedule.room}</p>
                    </div>
                  </div>
                  {[
                    { label: 'Instructor', value: viewSchedule.instructor },
                    { label: 'Day', value: viewSchedule.day },
                    { label: 'Time', value: viewSchedule.time },
                    { label: 'Duration', value: `${viewSchedule.duration} minutes` },
                    { label: 'Members Enrolled', value: `${viewSchedule.enrolled} / ${viewSchedule.capacity}` },
                  ].map(row => (
                    <div key={row.label} className="flex justify-between py-2" style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>{row.label}</span>
                      <span className="text-sm font-semibold text-white">{row.value}</span>
                    </div>
                  ))}
                  <button onClick={() => setViewSchedule(null)}
                    className="w-full py-2.5 rounded-xl font-semibold text-black mt-2"
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
