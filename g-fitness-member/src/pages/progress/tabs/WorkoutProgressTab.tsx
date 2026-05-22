import { useEffect, useMemo, useState } from 'react';
import { Flame, Dumbbell, Trophy, Plus, X } from 'lucide-react';
import { progressService, type WorkoutLog } from '../../../services/progressService';
import { useMemberId } from '../hooks/useMemberId';
import { Skeleton } from '../../../components/ui/Skeleton';
import EmptyState from '../../../components/ui/EmptyState';
import ErrorState from '../../../components/ui/ErrorState';

const WORKOUT_TYPES = ['Strength Training', 'HIIT', 'Yoga', 'Boxing', 'CrossFit', 'Cardio', 'Stretching'] as const;

const ringPath = (pct: number, radius = 28, stroke = 6) => {
  const c = 2 * Math.PI * radius;
  const offset = c - (pct / 100) * c;
  return { c, offset, radius, stroke };
};

export default function WorkoutProgressTab() {
  const memberId = useMemberId();
  const [logs, setLogs]       = useState<WorkoutLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(false);
  const [scope, setScope]     = useState<'week' | 'month'>('week');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ type: 'Strength Training', duration: '', calories: '', isPr: false, weightKg: '' });

  const load = async () => {
    setLoading(true); setError(false);
    try { setLogs(await progressService.getWorkoutLogs(memberId)); }
    catch { setError(true); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [memberId]);

  const stats = useMemo(() => {
    const now = new Date();
    const cutoff = new Date(now.getTime() - (scope === 'week' ? 7 : 30) * 86400000);
    const recent = logs.filter(l => new Date(l.date) >= cutoff);

    // Streak: consecutive days with at least one workout
    const datesSet = new Set(logs.map(l => l.date));
    let streak = 0;
    for (let i = 0; i < 90; i++) {
      const d = new Date(now.getTime() - i * 86400000).toISOString().split('T')[0];
      if (datesSet.has(d)) streak++;
      else if (i > 0) break;
    }

    const totalCalories = recent.reduce((s, l) => s + l.calories, 0);
    const totalMinutes  = recent.reduce((s, l) => s + l.duration, 0);
    const completed     = recent.filter(l => l.completed).length;
    const completionPct = recent.length ? Math.round((completed / recent.length) * 100) : 0;

    const heaviestLift  = logs.filter(l => l.type === 'Strength Training' && l.weightKg)
      .reduce((max, l) => Math.max(max, l.weightKg || 0), 0);
    const longestCardio = logs.filter(l => l.cardioMinutes)
      .reduce((max, l) => Math.max(max, l.cardioMinutes || 0), 0);
    const mostCalories  = logs.reduce((max, l) => Math.max(max, l.calories), 0);

    return {
      total: recent.length, totalCalories, totalMinutes, completionPct, streak,
      heaviestLift, longestCardio, mostCalories,
    };
  }, [logs, scope]);

  const handleAdd = async () => {
    if (!form.duration) return;
    await progressService.addWorkoutLog(memberId, {
      date: new Date().toISOString().split('T')[0],
      type: form.type as WorkoutLog['type'],
      duration: Number(form.duration),
      calories: Number(form.calories) || Math.round(Number(form.duration) * 8),
      completed: true,
      isPr: form.isPr,
      weightKg: form.weightKg ? Number(form.weightKg) : undefined,
    });
    setForm({ type: 'Strength Training', duration: '', calories: '', isPr: false, weightKg: '' });
    setShowForm(false); load();
  };

  if (loading) return <div className="space-y-3"><Skeleton className="h-32" /><Skeleton className="h-40" /><Skeleton className="h-32" /></div>;
  if (error) return <ErrorState onRetry={load} />;

  const ring = ringPath(stats.completionPct);

  return (
    <div className="space-y-4">
      {/* Toggle */}
      <div className="flex gap-2 p-1 rounded-xl" style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
        {(['week', 'month'] as const).map(s => (
          <button key={s} onClick={() => setScope(s)}
            className="flex-1 py-2 rounded-lg text-sm font-semibold transition-colors capitalize"
            style={{
              background: scope === s ? 'var(--color-secondary)' : 'transparent',
              color: scope === s ? '#000' : 'var(--color-text-muted)',
            }}>
            This {s}
          </button>
        ))}
      </div>

      {/* Top stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl p-4" style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
          <div className="flex items-center gap-2 mb-1">
            <Dumbbell size={14} style={{ color: 'var(--color-secondary)' }} />
            <span className="text-[11px] uppercase" style={{ color: 'var(--color-text-muted)' }}>Workouts</span>
          </div>
          <p className="text-2xl font-bold text-white">{stats.total}</p>
          <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>{stats.totalMinutes} mins logged</p>
        </div>
        <div className="rounded-2xl p-4" style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
          <div className="flex items-center gap-2 mb-1">
            <Flame size={14} style={{ color: 'var(--color-secondary)' }} />
            <span className="text-[11px] uppercase" style={{ color: 'var(--color-text-muted)' }}>Streak</span>
          </div>
          <p className="text-2xl font-bold text-white">{stats.streak} <span className="text-base">days</span></p>
          <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>Keep it going!</p>
        </div>
      </div>

      {/* Calories + completion ring */}
      <div className="rounded-2xl p-4 flex items-center gap-4" style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
        <div className="relative w-20 h-20 flex-shrink-0">
          <svg width="80" height="80" viewBox="0 0 80 80">
            <circle cx="40" cy="40" r={ring.radius} stroke="var(--color-border)" strokeWidth={ring.stroke} fill="none" />
            <circle cx="40" cy="40" r={ring.radius} stroke="var(--color-secondary)" strokeWidth={ring.stroke} fill="none"
              strokeDasharray={ring.c} strokeDashoffset={ring.offset} strokeLinecap="round"
              transform="rotate(-90 40 40)" style={{ transition: 'stroke-dashoffset 0.6s' }} />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center text-white font-bold text-sm">
            {stats.completionPct}%
          </div>
        </div>
        <div className="flex-1">
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Completion rate</p>
          <p className="text-2xl font-bold text-white">{stats.totalCalories.toLocaleString()} kcal</p>
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>burned this {scope}</p>
        </div>
      </div>

      {/* Personal Records */}
      <div className="rounded-2xl p-4" style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
        <div className="flex items-center gap-2 mb-3">
          <Trophy size={16} style={{ color: 'var(--color-secondary)' }} />
          <h3 className="text-white font-semibold">Personal Records</h3>
        </div>
        <div className="space-y-2">
          {[
            { label: 'Heaviest Lift',         value: stats.heaviestLift  ? `${stats.heaviestLift} kg`     : '—' },
            { label: 'Longest Cardio',        value: stats.longestCardio ? `${stats.longestCardio} mins` : '—' },
            { label: 'Most Calories / Session', value: stats.mostCalories ? `${stats.mostCalories} kcal` : '—' },
          ].map(pr => (
            <div key={pr.label} className="flex justify-between p-2.5 rounded-lg"
              style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
              <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>{pr.label}</span>
              <span className="text-sm font-bold text-white">{pr.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Add log */}
      <button onClick={() => setShowForm(s => !s)}
        className="w-full py-3 rounded-xl font-semibold text-black flex items-center justify-center gap-2"
        style={{ background: 'var(--color-secondary)' }}>
        {showForm ? <X size={18} /> : <Plus size={18} />} {showForm ? 'Close' : 'Log Workout'}
      </button>

      {showForm && (
        <div className="rounded-2xl p-4 space-y-3" style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
          <div>
            <label className="text-[11px] block mb-1" style={{ color: 'var(--color-text-muted)' }}>Type</label>
            <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}
              className="w-full px-3 rounded-xl text-white text-sm focus:outline-none"
              style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', height: 40 }}>
              {WORKOUT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] block mb-1" style={{ color: 'var(--color-text-muted)' }}>Duration (min) *</label>
              <input type="number" value={form.duration}
                onChange={e => setForm({ ...form, duration: e.target.value })}
                className="w-full px-3 rounded-xl text-white text-sm focus:outline-none"
                style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', height: 40 }} />
            </div>
            <div>
              <label className="text-[11px] block mb-1" style={{ color: 'var(--color-text-muted)' }}>Calories</label>
              <input type="number" value={form.calories}
                onChange={e => setForm({ ...form, calories: e.target.value })}
                className="w-full px-3 rounded-xl text-white text-sm focus:outline-none"
                style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', height: 40 }} />
            </div>
          </div>
          {form.type === 'Strength Training' && (
            <div>
              <label className="text-[11px] block mb-1" style={{ color: 'var(--color-text-muted)' }}>Heaviest Lift (kg)</label>
              <input type="number" value={form.weightKg}
                onChange={e => setForm({ ...form, weightKg: e.target.value })}
                className="w-full px-3 rounded-xl text-white text-sm focus:outline-none"
                style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', height: 40 }} />
            </div>
          )}
          <label className="flex items-center gap-2 text-sm text-white">
            <input type="checkbox" checked={form.isPr}
              onChange={e => setForm({ ...form, isPr: e.target.checked })} />
            This was a personal record 🏆
          </label>
          <button onClick={handleAdd}
            className="w-full py-2.5 rounded-xl font-semibold text-sm text-black"
            style={{ background: 'var(--color-secondary)' }}>
            Save Workout
          </button>
        </div>
      )}

      {/* History */}
      <div>
        <h4 className="text-white font-semibold mb-2 px-1">Recent Workouts</h4>
        {logs.length === 0 ? (
          <EmptyState icon={Dumbbell} title="No workouts yet" message="Log your first workout to start tracking." />
        ) : (
          <div className="space-y-2">
            {logs.slice(0, 10).map(l => (
              <div key={l.id} className="rounded-xl p-3 flex items-center justify-between"
                style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-white truncate">{l.type}</span>
                    {l.isPr && <Trophy size={12} style={{ color: 'var(--color-secondary)' }} />}
                  </div>
                  <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    {new Date(l.date).toLocaleDateString()} • {l.duration} min • {l.calories} kcal
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
