import { useState } from 'react';
import { AtSign } from 'lucide-react';
import { usernameAvailable, usernameShape, USERNAME_HINT } from '../lib/api/logins';

/**
 * The username box (0236): lowercase as you type, its shape checked at once and
 * whether it is free checked when you leave it (the database decides on save).
 * `required` when the account has no email — then it is their only login.
 */
export default function UsernameField({ value, onChange, required, inputClass, inputStyle, labelClass, labelStyle }: {
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  inputClass: string;
  inputStyle: React.CSSProperties;
  labelClass: string;
  labelStyle: React.CSSProperties;
}) {
  const [taken, setTaken] = useState<string | null>(null);
  const shape = usernameShape(value);
  const problem = shape ?? taken;
  return (
    <label className="block" data-username-field>
      <span className={labelClass} style={labelStyle}>Username {required ? '' : '(optional)'}</span>
      <div className="relative">
        <AtSign size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-text-muted)' }} />
        <input className={inputClass} style={{ ...inputStyle, paddingLeft: 36 }} value={value} autoCapitalize="off" spellCheck={false} autoComplete="username"
          aria-label="Username" placeholder="e.g. maria.santos"
          onChange={(e) => { setTaken(null); onChange(e.target.value.toLowerCase().replace(/\s+/g, '')); }}
          onBlur={() => { if (value.trim() && !shape) void usernameAvailable(value).then(setTaken).catch(() => setTaken(null)); }} />
      </div>
      <span className="block mt-1.5 text-[12px]" style={{ color: problem ? 'var(--color-secondary)' : 'var(--color-text-secondary)' }} role={problem ? 'alert' : undefined}>
        {problem ?? `${USERNAME_HINT}. You can sign in with it${required ? ' — with no email, it is your only login' : ' as well as your email'}.`}
      </span>
    </label>
  );
}
