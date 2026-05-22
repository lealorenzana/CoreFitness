import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import { useGymContext } from '../hooks/useGymContext';
import { TRAINERS } from '../data/trainers';
import { MEMBERS } from '../data/members';
import { MOCK_TRAINER_FEEDBACK } from '../data/mockTrainerFeedback';
import { UserPlus, Star, Users, X, Calendar, MessageSquare, ChevronDown, ChevronUp } from 'lucide-react';
import { showToast } from '../utils/toast';

export default function Trainers() {
  const { selectedGym } = useGymContext();
  const gymTrainers = TRAINERS.filter(t => t.gymId === selectedGym.id);
  const gymMembers = MEMBERS.filter(m => m.gymId === selectedGym.id && m.membershipStatus === 'Active');

  const [selectedTrainer, setSelectedTrainer] = useState<any | null>(null);
  const [detailTab, setDetailTab] = useState<'profile' | 'members' | 'schedule' | 'feedback'>('profile');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({ name: '', specialty: '', email: '', phone: '' });

  // Simulate assigned members per trainer (round-robin for demo)
  const getAssignedMembers = (trainerId: string) => {
    const idx = gymTrainers.findIndex(t => t.id === trainerId);
    return gymMembers.filter((_, i) => i % gymTrainers.length === idx).slice(0, 5);
  };

  const getTrainerFeedback = (trainerId: string) =>
    MOCK_TRAINER_FEEDBACK.filter(f => f.trainerId === trainerId);

  const openDetail = (trainer: any) => {
    setSelectedTrainer(trainer);
    setDetailTab('profile');
  };

  const handleAddTrainer = () => {
    if (!addForm.name.trim() || !addForm.specialty.trim()) {
      showToast('Name and specialization are required', 'error');
      return;
    }
    showToast(`${addForm.name} (${addForm.specialty}) added successfully!`, 'success');
    setAddForm({ name: '', specialty: '', email: '', phone: '' });
    setShowAddModal(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Trainers</h1>
          <p className="mt-1" style={{ color: 'var(--color-text-muted)' }}>Manage gym trainers and their assigned members</p>
        </div>
        <button onClick={() => setShowAddModal(true)}
          className="px-5 py-2.5 rounded-full font-semibold flex items-center gap-2 text-black transition-colors"
          style={{ background: 'var(--color-secondary)' }}>
          <UserPlus size={16} /> Add Trainer
        </button>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Trainers', value: gymTrainers.length, color: 'var(--color-primary)' },
          { label: 'Avg Rating', value: (gymTrainers.reduce((s, t) => s + t.rating, 0) / gymTrainers.length).toFixed(1), color: 'var(--color-secondary)' },
          { label: 'Total Sessions', value: gymTrainers.reduce((s, t) => s + t.sessionsCompleted, 0), color: 'var(--color-primary)' },
        ].map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.1 }}>
            <div className="rounded-xl p-5" style={{ background: 'var(--color-surface-raised)', border: `1px solid ${s.color}30` }}>
              <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>{s.label}</p>
              <p className="text-4xl font-bold mt-2" style={{ color: s.color }}>{s.value}</p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Trainer Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {gymTrainers.map((trainer, index) => {
          const assigned = getAssignedMembers(trainer.id);
          return (
            <motion.div key={trainer.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 + index * 0.1 }}>
              <Card className="group">
                <div className="text-center">
                  {/* Avatar */}
                  <div className="relative inline-block mb-4">
                    <div className="w-24 h-24 rounded-full flex items-center justify-center text-black text-3xl font-bold mx-auto" style={{ background: 'var(--color-secondary)' }}>
                      {trainer.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                    </div>
                  </div>
                  <h3 className="text-xl font-bold text-white">{trainer.name}</h3>
                  <Badge variant="Premium" className="mt-2 inline-block">{trainer.specialization}</Badge>

                  {/* Stats */}
                  <div className="mt-4 space-y-2">
                    <div className="flex items-center justify-between p-3 rounded-xl" style={{ background: 'var(--color-bg)' }}>
                      <span className="text-sm flex items-center gap-2" style={{ color: 'var(--color-text-muted)' }}>
                        <Star size={14} style={{ color: 'var(--color-secondary)' }} /> Avg. Rating
                      </span>
                      <span className="text-white font-bold">{trainer.rating}</span>
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-xl" style={{ background: 'var(--color-bg)' }}>
                      <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Total Sessions</span>
                      <span className="text-white font-bold">{trainer.sessionsCompleted}</span>
                    </div>
                    <button onClick={() => setExpanded(expanded === trainer.id ? null : trainer.id)}
                      className="w-full flex items-center justify-between p-3 rounded-xl transition-colors"
                      style={{ background: 'var(--color-bg)' }}>
                      <span className="text-sm flex items-center gap-2" style={{ color: 'var(--color-text-muted)' }}>
                        <Users size={14} style={{ color: 'var(--color-primary)' }} /> Assigned Members
                      </span>
                      <span className="font-bold flex items-center gap-1" style={{ color: 'var(--color-primary)' }}>
                        {assigned.length}
                        {expanded === trainer.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </span>
                    </button>
                  </div>

                  {/* Expandable assigned members */}
                  {expanded === trainer.id && assigned.length > 0 && (
                    <div className="mt-3 text-left space-y-1">
                      {assigned.map(m => (
                        <div key={m.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg" style={{ background: 'var(--color-bg)' }}>
                          <div className="w-6 h-6 rounded-full flex items-center justify-center text-black text-xs font-bold" style={{ background: 'var(--color-secondary)' }}>
                            {m.firstName[0]}
                          </div>
                          <span className="text-sm text-white">{m.fullName}</span>
                          <span className="ml-auto text-xs" style={{ color: 'var(--color-text-muted)' }}>{m.membershipType}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="mt-4 flex gap-2">
                    <button onClick={() => openDetail(trainer)}
                      className="flex-1 py-2 px-4 rounded-lg font-medium text-sm text-black transition-colors"
                      style={{ background: 'var(--color-secondary)' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-secondary-hover)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'var(--color-secondary)')}>
                      View Profile
                    </button>
                    <button
                      onClick={() => {
                        const days = trainer.availability?.map((a: any) => a.day).join(', ') || 'N/A';
                        showToast(`${trainer.name} available: ${days}`, 'info');
                      }}
                      className="p-2 rounded-lg transition-colors" title="View availability"
                      style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', color: 'var(--color-text-muted)' }}
                      onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--color-primary)')}
                      onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--color-border)')}>
                      <Calendar size={18} />
                    </button>
                  </div>
                </div>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* Trainer Detail Modal */}
      <AnimatePresence>
        {selectedTrainer && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/70 z-50" onClick={() => setSelectedTrainer(null)} />
            <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
                className="w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col overflow-hidden"
                style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', maxHeight: '88vh' }}
                onClick={e => e.stopPropagation()}>

                {/* Header */}
                <div className="p-5 flex items-center justify-between" style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full flex items-center justify-center text-black font-bold text-lg" style={{ background: 'var(--color-secondary)' }}>
                      {selectedTrainer.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-white">{selectedTrainer.name}</h2>
                      <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>{selectedTrainer.specialization}</p>
                    </div>
                  </div>
                  <button onClick={() => setSelectedTrainer(null)} style={{ color: 'var(--color-text-muted)' }}
                    onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-text-muted)')}>
                    <X size={22} />
                  </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b" style={{ borderColor: 'var(--color-border)' }}>
                  {[
                    { id: 'profile',  label: 'Profile',          icon: Star },
                    { id: 'members',  label: 'Assigned Members', icon: Users },
                    { id: 'schedule', label: 'Schedule',         icon: Calendar },
                    { id: 'feedback', label: 'Feedback Given',   icon: MessageSquare },
                  ].map(t => {
                    const Icon = t.icon;
                    const isActive = detailTab === t.id;
                    return (
                      <button key={t.id} onClick={() => setDetailTab(t.id as any)}
                        className="flex items-center gap-2 px-4 py-3 text-sm font-semibold whitespace-nowrap transition-colors border-b-2"
                        style={{
                          borderColor: isActive ? 'var(--color-secondary)' : 'transparent',
                          color: isActive ? 'var(--color-secondary)' : 'var(--color-text-muted)',
                        }}>
                        <Icon size={14} /> {t.label}
                      </button>
                    );
                  })}
                </div>

                {/* Body */}
                <div className="p-5 overflow-y-auto">
                  {detailTab === 'profile' && (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        {[
                          { label: 'Avg. Rating',         value: `${selectedTrainer.rating} / 5.0` },
                          { label: 'Sessions Completed',  value: selectedTrainer.sessionsCompleted },
                          { label: 'Assigned Members',    value: getAssignedMembers(selectedTrainer.id).length },
                          { label: 'Specialization',      value: selectedTrainer.specialization },
                        ].map(row => (
                          <div key={row.label} className="rounded-xl p-3" style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
                            <p className="text-[11px] uppercase" style={{ color: 'var(--color-text-muted)' }}>{row.label}</p>
                            <p className="text-lg font-bold text-white mt-0.5">{row.value}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {detailTab === 'members' && (
                    <div className="space-y-2">
                      {getAssignedMembers(selectedTrainer.id).map(m => (
                        <div key={m.id} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
                          <div className="w-9 h-9 rounded-full flex items-center justify-center text-black text-sm font-bold" style={{ background: 'var(--color-secondary)' }}>
                            {m.firstName[0]}{m.lastName[0]}
                          </div>
                          <div className="flex-1">
                            <p className="text-sm text-white font-medium">{m.fullName}</p>
                            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{m.email}</p>
                          </div>
                          <Badge variant={m.membershipType}>{m.membershipType}</Badge>
                        </div>
                      ))}
                    </div>
                  )}

                  {detailTab === 'schedule' && (
                    <div className="space-y-2">
                      {selectedTrainer.availability?.map((a: any) => (
                        <div key={a.day} className="rounded-xl p-3" style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
                          <p className="text-sm font-semibold text-white mb-1.5">{a.day}</p>
                          <div className="flex flex-wrap gap-1.5">
                            {a.slots.map((s: string) => (
                              <span key={s} className="text-xs px-2 py-1 rounded-full"
                                style={{ background: 'var(--color-secondary-light)', border: '1px solid rgba(245,158,11,0.25)', color: 'var(--color-secondary)' }}>
                                {s}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {detailTab === 'feedback' && (
                    <div className="space-y-2">
                      {getTrainerFeedback(selectedTrainer.id).length === 0 ? (
                        <p className="text-center py-8 text-sm" style={{ color: 'var(--color-text-muted)' }}>No feedback given yet.</p>
                      ) : (
                        getTrainerFeedback(selectedTrainer.id).map(f => (
                          <div key={f.id} className="rounded-xl p-3" style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
                            <div className="flex items-center justify-between mb-1">
                              <p className="text-xs font-semibold uppercase" style={{ color: 'var(--color-secondary)' }}>{f.type}</p>
                              <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>{new Date(f.date).toLocaleDateString()}</span>
                            </div>
                            <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>{f.content}</p>
                            <p className="text-[11px] mt-1" style={{ color: 'var(--color-text-muted)' }}>For: {f.memberName}</p>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="p-4 flex items-center justify-end" style={{ borderTop: '1px solid var(--color-border)' }}>
                  <button onClick={() => setSelectedTrainer(null)}
                    className="px-4 py-2 rounded-xl font-semibold text-sm text-black"
                    style={{ background: 'var(--color-secondary)' }}>
                    Close
                  </button>
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>

      {/* Add Trainer Modal */}
      <AnimatePresence>
        {showAddModal && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50" onClick={() => setShowAddModal(false)} />
            <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 12 }}
                className="w-full max-w-md rounded-2xl shadow-2xl overflow-hidden"
                style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}
                onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="p-5 flex items-center justify-between" style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <div>
                    <h2 className="text-lg font-bold text-white">Add New Trainer</h2>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>Fill in the trainer details</p>
                  </div>
                  <button onClick={() => setShowAddModal(false)}
                    className="p-1.5 rounded-lg transition-colors"
                    style={{ color: 'var(--color-text-muted)' }}>
                    <X size={18} />
                  </button>
                </div>

                {/* Form */}
                <div className="p-5 space-y-4">
                  <div>
                    <label className="text-xs block mb-1.5 font-medium" style={{ color: 'var(--color-text-muted)' }}>Full Name *</label>
                    <input value={addForm.name} onChange={e => setAddForm({ ...addForm, name: e.target.value })}
                      placeholder="e.g. Coach Maria"
                      className="w-full px-4 py-2.5 rounded-xl text-white text-sm focus:outline-none"
                      style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }} />
                  </div>
                  <div>
                    <label className="text-xs block mb-1.5 font-medium" style={{ color: 'var(--color-text-muted)' }}>Specialization *</label>
                    <input value={addForm.specialty} onChange={e => setAddForm({ ...addForm, specialty: e.target.value })}
                      placeholder="e.g. Yoga, Boxing, HIIT"
                      className="w-full px-4 py-2.5 rounded-xl text-white text-sm focus:outline-none"
                      style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs block mb-1.5 font-medium" style={{ color: 'var(--color-text-muted)' }}>Email</label>
                      <input value={addForm.email} onChange={e => setAddForm({ ...addForm, email: e.target.value })}
                        placeholder="trainer@email.com"
                        className="w-full px-4 py-2.5 rounded-xl text-white text-sm focus:outline-none"
                        style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }} />
                    </div>
                    <div>
                      <label className="text-xs block mb-1.5 font-medium" style={{ color: 'var(--color-text-muted)' }}>Phone</label>
                      <input value={addForm.phone} onChange={e => setAddForm({ ...addForm, phone: e.target.value })}
                        placeholder="+63 917 000 0000"
                        className="w-full px-4 py-2.5 rounded-xl text-white text-sm focus:outline-none"
                        style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }} />
                    </div>
                  </div>
                </div>

                {/* Footer */}
                <div className="p-5 flex items-center gap-3" style={{ borderTop: '1px solid var(--color-border)' }}>
                  <button onClick={() => setShowAddModal(false)}
                    className="flex-1 py-2.5 rounded-full font-semibold text-sm transition-colors"
                    style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
                    Cancel
                  </button>
                  <button onClick={handleAddTrainer}
                    className="flex-1 py-2.5 rounded-full font-semibold text-sm text-black transition-colors"
                    style={{ background: 'var(--color-secondary)' }}>
                    Add Trainer
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
