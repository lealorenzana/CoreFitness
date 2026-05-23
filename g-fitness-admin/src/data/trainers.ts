import type { Trainer } from '../types';

export const TRAINERS: Trainer[] = [
  {
    id: 'trainer-001',
    gymId: 'gym-001',
    name: 'Cyrelle Joy Duhac',
    specialization: 'Strength & Conditioning',
    photoUrl: '/trainer-duhac.png',
    rating: 4.8,
    sessionsCompleted: 342,
    availability: [
      { day: 'Monday', slots: ['6:00 AM', '7:00 AM', '5:00 PM', '6:00 PM'] },
      { day: 'Wednesday', slots: ['6:00 AM', '7:00 AM', '5:00 PM'] },
      { day: 'Friday', slots: ['6:00 AM', '5:00 PM', '6:00 PM'] }
    ]
  },
  {
    id: 'trainer-002',
    gymId: 'gym-001',
    name: 'Ana Par Iturralde',
    specialization: 'HIIT & Cardio',
    photoUrl: '/trainer-ituralde.png',
    rating: 4.9,
    sessionsCompleted: 428,
    availability: [
      { day: 'Tuesday', slots: ['6:00 AM', '7:00 AM', '6:00 PM'] },
      { day: 'Thursday', slots: ['6:00 AM', '5:00 PM', '6:00 PM'] },
      { day: 'Saturday', slots: ['7:00 AM', '8:00 AM'] }
    ]
  },
  {
    id: 'trainer-003',
    gymId: 'gym-001',
    name: 'Nathanniel Ucol',
    specialization: 'Boxing & Functional Training',
    photoUrl: '/trainer-ucol.png',
    rating: 4.7,
    sessionsCompleted: 315,
    availability: [
      { day: 'Monday', slots: ['5:00 PM', '6:00 PM', '7:00 PM'] },
      { day: 'Wednesday', slots: ['5:00 PM', '6:00 PM'] },
      { day: 'Friday', slots: ['5:00 PM', '6:00 PM', '7:00 PM'] },
      { day: 'Saturday', slots: ['8:00 AM', '9:00 AM'] }
    ]
  },
];
