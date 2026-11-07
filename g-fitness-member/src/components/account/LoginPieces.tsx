import { useEffect, useMemo, useRef, useState } from 'react';
import { AtSign, Camera, X } from 'lucide-react';
import { Field, TextInput } from '../ui/Field';
import { cropPhoto } from '../ui/PhotoCropper';
import { usernameAvailable, usernameShape, USERNAME_HINT } from '../../lib/api/logins';

/**
 * The username box (0236): lowercase as you type, its shape checked at once, and
 * whether it is free checked when you leave it (the database decides on save).
 * `required` when the account has no email — then it is their only login.
 */
export function UsernameInput({ value, onChange, required }: { value: string; onChange: (v: string) => void; required?: boolean }) {
  const [taken, setTaken] = useState<string | null>(null);
  const shape = usernameShape(value);
  const problem = shape ?? taken;
  return (
    <Field label={required ? 'Username' : 'Username (optional)'}>
      <div className="relative" data-username-input>
        <AtSign size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--color-text-muted)' }} />
        <TextInput value={value} autoCapitalize="off" spellCheck={false} autoComplete="username" placeholder="e.g. maria.santos" aria-label="Username"
          style={{ paddingLeft: 36 }}
          onChange={(e) => { setTaken(null); onChange(e.target.value.toLowerCase().replace(/\s+/g, '')); }}
          onBlur={() => { if (value.trim() && !shape) void usernameAvailable(value).then(setTaken).catch(() => setTaken(null)); }} />
      </div>
      <p className="text-xs mt-1.5 leading-relaxed" style={{ color: problem ? 'var(--color-secondary-300, var(--color-secondary))' : 'var(--color-text-muted)' }} role={problem ? 'alert' : undefined}>
        {problem ?? `${USERNAME_HINT}. You can sign in with it${required ? ' — with no email, it is your only login' : ' as well as your email'}.`}
      </p>
    </Field>
  );
}

/**
 * Pick and frame a profile photo (0236): the round cropper, then a preview. The
 * caller decides when it is uploaded — at once when signed in, or later
 * (sign-up keeps it on the phone until the first sign-in).
 */
export function PhotoPick({ file, onChange, name }: { file: File | null; onChange: (f: File | null) => void; name: string }) {
  const input = useRef<HTMLInputElement>(null);
  // Derived from the file; the effect only lets the old preview go.
  const url = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  const initials = name.trim().split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '?';
  const pick = async (raw: File | undefined) => {
    if (!raw) return;
    const framed = await cropPhoto(raw, { aspect: 1, shape: 'round', title: 'Frame your photo', maxSide: 640 });
    if (framed) onChange(framed);
  };
  return (
    <div className="flex items-center gap-4" data-photo-pick>
      <button type="button" onClick={() => input.current?.click()} aria-label={file ? 'Change your photo' : 'Add a photo'}
        className="relative flex-none rounded-full grid place-items-center overflow-hidden"
        style={{ width: 84, height: 84, background: 'var(--color-primary-light)', border: '2px solid color-mix(in srgb, var(--color-primary) 35%, transparent)' }}>
        {url ? <img src={url} alt="" className="w-full h-full object-cover" />
          : <span className="text-2xl font-extrabold" style={{ color: 'var(--color-primary-300)' }}>{initials}</span>}
        <span className="absolute bottom-0.5 right-0.5 w-7 h-7 rounded-full grid place-items-center"
          style={{ background: 'var(--fill-primary, var(--color-primary))', color: '#FFFFFF', border: '2px solid var(--color-surface)' }}><Camera size={13} /></span>
      </button>
      <div className="min-w-0">
        <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>{file ? 'Looking good' : 'Add a photo (optional)'}</p>
        <p className="text-xs mt-0.5 leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
          The desk and your coach see it, so they know you at the door. You can change it any time in Profile.
        </p>
        {file && (
          <button type="button" onClick={() => onChange(null)} className="mt-1.5 text-xs font-semibold inline-flex items-center gap-1" style={{ color: 'var(--color-text-secondary)' }}>
            <X size={12} /> Remove
          </button>
        )}
      </div>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
        onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ''; }} />
    </div>
  );
}
