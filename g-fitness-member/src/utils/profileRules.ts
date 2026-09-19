/**
 * The rules for a member's own details — **one copy, used by Register and Edit
 * profile** (2026-09-19). They had drifted: Register took an optional phone in
 * any readable shape ("0917 111 2222"), while Edit profile demanded exactly
 * "+63 XXX XXX XXXX" and required it — so a member who registered without a
 * phone, or wrote it their own way, could not save Edit profile at all, not
 * even to fix a typo in their name.
 */

/** A phone number a person could dial: digits, +, spaces, brackets, dashes; 7+ characters. */
export const PHONE_RE = /^[\d+\s()-]{7,}$/;

/**
 * Age from a birth date. Subtracting years alone over-counts for anyone whose
 * birthday has not happened yet this year. Mirrors `age_years()` in 0031.
 */
export function ageFrom(dob: string): number | null {
  if (!dob) return null;
  const d = new Date(`${dob}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const monthDiff = now.getMonth() - d.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < d.getDate())) age -= 1;
  return age;
}

/** Why a birth date is not acceptable, or null when it is. Bounds catch typos, not gym policy. */
export function birthDateProblem(dob: string): string | null {
  const age = ageFrom(dob);
  if (age == null) return 'That date of birth does not look right';
  if (age < 0) return 'That date of birth is in the future';
  if (age > 120) return 'Please check your date of birth';
  return null;
}

export const GENDER_OPTIONS: { value: string; label: string }[] = [
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
];
