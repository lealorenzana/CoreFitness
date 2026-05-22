export const PROTOTYPE_LOGIN = {
  email: 'eya.lorenzana@email.com',
  password: 'password123',
};

export const PROTOTYPE_REGISTER = {
  firstName: 'Eya',
  lastName: 'Lorenzana',
  email: 'eya.lorenzana@email.com',
  phone: '09123456789',
  address: 'Brgy. Payompon, Mamburao (Beside OMECO Mamburao)',
  birthdate: '2000-01-15',
  password: 'Password123',
  confirmPassword: 'Password123',
  selectedPlan: 'premium',
  termsAccepted: true,
};

export const PROTOTYPE_LOADING_MS = 1500;

export const SELECTED_GYM_KEY = 'selectedGym';

export function setSelectedGym(gymId: string, gymName: string) {
  localStorage.setItem(SELECTED_GYM_KEY, JSON.stringify({ id: gymId, name: gymName }));
}

export function getSelectedGym(): { id: string; name: string } | null {
  const raw = localStorage.getItem(SELECTED_GYM_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
