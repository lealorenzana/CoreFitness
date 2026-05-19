export interface Trainer {
  id: string;
  name: string;
  specialty: string;
  experience: string;
  rating: number;
  image: string;
  bio: string;
  certifications: string[];
  availability: {
    day: string;
    slots: string[];
  }[];
}

export interface ClassSession {
  id: string;
  trainerId: string;
  className: string;
  type: 'Personal Training' | 'Group Class' | 'Yoga' | 'Cardio' | 'Strength' | 'HIIT';
  date: string;
  time: string;
  duration: string;
  location: string;
  capacity: number;
  enrolled: number;
  price: number;
  description: string;
}

export const trainers: Trainer[] = [
  {
    id: 'T001',
    name: 'Coach Mike Santos',
    specialty: 'Strength & Conditioning',
    experience: '8 years',
    rating: 4.9,
    image: '/trainers/mike.jpg',
    bio: 'Certified strength coach specializing in powerlifting and functional fitness.',
    certifications: ['NSCA-CPT', 'CrossFit Level 2', 'Nutrition Specialist'],
    availability: [
      { day: 'Monday', slots: ['06:00 AM', '08:00 AM', '05:00 PM', '07:00 PM'] },
      { day: 'Wednesday', slots: ['06:00 AM', '08:00 AM', '05:00 PM', '07:00 PM'] },
      { day: 'Friday', slots: ['06:00 AM', '08:00 AM', '05:00 PM'] },
    ],
  },
  {
    id: 'T002',
    name: 'Coach Sarah Reyes',
    specialty: 'Yoga & Flexibility',
    experience: '6 years',
    rating: 4.8,
    image: '/trainers/sarah.jpg',
    bio: 'Experienced yoga instructor focused on mindfulness and body awareness.',
    certifications: ['RYT-500', 'Pilates Instructor', 'Meditation Guide'],
    availability: [
      { day: 'Tuesday', slots: ['07:00 AM', '09:00 AM', '06:00 PM'] },
      { day: 'Thursday', slots: ['07:00 AM', '09:00 AM', '06:00 PM'] },
      { day: 'Saturday', slots: ['08:00 AM', '10:00 AM'] },
    ],
  },
  {
    id: 'T003',
    name: 'Coach John Cruz',
    specialty: 'HIIT & Cardio',
    experience: '5 years',
    rating: 4.7,
    image: '/trainers/john.jpg',
    bio: 'High-energy trainer specializing in fat loss and cardiovascular fitness.',
    certifications: ['ACE-CPT', 'TRX Certified', 'Spinning Instructor'],
    availability: [
      { day: 'Monday', slots: ['07:00 AM', '12:00 PM', '06:00 PM'] },
      { day: 'Wednesday', slots: ['07:00 AM', '12:00 PM', '06:00 PM'] },
      { day: 'Friday', slots: ['07:00 AM', '12:00 PM'] },
    ],
  },
  {
    id: 'T004',
    name: 'Coach Maria Lopez',
    specialty: 'Personal Training',
    experience: '10 years',
    rating: 5.0,
    image: '/trainers/maria.jpg',
    bio: 'Elite personal trainer with expertise in body transformation and nutrition.',
    certifications: ['NASM-CPT', 'Precision Nutrition', 'Corrective Exercise Specialist'],
    availability: [
      { day: 'Tuesday', slots: ['06:00 AM', '10:00 AM', '04:00 PM'] },
      { day: 'Thursday', slots: ['06:00 AM', '10:00 AM', '04:00 PM'] },
      { day: 'Saturday', slots: ['09:00 AM', '11:00 AM'] },
    ],
  },
];

export const classSessions: ClassSession[] = [
  {
    id: 'CS001',
    trainerId: 'T001',
    className: 'Strength Fundamentals',
    type: 'Strength',
    date: '2024-05-25',
    time: '06:00 AM',
    duration: '60 min',
    location: 'Main Gym Floor',
    capacity: 12,
    enrolled: 8,
    price: 500,
    description: 'Learn proper form and technique for compound lifts.',
  },
  {
    id: 'CS002',
    trainerId: 'T002',
    className: 'Morning Yoga Flow',
    type: 'Yoga',
    date: '2024-05-26',
    time: '07:00 AM',
    duration: '45 min',
    location: 'Studio A',
    capacity: 15,
    enrolled: 12,
    price: 400,
    description: 'Start your day with energizing yoga sequences.',
  },
  {
    id: 'CS003',
    trainerId: 'T003',
    className: 'HIIT Bootcamp',
    type: 'HIIT',
    date: '2024-05-27',
    time: '06:00 PM',
    duration: '45 min',
    location: 'Outdoor Area',
    capacity: 20,
    enrolled: 15,
    price: 450,
    description: 'High-intensity interval training for maximum calorie burn.',
  },
  {
    id: 'CS004',
    trainerId: 'T004',
    className: 'Personal Training Session',
    type: 'Personal Training',
    date: '2024-05-28',
    time: '10:00 AM',
    duration: '60 min',
    location: 'Private Training Room',
    capacity: 1,
    enrolled: 0,
    price: 1200,
    description: 'One-on-one personalized training session.',
  },
  {
    id: 'CS005',
    trainerId: 'T001',
    className: 'Powerlifting Basics',
    type: 'Strength',
    date: '2024-05-29',
    time: '05:00 PM',
    duration: '90 min',
    location: 'Main Gym Floor',
    capacity: 10,
    enrolled: 7,
    price: 600,
    description: 'Introduction to squat, bench press, and deadlift.',
  },
  {
    id: 'CS006',
    trainerId: 'T002',
    className: 'Sunset Yoga',
    type: 'Yoga',
    date: '2024-05-30',
    time: '06:00 PM',
    duration: '60 min',
    location: 'Rooftop Studio',
    capacity: 15,
    enrolled: 10,
    price: 450,
    description: 'Relaxing evening yoga with meditation.',
  },
];
