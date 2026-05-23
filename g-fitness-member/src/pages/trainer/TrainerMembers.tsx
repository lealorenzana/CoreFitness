import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, TrendingUp, MessageSquare, X, Send, ChevronRight } from 'lucide-react';

const ASSIGNED_MEMBERS = [
  { id: 'm1', name: 'Aaron Diwa', membership: 'Premium', lastSession: '2026-05-22', progress: 'On Track', goal: 'Muscle Gain', weight: '72kg', bmi: '23.1', workoutsThisWeek: 4 },
  { id: 'm2', name: 'Aj Aguirre', membership: 'Standard', lastSession: '2026-05-21', progress: 'Needs Attention', goal: 'Weight Loss', weight: '85kg', bmi: '27.4', workoutsThisWeek: 2 },
  { id: 'm3', name: 'Ana Par Ituralde', membership: 'Premium', lastSession: '2026-05-23', progress: 'Excellent', goal: 'Toning', weight: '58kg', bmi: '21.5', workoutsThisWeek: 5 },
  { id: 'm4', name: 'Arvin Dela Rosa', membership: 'Basic', lastSession: '2026-05-20', progress: 'On Track', goal: 'General Fitness', weight: '78kg', bmi: '24.8', workoutsThisWeek: 3 },
  { id: 'm5', name: 'Clairey Anne Belen', membership: 'Standard', lastSession: '2026-05-22', progress: 'Excellent', goal: 'Strength', weight: '62kg', bmi: '22.0', workoutsThisWeek: 5 },
];

