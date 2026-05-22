import { useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { progressService, calcBmi, bmiLabel, type BodyProgressEntry } from '../../../services/progressService';
import { useMemberId } from '../hooks/useMemberId';
import { Skeleton } from '../../../components/ui/Skeleton';
import EmptyState from '../../../components/ui/EmptyState';
import ErrorState from '../../../components/ui/ErrorState';
import { Activity } from 'lucide-react';

interface FormState {
  weight: string; height: string; arms: string;
  waist: string; chest: string; legs: string; bodyFatPct: string;
}

const emptyForm: FormState = {
  weight: '', height: '', arms: '', waist: '', chest: '', legs: '', bodyFatPct: '',
};

export default function BodyProgressTab() {
  const memberId = useMemberId();
  const [entries, setEntries]   = useState<BodyProgressEntry[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState<FormState>(emptyForm);

  const load = async () => {
    setLoading(true); setError(false);
    try {
      const data = await progressService.getBodyProgress(memberId);
      setEntries(data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [memberId]);

  const latest = entries[entries.length - 1];
  const previous = entries[entries.length - 2];
  const bmi = latest ? calcBmi(latest.height, latest.weight) : 0;
  const bmiInfo = bmiLabel(bmi);

  const muscleDelta = latest && previous && latest.muscleMassKg && previous.muscleMassKg
    ? +(latest.muscleMassKg - previous.muscleMassKg).toFixed(1)
    : 0;
  const fatDelta = latest && previous
    ? +(latest.bodyFatPct - previous.bodyFatPct).toFixed(1)
    : 0;

  const handleSubmit = async () => {
    const weight = Number(form.weight); const height = Number(form.height);
    if (!weight || !height) return;
    const entry = {
      date: new Date().toISOString().split('T')[0],
      weight, height,
      bmi: calcBmi(height, weight),
      arms: Number(form.arms) || 0,
      waist: Number(form.waist) || 0,
      chest: Number(form.chest) || 0,
      legs: Number(form.legs) || 0,
      bodyFatPct: Number(form.bodyFatPct) || 0,
    };
    await progressService.addBodyProgress(memberId, entry);
    setForm(emptyForm); setShowForm(false);
    load();
  };

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-32" />
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    );
  }
  if (error) return <ErrorState onRetry={load} />;

  return (
    <div className="space-y-4">
      {/* Latest snapshot */}
      {latest ? (
        <div className="rounded-2xl p-4" style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-white font-semibold">Latest Snapshot</h3>
            <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: `${bmiInfo.color}20`, color: bmiInfo.color }}>
              BMI {bmi} — {bmiInfo.label}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Weight', value: `${latest.weight} kg` },
              { label: 'Height', value: `${latest.height} cm` },
              { label: 'Body Fat', value: `${latest.bodyFatPct}%` },
              { label: 'Arms',  value: `${latest.arms} cm` },
              { label: 'Chest', value: `${latest.chest} cm` },
              { label: 'Waist', value: `${latest.waist} cm` },
              { label: 'Legs',  value: `${latest.legs} cm` },
            ].map(s => (
              <div key={s.label} className="rounded-lg p-2 text-center" style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
                <p className="text-[10px] uppercase" style={{ color: 'var(--color-text-muted)' }}>{s.label}</p>
                <p className="text-sm font-bold text-white mt-0.5">{s.value}</p>
              </div>
            ))}
          </div>

          {/* Indicators */}
          <div className="flex gap-2 mt-3">
            <div className="flex-1 rounded-lg p-2 text-center" style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
              <p className="text-[10px] uppercase" style={{ color: 'var(--color-text-muted)' }}>Muscle Δ</p>
              <p className="text-sm font-bold mt-0.5" style={{ color: muscleDelta >= 0 ? 'var(--color-primary)' : 'var(--color-secondary)' }}>
                {muscleDelta > 0 ? '+' : ''}{muscleDelta} kg
              </p>
            </div>
            <div className="flex-1 rounded-lg p-2 text-center" style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
              <p className="text-[10px] uppercase" style={{ color: 'var(--color-text-muted)' }}>Fat Δ</p>
              <p className="text-sm font-bold mt-0.5" style={{ color: fatDelta <= 0 ? 'var(--color-primary)' : 'var(--color-secondary)' }}>
                {fatDelta > 0 ? '+' : ''}{fatDelta}%
              </p>
            </div>
          </div>
        </div>
      ) : (
        <EmptyState icon={Activity} title="No measurements yet" message="Log your first measurement to start tracking." />
      )}

      {/* Add button */}
      <button onClick={() => setShowForm(s => !s)}
        className="w-full py-3 rounded-xl font-semibold text-black flex items-center justify-center gap-2"
        style={{ background: 'var(--color-secondary)' }}>
        {showForm ? <X size={18} /> : <Plus size={18} />} {showForm ? 'Close' : 'Log New Entry'}
      </button>

      {/* Form */}
      {showForm && (
        <div className="rounded-2xl p-4 space-y-3" style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
          <div className="grid grid-cols-2 gap-3">
            {[
              ['weight', 'Weight (kg) *'],
              ['height', 'Height (cm) *'],
              ['arms', 'Arms (cm)'],
              ['chest', 'Chest (cm)'],
              ['waist', 'Waist (cm)'],
              ['legs', 'Legs (cm)'],
              ['bodyFatPct', 'Body Fat %'],
            ].map(([key, label]) => (
              <div key={key}>
                <label className="text-[11px] block mb-1" style={{ color: 'var(--color-text-muted)' }}>{label}</label>
                <input type="number" value={(form as any)[key]}
                  onChange={e => setForm({ ...form, [key]: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl text-white text-sm focus:outline-none"
                  style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', height: 40 }} />
              </div>
            ))}
          </div>
          <button onClick={handleSubmit}
            className="w-full py-2.5 rounded-xl font-semibold text-sm text-black"
            style={{ background: 'var(--color-secondary)' }}>
            Save Entry
          </button>
        </div>
      )}

      {/* History */}
      <div>
        <h4 className="text-white font-semibold mb-2 px-1">History</h4>
        {entries.length === 0 ? (
          <EmptyState icon={Activity} title="No history" message="Logged measurements appear here." />
        ) : (
          <div className="space-y-2">
            {[...entries].reverse().map(e => (
              <div key={e.id} className="rounded-xl p-3 flex items-center justify-between" style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
                <div>
                  <p className="text-sm font-semibold text-white">{e.weight} kg</p>
                  <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    {new Date(e.date).toLocaleDateString()} • Fat {e.bodyFatPct}% • BMI {e.bmi}
                  </p>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold" style={{
                  background: `${bmiLabel(e.bmi).color}20`, color: bmiLabel(e.bmi).color,
                }}>{bmiLabel(e.bmi).label}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
