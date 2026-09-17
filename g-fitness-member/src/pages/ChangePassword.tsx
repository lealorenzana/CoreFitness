import { useNavigate, useLocation } from 'react-router-dom';
import { useState } from 'react';
import { Check, Eye, EyeSlash } from '@phosphor-icons/react';
import { showSuccessToast, showErrorToast } from '../utils/errorHandler';
import { supabase } from '../lib/supabaseClient';
import { errorMessage } from '../utils/errorMessage';
import { Page, PageTitle } from '../components/ui/page';
import { Field } from '../components/ui/Field';
import { Eyebrow, NocButton } from '../components/ui/noc';

/**
 * Change password — against real Supabase Auth (Nocturne redesign).
 *
 * This screen used to be theatre. `handleSubmit` ran a `setTimeout(…, 1500)`
 * under a `// Simulate API call` comment, showed "Password changed
 * successfully!" and navigated away. It never contacted Supabase, so every
 * password in the gym stayed exactly as it was while the app said otherwise —
 * and the user would then be locked out of their own expectation at the next
 * login. It also ignored the current-password field entirely.
 *
 * `updateUser` does not verify the existing password, so the current-password
 * field is checked explicitly with `signInWithPassword` first. Without that,
 * anyone with a borrowed unlocked phone could change the account's password
 * without knowing it.
 *
 * **Only eight characters is a rule.** The old list headed "Password
 * Requirements" put mixed case, a number and a symbol beside it, and the form
 * accepted a password with none of them — a requirement the submit does not
 * enforce is a suggestion wearing a uniform. They are now listed as what makes
 * it stronger, under the one thing that is required.
 */

function strengthOf(password: string): { score: number; label: string } {
  if (!password) return { score: 0, label: '' };
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;
  const label = score <= 2 ? 'Weak' : score === 3 ? 'Fair' : score === 4 ? 'Good' : 'Strong';
  return { score, label };
}

/** A password input with a show/hide toggle inside its right edge. */
function PasswordInput({
  value, onChange, shown, onToggle, placeholder, autoComplete,
}: {
  value: string;
  onChange: (v: string) => void;
  shown: boolean;
  onToggle: () => void;
  placeholder: string;
  autoComplete: string;
}) {
  return (
    <span className="relative block">
      <input
        type={shown ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
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

export default function ChangePassword() {
  const navigate = useNavigate();
  const location = useLocation();
  // One screen, two shells. Sending a trainer back to /member/settings drops
  // them into a member layout they have no session role for.
  const isTrainer = location.pathname.startsWith('/trainer');
  const backTo = isTrainer ? '/trainer/settings' : '/member/settings';
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const strength = strengthOf(newPassword);
  const longEnough = newPassword.length >= 8;
  const stronger = [
    { label: '12 characters or more', met: newPassword.length >= 12 },
    { label: 'Upper and lower case', met: /[a-z]/.test(newPassword) && /[A-Z]/.test(newPassword) },
    { label: 'A number', met: /\d/.test(newPassword) },
    { label: 'A symbol', met: /[^a-zA-Z0-9]/.test(newPassword) },
  ];
  const mismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!currentPassword || !newPassword || !confirmPassword) {
      showErrorToast({ type: 'validation', message: 'Please fill in all fields' });
      return;
    }

    if (newPassword !== confirmPassword) {
      showErrorToast({ type: 'validation', message: 'New passwords do not match' });
      return;
    }

    if (newPassword.length < 8) {
      showErrorToast({ type: 'validation', message: 'Password must be at least 8 characters' });
      return;
    }

    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) throw new Error('Your session has expired. Please sign in again.');

      // Verify the current password before changing anything. `updateUser`
      // will happily set a new password without it, which would let anyone
      // holding an unlocked phone take the account over.
      const { error: checkError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      });
      if (checkError) {
        showErrorToast({ type: 'validation', message: 'Your current password is not correct' });
        return;
      }

      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;

      showSuccessToast('Password changed');
      navigate(backTo);
    } catch (err) {
      showErrorToast({ type: 'validation', message: errorMessage(err, 'Could not change your password') });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Page>
      <PageTitle back fallback={backTo} title="Change password" subtitle="You will stay signed in on this phone" />

      <form onSubmit={handleSubmit} className="flex flex-col" style={{ gap: 18 }}>
        <Field label="Current password" as="div">
          <PasswordInput value={currentPassword} onChange={setCurrentPassword} shown={showCurrent}
            onToggle={() => setShowCurrent((v) => !v)} placeholder="Your password now" autoComplete="current-password" />
        </Field>

        <div className="rule" />

        <Field label="New password" hint="At least 8 characters." as="div">
          <PasswordInput value={newPassword} onChange={setNewPassword} shown={showNew}
            onToggle={() => setShowNew((v) => !v)} placeholder="Choose a new one" autoComplete="new-password" />
        </Field>

        {newPassword && (
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
              {stronger.map((r) => (
                <li key={r.label} className="flex items-center" style={{ gap: 8, fontSize: 12.5,
                  color: r.met ? 'var(--color-primary-300)' : 'var(--color-text-muted)' }}>
                  <Check size={14} weight="bold" style={{ opacity: r.met ? 1 : 0.35 }} />
                  Stronger with: {r.label.toLowerCase()}
                </li>
              ))}
            </ul>
          </section>
        )}

        <Field label="Confirm new password" as="div">
          <PasswordInput value={confirmPassword} onChange={setConfirmPassword} shown={showConfirm}
            onToggle={() => setShowConfirm((v) => !v)} placeholder="Type it again" autoComplete="new-password" />
          {mismatch && (
            <span className="block" role="alert" style={{ fontSize: 12.5, marginTop: 6, color: 'var(--color-secondary)' }}>
              Passwords do not match
            </span>
          )}
        </Field>

        <NocButton
          type="submit"
          variant="action"
          className="w-full"
          disabled={isLoading || !currentPassword || !newPassword || !confirmPassword || newPassword !== confirmPassword}
        >
          {isLoading ? 'Updating…' : 'Change password'}
        </NocButton>
      </form>

      <section>
        <Eyebrow mark>Keeping it safe</Eyebrow>
        <ul className="flex flex-col" style={{ gap: 6, marginTop: 10, fontSize: 12.5, lineHeight: 1.5, color: 'var(--color-text-muted)' }}>
          <li>Use a password you do not use anywhere else.</li>
          <li>Longer beats cleverer — a short sentence is easy to remember.</li>
          <li>Leave out birthdays and names.</li>
        </ul>
      </section>
    </Page>
  );
}
