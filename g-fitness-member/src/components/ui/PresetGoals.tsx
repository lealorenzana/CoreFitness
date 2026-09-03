import { useEffect, useState } from 'react';
import { Target, Plus, AlertTriangle } from 'lucide-react';
import { panelStyle } from './Card';
import {
  listGoalTemplates, createTemplateGoal, type GoalTemplate,
} from '../../lib/api/goalTemplates';
import { errorMessage } from '../../utils/errorMessage';

/**
 * The five goals people actually state (migration 0055).
 *
 * ## Why these are presets and not a free-text box
 *
 * "Improve endurance" has no obvious unit. Asking a member to invent one
 * produces goals nobody can be measured against — which is what `custom` goals
 * have been since 0020: the words are stored and no progress is ever computed.
 *
 * Each preset carries its own definition instead, and **the card shows it**.
 * "Build consistency" is not a mood here, it is *weeks with at least two
 * training days over the last eight weeks*, and the member reads that sentence
 * before choosing it. A goal whose rule is hidden is a goal you cannot trust
 * when it tells you you have failed.
 *
 * ## The target is the member's, the verdict is not
 *
 * They pick how many. Whether it has been reached is settled in SQL, because
 * reaching a goal now pays 100 CORE Points and sends a notification.
 */

interface Props {
  memberId: string;
  /** Refresh the goal list above once one is added. */
  onCreated: () => void;
}

export default function PresetGoals({ memberId, onCreated }: Props) {
  const [templates, setTemplates] = useState<GoalTemplate[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [target, setTarget] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const rows = await listGoalTemplates();
        if (alive) setTemplates(rows);
      } catch (err) {
        if (alive) setError(errorMessage(err));
      }
    })();
    return () => { alive = false; };
  }, []);

  const choose = (t: GoalTemplate) => {
    setOpen(open === t.key ? null : t.key);
    setTarget(String(t.targetDefault));
    setError(null);
  };

  const add = async (t: GoalTemplate) => {
    const n = Number(target);
    if (!Number.isFinite(n) || n <= 0) {
      setError('Pick a target above zero.');
      return;
    }
    setBusy(true);
    try {
      await createTemplateGoal(memberId, t, n);
      setOpen(null);
      onCreated();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (templates.length === 0 && !error) return null;

  return (
    <div className="p-4 rounded-2xl" style={panelStyle}>
      <div className="flex items-center gap-2 mb-1">
        <Target size={14} style={{ color: 'var(--color-primary)' }} />
        <p className="text-xs font-bold text-white">Ready-made goals</p>
      </div>
      <p className="text-[10px] mb-3 leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
        These track themselves from your check-ins and logged workouts. Each one
        says exactly how it is counted.
      </p>

      {error && (
        <div className="px-3 py-2 rounded-xl flex items-start gap-2 text-[10px] leading-relaxed mb-3"
             style={{ background: 'var(--color-secondary-light)', color: 'var(--color-secondary)' }}>
          <AlertTriangle size={12} className="flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div className="space-y-2">
        {templates.map((t) => (
          <div key={t.key} className="rounded-xl overflow-hidden"
               style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
            <button onClick={() => choose(t)} className="w-full p-3 text-left">
              <p className="text-xs font-semibold text-white">{t.label}</p>
              <p className="text-[10px] mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
                {t.description}
              </p>
              {/* The rule, always visible — not behind the tap. */}
              <p className="text-[10px] mt-1.5" style={{ color: 'var(--color-text-muted)' }}>
                Counted as: {t.measuredAs}
              </p>
            </button>

            {open === t.key && (
              <div className="px-3 pb-3 flex items-end gap-2">
                <label className="flex-1 min-w-0">
                  <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                    Your target
                  </span>
                  <input
                    inputMode="numeric"
                    value={target}
                    onChange={(e) => setTarget(e.target.value)}
                    className="field-input w-full h-10 px-3 rounded-xl text-xs text-white mt-1"
                    style={{ background: 'var(--color-surface-high)', border: '1px solid var(--color-border)' }}
                  />
                </label>
                <button onClick={() => add(t)} disabled={busy}
                  className="px-3.5 h-10 rounded-xl text-[11px] font-bold flex items-center gap-1.5 flex-shrink-0 disabled:opacity-50"
                  style={{ background: 'var(--color-secondary)', color: '#1A1200' }}>
                  <Plus size={13} /> {busy ? 'Adding…' : 'Set goal'}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
