import { motion } from 'framer-motion';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Card from '../components/ui/Card';
import { TrendingDown, TrendingUp, Calendar, Target, Activity, ArrowLeft } from 'lucide-react';

interface ProgressEntry {
  date: string;
  weight: number;
  bodyFat?: number;
  chest?: number;
  waist?: number;
  hips?: number;
  arms?: number;
  thighs?: number;
  notes?: string;
}

interface MemberProgress {
  memberId: string;
  memberName: string;
  memberEmail: string;
  startDate: string;
  goal: string;
  startWeight: number;
  currentWeight: number;
  targetWeight: number;
  entries: ProgressEntry[];
}

const MOCK_PROGRESS: MemberProgress[] = [
  {
    memberId: 'mem-001',
    memberName: 'Eya Lorenzana',
    memberEmail: 'eya.lorenzana@email.com',
    startDate: '2026-01-15',
    goal: 'Weight Loss',
    startWeight: 75,
    currentWeight: 68,
    targetWeight: 65,
    entries: [
      { date: '2026-01-15', weight: 75, bodyFat: 28, chest: 95, waist: 85, hips: 100, arms: 32, thighs: 58 },
      { date: '2026-02-15', weight: 72, bodyFat: 26, chest: 93, waist: 82, hips: 98, arms: 31, thighs: 56, notes: 'Great progress!' },
      { date: '2026-03-15', weight: 70, bodyFat: 24, chest: 91, waist: 80, hips: 96, arms: 30, thighs: 55 },
      { date: '2026-04-15', weight: 68, bodyFat: 23, chest: 90, waist: 78, hips: 95, arms: 30, thighs: 54, notes: 'On track!' },
    ],
  },
  {
    memberId: 'mem-002',
    memberName: 'Aaron Diwa',
    memberEmail: 'aaron.diwa@email.com',
    startDate: '2026-02-01',
    goal: 'Muscle Gain',
    startWeight: 65,
    currentWeight: 70,
    targetWeight: 75,
    entries: [
      { date: '2026-02-01', weight: 65, bodyFat: 15, chest: 95, waist: 75, arms: 32, thighs: 52 },
      { date: '2026-03-01', weight: 67, bodyFat: 14, chest: 97, waist: 76, arms: 33, thighs: 54 },
      { date: '2026-04-01', weight: 69, bodyFat: 14, chest: 99, waist: 77, arms: 34, thighs: 55 },
      { date: '2026-05-01', weight: 70, bodyFat: 13, chest: 100, waist: 77, arms: 35, thighs: 56, notes: 'Strength gains!' },
    ],
  },
];