export default function TrainerMembers() {
  const [selectedMember, setSelectedMember] = useState<typeof ASSIGNED_MEMBERS[0] | null>(null);
  const [showRecommendation, setShowRecommendation] = useState(false);
  const [recommendation, setRecommendation] = useState('');
  const [recommendations, setRecommendations] = useState<Record<string, string[]>>({});

  const handleSendRecommendation = () => {
    if (!recommendation.trim() || !selectedMember) return;
    setRecommendations(prev => ({
      ...prev,
      [selectedMember.id]: [...(prev[selectedMember.id] || []), recommendation],
    }));
    setRecommendation('');
    setShowRecommendation(false);
  };

  return (
    <div className="space-y-4 pb-4">
      {/* Header */}
      <div>
        <h1 className="text-base font-bold text-white">My Members</h1>
        <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>{ASSIGNED_MEMBERS.length} assigned members</p>
      </div>

      {/* Members List */}
      <div className="space-y-2">
        {ASSIGNED_MEMBERS.map((member, i) => (
          <motion.div key={member.id}
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
            onClick={() => setSelectedMember(member)}
            className="flex items-center gap-3 p-3 rounded-xl cursor-pointer active:scale-[0.98] transition-transform"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
            <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0"
              style={{ background: 'var(--color-primary)' }}>
              {member.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-white truncate">{member.name}</p>
              <p className="text-[9px]" style={{ color: 'var(--color-text-muted)' }}>
                {member.membership} • Goal: {member.goal}
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] px-2 py-0.5 rounded-full font-medium"
                style={{
                  background: member.progress === 'Excellent' ? 'rgba(34,197,94,0.15)' :
                             member.progress === 'On Track' ? 'var(--color-primary-light)' : 'rgba(245,158,11,0.15)',
                  color: member.progress === 'Excellent' ? '#22c55e' :
                         member.progress === 'On Track' ? 'var(--color-primary)' : 'var(--color-secondary)',
                }}>
                {member.progress}
              </span>
              <ChevronRight size={12} style={{ color: 'var(--color-text-muted)' }} />
            </div>
          </motion.div>
        ))}
      </div>

      {/* Member Detail Modal */}
      <AnimatePresence>
        {selectedMember && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-end justify-center"
            onClick={() => setSelectedMember(null)}>
            <div className="absolute inset-0 bg-black/60" />
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="relative w-full max-w-[375px] rounded-t-3xl overflow-hidden"
              style={{ background: 'var(--color-surface)', maxHeight: '80vh' }}
              onClick={e => e.stopPropagation()}>

              {/* Handle */}
              <div className="flex justify-center pt-3 pb-2">
                <div className="w-10 h-1 rounded-full" style={{ background: 'var(--color-border)' }} />
              </div>

              {/* Header */}
              <div className="px-5 pb-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-full flex items-center justify-center text-white text-sm font-bold"
                    style={{ background: 'var(--color-primary)' }}>
                    {selectedMember.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white">{selectedMember.name}</p>
                    <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>{selectedMember.membership} • {selectedMember.goal}</p>
                  </div>
                </div>
                <button onClick={() => setSelectedMember(null)} style={{ color: 'var(--color-text-muted)' }}>
                  <X size={18} />
                </button>
              </div>

              {/* Stats */}
              <div className="px-5 pb-3 grid grid-cols-4 gap-2">
                {[
                  { label: 'Weight', value: selectedMember.weight },
                  { label: 'BMI', value: selectedMember.bmi },
                  { label: 'Workouts/wk', value: selectedMember.workoutsThisWeek },
                  { label: 'Last Session', value: new Date(selectedMember.lastSession).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) },
                ].map(s => (
                  <div key={s.label} className="rounded-xl p-2 text-center"
                    style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
                    <p className="text-xs font-bold text-white">{s.value}</p>
                    <p className="text-[8px]" style={{ color: 'var(--color-text-muted)' }}>{s.label}</p>
                  </div>
                ))}
              </div>

              {/* Progress bar */}
              <div className="px-5 pb-3">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[10px] font-semibold" style={{ color: 'var(--color-text-muted)' }}>Weekly Progress</p>
                  <p className="text-[10px] font-bold" style={{ color: 'var(--color-primary)' }}>
                    {selectedMember.workoutsThisWeek}/5 days
                  </p>
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--color-bg)' }}>
                  <div className="h-full rounded-full transition-all" style={{
                    width: `${(selectedMember.workoutsThisWeek / 5) * 100}%`,
                    background: 'var(--color-primary)',
                  }} />
                </div>
              </div>

              {/* Recommendations */}
              <div className="px-5 pb-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-semibold" style={{ color: 'var(--color-text-muted)' }}>Recommendations</p>
                  <button onClick={() => setShowRecommendation(true)}
                    className="text-[9px] font-semibold px-2 py-1 rounded-full flex items-center gap-1"
                    style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary)' }}>
                    <MessageSquare size={9} /> Add
                  </button>
                </div>
                {(recommendations[selectedMember.id] || []).length === 0 ? (
                  <p className="text-[10px] text-center py-3" style={{ color: 'var(--color-text-muted)' }}>No recommendations yet</p>
                ) : (
                  <div className="space-y-1.5 max-h-24 overflow-y-auto scrollbar-hide">
                    {(recommendations[selectedMember.id] || []).map((rec, i) => (
                      <div key={i} className="px-3 py-2 rounded-lg text-[10px] text-white"
                        style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
                        {rec}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Add Recommendation Input */}
              {showRecommendation && (
                <div className="px-5 pb-4">
                  <div className="flex gap-2">
                    <input value={recommendation} onChange={e => setRecommendation(e.target.value)}
                      placeholder="Add workout recommendation..."
                      className="flex-1 px-3 py-2 rounded-xl text-white text-[11px] focus:outline-none"
                      style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}
                      onKeyDown={e => { if (e.key === 'Enter') handleSendRecommendation(); }}
                    />
                    <button onClick={handleSendRecommendation}
                      className="w-9 h-9 rounded-full flex items-center justify-center"
                      style={{ background: 'var(--color-primary)' }}>
                      <Send size={13} className="text-white" />
                    </button>
                  </div>
                </div>
              )}

              <div className="h-6" />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
