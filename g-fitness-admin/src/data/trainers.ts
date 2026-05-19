import type { Trainer } from '../types';

export const TRAINERS: Trainer[] = [
  {
    id: 'trainer-001',
    gymId: 'gym-001',
    name: 'Coach Eman',
    specialization: 'Strength',
    photoUrl: '/avatars/coach-eman.jpg',
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
    name: 'Coach Trish',
    specialization: 'HIIT',
    photoUrl: '/avatars/coach-trish.jpg',
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
    gymId: 'gym-002',
    name: 'Coach Bong',
    specialization: 'Boxing',
    photoUrl: '/avatars/coach-bong.jpg',
    rating: 4.7,
    sessionsCompleted: 315,
    availability: [
      { day: 'Monday', slots: ['5:00 PM', '6:00 PM', '7:00 PM'] },
      { day: 'Wednesday', slots: ['5:00 PM', '6:00 PM'] },
      { day: 'Friday', slots: ['5:00 PM', '6:00 PM', '7:00 PM'] }
    ]
  },
  {
    id: 'trainer-004',
    gymId: 'gym-002',
    name: 'Coach Liza',
    specialization: 'Yoga',
    photoUrl: '/avatars/coach-liza.jpg',
    rating: 4.9,
    sessionsCompleted: 502,
    availability: [
      { day: 'Tuesday', slots: ['6:00 AM', '7:00 AM'] },
      { day: 'Thursday', slots: ['6:00 AM', '7:00 AM'] },
      { day: 'Saturday', slots: ['7:00 AM', '8:00 AM', '9:00 AM'] }
    ]
  },
  {
    id: 'trainer-005',
    gymId: 'gym-003',
    name: 'Coach Mark',
    specialization: 'CrossFit',
    photoUrl: '/avatars/coach-mark.jpg',
    rating: 4.6,
    sessionsCompleted: 287,
    availability: [
      { day: 'Monday', slots: ['6:00 AM', '7:00 AM', '6:00 PM'] },
      { day: 'Wednesday', slots: ['6:00 AM', '6:00 PM'] },
      { day: 'Friday', slots: ['6:00 AM', '7:00 AM'] }
    ]
  }
];