export default function MemberProgress() {
  const navigate = useNavigate();
  const [progressData] = useState<MemberProgress[]>(() => {
    try {
      const s = localStorage.getItem('admin_member_progress');
      if (s) return JSON.parse(s);
    } catch {}
    localStorage.setItem('admin_member_progress', JSON.stringify(MOCK_PROGRESS));
    return MOCK_PROGRESS;
  });

  const [selectedMember, setSelectedMember] = useState<MemberProgress | null>(null);

  const getProgressPercentage = (member: MemberProgress) => {
    const total = Math.abs(member.targetWeight - member.startWeight);
    const current = Math.abs(member.currentWeight - member.startWeight);
    return Math.round((current / total) * 100);
  };

  const getWeightChange = (member: MemberProgress) => {
    const change = member.currentWeight - member.startWeight;
    return {
      value: Math.abs(change),
      isLoss: change < 0,
      isGain: change > 0,
    };
  };

  if (selectedMember) {
    const weightChange = getWeightChange(selectedMember);
    const latestEntry = selectedMember.entries[selectedMember.entries.length - 1];
    const firstEntry = selectedMember.entries[0];

    return (
      <div className="space-y-5">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
          <button onClick={() => setSelectedMember(null)}
            className="flex items-center gap-2 mb-3 text-sm font-semibold"
            style={{ color: 'var(--color-secondary)' }}>
            <ArrowLeft size={16} /> Back to All Members
          </button>
          <h1 className="text-2xl font-bold text-white">{selectedMember.memberName}'s Progress</h1>
          <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
            {selectedMember.memberEmail} • Goal: {selectedMember.goal}
          </p>
        </motion.div>

        {/* Stats Overview */}
        <div className="grid grid-cols-4 gap-3">
          <Card className="!p-4">
            <div className="flex items-center gap-2 mb-1">
              <Target size={14} style={{ color: 'var(--color-primary)' }} />
              <p className="text-[10px] uppercase" style={{ color: 'var(--color-text-muted)' }}>Start Weight</p>
            </div>
            <p className="text-xl font-bold text-white">{selectedMember.startWeight} kg</p>
          </Card>
          <Card className="!p-4">
            <div className="flex items-center gap-2 mb-1">
              <Activity size={14} style={{ color: 'var(--color-secondary)' }} />
              <p className="text-[10px] uppercase" style={{ color: 'var(--color-text-muted)' }}>Current Weight</p>
            </div>
            <p className="text-xl font-bold text-white">{selectedMember.currentWeight} kg</p>
          </Card>
          <Card className="!p-4">
            <div className="flex items-center gap-2 mb-1">
              <Target size={14} style={{ color: 'var(--color-primary)' }} />
              <p className="text-[10px] uppercase" style={{ color: 'var(--color-text-muted)' }}>Target Weight</p>
            </div>
            <p className="text-xl font-bold text-white">{selectedMember.targetWeight} kg</p>
          </Card>
          <Card className="!p-4">
            <div className="flex items-center gap-2 mb-1">
              {weightChange.isLoss ? <TrendingDown size={14} style={{ color: '#10b981' }} /> : <TrendingUp size={14} style={{ color: 'var(--color-secondary)' }} />}
              <p className="text-[10px] uppercase" style={{ color: 'var(--color-text-muted)' }}>Change</p>
            </div>
            <p className="text-xl font-bold" style={{ color: weightChange.isLoss ? '#10b981' : 'var(--color-secondary)' }}>
              {weightChange.isLoss ? '-' : '+'}{weightChange.value} kg
            </p>
          </Card>
        </div>

        {/* Progress Timeline */}
        <Card title="Progress Timeline">
          <div className="space-y-3">
            {selectedMember.entries.map((entry, idx) => (
              <div key={entry.date} className="rounded-xl p-4"
                style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Calendar size={14} style={{ color: 'var(--color-secondary)' }} />
                      <p className="text-sm font-bold text-white">
                        {new Date(entry.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                      </p>
                    </div>
                    <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                      Entry #{idx + 1}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-white">{entry.weight} kg</p>
                    {entry.bodyFat && (
                      <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{entry.bodyFat}% body fat</p>
                    )}
                  </div>
                </div>

                {/* Measurements */}
                <div className="grid grid-cols-3 gap-2">
                  {entry.chest && (
                    <div className="rounded-lg p-2" style={{ background: 'var(--color-bg)' }}>
                      <p className="text-[9px] uppercase" style={{ color: 'var(--color-text-muted)' }}>Chest</p>
                      <p className="text-xs font-bold text-white">{entry.chest} cm</p>
                    </div>
                  )}
                  {entry.waist && (
                    <div className="rounded-lg p-2" style={{ background: 'var(--color-bg)' }}>
                      <p className="text-[9px] uppercase" style={{ color: 'var(--color-text-muted)' }}>Waist</p>
                      <p className="text-xs font-bold text-white">{entry.waist} cm</p>
                    </div>
                  )}
                  {entry.hips && (
                    <div className="rounded-lg p-2" style={{ background: 'var(--color-bg)' }}>
                      <p className="text-[9px] uppercase" style={{ color: 'var(--color-text-muted)' }}>Hips</p>
                      <p className="text-xs font-bold text-white">{entry.hips} cm</p>
                    </div>
                  )}
                  {entry.arms && (
                    <div className="rounded-lg p-2" style={{ background: 'var(--color-bg)' }}>
                      <p className="text-[9px] uppercase" style={{ color: 'var(--color-text-muted)' }}>Arms</p>
                      <p className="text-xs font-bold text-white">{entry.arms} cm</p>
                    </div>
                  )}
                  {entry.thighs && (
                    <div className="rounded-lg p-2" style={{ background: 'var(--color-bg)' }}>
                      <p className="text-[9px] uppercase" style={{ color: 'var(--color-text-muted)' }}>Thighs</p>
                      <p className="text-xs font-bold text-white">{entry.thighs} cm</p>
                    </div>
                  )}
                </div>

                {entry.notes && (
                  <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--color-border)' }}>
                    <p className="text-xs italic" style={{ color: 'var(--color-text-secondary)' }}>
                      💬 {entry.notes}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>

        {/* Measurements Comparison */}
        {latestEntry.chest && firstEntry.chest && (
          <Card title="Measurements Change">
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Chest', first: firstEntry.chest, latest: latestEntry.chest },
                { label: 'Waist', first: firstEntry.waist, latest: latestEntry.waist },
                { label: 'Hips', first: firstEntry.hips, latest: latestEntry.hips },
                { label: 'Arms', first: firstEntry.arms, latest: latestEntry.arms },
                { label: 'Thighs', first: firstEntry.thighs, latest: latestEntry.thighs },
              ].filter(m => m.first && m.latest).map(m => {
                const change = m.latest! - m.first!;
                const isDecrease = change < 0;
                return (
                  <div key={m.label} className="rounded-xl p-3"
                    style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
                    <p className="text-xs font-semibold text-white mb-1">{m.label}</p>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                          {m.first} → {m.latest} cm
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        {isDecrease ? <TrendingDown size={12} style={{ color: '#10b981' }} /> : <TrendingUp size={12} style={{ color: 'var(--color-secondary)' }} />}
                        <span className="text-xs font-bold" style={{ color: isDecrease ? '#10b981' : 'var(--color-secondary)' }}>
                          {isDecrease ? '' : '+'}{change} cm
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-bold text-white">Member Progress</h1>
        <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
          Track member fitness progress and measurements
        </p>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="!p-4">
          <div className="flex items-center gap-3">
            <Activity size={20} style={{ color: 'var(--color-primary)' }} />
            <div>
              <p className="text-2xl font-bold text-white">{progressData.length}</p>
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Tracking Members</p>
            </div>
          </div>
        </Card>
        <Card className="!p-4">
          <div className="flex items-center gap-3">
            <TrendingDown size={20} style={{ color: '#10b981' }} />
            <div>
              <p className="text-2xl font-bold text-white">
                {progressData.filter(m => m.currentWeight < m.startWeight).length}
              </p>
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Weight Loss</p>
            </div>
          </div>
        </Card>
        <Card className="!p-4">
          <div className="flex items-center gap-3">
            <TrendingUp size={20} style={{ color: 'var(--color-secondary)' }} />
            <div>
              <p className="text-2xl font-bold text-white">
                {progressData.filter(m => m.currentWeight > m.startWeight).length}
              </p>
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Muscle Gain</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Members List */}
      <div className="grid grid-cols-2 gap-4">
        {progressData.map((member, i) => {
          const weightChange = getWeightChange(member);
          const progress = getProgressPercentage(member);
          return (
            <motion.div key={member.memberId} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
              onClick={() => setSelectedMember(member)}
              className="cursor-pointer">
              <Card className="!p-4 hover:border-secondary transition-colors">
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-12 h-12 rounded-full flex items-center justify-center text-black font-bold text-sm flex-shrink-0"
                    style={{ background: 'var(--color-secondary)' }}>
                    {member.memberName.split(' ').map(n => n[0]).join('').slice(0, 2)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-bold text-white truncate">{member.memberName}</h3>
                    <p className="text-[10px] truncate" style={{ color: 'var(--color-text-muted)' }}>{member.memberEmail}</p>
                    <span className="inline-block mt-1 text-[9px] px-2 py-0.5 rounded-full font-semibold"
                      style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary)' }}>
                      {member.goal}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 mb-3">
                  <div>
                    <p className="text-[9px] uppercase" style={{ color: 'var(--color-text-muted)' }}>Start</p>
                    <p className="text-sm font-bold text-white">{member.startWeight} kg</p>
                  </div>
                  <div>
                    <p className="text-[9px] uppercase" style={{ color: 'var(--color-text-muted)' }}>Current</p>
                    <p className="text-sm font-bold text-white">{member.currentWeight} kg</p>
                  </div>
                  <div>
                    <p className="text-[9px] uppercase" style={{ color: 'var(--color-text-muted)' }}>Target</p>
                    <p className="text-sm font-bold text-white">{member.targetWeight} kg</p>
                  </div>
                </div>

                <div className="mb-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[9px] uppercase" style={{ color: 'var(--color-text-muted)' }}>Progress</span>
                    <span className="text-[9px] font-bold" style={{ color: 'var(--color-secondary)' }}>{progress}%</span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--color-bg)' }}>
                    <div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, background: 'var(--color-secondary)' }} />
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2" style={{ borderTop: '1px solid var(--color-border)' }}>
                  {weightChange.isLoss ? <TrendingDown size={12} style={{ color: '#10b981' }} /> : <TrendingUp size={12} style={{ color: 'var(--color-secondary)' }} />}
                  <span className="text-xs font-bold" style={{ color: weightChange.isLoss ? '#10b981' : 'var(--color-secondary)' }}>
                    {weightChange.isLoss ? '-' : '+'}{weightChange.value} kg
                  </span>
                  <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                    • {member.entries.length} entries
                  </span>
                </div>
              </Card>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
