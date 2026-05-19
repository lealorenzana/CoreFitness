export interface GymInfo {
  id: string;
  name: string;
  owner: string;
  location: string;
  hours: string;
  hasTrainers: boolean;
  dailyRate: number;
  monthlyPlans: {
    basic: number;
    standard: number;
    premium: number;
  };
  amenities: string[];
  description: string;
  logo: string;
  cover: string;
}

export const GYMS: GymInfo[] = [
  {
    id: 'g-fitness',
    name: 'G-Fitness',
    owner: 'Owner Name',
    location: 'Mamburao, Occidental Mindoro',
    hours: '5:00 AM - 10:00 PM',
    hasTrainers: true,
    dailyRate: 50,
    monthlyPlans: {
      basic: 800,
      standard: 1500,
      premium: 2500,
    },
    amenities: ['Personal Trainers', 'Locker Room', 'Shower Facilities', 'Free Weights', 'Cardio Equipment', 'Group Classes'],
    description: 'Premier fitness center with state-of-the-art equipment and certified trainers.',
    logo: '/g-fitness-logo.jpg',
    cover: '/g-fitness-cover.jpg',
  },
  {
    id: 'fitness-regency',
    name: 'Fitness Regency',
    owner: 'Owner Name',
    location: 'Mamburao, Occidental Mindoro',
    hours: '6:00 AM - 9:00 PM',
    hasTrainers: false,
    dailyRate: 40,
    monthlyPlans: {
      basic: 600,
      standard: 1200,
      premium: 0, // No premium plan
    },
    amenities: ['Locker Room', 'Free Weights', 'Cardio Equipment', 'Open Gym'],
    description: 'Affordable gym with essential equipment for your fitness journey.',
    logo: '/fitness-regency-logo.jpg',
    cover: '/fitness-regency-cover.jpg',
  },
  {
    id: 'ferrer-fitness',
    name: 'Ferrer Fitness',
    owner: 'Owner Name',
    location: 'Mamburao, Occidental Mindoro',
    hours: '5:30 AM - 9:30 PM',
    hasTrainers: true,
    dailyRate: 45,
    monthlyPlans: {
      basic: 700,
      standard: 1300,
      premium: 2200,
    },
    amenities: ['Personal Trainers', 'Locker Room', 'Shower Facilities', 'Free Weights', 'Cardio Equipment'],
    description: 'Community-focused gym with personalized training programs.',
    logo: '/ferrer-fitness-logo.png',
    cover: '/ferrer-fitness-cover.jpg',
  },
];
