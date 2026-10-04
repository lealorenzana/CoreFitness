import { Check, Lock } from 'lucide-react';
import type { GymModule } from '../lib/api/gymApp';

/**
 * What a gym runs (0141), as switches: each part, with its children indented
 * under it. Shared by Your app → What you run and the setup wizard.
 *
 * `hideUnsold` drops what the gym's Core Fitness plan does not include — the
 * wizard asks only about parts the gym can actually run; Your app shows them
 * locked, with the reason, because a gym looking later deserves to know.
 */
export default function ModuleSwitches({ modules, onToggle, hideUnsold }: {
  modules: GymModule[]; onToggle: (m: GymModule) => void; hideUnsold?: boolean;
}) {
  const shown = hideUnsold ? modules.filter((m) => m.state !== 'not_sold') : modules;
  return (
    <div className="space-y-2">
      {shown.filter((m) => !m.parent_key).map((parent) => (
        <div key={parent.feature_key} className="space-y-1.5">
          <ModuleRow m={parent} onToggle={onToggle} />
          {shown.some((c) => c.parent_key === parent.feature_key) && (
            <div className="ml-6 space-y-1.5 border-l pl-3" style={{ borderColor: 'var(--color-border)' }}>
              {shown.filter((c) => c.parent_key === parent.feature_key).map((child) => (
                <ModuleRow key={child.feature_key} m={child} parentLabel={parent.label} onToggle={onToggle} small />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function ModuleRow({ m, onToggle, parentLabel, small }: {
  m: GymModule; onToggle: (m: GymModule) => void; parentLabel?: string; small?: boolean;
}) {
  const locked = m.state === 'not_sold';
  const held = m.state === 'parent_off';
  const note = locked
    ? 'Your Core Fitness plan does not include this. Ask us to move you to a plan that does.'
    : held
      ? `Off because ${parentLabel ?? 'the part it belongs to'} is off. Switch that on and this comes back as you left it.`
      : m.description;
  return (
    <button
      type="button"
      onClick={() => onToggle(m)}
      disabled={locked || held}
      aria-pressed={m.enabled}
      data-tip={locked || held ? undefined : m.enabled ? `Switch off ${m.label}` : `Switch on ${m.label}`}
      className={`w-full flex items-start gap-3 rounded-lg border text-left disabled:cursor-default ${small ? 'px-3 py-2' : 'px-3.5 py-3'}`}
      style={{
        borderColor: m.enabled ? 'var(--color-primary)' : 'var(--color-border)',
        background: 'var(--color-bg)',
        opacity: locked || held ? 0.6 : 1,
      }}
    >
      <span className="mt-0.5 shrink-0">
        {locked ? <Lock size={16} style={{ color: 'var(--color-text-muted)' }} />
          : m.enabled ? <Check size={16} style={{ color: 'var(--color-primary)' }} />
          : <span className="block h-4 w-4 rounded border" style={{ borderColor: 'var(--color-border)' }} />}
      </span>
      <span className="flex-1 min-w-0">
        <span className={`block font-medium ${small ? 'text-[13px]' : 'text-sm'}`}
          style={{ color: 'var(--color-text-primary)' }}>
          {m.label}
        </span>
        <span className="block text-xs mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
          {note}
        </span>
      </span>
    </button>
  );
}
