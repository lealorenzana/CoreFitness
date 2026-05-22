import { useEffect, useState, useRef } from 'react';
import { Target, Plus, X, Trash2, CheckCircle2 } from 'lucide-react';
import { progressService, goalProgressPct, type Goal } from '../../../services/progressService';
import { useMemberId } from '../hooks/useMemberId';
import { Skeleton } from '../../../components/ui/Skeleton';
import EmptyState from '../../../components/ui/EmptyState';
import ErrorState from '../../../components/ui/ErrorState';
import { toast } from '../../../components/ui/Toast';

const TYPE_OPTIONS: { value: Goal['type']; label: string; unit: string }[] = [
  { value: 'weight_loss', label: 'Weight Loss', unit: 'kg' },
  { value: 'muscle_gain', label: 'Muscle Gain', unit: 'kg' },
  { value: 'attendance',  label: 'Attendance',  unit: 'visits' },
  { value: 'calories',    label: 'Calories',    unit: 'kcal' },
];

export default function GoalsTab() {
  const memberId = useMemberId();
  const [goals, setGoals]     = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ type: 'weight_loss', title: '', target: '', deadline: '' });
  const alertedGoalsRef = useRef<Set<string>>(new Set());

  const load = async () => {
    setLoading(true); setError(false);
    try { setGoals(await progressService.getGoals(memberId)); }
    catch { setError(true); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [memberId]);

  // Check goal progress and show alerts
  useEffect(() => {
    if (loading || goals.length === 0) return;
    const checkGoals = async () => {
      for (const g of goals) {
        if (g.status !== 'in_progress') continue;
        const pct = goalProgressPct(g);
        if (pct >= 100) {
          await progressService.updateGoalProgress(memberId, g.id, g.targetValue);
          toast.success('🏆 Goal achieved: ' + g.title);
          load();
          return;
        }
        if (pct >= 50 && !alertedGoalsRef.current.has(g.id)) {
          alertedGoalsRef.current.add(g.id);
          toast.info('🔥 Halfway there: ' + g.title);
        }
      }
    };
    checkGoals();
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [goals, loading]);

  const handleAdd = async () => {
    if (!form.title || !form.target || !form.deadline) return;
    const opt = TYPE_OPTIONS.find(t => t.value === form.type)!;
    await progressService.addGoal(memberId, {
      type: form.type as Goal['type'],
      title: form.title,
      targetValue: Number(form.target),
      unit: opt.unit,
      deadline: form.deadline,
    });
    toast.success('Goal created! Start tracking your progress.');
    setForm({ type: 'weight_loss', title: '', target: '', deadline: '' });
    setShowForm(false); load();
  };

  const inProgress = goals.filter(g => g.status === 'in_progress');
  const achieved   = goals.filter(g => g.status === 'achieved');

  if (loading) return <div className="space-y-3"><Skeleton className="h-32" /><Skeleton className="h-32" /></div>;
  if (error) return <ErrorState onRetry={load} />;

  return (
    <div className="space-y-4">
      <button onClick={() => setShowForm(s => !s)}
        className="w-full py-3 rounded-xl font-semibold text-black flex items-center justify-center gap-2"
        style={{ background: 'var(--color-secondary)' }}>
        {showForm ? <X size={18} /> : <Plus size={18} />} {showForm ? 'Close' : 'Create New Goal'}
      </button>

      {showForm && (
        <div className="rounded-2xl p-4 space-y-3" style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
          <div>
            <label className="text-[11px] block mb-1" style={{ color: 'var(--color-text-muted)' }}>Type *</label>
            <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}
              className="w-full px-3 rounded-xl text-white text-sm focus:outline-none"
              style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', height: 40 }}>
              {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] block mb-1" style={{ color: 'var(--color-text-muted)' }}>Title *</label>
            <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
              placeholder="e.g. Lose 5 kg by next month"
              className="w-full px-3 rounded-xl text-white text-sm focus:outline-none"
              style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', height: 40 }} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] block mb-1" style={{ color: 'var(--color-text-muted)' }}>Target Value *</label>
              <input type="number" value={form.target} onChange={e => setForm({ ...form, target: e.target.value })}
                className="w-full px-3 rounded-xl text-white text-sm focus:outline-none"
                style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', height: 40 }} />
            </div>
            <div>
              <label className="text-[11px] block mb-1" style={{ color: 'var(--color-text-muted)' }}>Deadline *</label>
              <input type="date" value={form.deadline} onChange={e => setForm({ ...form, deadline: e.target.value })}
                className="w-full px-3 rounded-xl text-white text-sm focus:outline-none"
                style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', height: 40 }} />
            </div>
          </div>
          <button onClick={handleAdd}
            className="w-full py-2.5 rounded-xl font-semibold text-sm text-black"
            style={{ background: 'var(--color-secondary)' }}>
            Save Goal
          </button>
        </div>
      )}

      {/* In progress */}
      <div>
        <h3 className="text-white font-semibold mb-2 px-1">In Progress</h3>
        {inProgress.length === 0 ? (
          <EmptyState icon={Target} title="No active goals" message="Create a goal to start tracking your progress." />
        ) : (
          <div className="space-y-2">
            {inProgress.map(g => {
              const pct = goalProgressPct(g);
              const milestone = pct >= 100 ? '🏆 Complete!' : pct >= 50 ? '🔥 Halfway there!' : '';
              return (
                <div key={g.id} className="rounded-2xl p-4" style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-semibold text-sm">{g.title}</p>
                      <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                        {g.currentValue} / {g.targetValue} {g.unit} • due {new Date(g.deadline).toLocaleDateString()}
                      </p>
                    </div>
                    <button onClick={() => progressService.deleteGoal(memberId, g.id).then(load)}
                      className="p-1.5 rounded-lg" style={{ color: 'var(--color-text-muted)' }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <div className="h-2 rounded-full" style={{ background: 'var(--color-border)' }}>
                    <div className="h-full rounded-full transition-all"
                      style={{ width: `${pct}%`, background: pct >= 100 ? 'var(--color-primary)' : 'var(--color-secondary)' }} />
                  </div>
                  {milestone && (
                    <p className="text-[11px] mt-1.5 font-semibold" style={{ color: pct >= 100 ? 'var(--color-primary)' : 'var(--color-secondary)' }}>{milestone}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Achieved */}
      {achieved.length > 0 && (
        <div>
          <h3 className="text-white font-semibold mb-2 px-1 flex items-center gap-1.5">
            <CheckCircle2 size={16} style={{ color: 'var(--color-primary)' }} /> Achieved
          </h3>
          <div className="space-y-2">
            {achieved.map(g => (
              <div key={g.id} className="rounded-2xl p-3 flex items-center justify-between"
                style={{ background: 'var(--color-primary-light)', border: '1px solid rgba(124,58,237,0.30)' }}>
                <div>
                  <p className="text-sm font-semibold text-white">{g.title}</p>
                  <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                    Achieved {g.achievedAt && new Date(g.achievedAt).toLocaleDateString()}
                  </p>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase"
                  style={{ background: 'rgba(124,58,237,0.20)', color: 'var(--color-primary)' }}>
                  Completed
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
