import { useEffect, useState } from 'react';
import { MessageSquare, Lightbulb, ThumbsUp, ListChecks, FileText } from 'lucide-react';
import { progressService, type TrainerFeedback, type WorkoutPlan } from '../../../services/progressService';
import { useMemberId } from '../hooks/useMemberId';
import { Skeleton } from '../../../components/ui/Skeleton';
import EmptyState from '../../../components/ui/EmptyState';
import ErrorState from '../../../components/ui/ErrorState';

const typeMeta: Record<TrainerFeedback['type'], { icon: any; label: string; color: string }> = {
  recommendation: { icon: Lightbulb,  label: 'Recommendation',  color: 'var(--color-secondary)' },
  comment:        { icon: ThumbsUp,   label: 'Performance Note', color: 'var(--color-primary)' },
  improvement:    { icon: ListChecks, label: 'Improvement',      color: 'var(--color-primary)' },
  plan:           { icon: FileText,   label: 'Workout Plan',     color: 'var(--color-primary)' },
};

export default function TrainerFeedbackTab() {
  const memberId = useMemberId();
  const [feedback, setFeedback]   = useState<TrainerFeedback[]>([]);
  const [plan, setPlan]           = useState<WorkoutPlan | null>(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(false);

  const load = async () => {
    setLoading(true); setError(false);
    try {
      const list = await progressService.getTrainerFeedback(memberId);
      setFeedback(list);
      const planEntry = list.find(f => f.type === 'plan' && f.workoutPlanId);
      if (planEntry?.workoutPlanId) {
        setPlan((await progressService.getWorkoutPlan(planEntry.workoutPlanId)) ?? null);
      }
    } catch { setError(true); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [memberId]);

  if (loading) return <div className="space-y-3"><Skeleton className="h-32" /><Skeleton className="h-48" /></div>;
  if (error) return <ErrorState onRetry={load} />;

  return (
    <div className="space-y-4">
      <p className="text-xs px-1" style={{ color: 'var(--color-text-muted)' }}>
        Read-only — your trainer’s notes and assigned plan
      </p>

      {feedback.length === 0 ? (
        <EmptyState icon={MessageSquare} title="No feedback yet"
          message="Your trainer’s notes and recommendations will show up here." />
      ) : (
        <div className="space-y-2">
          {feedback.map(f => {
            const meta = typeMeta[f.type];
            const Icon = meta.icon;
            return (
              <div key={f.id} className="rounded-2xl p-4"
                style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: `${meta.color}20` }}>
                    <Icon size={18} style={{ color: meta.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs font-semibold uppercase" style={{ color: meta.color }}>{meta.label}</p>
                      <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                        {new Date(f.date).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>{f.content}</p>
                    <p className="text-[11px] mt-1" style={{ color: 'var(--color-text-muted)' }}>— {f.trainerName}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Assigned workout plan */}
      {plan && (
        <div className="rounded-2xl p-4" style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-primary)' }}>
          <p className="text-[11px] uppercase font-semibold mb-1" style={{ color: 'var(--color-primary)' }}>Assigned Plan</p>
          <h3 className="text-white font-bold">{plan.name}</h3>
          {plan.description && (
            <p className="text-xs mt-1" style={{ color: 'var(--color-text-secondary)' }}>{plan.description}</p>
          )}
          <div className="mt-3 space-y-2">
            {plan.schedule.map(d => (
              <div key={d.day} className="rounded-xl p-3" style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
                <p className="text-sm font-semibold text-white mb-1.5">{d.day}</p>
                <div className="space-y-1">
                  {d.exercises.map((e, idx) => (
                    <div key={idx} className="flex items-center justify-between text-xs">
                      <span style={{ color: 'var(--color-text-secondary)' }}>• {e.name}</span>
                      <span style={{ color: 'var(--color-text-muted)' }}>
                        {e.sets ? `${e.sets} × ${e.reps}` : `${e.durationMin} min`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
