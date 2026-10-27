/** The body measurements, in the order they are shown (Body tab, the readings page). */
export const FIELDS = [
  { key: 'weight', label: 'Weight', unit: 'kg' },
  { key: 'height', label: 'Height', unit: 'cm' },
  { key: 'bodyFatPct', label: 'Body fat', unit: '%' },
  { key: 'neck', label: 'Neck', unit: 'cm' },
  { key: 'shoulders', label: 'Shoulders', unit: 'cm' },
  { key: 'chest', label: 'Chest', unit: 'cm' },
  { key: 'arms', label: 'Upper arms', unit: 'cm' },
  { key: 'forearms', label: 'Forearms', unit: 'cm' },
  { key: 'waist', label: 'Waist', unit: 'cm' },
  { key: 'hips', label: 'Hips', unit: 'cm' },
  { key: 'legs', label: 'Thighs', unit: 'cm' },
  { key: 'calves', label: 'Calves', unit: 'cm' },
] as const;
