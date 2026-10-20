/**
 * A coach's details as a draft, shared by Add trainer and Edit trainer
 * (2026-10-20) — the data half of TrainerFields.tsx, kept apart so that file
 * exports only components (React Fast Refresh).
 */

export const TRAINER_STEPS = ['Who they are', 'What they coach', 'When they coach', 'Their login'];
export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
/** "Trains for": the words members' "Find your coach" matches on (lib/coachGoals.ts), so a pick is never a dead label. */
export const FOCUS = ['Weight loss', 'HIIT', 'Strength', 'Hypertrophy', 'Powerlifting', 'Calisthenics', 'Mobility', 'Yoga', 'Pilates',
  'Boxing', 'Muay Thai', 'Rehab', 'Low impact', 'Beginner', 'Seniors'];
export const TITLES = ['Strength & Conditioning', 'Personal Trainer', 'Group Fitness', 'Boxing Coach', 'Yoga Instructor', 'Rehab & Injury Prevention'];
export const CERTS = ['First Aid / CPR', 'NASM-CPT', 'ACE-CPT', 'ISSA', 'TESDA NC II Fitness', 'ACSM'];
/** Quick picks for years coaching. The value is always the exact number — 0 is "first year". */
export const YEAR_PICKS = [0, 1, 2, 3, 5, 8, 10, 15];

export interface TrainerDraft {
  firstName: string; lastName: string; phone: string;
  /** Exact years as typed, '' = not said (members see nothing). 0–70, the 0041 constraint. */
  years: string;
  specialization: string; bio: string; achievements: string;
  focus: string[]; certs: string[]; otherCert: string;
  days: string[];
}

export const emptyDraft = (): TrainerDraft => ({
  firstName: '', lastName: '', phone: '', years: '', specialization: '', bio: '', achievements: '',
  focus: [], certs: [], otherCert: '', days: [],
});

/** A saved coach as a draft: known certificates become picks, the rest the "other" line. */
export function draftFrom(t: {
  firstName: string; lastName: string; phone: string | null; yearsExperience: number | null; specialization: string;
  bio: string | null; achievements: string | null; focusAreas: string[]; certifications: string[]; availabilityDays: string[];
}): TrainerDraft {
  const known = t.certifications.filter((c) => CERTS.includes(c));
  return {
    firstName: t.firstName, lastName: t.lastName, phone: t.phone ?? '',
    years: t.yearsExperience != null ? String(t.yearsExperience) : '',
    specialization: t.specialization, bio: t.bio ?? '', achievements: t.achievements ?? '',
    focus: t.focusAreas, certs: known, otherCert: t.certifications.filter((c) => !CERTS.includes(c)).join(', '),
    days: t.availabilityDays,
  };
}

export const certsOf = (d: TrainerDraft) => [...d.certs, ...d.otherCert.split(',').map((x) => x.trim()).filter(Boolean)];
export const yearsOf = (d: TrainerDraft): number | null => (d.years.trim() === '' ? null : Number(d.years));
export const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

/** The checks both screens make, by section. */
export function draftErrors(d: TrainerDraft, section: 0 | 1): Record<string, string> {
  const e: Record<string, string> = {};
  if (section === 0) {
    if (!d.firstName.trim()) e.firstName = 'Required.';
    if (!d.lastName.trim()) e.lastName = 'Required.';
    const y = yearsOf(d);
    if (y != null && (!Number.isInteger(y) || y < 0 || y > 70)) e.years = 'A whole number from 0 to 70 — or leave it blank.';
  }
  if (section === 1 && !d.specialization.trim()) e.specialization = 'The line under their name — pick one or type it.';
  return e;
}

