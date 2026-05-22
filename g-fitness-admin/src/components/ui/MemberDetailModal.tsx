import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState } from 'react';
import { X, User, Activity, Calendar, CreditCard, MessageSquare, TrendingUp, Mail, Phone, MapPin } from 'lucide-react';
import { SharedStorage } from '../../utils/sharedStorage';
import { MOCK_TRAINER_FEEDBACK, type TrainerFeedback } from '../../data/mockTrainerFeedback';
import Badge from './Badge';

type TabId = 'profile' | 'progress' | 'attendance' | 'payments' | 'notes';

interface MemberDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  member: any | null;
}

export default function MemberDetailModal({ isOpen, onClose, member }: MemberDetailModalProps) {
  const [tab, setTab] = useState<TabId>('profile');
  const [payments, setPayments] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [notes, setNotes] = useState<TrainerFeedback[]>([]);

  useEffect(() => {
    if (!member) return;
    setTab('profile');
    setPayments(SharedStorage.getMemberPayments(member.id) || []);
    const allAttendance = SharedStorage.getAttendance() || [];
    setAttendance(allAttendance.filter((a: any) => a.memberId === member.id || a.memberId === member.qrCode));
    setNotes(MOCK_TRAINER_FEEDBACK.filter(f => f.memberId === member.id));
  }, [member]);

  if (!member) return null;

  const totalVisits = attendance.length;
  const totalSpent = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);

  const tabs: { id: TabId; label: string; icon: any }[] = [
    { id: 'profile',    label: 'Profile',       icon: User },
    { id: 'progress',   label: 'Progress',      icon: TrendingUp },
    { id: 'attendance', label: 'Attendance',    icon: Calendar },
    { id: 'payments',   label: 'Payments',      icon: CreditCard },
    { id: 'notes',      label: 'Trainer Notes', icon: MessageSquare },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50" onClick={onClose} />
          <div className="fixed inset-0 flex items-center justify-center p-4 z-50">
            <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}
              className="w-full max-w-3xl rounded-2xl shadow-2xl flex flex-col overflow-hidden"
              style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', maxHeight: '90vh' }}
              onClick={e => e.stopPropagation()}>

              {/* Header */}
              <div className="p-5 flex items-center justify-between" style={{ borderBottom: '1px solid var(--color-border)' }}>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full flex items-center justify-center text-black font-bold text-lg" style={{ background: 'var(--color-secondary)' }}>
                    {member.firstName?.[0]}{member.lastName?.[0]}
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-white">{member.fullName}</h2>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant={member.membershipType}>{member.membershipType}</Badge>
                      <Badge variant={member.membershipStatus}>{member.membershipStatus}</Badge>
                    </div>
                  </div>
                </div>
                <button onClick={onClose} style={{ color: 'var(--color-text-muted)' }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-text-muted)')}>
                  <X size={22} />
                </button>
              </div>

              {/* Tabs */}
              <div className="flex border-b overflow-x-auto" style={{ borderColor: 'var(--color-border)' }}>
                {tabs.map(t => {
                  const Icon = t.icon;
                  const isActive = tab === t.id;
                  return (
                    <button key={t.id} onClick={() => setTab(t.id)}
                      className="flex items-center gap-2 px-5 py-3 text-sm font-semibold whitespace-nowrap transition-colors border-b-2"
                      style={{
                        borderColor: isActive ? 'var(--color-secondary)' : 'transparent',
                        color: isActive ? 'var(--color-secondary)' : 'var(--color-text-muted)',
                      }}>
                      <Icon size={15} /> {t.label}
                    </button>
                  );
                })}
              </div>

              {/* Body */}
              <div className="p-5 overflow-y-auto">
                {tab === 'profile' && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { icon: Mail,     label: 'Email',     value: member.email },
                        { icon: Phone,    label: 'Phone',     value: member.phone },
                        { icon: MapPin,   label: 'Address',   value: member.address },
                        { icon: Calendar, label: 'Join Date', value: new Date(member.joinDate || member.startDate).toLocaleDateString() },
                        { icon: Calendar, label: 'Expiry',    value: new Date(member.expiryDate).toLocaleDateString() },
                      ].map(row => {
                        const Icon = row.icon;
                        return (
                          <div key={row.label} className="rounded-xl p-3" style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
                            <div className="flex items-center gap-2 mb-1">
                              <Icon size={14} style={{ color: 'var(--color-text-muted)' }} />
                              <span className="text-[11px] uppercase" style={{ color: 'var(--color-text-muted)' }}>{row.label}</span>
                            </div>
                            <p className="text-sm font-medium text-white truncate">{row.value}</p>
                          </div>
                        );
                      })}
                    </div>

                    {(member.birthday || member.heightCm || member.weightKg || member.medicalConditions) && (
                      <div className="rounded-xl p-3" style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
                        <h4 className="text-white font-semibold text-sm mb-2 flex items-center gap-2">
                          <Activity size={14} style={{ color: 'var(--color-secondary)' }} /> Physical Info
                        </h4>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          {member.birthday   && <div><span style={{ color: 'var(--color-text-muted)' }}>Birthday:</span> <span className="text-white">{member.birthday}</span></div>}
                          {member.heightCm   && <div><span style={{ color: 'var(--color-text-muted)' }}>Height:</span> <span className="text-white">{member.heightCm} cm</span></div>}
                          {member.weightKg   && <div><span style={{ color: 'var(--color-text-muted)' }}>Weight:</span> <span className="text-white">{member.weightKg} kg</span></div>}
                          {member.bmi        && <div><span style={{ color: 'var(--color-text-muted)' }}>BMI:</span> <span className="text-white">{member.bmi}</span></div>}
                          {member.isStudent  && <div><span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--color-secondary-light)', color: 'var(--color-secondary)' }}>🎓 Student</span></div>}
                        </div>
                        {member.medicalConditions && (
                          <p className="text-xs mt-2"><span style={{ color: 'var(--color-text-muted)' }}>Medical:</span> <span className="text-white">{member.medicalConditions}</span></p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {tab === 'progress' && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { label: 'Total Visits',  value: totalVisits,        color: 'var(--color-secondary)' },
                        { label: 'Total Spent',   value: `₱${totalSpent.toLocaleString()}`, color: 'var(--color-primary)' },
                        { label: 'Active Days',   value: new Set(attendance.map((a: any) => a.date)).size, color: 'var(--color-primary)' },
                      ].map(s => (
                        <div key={s.label} className="rounded-xl p-3" style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
                          <p className="text-[11px] uppercase" style={{ color: 'var(--color-text-muted)' }}>{s.label}</p>
                          <p className="text-2xl font-bold mt-1" style={{ color: s.color }}>{s.value}</p>
                        </div>
                      ))}
                    </div>
                    <div className="rounded-xl p-4" style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
                      <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                        Detailed body progress, workouts, goals and badges are tracked in the member-app Progress Hub.
                      </p>
                    </div>
                  </div>
                )}

                {tab === 'attendance' && (
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Total visits: <span className="text-white font-bold">{totalVisits}</span></p>
                    </div>
                    {attendance.length === 0 ? (
                      <div className="text-center py-8" style={{ color: 'var(--color-text-muted)' }}>No attendance records yet.</div>
                    ) : (
                      <div className="space-y-2">
                        {attendance.slice(0, 12).map((a: any, i: number) => (
                          <div key={i} className="flex items-center justify-between rounded-xl p-3"
                            style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
                            <div>
                              <p className="text-sm text-white font-semibold">{a.date}</p>
                              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{a.time || a.checkInTime}</p>
                            </div>
                            <Badge variant="Standard">{a.method || 'QR'}</Badge>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {tab === 'payments' && (
                  <div>
                    {payments.length === 0 ? (
                      <div className="text-center py-8" style={{ color: 'var(--color-text-muted)' }}>No payment records.</div>
                    ) : (
                      <div className="space-y-2">
                        {payments.map((p: any, i: number) => (
                          <div key={i} className="flex items-center justify-between rounded-xl p-3"
                            style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
                            <div>
                              <p className="text-sm text-white font-semibold">{p.plan || 'Membership'}</p>
                              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{new Date(p.date).toLocaleDateString()} • {p.method}</p>
                            </div>
                            <p className="text-base font-bold" style={{ color: 'var(--color-secondary)' }}>₱{Number(p.amount).toLocaleString()}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {tab === 'notes' && (
                  <div>
                    {notes.length === 0 ? (
                      <div className="text-center py-8" style={{ color: 'var(--color-text-muted)' }}>No trainer notes yet.</div>
                    ) : (
                      <div className="space-y-2">
                        {notes.map(n => (
                          <div key={n.id} className="rounded-xl p-3"
                            style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
                            <div className="flex items-center justify-between mb-1">
                              <p className="text-xs font-semibold uppercase" style={{ color: 'var(--color-secondary)' }}>{n.type}</p>
                              <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>{new Date(n.date).toLocaleDateString()}</span>
                            </div>
                            <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>{n.content}</p>
                            <p className="text-[11px] mt-1" style={{ color: 'var(--color-text-muted)' }}>— {n.trainerName}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="p-4 flex items-center justify-end gap-2" style={{ borderTop: '1px solid var(--color-border)' }}>
                <button onClick={onClose}
                  className="px-4 py-2 rounded-xl font-semibold text-sm"
                  style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
