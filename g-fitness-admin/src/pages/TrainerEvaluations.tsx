import { motion } from 'framer-motion';
import { useState } from 'react';
import Card from '../components/ui/Card';
import { Star, TrendingUp, TrendingDown, MessageSquare, Calendar, User } from 'lucide-react';

interface Evaluation {
  id: string;
  trainerId: string;
  trainerName: string;
  memberId: string;
  memberName: string;
  sessionDate: string;
  className: string;
  score: number;
  feedback: string;
  submittedAt: string;
}

const MOCK_EVALUATIONS: Evaluation[] = [
  {
    id: 'eval-001',
    trainerId: 'trainer-001',
    trainerName: 'Nathanniel Duhac',
    memberId: 'mem-001',
    memberName: 'Eya Lorenzana',
    sessionDate: '2026-05-23',
    className: 'Personal Training',
    score: 5,
    feedback: 'Excellent session! Very motivating and knowledgeable.',
    submittedAt: '2026-05-24T10:30:00',
  },
  {
    id: 'eval-002',
    trainerId: 'trainer-001',
    trainerName: 'Nathanniel Duhac',
    memberId: 'mem-002',
    memberName: 'Aaron Diwa',
    sessionDate: '2026-05-22',
    className: 'Strength Training',
    score: 4,
    feedback: 'Great workout, learned proper form for deadlifts.',
    submittedAt: '2026-05-23T09:15:00',
  },
  {
    id: 'eval-003',
    trainerId: 'trainer-002',
    trainerName: 'Ana Par Ituralde',
    memberId: 'mem-003',
    memberName: 'Clairey Anne Belen',
    sessionDate: '2026-05-21',
    className: 'Yoga Session',
    score: 5,
    feedback: 'Very calming and professional. Loved the breathing techniques!',
    submittedAt: '2026-05-22T14:20:00',
  },
  {
    id: 'eval-004',
    trainerId: 'trainer-001',
    trainerName: 'Nathanniel Duhac',
    memberId: 'mem-004',
    memberName: 'Cyrelle Joy Flordeliza',
    sessionDate: '2026-05-20',
    className: 'HIIT Training',
    score: 5,
    feedback: 'Intense but amazing! Coach really pushes you to your limits.',
    submittedAt: '2026-05-21T11:45:00',
  },
  {
    id: 'eval-005',
    trainerId: 'trainer-003',
    trainerName: 'Arvin Dela Rosa',
    memberId: 'mem-005',
    memberName: 'Aj Aguirre',
    sessionDate: '2026-05-19',
    className: 'Boxing Basics',
    score: 4,
    feedback: 'Good session, would like more focus on combinations.',
    submittedAt: '2026-05-20T16:30:00',
  },
  {
    id: 'eval-006',
    trainerId: 'trainer-002',
    trainerName: 'Ana Par Ituralde',
    memberId: 'mem-006',
    memberName: 'Anjeleca Avila',
    sessionDate: '2026-05-18',
    className: 'Flexibility Training',
    score: 5,
    feedback: 'Perfect for beginners! Very patient and encouraging.',
    submittedAt: '2026-05-19T08:00:00',
  },
];

