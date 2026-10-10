import { Check } from 'lucide-react';
import type { JoinPolicy, JoinSettings } from '../lib/api/gymApp';

/**
 * The two questions after "how do they find you" (0179): whether a sign-up is
 * let in at once or waits for the desk, and the youngest age the gym takes.
 * Shared by Setup and Your app → How members join, so the two cannot drift.
 * A front-desk-only gym is never asked about approval: the desk decides every
 * request a member's invitation brings.
 */
export default function JoinApproval({ policy, value, onChange }: {
  policy: JoinPolicy;
  value: JoinSettings;
  onChange: (next: JoinSettings) => void;
}) {
  const labelStyle = { color: 'var(--color-text-secondary)' };
  return (
    <div className="mt-4 space-y-3" data-join-approval>
      {policy !== 'closed' && (
        <div>
          <p className="text-xs font-medium mb-1.5" style={labelStyle}>When someone signs up</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {([
              ['desk', 'Your desk approves them', 'They wait until the desk accepts. Best when you check people in person first.'],
              ['auto', 'Let them in at once', 'They start on your free plan straight away. You can still suspend anyone.'],
            ] as const).map(([key, title, blurb]) => (
              <button key={key} type="button" aria-pressed={value.approval === key}
                onClick={() => onChange({ ...value, approval: key })}
                className="flex items-start gap-3 rounded-lg border px-3.5 py-3 text-left"
                style={{ borderColor: value.approval === key ? 'var(--color-primary)' : 'var(--color-border)', background: 'var(--color-bg)' }}>
                <span className="mt-0.5 shrink-0">
                  {value.approval === key
                    ? <Check size={16} style={{ color: 'var(--color-primary)' }} />
                    : <span className="block h-4 w-4 rounded-full border" style={{ borderColor: 'var(--color-border)' }} />}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>{title}</span>
                  <span className="block text-xs mt-0.5" style={labelStyle}>{blurb}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
      <div>
        <label className="block text-xs font-medium mb-1.5" style={labelStyle} htmlFor="join-min-age">Youngest age you take</label>
        <div className="flex items-center gap-2">
          <input id="join-min-age" type="number" min={0} max={21} value={value.minAge}
            onChange={(e) => onChange({ ...value, minAge: Math.max(0, Math.min(21, Number(e.target.value) || 0)) })}
            className="w-20 rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text-primary)' }} />
          <span className="text-xs" style={labelStyle}>years old. Under 18 joins with a parent&rsquo;s or guardian&rsquo;s consent.</span>
        </div>
      </div>
    </div>
  );
}
