/**
 * How strong a new password is, for Change password and Reset password.
 *
 * **Only eight characters is a rule** (Supabase Auth refuses less). The other
 * four are what makes it stronger — listed as that, never as requirements the
 * form does not enforce.
 */
export function strengthOf(password: string): { score: number; label: string } {
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

export const strongerWith = (password: string) => [
  { label: '12 characters or more', met: password.length >= 12 },
  { label: 'Upper and lower case', met: /[a-z]/.test(password) && /[A-Z]/.test(password) },
  { label: 'A number', met: /\d/.test(password) },
  { label: 'A symbol', met: /[^a-zA-Z0-9]/.test(password) },
];
