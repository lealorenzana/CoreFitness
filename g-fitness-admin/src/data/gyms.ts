import type { Gym } from '../types';

export const GYMS: Gym[] = [
  {
    id: 'gym-001',
    name: 'G-Fitness',
    location: 'Mamburao, Occidental Mindoro',
    address: 'Poblacion, Mamburao, Occidental Mindoro',
    phone: '+63 917 123 4567',
    operatingHours: {
      weekday: '5:00 AM - 10:00 PM',
      weekend: '6:00 AM - 9:00 PM'
    }
  },
  {
    id: 'gym-002',
    name: 'Fitness Regency',
    location: 'Mamburao, Occidental Mindoro',
    address: 'Barangay Payompon, Mamburao, Occidental Mindoro',
    phone: '+63 917 234 5678',
    operatingHours: {
      weekday: '6:00 AM - 10:00 PM',
      weekend: '7:00 AM - 8:00 PM'
    }
  },
  {
    id: 'gym-003',
    name: 'Ferrer Fitness',
    location: 'Mamburao, Occidental Mindoro',
    address: 'Barangay Tayamaan, Mamburao, Occidental Mindoro',
    phone: '+63 917 345 6789',
    operatingHours: {
      weekday: '5:30 AM - 9:30 PM',
      weekend: '6:30 AM - 8:30 PM'
    }
  }
];
