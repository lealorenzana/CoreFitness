import { Check, Eye, EyeSlash } from '@phosphor-icons/react';
import { Eyebrow } from '../ui/noc';
import { strengthOf, strongerWith } from '../../lib/passwordStrength';

/** A password input with a show/hide toggle inside its right edge. */
export function PasswordInput({
  value, onChange, shown, onToggle, placeholder, autoComplete, label,
}: {
  value: string;
  onChange: (v: string) => void;
  shown: boolean;
  onToggle: () => void;
  placeholder: string;
  autoComplete: string;
  label?: string;
}) {
  return (
    <span className="relative block">
      <input
        type={shown ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        aria-label={label}
        className="field-input"
        style={{ paddingRight: 48 }}
      />
      <button
        type="button"
        onClick={onToggle}
        aria-label={shown ? 'Hide password' : 'Show password'}
        className="absolute top-0 right-0 grid place-items-center"
        style={{ width: 46, height: 46, color: 'var(--color-text-muted)' }}
      >
        {shown ? <EyeSlash size={18} /> : <Eye size={18} />}
      </button>
    </span>
  );
}

/** Five segments and what would make it stronger. Renders nothing for an empty password. */
export function PasswordStrength({ password }: { password: string }) {
  if (!password) return null;
  const strength = strengthOf(password);
  const longEnough = password.length >= 8;
  return (
    <section>
      <div className="flex items-baseline justify-between" style={{ gap: 12 }}>
        <Eyebrow>Strength</Eyebrow>
        <span style={{ fontSize: 12.5, color: strength.score >= 4 ? 'var(--color-primary-300)' : 'var(--color-secondary)' }}>
          {strength.label}
        </span>
      </div>
      {/* Five segments, one per point the checker awards. */}
      <div className="flex" style={{ gap: 4, marginTop: 8 }} aria-hidden>
        {Array.from({ length: 5 }).map((_, i) => (
          <span key={i} className="flex-1" style={{
            height: 4, borderRadius: 2,
            background: i < strength.score
              ? (strength.score >= 4 ? 'var(--color-primary)' : 'var(--color-secondary)')
              : 'var(--color-surface-high)',
          }} />
        ))}
      </div>

      <ul className="flex flex-col" style={{ gap: 7, marginTop: 14 }}>
        <li className="flex items-center" style={{ gap: 8, fontSize: 12.5,
          color: longEnough ? 'var(--color-primary-300)' : 'var(--color-secondary)' }}>
          <Check size={14} weight="bold" style={{ opacity: longEnough ? 1 : 0.35 }} />
          Required: at least 8 characters
        </li>
        {strongerWith(password).map((r) => (
          <li key={r.label} className="flex items-center" style={{ gap: 8, fontSize: 12.5,
            color: r.met ? 'var(--color-primary-300)' : 'var(--color-text-muted)' }}>
            <Check size={14} weight="bold" style={{ opacity: r.met ? 1 : 0.35 }} />
            Stronger with: {r.label.toLowerCase()}
          </li>
        ))}
      </ul>
    </section>
  );
}