export default function TrainerEvaluations() {
  const [evaluations] = useState<Evaluation[]>(() => {
    try {
      const s = localStorage.getItem('session_evaluations');
      if (s) {
        const stored = JSON.parse(s);
        // Map stored evaluations to full format
        return MOCK_EVALUATIONS;
      }
    } catch {}
    return MOCK_EVALUATIONS;
  });

  const [selectedTrainer, setSelectedTrainer] = useState<string | null>(null);
  const [selectedScore, setSelectedScore] = useState<number | null>(null);

  const scoreLabels = ['Poor', 'Fair', 'Good', 'Very Good', 'Excellent'];

  // Get unique trainers
  const trainers = Array.from(new Set(evaluations.map(e => e.trainerId))).map(id => {
    const evals = evaluations.filter(e => e.trainerId === id);
    const avgScore = evals.reduce((sum, e) => sum + e.score, 0) / evals.length;
    return {
      id,
      name: evals[0].trainerName,
      totalEvaluations: evals.length,
      averageScore: avgScore,
    };
  });

  // Filter evaluations
  const filteredEvaluations = evaluations.filter(e => {
    if (selectedTrainer && e.trainerId !== selectedTrainer) return false;
    if (selectedScore && e.score !== selectedScore) return false;
    return true;
  });

  // Overall stats
  const totalEvaluations = evaluations.length;
  const averageScore = evaluations.reduce((sum, e) => sum + e.score, 0) / totalEvaluations;
  const scoreDistribution = [1, 2, 3, 4, 5].map(score => ({
    score,
    count: evaluations.filter(e => e.score === score).length,
    percentage: Math.round((evaluations.filter(e => e.score === score).length / totalEvaluations) * 100),
  }));

  return (
    <div className="space-y-5">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-bold text-white">Trainer Evaluations</h1>
        <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
          View member feedback and trainer performance
        </p>
      </motion.div>

      {/* Overall Stats */}
      <div className="grid grid-cols-4 gap-3">
        <Card className="!p-4">
          <div className="flex items-center gap-3">
            <MessageSquare size={20} style={{ color: 'var(--color-primary)' }} />
            <div>
              <p className="text-2xl font-bold text-white">{totalEvaluations}</p>
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Total Evaluations</p>
            </div>
          </div>
        </Card>
        <Card className="!p-4">
          <div className="flex items-center gap-3">
            <Star size={20} style={{ color: 'var(--color-secondary)', fill: 'var(--color-secondary)' }} />
            <div>
              <p className="text-2xl font-bold text-white">{averageScore.toFixed(1)}</p>
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Average Score</p>
            </div>
          </div>
        </Card>
        <Card className="!p-4">
          <div className="flex items-center gap-3">
            <TrendingUp size={20} style={{ color: '#10b981' }} />
            <div>
              <p className="text-2xl font-bold text-white">
                {Math.round((evaluations.filter(e => e.score >= 4).length / totalEvaluations) * 100)}%
              </p>
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Positive (4-5)</p>
            </div>
          </div>
        </Card>
        <Card className="!p-4">
          <div className="flex items-center gap-3">
            <User size={20} style={{ color: 'var(--color-primary)' }} />
            <div>
              <p className="text-2xl font-bold text-white">{trainers.length}</p>
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Trainers Evaluated</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Trainer Performance */}
      <Card title="Trainer Performance">
        <div className="grid grid-cols-2 gap-3">
          {trainers.map(trainer => (
            <div key={trainer.id} className="rounded-xl p-4 cursor-pointer transition-colors"
              style={{
                background: selectedTrainer === trainer.id ? 'var(--color-primary-light)' : 'var(--color-surface-raised)',
                border: `1px solid ${selectedTrainer === trainer.id ? 'var(--color-primary)' : 'var(--color-border)'}`,
              }}
              onClick={() => setSelectedTrainer(selectedTrainer === trainer.id ? null : trainer.id)}>
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h3 className="text-sm font-bold text-white">{trainer.name}</h3>
                  <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                    {trainer.totalEvaluations} evaluations
                  </p>
                </div>
                <div className="text-right">
                  <div className="flex items-center gap-1">
                    <Star size={14} style={{ color: 'var(--color-secondary)', fill: 'var(--color-secondary)' }} />
                    <span className="text-lg font-bold text-white">{trainer.averageScore.toFixed(1)}</span>
                  </div>
                  <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                    {scoreLabels[Math.round(trainer.averageScore) - 1]}
                  </p>
                </div>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--color-bg)' }}>
                <div className="h-full rounded-full" style={{ width: `${(trainer.averageScore / 5) * 100}%`, background: 'var(--color-secondary)' }} />
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Score Distribution */}
      <Card title="Score Distribution">
        <div className="space-y-2">
          {scoreDistribution.reverse().map(({ score, count, percentage }) => (
            <div key={score} className="flex items-center gap-3">
              <button onClick={() => setSelectedScore(selectedScore === score ? null : score)}
                className="flex items-center gap-1 text-sm font-semibold min-w-[80px] transition-colors"
                style={{ color: selectedScore === score ? 'var(--color-secondary)' : 'var(--color-text-secondary)' }}>
                {score} {scoreLabels[score - 1]}
              </button>
              <div className="flex-1 h-6 rounded-lg overflow-hidden" style={{ background: 'var(--color-bg)' }}>
                <div className="h-full flex items-center px-2 text-xs font-bold transition-all"
                  style={{ width: `${percentage}%`, background: 'var(--color-secondary)', color: '#000' }}>
                  {percentage > 10 && `${count} (${percentage}%)`}
                </div>
              </div>
              {percentage <= 10 && (
                <span className="text-xs font-bold min-w-[60px]" style={{ color: 'var(--color-text-muted)' }}>
                  {count} ({percentage}%)
                </span>
              )}
            </div>
          ))}
        </div>
      </Card>

      {/* Filters */}
      {(selectedTrainer || selectedScore) && (
        <div className="flex items-center gap-2">
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Filters:</span>
          {selectedTrainer && (
            <button onClick={() => setSelectedTrainer(null)}
              className="text-xs px-2 py-1 rounded-full font-semibold"
              style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary)' }}>
              {trainers.find(t => t.id === selectedTrainer)?.name} ✕
            </button>
          )}
          {selectedScore && (
            <button onClick={() => setSelectedScore(null)}
              className="text-xs px-2 py-1 rounded-full font-semibold"
              style={{ background: 'var(--color-secondary-light)', color: 'var(--color-secondary)' }}>
              {selectedScore} {scoreLabels[selectedScore - 1]} ✕
            </button>
          )}
        </div>
      )}

      {/* Evaluations List */}
      <Card title={`Recent Evaluations (${filteredEvaluations.length})`}>
        <div className="space-y-3">
          {filteredEvaluations.map(evaluation => (
            <div key={evaluation.id} className="rounded-xl p-4"
              style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-sm font-bold text-white">{evaluation.trainerName}</h3>
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                      style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary)' }}>
                      {evaluation.className}
                    </span>
                  </div>
                  <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                    by {evaluation.memberName} • {new Date(evaluation.sessionDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                </div>
                <div className="text-right">
                  <div className="flex items-center gap-1 justify-end mb-1">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} size={12}
                        style={{
                          color: i < evaluation.score ? 'var(--color-secondary)' : 'var(--color-border)',
                          fill: i < evaluation.score ? 'var(--color-secondary)' : 'none',
                        }} />
                    ))}
                  </div>
                  <p className="text-[10px] font-semibold" style={{ color: 'var(--color-secondary)' }}>
                    {scoreLabels[evaluation.score - 1]}
                  </p>
                </div>
              </div>
              {evaluation.feedback && (
                <div className="rounded-lg p-3 mt-2" style={{ background: 'var(--color-bg)' }}>
                  <p className="text-xs italic" style={{ color: 'var(--color-text-secondary)' }}>
                    "{evaluation.feedback}"
                  </p>
                </div>
              )}
              <div className="flex items-center gap-2 mt-2 text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                <Calendar size={10} />
                <span>Submitted {new Date(evaluation.submittedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
